#!/usr/bin/env node
/* import-deepen-history — importa o `deepen_history` do app (SQLite) como atividade
 * inicial do Grimório (spec 002 US5):
 *
 *   node scripts/import-deepen-history.mjs <comments.db> [--local|--remote] [--sql out.sql]
 *
 * Mapeia analysis_type → slug do template, extrai pergunta (prompt) e resposta (texto dos
 * widgets do modal_json), rating/status/feedback, e grava em `activity` com origem='app'.
 * Cada linha passa pelo gate de PII (mesmas regras de src/kit/pii.ts); as recusadas vão
 * para o relatório. O app não guarda o e-mail do consultor: autor = app@import. */

import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

export const TYPE_TO_SLUG = {
  'acompanhamento-lancamento': 'acompanhamento-diario',
  'debriefing-lancamento': 'debriefing',
  'historico-lancamentos': 'historico-lancamentos',
  'criativos': 'criativos',
  'conversao-perfil': 'conversao-perfil',
};
export const AUTHOR = 'app@import';
const ORG = 'witly';

// ── gate de PII (espelho de src/kit/pii.ts) ─────────────────────────────────
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+55\s?)?(?:\(?[1-9]{2}\)?[\s.-]?)(?:9\s?)?\d{4}[\s.-]\d{4}\b/g;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
function cpfValido(s) {
  const d = s.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (n) => { let sum = 0; for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i); const r = (sum * 10) % 11; return r === 10 ? 0 : r; };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
export function scanPii(text) {
  const hits = [];
  if (text.includes('@')) for (const m of text.matchAll(EMAIL)) hits.push(`email ${m[0].slice(0, 2)}…`);
  if (!/\d{4}/.test(text)) return hits;
  for (const m of text.matchAll(CPF)) if (cpfValido(m[0])) hits.push('cpf');
  for (const m of text.matchAll(PHONE)) { const d = m[0].replace(/\D/g, ''); if (d.length >= 10 && d.length <= 13) hits.push('telefone'); }
  return hits;
}

/** Texto legível dos widgets de um modal/seção gerada (título + prosa), sem números inventados. */
export function respostaFromModal(modalJson) {
  let m; try { m = JSON.parse(modalJson || '{}'); } catch { return ''; }
  const out = [];
  const widgets = Array.isArray(m.widgets) ? m.widgets : (Array.isArray(m.blocks) ? m.blocks : []);
  if (m.title) out.push(`# ${m.title}`);
  for (const w of widgets) {
    if (!w || typeof w !== 'object') continue;
    const parts = [w.label, w.title, w.text, w.detail, w.why, w.action].filter((x) => typeof x === 'string' && x.trim());
    if (parts.length) out.push(`- [${w.type || '?'}] ${parts.join(' — ')}`);
  }
  return out.join('\n');
}

export function mapRow(r) {
  const slug = TYPE_TO_SLUG[r.analysis_type] || r.analysis_type;
  const descartado = r.status === 'descartado';
  const motivo = descartado ? String(r.feedback_text || '').replace(/^.*?descartado:\s*/s, '').trim() || null : null;
  const dados = { pergunta: String(r.prompt || '').trim(), resposta: respostaFromModal(r.modal_json), consultas: [], origem_app: { client: r.client, slug: r.slug, origem: r.origem, section_id: r.section_id, model: r.model } };
  return { id: `app-${r.id}`, slug, cliente: r.client || null, dados, avaliacao: r.rating ?? null, descartado, motivo, at: r.created_at };
}

const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);

export function importRows(rows) {
  const sql = []; const skipped = []; let ok = 0;
  for (const r of rows) {
    const a = mapRow(r);
    if (!a.dados.pergunta) { skipped.push({ id: r.id, motivo: 'sem prompt' }); continue; }
    const pii = scanPii(JSON.stringify({ dados: a.dados, cliente: a.cliente, motivo: a.motivo }));
    if (pii.length) { skipped.push({ id: r.id, motivo: `PII: ${pii.join(', ')}` }); continue; }
    sql.push(`INSERT OR IGNORE INTO activity (id, org_id, email, evento, slug, version_number, cliente, pergunta_id, dados_json, avaliacao, descartado, motivo, origem, at)
  VALUES (${q(a.id)}, ${q(ORG)}, ${q(AUTHOR)}, 'aprofundamento', ${q(a.slug)}, NULL, ${q(a.cliente)}, NULL, ${q(JSON.stringify(a.dados))}, ${a.avaliacao == null ? 'NULL' : Number(a.avaliacao)}, ${a.descartado ? 1 : 0}, ${q(a.motivo)}, 'app', ${q(a.at)});`);
    ok++;
  }
  return { sql, ok, skipped };
}

export function readHistory(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare('SELECT id, client, slug, analysis_type, origem, section_id, prompt, modal_json, model, rating, feedback_text, status, created_at FROM deepen_history ORDER BY created_at').all();
  } finally { db.close(); }
}

async function main() {
  const [dbPath, ...args] = process.argv.slice(2);
  if (!dbPath) { console.error('uso: import-deepen-history.mjs <comments.db> [--local|--remote] [--sql out.sql]'); process.exit(2); }
  const rows = readHistory(dbPath);
  const { sql, ok, skipped } = importRows(rows);
  console.log(`linhas: ${rows.length} · importáveis: ${ok} · puladas: ${skipped.length}`);
  for (const s of skipped.slice(0, 30)) console.log(`  pulada ${s.id}: ${s.motivo}`);
  const sqlOut = args.includes('--sql') ? args[args.indexOf('--sql') + 1] : null;
  const file = sqlOut || path.join(os.tmpdir(), `witly-import-${Date.now()}.sql`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, sql.join('\n') + '\n', 'utf8');
  console.log(`SQL: ${file} (${Math.round((await readFile(file)).length / 1024)} KB)`);
  if (sqlOut || !sql.length) return;
  const target = args.includes('--remote') ? '--remote' : '--local';
  const wrangler = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'witly-templates', target, `--file=${file}`, '-y'], { stdio: ['ignore', 'ignore', 'inherit'], cwd: ROOT });
  if (!sqlOut) await rm(file, { force: true });
  console.log(`importado no D1 ${target}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
