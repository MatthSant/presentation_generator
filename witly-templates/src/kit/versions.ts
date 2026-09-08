/* versions — diff entre duas versões de um template (spec 002 US4). Textual, por
 * arquivo/tarefa/manifesto: added | removed | changed, com diff de linhas (LCS) para
 * textos até 64 KB; acima disso só o status. */

import { getContextTasks, getTemplateRules, getVersionByNumber, getVersionFiles } from '../db/index.js';

export type ChangeKind = 'added' | 'removed' | 'changed';
export interface FileDiff { path: string; kind: ChangeKind; lines?: string[] }
export interface VersionDiff { from: number; to: number; files: FileDiff[]; tasks: FileDiff[]; rules: FileDiff[]; manifest: FileDiff | null }

const MAX_DIFF_BYTES = 64 * 1024;

/** Diff de linhas mínimo (LCS) no formato unificado simplificado: "+", "-", " ". */
export function lineDiff(a: string, b: string, context = 2): string[] {
  const A = a.split('\n'); const B = b.split('\n');
  const n = A.length; const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: Array<[' ' | '+' | '-', string]> = [];
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { ops.push([' ', A[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(['-', A[i]]); i++; }
    else { ops.push(['+', B[j]]); j++; }
  }
  while (i < n) ops.push(['-', A[i++]]);
  while (j < m) ops.push(['+', B[j++]]);
  // Mantém só linhas alteradas + contexto
  const keep = new Set<number>();
  ops.forEach(([k], idx) => { if (k !== ' ') for (let d = -context; d <= context; d++) keep.add(idx + d); });
  const out: string[] = [];
  let lastKept = -2;
  ops.forEach(([k, line], idx) => {
    if (!keep.has(idx)) return;
    if (idx !== lastKept + 1 && out.length) out.push('…');
    out.push(`${k} ${line}`);
    lastKept = idx;
  });
  return out;
}

function diffText(path: string, a: string | undefined, b: string | undefined): FileDiff | null {
  if (a === b) return null;
  if (a === undefined) return { path, kind: 'added' };
  if (b === undefined) return { path, kind: 'removed' };
  const big = a.length > MAX_DIFF_BYTES || b.length > MAX_DIFF_BYTES;
  return { path, kind: 'changed', lines: big ? undefined : lineDiff(a, b) };
}

export async function diffVersions(db: D1Database, slug: string, from: number, to: number): Promise<VersionDiff> {
  const [va, vb] = await Promise.all([getVersionByNumber(db, slug, from), getVersionByNumber(db, slug, to)]);
  if (!va || !vb) throw new Error('versão inexistente');
  const [fa, fb, ta, tb, ra, rb] = await Promise.all([
    getVersionFiles(db, va.id), getVersionFiles(db, vb.id),
    getContextTasks(db, va.id), getContextTasks(db, vb.id),
    getTemplateRules(db, va.id), getTemplateRules(db, vb.id),
  ]);
  const A = new Map(fa.map((f) => [f.path, f.content])); const B = new Map(fb.map((f) => [f.path, f.content]));
  const files: FileDiff[] = [];
  for (const p of new Set([...A.keys(), ...B.keys()])) { const d = diffText(p, A.get(p), B.get(p)); if (d) files.push(d); }
  const TA = new Map(ta.map((t) => [t.task_id, `# ${t.title}\n\n${t.body_md}`])); const TB = new Map(tb.map((t) => [t.task_id, `# ${t.title}\n\n${t.body_md}`]));
  const tasks: FileDiff[] = [];
  for (const id of new Set([...TA.keys(), ...TB.keys()])) { const d = diffText(id, TA.get(id), TB.get(id)); if (d) tasks.push(d); }
  const rulize = (r: { tipo: string; title: string; body_md: string }) => `${r.tipo}: ${r.title}

${r.body_md}`;
  const RA = new Map(ra.map((r) => [r.rule_id, rulize(r)])); const RB = new Map(rb.map((r) => [r.rule_id, rulize(r)]));
  const rules: FileDiff[] = [];
  for (const id of new Set([...RA.keys(), ...RB.keys()])) { const d = diffText(id, RA.get(id), RB.get(id)); if (d) rules.push(d); }
  const pretty = (s: string) => { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } };
  const manifest = diffText('manifest.json', pretty(va.manifest_json), pretty(vb.manifest_json));
  files.sort((x, y) => x.path.localeCompare(y.path)); tasks.sort((x, y) => x.path.localeCompare(y.path)); rules.sort((x, y) => x.path.localeCompare(y.path));
  return { from, to, files, tasks, rules, manifest };
}
