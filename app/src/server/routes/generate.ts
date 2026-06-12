/* generate.ts — Layer A: in-app analysis generation (pure Python, no LLM).
 *
 * POST /api/:client/:slug/generate  (multipart: file `csv` + fields `config`,
 *   optional `content`) → runs build_report → writes the 4 layers → validates →
 *   discards the raw CSV (process-and-discard; raw never persists in Fase 1).
 * POST /api/inspect-csv  (multipart: file `csv`) → header + sample distinct
 *   values, to drive the config form.
 *
 * Gate: when GEN_SECRET is set, requests must carry a matching x-gen-secret
 * header. The raw upload lives only in a scratch dir OUTSIDE the served tree. */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import type { Express, Request } from 'express';
import type { Ctx } from '../context.js';
import { analysisDir, writeJson, readJson } from '../fsutil.js';
import { SCRATCH, BASE } from '../paths.js';
import { runGeneration } from '../pygen.js';
import { TYPES } from '../typeRegistry.js';
import { buildDigest } from '../datasetCatalog.js';
import { generateInsights } from '../claude.js';
import { assignClient } from '../auth.js';
import { clientName } from './clients.js';
import type { AuthedRequest } from './authRoutes.js';
import { validateAnalysis } from '../../shared/validate.js';

/** Slug-base legível por tipo (o id real é gerado pelo servidor, não digitado). */
const SLUG_BASE: Record<string, string> = {
  'conversao-perfil': 'conversao-perfil',
  'debriefing-lancamento': 'debriefing',
  'historico-lancamentos': 'historico',
  'acompanhamento-lancamento': 'acompanhamento',
  'criativos': 'criativos',
};

/** Gera um slug de análise ÚNICO dentro de output/<client>/ (base, base-2, base-3…),
 *  para o app cuidar do id sozinho e nunca colidir/sobrescrever. */
