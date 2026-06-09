/* pygen.ts — runs the vendored Python pipeline (build_report) as a subprocess.
 *
 * The numeric/descriptive layer is pure deterministic Python; the Node server
 * only triggers it. Concurrency is bounded (a runaway dump aggregation eats
 * memory) and each (client/slug) is serialized so two runs never write the same
 * output dir at once. */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { PYSRC, PYTHON_BIN } from './paths.js';

export interface BuildReportArgs {
  csvPath: string;
  configPath: string;
  contentPath: string;
  outDir: string;
}

export interface PyResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

const SCRIPT = path.join(PYSRC, 'conversao-perfil', 'build_report.py');

function runBuildReport(a: BuildReportArgs): Promise<PyResult> {
  // The Windows `py` launcher needs `-3` before the script path; `python3` does not.
  const prefix = PYTHON_BIN === 'py' ? ['-3'] : [];
  const args = [...prefix, SCRIPT, a.configPath, a.contentPath, a.csvPath, a.outDir];
  return new Promise((resolve) => {
    const child = spawn(PYTHON_BIN, args, { windowsHide: true });
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
