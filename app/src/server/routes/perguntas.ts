/* perguntas.ts — perguntas norteadoras: lista ranqueada + histórico de uso.
 *
 * GET    /api/:client/:slug/perguntas               → perguntas.json + status vivo (do histórico)
 * POST   /api/:client/:slug/perguntas/:pid/seguir   → gera o detalhamento como uma SEÇÃO na
 *                                                      página "Detalhamentos" (cria a página se faltar)
 * POST   /api/:client/:slug/perguntas/:pid/ignorar  → registra ignorar
 * GET    /api/:client/:slug/perguntas/historico     → trilha de auditoria (refino posterior)
 * POST   /api/:client/:slug/perguntas/recalc        → roda o cálculo fixo (input → perguntas.json)
 *
 * A relevância é SEMPRE calculada em Python (perguntas_calc.py). Seguir uma
 * pergunta NÃO mexe no bloco de origem — ele é só contexto; o detalhamento vira
 * uma seção própria, agrupada na página Detalhamentos. O histórico é append-only. */

import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import type { Express, Request, Response } from 'express';
import type { Ctx } from '../context.js';
import { sendGenError } from '../creditError.js';
import type { PerguntasDoc, Pergunta, ReportData, PageRef, Section, Layout } from '../../shared/types.js';
import { analysisDir, isSafeSeg, readJson, writeJson } from '../fsutil.js';
import { BASE } from '../paths.js';
import { typeOf } from '../typeRegistry.js';
import { runPerguntasCalc } from '../pygen.js';
import { generateDetalhamento } from '../detalhamento.js';
import { recordDeepen, getFewShot } from '../deepenHistory.js';

interface HistRow { pergunta_id: string; acao: string; modal_id: string; created_at: string }

const DET_PAGE_ID = 'detalhamentos';

