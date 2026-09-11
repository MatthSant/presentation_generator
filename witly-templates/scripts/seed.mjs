#!/usr/bin/env node
/* seed — carrega os kits de seed/ no D1 como templates PUBLICADOS + os contextos gerais.
 *
 *   node scripts/seed.mjs --local        (D1 local do wrangler dev)
 *   node scripts/seed.mjs --remote       (D1 de produção)
 *   --bump patch|minor|major             (semver da versão nova; padrão patch = ajuste)
 *   node scripts/seed.mjs --sql out.sql  (só gera o SQL)
 *
 * Passos: kit-assemble (copia o motor do app) → fixture → gerar.py → exemplo/*.json →
 * SQL de INSERT (uma linha por arquivo; exemplo fica como JSON, o HTML é sintetizado
 * pelo Worker) → wrangler d1 execute. Re-rodar substitui a versão publicada do template
 * (número +1) sem tocar em rascunhos; kit cujo conteúdo (hash) não mudou é pulado (--force publica). Os .md daqui são SÓ a semente: depois disso a
 * fonte de verdade é o D1, editado na UI. */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleKit, kits } from './kit-assemble.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const SEED = path.join(ROOT, 'seed');
const PY = process.platform === 'win32' ? 'python' : 'python3';
const ORG = 'witly';
const AUTHOR = 'seed';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const BUMP = (() => { const i = process.argv.indexOf('--bump'); const v = i >= 0 ? process.argv[i + 1] : 'patch'; return ['patch', 'minor', 'major'].includes(v) ? v : 'patch'; })();
const id = () => crypto.randomUUID();

