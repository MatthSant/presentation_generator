#!/usr/bin/env node
/* kit-assemble — copia o motor Python do app (fonte única) para dentro de cada kit em seed/:
 *   app/pysrc/<pysrcDir>/{calc,build_report,query_api,render_view}.py → seed/<slug>/python/
 *   app/pysrc/common/*.py                                            → seed/<slug>/python/common/
 *   app/pysrc/perguntas/perguntas_calc.py + banks/<bank>.py          → seed/<slug>/python/perguntas/
 *     (com um banks/__init__.py LOCAL que registra só o banco do kit)
 * O mapeamento vem de seed/<slug>/manifest.json (`engine`, `perguntas_bank`) ou dos defaults.
 * As cópias são gitignored; rode antes de `test:py`, `seed` e `parity`. */

import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const PYSRC = path.resolve(ROOT, '..', 'app', 'pysrc');
const SEED = path.join(ROOT, 'seed');

const DEFAULT_ENGINE = { 'acompanhamento-diario': 'acompanhamento-lancamento' };
const DEFAULT_BANK = { 'acompanhamento-diario': 'acompanhamento_lancamento' };
const ENGINE_FILES = ['calc.py', 'build_report.py', 'query_api.py', 'render_view.py'];

export async function assembleKit(slug) {
  const dir = path.join(SEED, slug);
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
  const engine = manifest.engine || DEFAULT_ENGINE[slug];
  if (!engine) throw new Error(`kit ${slug}: sem 'engine' no manifest`);
  const bank = manifest.perguntas_bank || DEFAULT_BANK[slug] || null;
  const py = path.join(dir, 'python');
  await mkdir(path.join(py, 'common'), { recursive: true });
  let n = 0;
  for (const f of ENGINE_FILES) {
    try { await copyFile(path.join(PYSRC, engine, f), path.join(py, f)); n++; } catch { /* opcional */ }
  }
  for (const f of await readdir(path.join(PYSRC, 'common'))) {
    if (f.endsWith('.py')) { await copyFile(path.join(PYSRC, 'common', f), path.join(py, 'common', f)); n++; }
  }
  if (bank) {
    const pq = path.join(py, 'perguntas');
    await mkdir(path.join(pq, 'banks'), { recursive: true });
    await copyFile(path.join(PYSRC, 'perguntas', 'perguntas_calc.py'), path.join(pq, 'perguntas_calc.py'));
    await copyFile(path.join(PYSRC, 'perguntas', 'banks', `${bank}.py`), path.join(pq, 'banks', `${bank}.py`));
    await writeFile(path.join(pq, '__init__.py'), '');
    await writeFile(path.join(pq, 'banks', '__init__.py'), `"""Registry LOCAL do kit: só o banco deste template (gerado pelo kit-assemble)."""
from . import ${bank}

BANKS = [${bank}]


def pick_bank(dataset):
    for b in BANKS:
        try:
            if b.detect(dataset):
                return b
        except Exception:
            continue
    return None
`);
    n += 4;
  }
  return { slug, engine, bank, files: n };
}

export async function kits() {
  const out = [];
  for (const d of await readdir(SEED, { withFileTypes: true })) {
    if (d.isDirectory() && !d.name.startsWith('_') && d.name !== 'general-contexts') out.push(d.name);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const slug of await kits()) {
    const r = await assembleKit(slug);
    console.log(`kit ${r.slug}: motor ${r.engine}${r.bank ? `, perguntas ${r.bank}` : ''} (${r.files} arquivos)`);
  }
}