export function registerPerguntas(app: Express, ctx: Ctx): void {
  const insert = ctx.db.prepare(`
    INSERT INTO perguntas_history
      (id, client, slug, pergunta_id, pergunta, acao, relevancia, nivel, section_id, block_id, modal_id, prompt, created_at)
    VALUES
      (@id, @client, @slug, @pergunta_id, @pergunta, @acao, @relevancia, @nivel, @section_id, @block_id, @modal_id, @prompt, @created_at)
  `);
  const histFor = ctx.db.prepare(
    `SELECT pergunta_id, acao, modal_id, created_at FROM perguntas_history
       WHERE client = ? AND slug = ? ORDER BY created_at ASC`,
  );

  const docPath = (client: string, slug: string): string | null => {
    const dir = analysisDir(ctx.out, client, slug);
    return dir ? path.join(dir, 'perguntas.json') : null;
  };
  const customPath = (dir: string): string => path.join(dir, 'perguntas_custom.json');
  const find = (doc: PerguntasDoc | null, pid: string): Pergunta | undefined =>
    (doc?.perguntas || []).find((p) => p.id === pid);
  /** Look a question up across the calc list and the custom (manually added) store. */
  const loadPergunta = (dir: string, pid: string): Pergunta | undefined =>
    find(readJson<PerguntasDoc>(path.join(dir, 'perguntas.json')), pid)
    ?? find(readJson<PerguntasDoc>(customPath(dir)), pid);

  function record(client: string, slug: string, p: Pergunta, acao: 'seguir' | 'ignorar' | 'detalhamento', resultSection = ''): void {
    insert.run({
      id: crypto.randomUUID(), client, slug,
      pergunta_id: p.id, pergunta: p.pergunta, acao,
      relevancia: p.relevancia ?? null, nivel: p.nivel || '',
      section_id: p.deepen?.sectionId || '', block_id: p.deepen?.blockId || '',
      modal_id: resultSection, prompt: p.deepen?.prompt || '',
      created_at: new Date().toISOString(),
    });
  }

  /** Latest meaningful status per pergunta from the append-only history. */
  function liveStatus(client: string, slug: string): Map<string, { status: 'seguida' | 'ignorada'; det?: string }> {
    const rows = histFor.all(client, slug) as HistRow[];
    const m = new Map<string, { status: 'seguida' | 'ignorada'; det?: string }>();
    for (const r of rows) {
      if (r.acao === 'ignorar') m.set(r.pergunta_id, { status: 'ignorada' });
      else if (r.acao === 'descartar') m.delete(r.pergunta_id);
      // SÓ o 'detalhamento' (seção gerada com sucesso) marca como FEITA. O 'seguir'
      // é só a INTENÇÃO, gravada antes da geração — se o detalhamento falha ou o
      // consultor cancela, fica só o 'seguir', e a pergunta NÃO pode aparecer feita.
      else if (r.acao === 'detalhamento' && r.modal_id) {
        m.set(r.pergunta_id, { status: 'seguida', det: r.modal_id });
      }
    }
    return m;
  }

  /** Ensure the report nav has a "Perguntas norteadoras" page (kind: perguntas). */
  function ensurePerguntasPage(dir: string): void {
    const dataFile = path.join(dir, 'data.json');
    const data = readJson<ReportData>(dataFile);
    if (!data) return;
    const pages = (data.pages ||= []);
    if (pages.some((p) => p.kind === 'perguntas')) return;
    pages.push({ id: 'perguntas', label: 'Perguntas de aprofundamento', kind: 'perguntas',
      sections: [{ id: 'perguntas', label: 'Perguntas de aprofundamento' }] } as PageRef);
    ctx.skipNextSSE.add('data.json');
    writeJson(dataFile, data);
  }

  /** Run the relevance calc (bank for standard analyses, else legacy input) and,
   *  when it yields questions, surface the board as a report page. */
  async function generateDoc(dir: string): Promise<void> {
    ctx.skipNextSSE.add('perguntas.json');
    await runPerguntasCalc(path.join(dir, 'dataset.json'), path.join(dir, 'perguntas.json'));
    const doc = readJson<PerguntasDoc>(path.join(dir, 'perguntas.json'));
    if (doc && (doc.perguntas || []).length) ensurePerguntasPage(dir);
  }

  app.get('/api/:client/:slug/perguntas', async (req, res) => {
    const { client, slug } = req.params;
    const dir = analysisDir(ctx.out, client, slug);
    const file = docPath(client, slug);
    // Deriva (ou re-deriva) as perguntas ranqueadas a partir do dataset quando o doc
    // está AUSENTE, VAZIO ou DEFASADO (dataset regenerado depois dele). Sem o caso
    // "vazio/defasado", um perguntas.json salvo sem perguntas — ou anterior a uma
    // regeração da análise — travava a página para sempre.
    const dsFile = dir ? path.join(dir, 'dataset.json') : '';
    if (dir && file && dsFile && fs.existsSync(dsFile)) {
      const existing = fs.existsSync(file) ? readJson<PerguntasDoc>(file) : null;
      const stale = !existing
        || !(existing.perguntas || []).length
        || fs.statSync(dsFile).mtimeMs > fs.statSync(file).mtimeMs;
      if (stale) await generateDoc(dir).catch(() => { /* fall through to empty */ });
    }
    const doc = file ? readJson<PerguntasDoc>(file) : null;
    // Idempotent: keep the nav page present even after the analysis is regenerated
    // (which rewrites data.json but leaves perguntas.json in place).
    if (dir && doc && (doc.perguntas || []).length) ensurePerguntasPage(dir);
    const custom = dir ? readJson<PerguntasDoc>(customPath(dir)) : null;
    const list = [...(doc?.perguntas || []), ...(custom?.perguntas || [])];
    const status = liveStatus(client, slug);
    const perguntas = list.map((p) => {
      const s = status.get(p.id);
      if (!s) return p;
      return { ...p, status: s.status, det: s.det ? { pageId: DET_PAGE_ID, sectionId: s.det } : undefined };
    });
    res.json({ pesos: doc?.pesos, efeito_ref: doc?.efeito_ref, perguntas });
  });

  /** Ensure the Detalhamentos page exists in data.json and holds this section. */
  function attachToDetalhamentos(dir: string, ref: { id: string; label: string }): void {
    const dataFile = path.join(dir, 'data.json');
    const data = readJson<ReportData>(dataFile) || { meta: {}, pages: [] };
    const pages = (data.pages ||= []);
    let page = pages.find((p) => p.id === DET_PAGE_ID);
    if (!page) {
      page = { id: DET_PAGE_ID, label: 'Aprofundamentos', sections: [] } as PageRef;
      const pi = pages.findIndex((p) => p.kind === 'perguntas');
      if (pi >= 0) pages.splice(pi, 0, page); else pages.push(page);
    }
    if (!page.sections.some((s) => s.id === ref.id)) page.sections.push(ref);
    ctx.skipNextSSE.add('data.json');
    writeJson(dataFile, data);
  }

  /** Generate the detalhamento for a question and land it as a new section on the
   *  Detalhamentos page. Shared by "seguir" and "Adicionar pergunta". */
  async function buildSection(dir: string, client: string, slug: string, p: Pergunta, badge: string, label: string,
    origem: 'pergunta' | 'custom', isAborted: () => boolean = () => false): Promise<{ sectionId: string; mocked: boolean; historyId: string }> {
    const idbase = p.id.toLowerCase().replace(/[^a-z0-9]/g, '');
    const sectionId = `det-${idbase}-${crypto.randomBytes(3).toString('hex')}`;
    if (!isSafeSeg(sectionId)) throw new Error('id inválido');
    // Seam de TESTE: simula uma geração demorada para o teste de integração conseguir
    // ABORTAR o request HTTP no meio (reproduz o consultor cancelando). Sem efeito em
    // produção — só liga quando DEEPEN_TEST_DELAY_MS está setado.
    const testDelay = Number(process.env.DEEPEN_TEST_DELAY_MS) || 0;
    if (testDelay > 0) await new Promise((r) => setTimeout(r, testDelay));
    let r;
    try {
      r = await generateDetalhamento({
        out: ctx.out, client, slug,
        srcSecId: p.deepen.sectionId, blockId: p.deepen.blockId, prompt: p.deepen.prompt,
        resultId: sectionId, objetivo: p.pergunta,
        fewShot: getFewShot(ctx.db, analysisTypeOf(client, slug, dir), 3),
        onProgress: (msg) => ctx.emitProgress?.(client, slug, msg),
      });
    } catch (e) {
      // falha também vira histórico (instrumentação do harness)
      recordDeepen(ctx.db, {
        client, slug, analysisType: analysisTypeOf(client, slug, dir), origem,
        sectionId: p.deepen.sectionId, blockId: p.deepen.blockId, modalId: sectionId,
        prompt: p.deepen.prompt, validatedOk: false,
        validationErrors: [(e as Error).message], mocked: false,
      });
      throw e;
    }
    // O consultor cancelou (fechou a modal / saiu) enquanto gerava: o request foi
    // abortado, mas a geração no servidor continuou até aqui. NÃO persiste a seção
    // nem grava o 'detalhamento' — senão a pergunta apareceria FEITA mesmo cancelada.
    if (isAborted()) {
      recordDeepen(ctx.db, {
        client, slug, analysisType: r.analysisType, origem,
        sectionId: p.deepen?.sectionId || '', blockId: p.deepen?.blockId || '', modalId: sectionId,
        prompt: p.deepen?.prompt || '', validatedOk: false,
        validationErrors: ['cancelado pelo consultor'], mocked: r.mocked,
      });
      throw new Error('cancelado pelo consultor');
    }
    if (r.datasetChanged) {
      ctx.skipNextSSE.add('dataset.json');
      writeJson(path.join(dir, 'dataset.json'), r.dataset);
    }
    const section: Section = { id: sectionId, header: { badge, title: p.pergunta, sub: p.justificativa }, widgets: r.widgets };
    const historyId = recordDeepen(ctx.db, {
      client, slug, analysisType: r.analysisType, origem,
      sectionId: p.deepen.sectionId, blockId: p.deepen.blockId, modalId: sectionId,
      prompt: p.deepen.prompt, cardContext: r.cardContext,
      modalJson: { title: p.pergunta, widgets: r.widgets },
      validatedOk: true, usage: r.usage, mocked: r.mocked,
      gateAttempts: r.gate.attempts, gateIssues: r.gate.issues, gateResidual: r.gate.residual,
    });
    section.historyId = historyId;   // âncora do rating no rodapé da seção
    ctx.skipNextSSE.add(`${sectionId}.json`);
    writeJson(path.join(dir, `${sectionId}.json`), section);
    // disposição decidida pelo agente de layout → grade de coordenadas da seção
    if (r.layout?.length) {
      const layoutFile = path.join(dir, 'layout.json');
      const layout = readJson<Layout>(layoutFile) || { sections: {} };
      (layout.sections ||= {})[sectionId] = r.layout;
      ctx.skipNextSSE.add('layout.json');
      writeJson(layoutFile, layout);
    }
    attachToDetalhamentos(dir, { id: sectionId, label });
    record(client, slug, p, 'detalhamento', sectionId);
    return { sectionId, mocked: r.mocked, historyId };
  }

  /** Tipo da análise (p/ few-shot e histórico): config da base ou controls.kind. */
  function analysisTypeOf(client: string, slug: string, dir: string): string {
    const baseCfg = readJson<Record<string, unknown>>(path.join(BASE, client, slug, 'config.json'));
    if (baseCfg) return typeOf(baseCfg).type;
    const nav = readJson<ReportData>(path.join(dir, 'data.json'));
    return typeOf(nav?.meta?.controls?.kind).type;
  }

  const shortLabel = (s: string): string => (s.length > 42 ? `${s.slice(0, 40)}…` : s);

  app.post('/api/:client/:slug/perguntas/:pid/seguir', async (req, res) => {
    const { client, slug, pid } = req.params;
    const dir = analysisDir(ctx.out, client, slug);
    if (!dir) { res.status(400).json({ error: 'bad path' }); return; }
    const p = loadPergunta(dir, pid);
    if (!p) { res.status(404).json({ error: 'pergunta não encontrada' }); return; }

    record(client, slug, p, 'seguir'); // intent (kept even if generation fails)
    // Detecta o consultor cancelar (fechar modal / sair) durante a geração: só a
    // RESPOSTA fechando ANTES de terminar é abort real. Usar req.on('close') daria
    // falso-positivo — o stream do corpo do POST fecha cedo, abortando toda geração.
    let clientGone = false;
    res.on('close', () => { if (!res.writableFinished) clientGone = true; });
    try {
      const { sectionId, mocked, historyId } = await buildSection(dir, client, slug, p, 'Aprofundamento', shortLabel(p.pergunta), 'pergunta', () => clientGone);
      res.json({ ok: true, mocked, pageId: DET_PAGE_ID, sectionId, historyId });
    } catch (e) {
      sendGenError(res, e);
    }
  });

  /** Adicionar pergunta: salva uma pergunta custom (sem cálculo de relevância) e já
   *  gera o detalhamento dela. */
  app.post('/api/:client/:slug/perguntas/custom', async (req, res) => {
    const { client, slug } = req.params;
    const dir = analysisDir(ctx.out, client, slug);
    if (!dir) { res.status(400).json({ error: 'bad path' }); return; }
    const body = (req.body || {}) as Record<string, unknown>;
    const text = String(body.pergunta || '').trim();
    if (!text) { res.status(400).json({ error: 'pergunta vazia' }); return; }

    const p: Pergunta = {
      id: `custom-${crypto.randomBytes(3).toString('hex')}`,
      pergunta: text,
      justificativa: String(body.justificativa || 'Pergunta adicionada manualmente pelo consultor.'),
      kpis: [], custom: true,
      deepen: {
        sectionId: String(body.sectionId || ''), blockId: String(body.blockId || ''),
        prompt: String(body.prompt || text),
      },
    };
    const store = readJson<PerguntasDoc>(customPath(dir)) || { perguntas: [] };
    store.perguntas.push(p);
    ctx.skipNextSSE.add('perguntas_custom.json');
    writeJson(customPath(dir), store);

    record(client, slug, p, 'seguir');
    let clientGone = false;
    res.on('close', () => { if (!res.writableFinished) clientGone = true; });
    try {
      const { sectionId, mocked, historyId } = await buildSection(dir, client, slug, p, 'Aprofundamento · Sua pergunta', `✎ ${shortLabel(text)}`, 'custom', () => clientGone);
      res.json({ ok: true, mocked, pageId: DET_PAGE_ID, sectionId, pergunta: p, historyId });
    } catch (e) {
      sendGenError(res, e);
    }
  });

  app.post('/api/:client/:slug/perguntas/:pid/ignorar', (req: Request, res: Response) => {
    const { client, slug, pid } = req.params;
    const dir = analysisDir(ctx.out, client, slug);
    const p = dir ? loadPergunta(dir, pid) : undefined;
    if (!p) { res.status(404).json({ error: 'pergunta não encontrada' }); return; }
    record(client, slug, p, 'ignorar');
    res.json({ ok: true });
  });

  app.get('/api/:client/:slug/perguntas/historico', (req, res) => {
    const { client, slug } = req.params;
    const rows = ctx.db.prepare(
      `SELECT id, pergunta_id, pergunta, acao, relevancia, nivel, section_id, block_id, modal_id, prompt, created_at
         FROM perguntas_history WHERE client = ? AND slug = ? ORDER BY created_at DESC`,
    ).all(client, slug);
    res.json({ total: rows.length, entries: rows });
  });

  app.post('/api/:client/:slug/perguntas/recalc', async (req, res) => {
    const { client, slug } = req.params;
    const dir = analysisDir(ctx.out, client, slug);
    if (!dir) { res.status(400).json({ error: 'bad path' }); return; }
    if (!fs.existsSync(path.join(dir, 'dataset.json'))) { res.status(404).json({ error: 'dataset.json ausente' }); return; }
    ctx.skipNextSSE.add('perguntas.json');
    const r = await runPerguntasCalc(path.join(dir, 'dataset.json'), path.join(dir, 'perguntas.json'));
    if (!r.ok) { res.status(500).json({ error: 'calc falhou', detail: r.stderr.trim() }); return; }
    res.json({ ok: true });
  });
}
