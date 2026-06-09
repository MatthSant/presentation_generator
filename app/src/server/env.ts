/* env.ts — minimal .env loader (no dependency). Imported FIRST by index.ts so
 * variables are present before paths/db/auth read them. A real env var always
 * wins over the file. Put secrets in app/.env (gitignored) — never commit it. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = process.env.ENV_FILE || path.join(here, '..', '..', '.env'); // app/.env

if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (key && !(key in process.env)) process.env[key] = val;
  }
}
