#!/usr/bin/env node
/* test-kits — roda, para CADA kit de seed/: kit-assemble → unittest (python/tests) →
 * paridade kit == app (scripts/parity.mjs). Só stdlib Python; falha no 1º erro.
 *
 *   node scripts/test-kits.mjs            (todos)
 *   node scripts/test-kits.mjs debriefing (um kit)
 *   node scripts/test-kits.mjs --no-parity */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleKit, kits } from './kit-assemble.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const PY = process.platform === 'win32' ? 'python' : 'python3';
const args = process.argv.slice(2);
const noParity = args.includes('--no-parity');
const only = args.filter((a) => !a.startsWith('--'));

let failed = 0;
for (const slug of await kits()) {
  if (only.length && !only.includes(slug)) continue;
  const a = await assembleKit(slug);
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'seed', slug, 'manifest.json'), 'utf8'));
  const py = path.join(ROOT, 'seed', slug, 'python');
  process.stdout.write(`\n== ${slug} (motor ${a.engine})\n`);
  try {
    execFileSync(PY, ['-m', 'unittest', 'discover', '-s', path.join(py, 'tests'), '-t', py], { stdio: 'inherit', cwd: py });
  } catch { failed++; console.error(`✗ unittest falhou: ${slug}`); continue; }
  if (!noParity && manifest.engine) {
    try {
      execFileSync(process.execPath, [path.join(here, 'parity.mjs'), slug, manifest.engine], { stdio: 'inherit', cwd: ROOT });
    } catch { failed++; console.error(`✗ paridade falhou: ${slug}`); }
  }
}
if (failed) { console.error(`\n${failed} kit(s) com falha`); process.exit(1); }
console.log('\ntodos os kits OK');