function uniqueSlug(out: string, client: string, base: string): string {
  const safe = (base || 'analise').replace(/[^a-z0-9-]/g, '') || 'analise';
  let slug = safe;
  for (let n = 2; fs.existsSync(path.join(out, client, slug)); n++) slug = `${safe}-${n}`;
  return slug;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

interface ConfigShape { criterios?: unknown[]; [k: string]: unknown }

function gateOk(req: Request): boolean {
  const secret = process.env.GEN_SECRET;
  if (!secret) return true; // dev convenience: no gate configured
  return req.get('x-gen-secret') === secret;
}

/** Minimal valid `content` for Fase 1 (insights/detalhamentos come from Claude in
 *  Fase 2). Empty zones + no cross-cut; build_report still emits the codependency
 *  zone. */
function defaultContent(): unknown {
  return {
    insights: {
      header: { badge: 'Insights', title: 'Insights Estratégicos', sub: 'Análise descritiva gerada — insights autorais ainda pendentes.' },
      zones: [],
      method: 'Os insights e detalhamentos autorais ainda não foram gerados para esta análise.',
    },
    detalhamentos: {},
  };
}

const tail = (s: string, n: number): string => (s.length > n ? s.slice(-n) : s);

/** Reconstrói um `content` mínimo a partir do output (s10 = Insights), p/ atualizar
 *  análises antigas que não têm content.json retido. Tipos sem s10 caem no default.
 *  As zonas autorais não são recuperáveis daqui — preserve() mantém det/perguntas. */
function reconstructContent(outDir: string): unknown | null {
  try {
    const s10 = readJson<{ header?: unknown; widgets?: Array<{ type: string; text?: string }> }>(path.join(outDir, 's10.json'));
    if (!s10) return null;
    const note = s10.widgets?.find((w) => w.type === 'find-note')?.text || '';
    return { insights: { header: s10.header || { title: 'Insights Estratégicos' }, zones: [], method: note }, detalhamentos: {} };
  } catch { return null; }
}

export function registerGenerate(app: Express, ctx: Ctx): void {
  // `csv` é o dump principal; `dict` é um arquivo auxiliar opcional (ex.: criativos →
  // dicionário field_ad_name→link). Tipos que não usam `dict` simplesmente o ignoram.
  const genUpload = upload.fields([{ name: 'csv', maxCount: 1 }, { name: 'dict', maxCount: 1 },
    { name: 'goals', maxCount: 1 }, { name: 'hist', maxCount: 1 }]);
  app.post('/api/:client/:slug/generate', genUpload, async (req, res) => {
    if (!gateOk(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
    const { client, slug: urlSlug } = req.params;
    if (!analysisDir(ctx.out, client, urlSlug)) { res.status(400).json({ error: 'bad path' }); return; }
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const csvFile = files?.csv?.[0];
    const dictFile = files?.dict?.[0];
    if (!csvFile) { res.status(400).json({ error: 'csv file required (campo "csv")' }); return; }

    let config: ConfigShape;
    try { config = JSON.parse(String(req.body?.config ?? '')) as ConfigShape; }
    catch { res.status(400).json({ error: 'config inválido (JSON)' }); return; }
    // Whitelist do registry: nunca montar caminho de script a partir de string livre.
    const rawType = typeof config?.type === 'string' ? config.type : 'conversao-perfil';
    if (!TYPES[rawType]) { res.status(400).json({ error: `tipo desconhecido: ${rawType}` }); return; }
    const def = TYPES[rawType];
    const type = def.type;
    const cfgErrors = def.validateConfig(config);
    if (cfgErrors.length) { res.status(400).json({ error: cfgErrors.join('; ') }); return; }
    // Arquivos auxiliares obrigatórios por tipo (ex.: debriefing → metas).
    const missing = (def.requiredFiles || []).filter((n) => !files?.[n]?.[0]);
    if (missing.length) { res.status(400).json({ error: `arquivo(s) obrigatório(s) ausente(s): ${missing.join(', ')}` }); return; }
    let content: unknown;
    try { content = req.body?.content ? JSON.parse(String(req.body.content)) : defaultContent(); }
    catch { res.status(400).json({ error: 'content inválido (JSON)' }); return; }

    // O app cuida do ID da análise: '_new'/'_auto' → slug único gerado no servidor
    // (base por tipo + sufixo numérico), evitando colisão/sobrescrita por digitação.
    const slug = (urlSlug === '_new' || urlSlug === '_auto')
      ? uniqueSlug(ctx.out, client, SLUG_BASE[type] || type) : urlSlug;
    const outDir = analysisDir(ctx.out, client, slug)!;
    // Nome/título do cliente vêm do REGISTRO — o consultor escolhe o cliente, não digita.
    config.client = client;
    config.client_name = String(config.client_name || '').trim() || clientName(client) || client;
    if (!String(config.title || '').trim()) config.title = `${config.client_name} · ${def.label}`;

    const job = path.join(SCRATCH, `gen-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
    const csvPath = path.join(job, 'upload.csv');
    const configPath = path.join(job, 'config.json');
    const contentPath = path.join(job, 'content.json');
    fs.mkdirSync(job, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(csvPath, csvFile.buffer);
    // Dicionário auxiliar (opcional): grava no scratch e injeta o caminho no config.
    if (dictFile) {
      const dictPath = path.join(job, 'dict.csv');
      fs.writeFileSync(dictPath, dictFile.buffer);
      config.dict_csv = dictPath;
    }
    // CSVs auxiliares adicionais (ex.: debriefing → metas e histórico).
    for (const aux of ['goals', 'hist'] as const) {
      const f = files?.[aux]?.[0];
      if (f) {
        const p = path.join(job, `${aux}.csv`);
        fs.writeFileSync(p, f.buffer);
        (config as Record<string, unknown>)[`${aux}_csv`] = p;
      }
    }
    writeJson(configPath, config);
    writeJson(contentPath, content);

    try {
      const result = await runGeneration(`${client}/${slug}`, { csvPath, configPath, contentPath, outDir, type });
      if (!result.ok) {
        res.status(500).json({ error: 'falha na geração', stderr: tail(result.stderr || result.stdout, 2000) });
        return;
      }
      // Multi-tenant: the consultant who generated owns this client from now on.
      const uid = (req as AuthedRequest).user?.id;
      if (uid) assignClient(ctx.db, uid, client);

      // Fase 3b: retain the base data (dump + config) for on-demand crossings.
      // Lives outside the served tree; at-rest encryption = encrypted volume.
      let baseRetained = false;
      if (String(req.body?.retainBase ?? 'true') !== 'false') {
        try {
          const baseDir = path.join(BASE, client, slug);
          fs.mkdirSync(baseDir, { recursive: true });
          fs.copyFileSync(csvPath, path.join(baseDir, 'dump.csv'));
          // Os CSVs auxiliares (metas/histórico/dicionário) vivem no scratch, que é
          // efêmero. Sem copiá-los para a base, o config retido aponta para um caminho
          // morto → recompute/rebuild/deep perdem metas e histórico silenciosamente.
          // Copia cada aux para a base e reescreve o path no config persistido.
          const baseConfig = { ...config } as Record<string, unknown>;
          for (const aux of ['goals', 'hist', 'dict'] as const) {
            const src = baseConfig[`${aux}_csv`];
            if (typeof src === 'string' && fs.existsSync(src)) {
              const dest = path.join(baseDir, `${aux}.csv`);
              fs.copyFileSync(src, dest);
              baseConfig[`${aux}_csv`] = dest;
            }
          }
          writeJson(path.join(baseDir, 'config.json'), baseConfig);
          // Retém também o content (insights/detalhamentos) — sem ele, regerar tipos que
          // exigem content.insights (conversao-perfil) quebra. Atualizado se insights rodar.
          try { fs.copyFileSync(contentPath, path.join(baseDir, 'content.json')); } catch { /* opcional */ }
          baseRetained = true;
        } catch { baseRetained = false; }
      }

      // Optional Layer B1: generate insight prose from the freshly computed
      // aggregates (CSV still in scratch), then re-emit the views with it.
      let insights: { applied: boolean; mocked?: boolean; error?: string } = { applied: false };
      if (def.supportsInsights && String(req.body?.insights ?? '') === 'true') {
        try {
          const ds = readJson<Record<string, { rows: Array<Record<string, unknown>> }>>(path.join(outDir, 'dataset.json'));
          if (!ds) throw new Error('dataset ausente para o digest');
          const digest = buildDigest(config as Parameters<typeof buildDigest>[0], ds);
          const { content: real, mocked } = await generateInsights(digest);
          writeJson(contentPath, real);
          const r2 = await runGeneration(`${client}/${slug}`, { csvPath, configPath, contentPath, outDir });
          if (!r2.ok) throw new Error(`rebuild com insights falhou: ${tail(r2.stderr, 300)}`);
          insights = { applied: true, mocked };
        } catch (e) {
          insights = { applied: false, error: (e as Error).message };
        }
      }

      // O nome de exibição (home/cabeçalho) vem do REGISTRO de clientes, não do slug:
      // fixa meta.client com o client_name resolvido (a rota/pasta segue o slug).
      try {
        const dataFile = path.join(outDir, 'data.json');
        const dj = readJson<{ meta?: Record<string, unknown> }>(dataFile);
        if (dj?.meta && config.client_name) { dj.meta.client = config.client_name; writeJson(dataFile, dj); }
      } catch { /* não-fatal */ }

      const dataset = readJson<unknown>(path.join(outDir, 'dataset.json'));
      const layout = readJson<unknown>(path.join(outDir, 'layout.json'));
      const sections = fs.readdirSync(outDir)
        .filter((f) => /^s\d+\.json$/.test(f))
        .map((f) => readJson<unknown>(path.join(outDir, f)));
      const v = validateAnalysis({ dataset: dataset ?? undefined, sections, layout: layout ?? undefined });
      res.json({ ok: v.ok, report: `/report/${client}/${slug}`, insights, baseRetained, stdout: tail(result.stdout, 1000), validation: v });
    } catch (e) {
      const msg = (e as Error).message;
      res.status(msg === 'busy' ? 409 : 500).json({ error: msg });
    } finally {
      fs.rmSync(job, { recursive: true, force: true }); // discard raw CSV + transient config/content
    }
  });

  // ── Atualizar análise: reupar CSV e/ou editar o config inicial, reusando a base
  // retida (dump/config/content). preserve() mantém detalhamentos/perguntas/comentários.
  // GET devolve o config retido (sem caminhos internos) p/ popular o formulário.
  app.get('/api/:client/:slug/base-config', (req, res) => {
    const { client, slug } = req.params;
    if (!analysisDir(ctx.out, client, slug)) { res.status(400).json({ error: 'bad path' }); return; }
    const baseDir = path.join(BASE, client, slug);
    const cfg = readJson<Record<string, unknown>>(path.join(baseDir, 'config.json'));
    const hasBase = !!cfg && fs.existsSync(path.join(baseDir, 'dump.csv'));
    if (!hasBase) { res.json({ hasBase: false }); return; }
    // Esconde os caminhos internos dos auxiliares (são re-resolvidos no servidor).
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cfg!)) { if (!/_csv$/.test(k)) clean[k] = v; }
    res.json({ hasBase: true, config: clean, type: cfg!.type });
  });

  app.post('/api/:client/:slug/update', upload.fields([{ name: 'csv', maxCount: 1 }]), async (req, res) => {
    if (!gateOk(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
    const { client, slug } = req.params;
    const outDir = analysisDir(ctx.out, client, slug);
    if (!outDir || !fs.existsSync(outDir)) { res.status(404).json({ error: 'análise não encontrada' }); return; }
    const baseDir = path.join(BASE, client, slug);
    const baseCsv = path.join(baseDir, 'dump.csv');
    const retainedCfg = readJson<Record<string, unknown>>(path.join(baseDir, 'config.json'));
    if (!retainedCfg || !fs.existsSync(baseCsv)) {
      res.status(400).json({ error: 'base retida ausente — gere a análise novamente para habilitar a atualização' }); return;
    }
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const newCsv = files?.csv?.[0];

    let config: Record<string, unknown>;
    if (req.body?.config) {
      try { config = JSON.parse(String(req.body.config)) as Record<string, unknown>; }
      catch { res.status(400).json({ error: 'config inválido (JSON)' }); return; }
    } else { config = { ...retainedCfg }; }
    const type = typeof config.type === 'string' ? config.type : (retainedCfg.type as string);
    if (!type || !TYPES[type]) { res.status(400).json({ error: `tipo desconhecido: ${type}` }); return; }
    const def = TYPES[type];
    config.type = type; config.client = client;
    config.client_name = String(config.client_name || retainedCfg.client_name || '').trim() || clientName(client) || client;
    if (!String(config.title || '').trim()) config.title = String(retainedCfg.title || `${config.client_name} · ${def.label}`);
    const cfgErrors = def.validateConfig(config);
    if (cfgErrors.length) { res.status(400).json({ error: cfgErrors.join('; ') }); return; }
    // Auxiliares: reaproveita os CSVs retidos na base (não são re-enviados aqui).
    for (const aux of ['goals', 'hist', 'dict'] as const) {
      const dest = path.join(baseDir, `${aux}.csv`);
      if (fs.existsSync(dest)) config[`${aux}_csv`] = dest;
    }
    // content: retido > reconstruído do s10 (insights) > default. preserve() cuida do resto.
    const content = readJson<unknown>(path.join(baseDir, 'content.json'))
      ?? reconstructContent(outDir) ?? defaultContent();

    const job = path.join(SCRATCH, `upd-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
    fs.mkdirSync(job, { recursive: true });
    const csvPath = newCsv ? path.join(job, 'upload.csv') : baseCsv;
    if (newCsv) fs.writeFileSync(csvPath, newCsv.buffer);
    const configPath = path.join(job, 'config.json');
    const contentPath = path.join(job, 'content.json');
    writeJson(configPath, config);
    writeJson(contentPath, content);

    try {
      const result = await runGeneration(`${client}/${slug}`, { csvPath, configPath, contentPath, outDir, type });
      if (!result.ok) { res.status(500).json({ error: 'falha na atualização', stderr: tail(result.stderr || result.stdout, 2000) }); return; }
      // Re-retém a base atualizada (novo dump se houver; config + content novos).
      try {
        if (newCsv) fs.copyFileSync(csvPath, baseCsv);
        writeJson(path.join(baseDir, 'config.json'), config);
        writeJson(path.join(baseDir, 'content.json'), content);
      } catch { /* não-fatal */ }
      // Re-fixa o nome de exibição do cliente na meta (segue o registro).
      try {
        const dataFile = path.join(outDir, 'data.json');
        const dj = readJson<{ meta?: Record<string, unknown> }>(dataFile);
        if (dj?.meta && config.client_name) { dj.meta.client = config.client_name; writeJson(dataFile, dj); }
      } catch { /* não-fatal */ }
      const dataset = readJson<unknown>(path.join(outDir, 'dataset.json'));
      const layout = readJson<unknown>(path.join(outDir, 'layout.json'));
      const sections = fs.readdirSync(outDir).filter((f) => /^s\d+\.json$/.test(f)).map((f) => readJson<unknown>(path.join(outDir, f)));
      const v = validateAnalysis({ dataset: dataset ?? undefined, sections, layout: layout ?? undefined });
      res.json({ ok: v.ok, report: `/report/${client}/${slug}`, csvUpdated: !!newCsv, validation: v });
    } catch (e) {
      const msg = (e as Error).message;
      res.status(msg === 'busy' ? 409 : 500).json({ error: msg });
    } finally {
      fs.rmSync(job, { recursive: true, force: true });
    }
  });

  app.post('/api/inspect-csv', upload.single('csv'), (req, res) => {
    if (!gateOk(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
    if (!req.file) { res.status(400).json({ error: 'csv file required' }); return; }
    const text = req.file.buffer.toString('utf8');
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) { res.status(400).json({ error: 'csv vazio' }); return; }
    const sep = detectSep(lines[0]);
    const header = splitCsv(lines[0], sep);
    const seen: Record<string, Set<string>> = {};
    header.forEach((c) => { seen[c] = new Set(); });
    for (const line of lines.slice(1, 5001)) {
      const cells = splitCsv(line, sep);
      header.forEach((c, i) => {
        const v = (cells[i] ?? '').trim();
        if (v && seen[c].size < 40) seen[c].add(v);
      });
    }
    const distinct: Record<string, string[]> = {};
    header.forEach((c) => { distinct[c] = [...seen[c]]; });
    res.json({ columns: header, distinct, sep: sep === '\t' ? '\\t' : sep });
  });
}

function detectSep(headerLine: string): string {
  const counts: Array<[string, number]> = [
    [',', (headerLine.match(/,/g) || []).length],
    [';', (headerLine.match(/;/g) || []).length],
    ['\t', (headerLine.match(/\t/g) || []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

function splitCsv(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
