/* pygen.ts — runs the vendored Python pipeline (build_report) as a subprocess.
 *
 * The numeric/descriptive layer is pure deterministic Python; the Node server
 * only triggers it. Concurrency is bounded (a runaway dump aggregation eats
 * memory) and each (client/slug) is serialized so two runs never write the same
 * output dir at once. */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PYSRC, PYTHON_BIN, BASE } from './paths.js';
import { typeOf } from './typeRegistry.js';

export interface BuildReportArgs {
  csvPath: string;
  configPath: string;
  contentPath: string;
  outDir: string;
  /** Analysis type → which generator runs (pysrc/<type>/build_report.py). */
  type?: string;
}

export interface PyResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

/** Each analysis type vends its own build_report.py under pysrc/<dir>/ (registry). */
const buildScript = (type?: string) => path.join(PYSRC, typeOf(type).pysrcDir, 'build_report.py');

/** Tipo da análise a partir do config retido em .base (fallback: conversao-perfil). */
function baseType(baseDir: string): ReturnType<typeof typeOf> {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(baseDir, 'config.json'), 'utf8')) as { type?: string };
    return typeOf(cfg);
  } catch { return typeOf(undefined); }
}

/** Force Python stdout/stderr to UTF-8 — on Windows the default codepage (cp1252)
 *  would mangle acentos in the JSON the Node side captures (→ "n�o"). */
const PY_SPAWN = { windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } };

function runBuildReport(a: BuildReportArgs): Promise<PyResult> {
  // The Windows `py` launcher needs `-3` before the script path; `python3` does not.
  const prefix = PYTHON_BIN === 'py' ? ['-3'] : [];
  const args = [...prefix, buildScript(a.type), a.configPath, a.contentPath, a.csvPath, a.outDir];
  return new Promise((resolve) => {
    const child = spawn(PYTHON_BIN, args, PY_SPAWN);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => resolve({ ok: false, stdout, stderr: `${stderr}\n${e.message}`, code: null }));
    child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr, code }));
  });
}

// --- concurrency control -----------------------------------------------------

const MAX = Math.max(1, Number(process.env.PYGEN_MAX) || 2);
let active = 0;
const waiters: Array<() => void> = [];
const locked = new Set<string>();

function acquireSlot(): Promise<void> {
  if (active < MAX) { active++; return Promise.resolve(); }
  return new Promise((r) => waiters.push(r));
}
function releaseSlot(): void {
  const next = waiters.shift();
  if (next) next();
  else active--;
}

/** Run build_report under the global semaphore + a per-key lock. Throws if the
 *  same (client/slug) is already generating. */
export async function runGeneration(key: string, args: BuildReportArgs): Promise<PyResult> {
  if (locked.has(key)) throw new Error('busy');
  locked.add(key);
  await acquireSlot();
  try {
    return await runBuildReport(args);
  } finally {
    releaseSlot();
    locked.delete(key);
  }
}

// --- Perguntas norteadoras: cálculo fixo de relevância ----------------------

const PERGUNTAS_SCRIPT = path.join(PYSRC, 'perguntas', 'perguntas_calc.py');

/** Run the deterministic relevance calc: perguntas_input.json → perguntas.json.
 *  Pure Python (stdlib), no LLM. Returns the PyResult so callers can surface stderr. */
export async function runPerguntasCalc(inputPath: string, outputPath: string): Promise<PyResult> {
  const prefix = PYTHON_BIN === 'py' ? ['-3'] : [];
  const args = [...prefix, PERGUNTAS_SCRIPT, inputPath, outputPath];
  await acquireSlot();
  return new Promise<PyResult>((resolve) => {
    const child = spawn(PYTHON_BIN, args, PY_SPAWN);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => resolve({ ok: false, stdout, stderr: `${stderr}\n${e.message}`, code: null }));
    child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr, code }));
  }).finally(releaseSlot);
}

// --- Recompute da vista filtrada (controles interativos), por tipo ----------

/** Recompute the filtered view over the retained base, using the type's
 *  renderScript (registry). Returns null when there is no base or the type has
 *  no render script. (Antigo runHistoricoRender, generalizado.) */
export async function runRenderView(client: string, slug: string, opts: unknown): Promise<Record<string, unknown> | null> {
  const baseDir = path.join(BASE, client, slug);
  const config = path.join(baseDir, 'config.json');
  const dump = path.join(baseDir, 'dump.csv');
  if (!fs.existsSync(config) || !fs.existsSync(dump)) return null;
  const def = baseType(baseDir);
  if (!def.renderScript) return null;
  const script = path.join(PYSRC, def.pysrcDir, def.renderScript);

  const prefix = PYTHON_BIN === 'py' ? ['-3'] : [];
  const a = [...prefix, script, config, dump, JSON.stringify(opts ?? {})];
  await acquireSlot();
  return new Promise<Record<string, unknown>>((resolve) => {
    const child = spawn(PYTHON_BIN, a, PY_SPAWN);
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => resolve({ error: e.message }));
    child.on('close', () => {
      try { resolve(JSON.parse(out.trim().split('\n').pop() || '{}') as Record<string, unknown>); }
      catch { resolve({ error: err || out || 'sem saída' }); }
    });
  }).finally(releaseSlot);
}

// --- Fase 3b: on-demand query over the retained base ------------------------

export interface QueryResult { status: string; [k: string]: unknown }

/** Run a catalog query over the retained dump, using the type's queryScript
 *  (registry). Returns null when there is no base OR the type doesn't support
 *  on-demand queries (deep deepen unavailable). Always returns aggregates. */
export async function runQuery(client: string, slug: string, fn: string, args: unknown): Promise<QueryResult | null> {
  const baseDir = path.join(BASE, client, slug);
  const config = path.join(baseDir, 'config.json');
  const dump = path.join(baseDir, 'dump.csv');
  if (!fs.existsSync(config) || !fs.existsSync(dump)) return null;
  const def = baseType(baseDir);
  if (!def.queryScript) return null;
  const script = path.join(PYSRC, def.pysrcDir, def.queryScript);

  const prefix = PYTHON_BIN === 'py' ? ['-3'] : [];
  const a = [...prefix, script, config, dump, fn, JSON.stringify(args ?? {})];
  await acquireSlot();
  return new Promise<QueryResult>((resolve) => {
    const child = spawn(PYTHON_BIN, a, PY_SPAWN);
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => resolve({ status: 'erro', motivo: e.message }));
    child.on('close', () => {
      try { resolve(JSON.parse(out.trim().split('\n').pop() || '{}') as QueryResult); }
      catch { resolve({ status: 'erro', motivo: err || out || 'sem saída' }); }
    });
  }).finally(releaseSlot);
}