async function walk(dir, base = '') {
  const out = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${d.name}` : d.name;
    if (d.isDirectory()) { if (d.name === '__pycache__' || d.name === 'out') continue; out.push(...await walk(path.join(dir, d.name), rel)); }
    else out.push(rel);
  }
  return out;
}

/** Roda o gerar.py do kit sobre a fixture e devolve os JSON do exemplo. */
async function buildExample(slug) {
  const kit = path.join(SEED, slug);
  const py = path.join(kit, 'python');
  const tmp = await import('node:fs/promises').then((fs) => fs.mkdtemp(path.join(os.tmpdir(), 'witly-seed-')));
  try {
    const fixture = path.join(tmp, 'fixture.csv');
    execFileSync(PY, [path.join(py, 'tests', 'make_fixture.py')], { stdio: 'ignore' });
    if (existsSync(path.join(py, 'tests', 'fixture.csv'))) await cp(path.join(py, 'tests', 'fixture.csv'), fixture);
    const out = path.join(tmp, 'out');
    // sem viewer aqui de propósito: só as camadas (o HTML do exemplo é sintetizado no Worker)
    // auxiliares da fixture (goals/hist/dict), quando o kit os tem — o debriefing exige goals
    const aux = [];
    for (const k of ['goals', 'hist', 'dict']) {
      const f = path.join(py, 'tests', `${k}.csv`);
      if (existsSync(f)) aux.push(`--${k}`, f);
    }
    if (existsSync(path.join(py, 'exemplo', 'build.py'))) {
      // análise livre: o exemplo é um relatório inteiro montado em Python (relatorio.py) sobre dado sintético
      execFileSync(PY, [path.join(py, 'exemplo', 'build.py'), '--fixture', '--out', out], { stdio: ['ignore', 'ignore', 'inherit'] });
    } else {
      execFileSync(PY, [path.join(py, 'gerar.py'), '--config', path.join(py, 'tests', 'config.json'), '--csv', fixture, '--out', out, ...aux], { stdio: ['ignore', 'ignore', 'inherit'] });
    }
    const files = [];
    // variantes.json (filtros pré-calculados) fica fora do exemplo: pesa ~1 MB por versão e o kit gera de novo
    for (const f of await readdir(out)) if (f.endsWith('.json') && f !== 'variantes.json') files.push({ path: `exemplo/${f}`, content: await readFile(path.join(out, f), 'utf8') });
    return files;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** design-system.md: contrato (seed/_shared) + catálogo de widgets do app + regras de design.
 *  É documento da PLATAFORMA (platform_docs): um só para todos os templates, entra em todo zip. */
async function buildDesignSystemMd() {
  const APP = path.resolve(ROOT, '..', 'app');
  const contrato = await readFile(path.join(SEED, '_shared', 'design-system-contrato.md'), 'utf8');
  const widgets = await readFile(path.join(APP, 'docs', 'WIDGETS.md'), 'utf8');
  const claude = await readFile(path.resolve(ROOT, '..', 'CLAUDE.md'), 'utf8');
  const m = claude.match(/## Regras críticas de design[\s\S]*?(?=\n## |$)/);
  const regras = m ? m[0].replace('## Regras críticas de design', '## Regras críticas de design (do app)') : '';
  const cat = widgets.replace(/^# .*\n/, '').replace(/^> .*\n(> .*\n)*/m, '');
  return `${contrato.trimEnd()}\n\n${cat.trim()}\n\n${regras.trim()}\n`;
}

async function platformSql() {
  return [`DELETE FROM platform_docs WHERE slug = 'design-system';`];
}

function splitMd(md) {
  const m = md.match(/^#\s+(.+?)\s*\n([\s\S]*)$/);
  let title = m ? m[1].trim() : '', body = (m ? m[2] : md).trim();
  // contextos gerais: linha `Tipo: regra|recomendacao|definicao` logo abaixo do título
  let tipo = 'regra';
  const t = body.match(/^Tipo:\s*(regra|recomendacao|definicao|pergunta)\s*\n?/i);
  if (t) { tipo = t[1].toLowerCase(); body = body.slice(t[0].length).trim(); }
  // `Ordem: N` opcional (perguntas seguem a ordem do banco, não a alfabética do arquivo)
  let ordem = null;
  const o = body.match(/^Ordem:\s*(\d+)\s*\n?/i);
  if (o) { ordem = Number(o[1]); body = body.slice(o[0].length).trim(); }
  return { title, body, tipo, ordem };
}

/** D1 limita cada statement a 100 KB: arquivos grandes entram em pedaços
 * (INSERT do primeiro + UPDATE content = content || pedaço). */
const CHUNK = 60_000;
function fileSql(vid, f) {
  const parts = [];
  for (let i = 0; i < Math.max(1, f.content.length); i += CHUNK) parts.push(f.content.slice(i, i + CHUNK));
  const [first, ...rest] = parts;
  return [
    `INSERT INTO template_files (version_id, path, content) VALUES (${q(vid)}, ${q(f.path)}, ${q(first ?? '')});`,
    ...rest.map((c) => `UPDATE template_files SET content = content || ${q(c)} WHERE version_id = ${q(vid)} AND path = ${q(f.path)};`),
  ];
}

/** Próximo semver em SQL, a partir da publicada atual do template (NULL/0.x → 1.0.0).
 *  BUMP vem de --bump patch|minor|major (padrão patch): re-seed é ajuste. */
function semverSql(slug) {
  const cur = `(SELECT v.semver FROM templates t JOIN template_versions v ON v.id = t.published_version_id WHERE t.slug = ${q(slug)})`;
  const a = `CAST(substr(${cur}, 1, instr(${cur}, '.') - 1) AS INTEGER)`;
  const rest = `substr(${cur}, instr(${cur}, '.') + 1)`;
  const b = `CAST(substr(${rest}, 1, instr(${rest}, '.') - 1) AS INTEGER)`;
  const c = `CAST(substr(${rest}, instr(${rest}, '.') + 1) AS INTEGER)`;
  const next = BUMP === 'major' ? `(${a} + 1) || '.0.0'` : BUMP === 'minor' ? `${a} || '.' || (${b} + 1) || '.0'` : `${a} || '.' || ${b} || '.' || (${c} + 1)`;
  // entre parênteses: um CASE…END solto dentro do VALUES confunde o divisor de statements do wrangler
  return `(CASE WHEN ${cur} IS NULL OR ${cur} LIKE '0.%' THEN '1.0.0' ELSE ${next} END)`;
}

async function kitSql(slug) {
  const dir = path.join(SEED, slug);
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
  const files = [];
  const design = manifest.kind === 'design';
  if (design) {
    // contrato.md nasce das fontes de hoje; os elementos, do galeria.py (relatorio.py sobre dado sintético)
    files.push({ path: 'contrato.md', content: await buildDesignSystemMd() });
    execFileSync(PY, [path.join(dir, 'galeria.py')], { stdio: ['ignore', 'ignore', 'inherit'] });
  }
  for (const rel of await walk(dir)) {
    if (design && !rel.startsWith('elementos/')) continue;
    if (rel === 'manifest.json' || rel.startsWith('tarefas/') || rel.startsWith('regras/') || rel.startsWith('perguntas/') || rel.startsWith('viewer/') || rel === 'exemplo.html' || rel === 'design-system.md' || rel === 'perguntas.md') continue;
    if (rel.startsWith('python/tests/out')) continue;
    files.push({ path: rel, content: await readFile(path.join(dir, rel), 'utf8') });
  }
  if (!design) files.push(...await buildExample(slug));
  const tasks = [];
  // regras da análise: uma entrada por arquivo em regras/ (título = a regra, `Tipo:` no corpo)
  const rules = [];
  const rulesDir = path.join(dir, 'regras');
  if (existsSync(rulesDir)) {
    for (const [i, f] of (await readdir(rulesDir)).filter((x) => x.endsWith('.md')).entries()) {
      const { title, body, tipo } = splitMd(await readFile(path.join(rulesDir, f), 'utf8'));
      rules.push({ rule_id: f.replace(/\.md$/, ''), tipo, title: title || f, body, sort: i });
    }
  }
  // perguntas norteadoras: entradas tipo 'pergunta' na mesma tabela (título = a pergunta)
  const qDir = path.join(dir, 'perguntas');
  if (existsSync(qDir)) {
    for (const [i, f] of (await readdir(qDir)).filter((x) => x.endsWith('.md')).entries()) {
      const { title, body, ordem } = splitMd(await readFile(path.join(qDir, f), 'utf8'));
      rules.push({ rule_id: f.replace(/\.md$/, ''), tipo: 'pergunta', title: title || f, body, sort: 100 + (ordem ?? i) });
    }
  }
  const ctxDir = path.join(dir, 'tarefas');
  const order = (manifest.tarefas_contexto || []).map((t) => t.id);
  for (const f of (existsSync(ctxDir) ? await readdir(ctxDir) : []).filter((x) => x.endsWith('.md'))) {   // o design system não tem tarefas
    const task_id = f.replace(/\.md$/, '');
    const { title, body } = splitMd(await readFile(path.join(ctxDir, f), 'utf8'));
    tasks.push({ task_id, title: title || task_id, body, sort: order.indexOf(task_id) === -1 ? 99 : order.indexOf(task_id) });
  }
  const { slug: _s, name, objective, when_to_use, ...rest } = manifest;
  // hash do conteúdo (sem o exemplo, que é derivado): igual ao publicado = não publica de novo
  const hash = createHash('sha256').update(JSON.stringify({
    manifest: rest,
    files: files.filter((f) => !f.path.startsWith('exemplo/')).map((f) => [f.path, f.content]).sort(),
    tasks: tasks.map((x) => [x.task_id, x.title, x.body, x.sort]).sort(),
    rules: rules.map((x) => [x.rule_id, x.tipo, x.title, x.body, x.sort]).sort(),
  })).digest('hex');
  const vid = id();
  const sql = [
    `INSERT INTO templates (slug, org_id, name, objective, when_to_use, kind) VALUES (${q(slug)}, ${q(ORG)}, ${q(name)}, ${q(objective || '')}, ${q(when_to_use || '')}, ${q(manifest.kind || 'analise')})
       ON CONFLICT(slug) DO UPDATE SET name = excluded.name, objective = excluded.objective, when_to_use = excluded.when_to_use, kind = excluded.kind;`,
    `INSERT INTO template_versions (id, slug, number, state, author_email, manifest_json, published_at, semver, content_hash)
       VALUES (${q(vid)}, ${q(slug)}, COALESCE((SELECT MAX(number) FROM template_versions WHERE slug = ${q(slug)}), 0) + 1, 'published', ${q(AUTHOR)}, ${q(JSON.stringify(rest))}, strftime('%Y-%m-%dT%H:%M:%fZ','now'),
               ${semverSql(slug)}, ${q(hash)});`,
    ...files.flatMap((f) => fileSql(vid, f)),
    ...tasks.map((t) => `INSERT INTO context_tasks (version_id, task_id, title, body_md, sort) VALUES (${q(vid)}, ${q(t.task_id)}, ${q(t.title)}, ${q(t.body)}, ${t.sort});`),
    ...rules.map((r) => `INSERT INTO template_rules (version_id, rule_id, tipo, title, body_md, sort) VALUES (${q(vid)}, ${q(r.rule_id)}, ${q(r.tipo)}, ${q(r.title)}, ${q(r.body)}, ${r.sort});`),
    `UPDATE templates SET published_version_id = ${q(vid)} WHERE slug = ${q(slug)};`,
  ];
  return { sql, files: files.length, tasks: tasks.length, rules: rules.length, hash };
}

async function generalSql() {
  const dir = path.join(SEED, 'general-contexts');
  const sql = [];
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.md'))) {
    const slug = f.replace(/\.md$/, '');
    const { title, body, tipo } = splitMd(await readFile(path.join(dir, f), 'utf8'));
    sql.push(`INSERT INTO general_contexts (slug, org_id, title, body_md, tipo, author_email) VALUES (${q(slug)}, ${q(ORG)}, ${q(title || slug)}, ${q(body)}, ${q(tipo)}, ${q(AUTHOR)})
      ON CONFLICT(slug) DO UPDATE SET title = excluded.title, body_md = excluded.body_md, tipo = excluded.tipo, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');`);
  }
  return sql;
}

