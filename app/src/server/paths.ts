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
export const PORT     = Number(process.env.PORT) || 3131;
