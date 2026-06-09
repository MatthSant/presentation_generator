/* paths.ts — filesystem layout, overridable via env for tests/isolation.
 *
 * Compiled output lives at app/dist/server/ and dev runs from app/src/server/ —
 * both are two levels below the app root, so APP_ROOT is symmetric. */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.join(here, '..', '..');           // app/
export const PUBLIC   = path.join(APP_ROOT, 'public');
export const OUT      = process.env.APP_OUT || path.join(APP_ROOT, '..', 'output');
export const DB_PATH  = process.env.APP_DB  || path.join(APP_ROOT, 'data', 'comments.db');
/** Append-only JSONL log of every Claude API call (request + response/error). */
export const CLAUDE_LOG = process.env.CLAUDE_LOG || path.join(APP_ROOT, 'data', 'claude-log.jsonl');
export const PORT     = Number(process.env.PORT) || 3131;

/** Vendored Python pipeline (build_report/conv_calc). Container-safe — does not
 *  depend on .claude/ being present. Override with PYSRC_DIR. */
export const PYSRC    = process.env.PYSRC_DIR || path.join(APP_ROOT, 'pysrc');
/** Scratch dir for raw uploads + transient config/content. NOT served by
 *  express.static (lives outside PUBLIC and OUT) so raw CSVs can't leak. */
export const SCRATCH  = process.env.APP_SCRATCH || path.join(APP_ROOT, '.scratch');
/** Retained base data per analysis (dump + config) for on-demand crossings
 *  (Fase 3b). Outside the served tree. At-rest encryption = encrypted volume in
 *  production. Override/relocate with APP_BASE. */
export const BASE     = process.env.APP_BASE || path.join(APP_ROOT, '.base');
/** Python interpreter. Windows uses the `py -3` launcher; *nix `python3`. */
export const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'py' : 'python3');