async function main() {
  const args = process.argv.slice(2);
  const remote = args.includes('--remote');
  const sqlOut = args.includes('--sql') ? args[args.indexOf('--sql') + 1] : null;
  const force = args.includes('--force');
  const target = remote ? '--remote' : '--local';
  // Chama o wrangler pelo Node (sem npx/.cmd: no Windows o spawn de .cmd exige shell).
  const wrangler = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  // hash do que está publicado hoje: kit igual não vira versão nova
  const atual = new Map();
  if (!sqlOut && !force) {
    try {
      const out = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'witly-templates', target, '--json',
        '--command', 'SELECT t.slug, v.content_hash, v.author_email FROM templates t JOIN template_versions v ON v.id = t.published_version_id'], { encoding: 'utf8', cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
      for (const r of JSON.parse(out)[0].results) atual.set(r.slug, { hash: r.content_hash, autor: r.author_email });
    } catch { /* banco vazio ou sem a coluna: publica tudo */ }
  }
  const lines = ['-- gerado por scripts/seed.mjs', 'INSERT OR IGNORE INTO orgs (id, name) VALUES (\'witly\', \'Witly\');'];
  let publicados = 0;
  for (const slug of await kits()) {
    const a = await assembleKit(slug);
    const k = await kitSql(slug);
    const cur = atual.get(slug);
    if (cur && cur.hash === k.hash) { console.log(`kit ${slug}: igual à publicada (hash), pulado`); continue; }
    // a publicada foi editada por pessoa na UI: o seed não sobrescreve (--force para forçar)
    if (cur && cur.autor && cur.autor !== AUTHOR && !force) { console.log(`kit ${slug}: publicada por ${cur.autor} (não pelo seed), pulado — use --force para sobrescrever`); continue; }
    lines.push(...k.sql);
    publicados++;
    console.log(`kit ${slug}: motor ${a.engine}, ${k.files} arquivos, ${k.tasks} tarefas, ${k.rules} regras/perguntas`);
  }
  const g = await generalSql();
  lines.push(...g);
  console.log(`contextos gerais: ${g.length}`);
  lines.push(...await platformSql());
  console.log('documentos da plataforma: design-system');
  const file = sqlOut || path.join(os.tmpdir(), `witly-seed-${Date.now()}.sql`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, lines.join('\n') + '\n', 'utf8');
  console.log(`SQL: ${file} (${Math.round((await readFile(file)).length / 1024)} KB)`);
  if (sqlOut) return;
  console.log(`templates publicados: ${publicados}`);
  execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'witly-templates', target, `--file=${file}`, '-y'], { stdio: ['ignore', 'ignore', 'inherit'], cwd: ROOT });
  if (!remote) await rm(file, { force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
