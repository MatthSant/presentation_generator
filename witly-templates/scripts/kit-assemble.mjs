#!/usr/bin/env node
/* kit-assemble — copia o motor Python do app (fonte única) para dentro de cada kit em seed/:
 *   app/pysrc/<pysrcDir>/{calc,build_report,render_view}.py → seed/<slug>/python/
 *   app/pysrc/common/*.py                                            → seed/<slug>/python/common/
 * O mapeamento vem de seed/<slug>/manifest.json (`engine`) ou dos defaults. O kit NÃO leva
 * query_api.py nem perguntas/ (eram o deep mode do app antigo): o agente escreve o corte
 * em Python importando calc.py; as perguntas são entradas do template (spec 005).
 * Copia também o viewer offline (public/viewer/ → seed/<slug>/viewer/), que o gerar.py
 * embute no relatorio.html; rode `npm run build` antes, se ele ainda não existir.
 * As cópias são gitignored; rode antes de `test:py`, `seed` e `parity`. */

import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const PYSRC = path.resolve(ROOT, '..', 'app', 'pysrc');
const SEED = path.join(ROOT, 'seed');

const DEFAULT_ENGINE = { 'acompanhamento-diario': 'acompanhamento-lancamento' };
const ENGINE_FILES = ['calc.py', 'conv_calc.py', 'build_report.py', 'render_view.py'];
const SHARED = path.join(SEED, '_shared');
const VIEWER = path.join(ROOT, 'public', 'viewer');

export async function assembleKit(slug) {
  const dir = path.join(SEED, slug);
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
  if (manifest.kind === 'design') return { slug, engine: 'design', files: 0 };   // só contrato, regras e elementos
  const engine = manifest.engine || DEFAULT_ENGINE[slug] || null;
  if (!engine && !manifest.livre) throw new Error(`kit ${slug}: sem 'engine' no manifest (ou marque "livre": true)`);
  const py = path.join(dir, 'python');
  await mkdir(path.join(py, 'common'), { recursive: true });
  let n = 0;
  for (const f of engine ? ENGINE_FILES : []) {
    try { await copyFile(path.join(PYSRC, engine, f), path.join(py, f)); n++; } catch { /* opcional */ }
  }
  // Scripts compartilhados por todos os kits (gerar.py, aprofundar.py).
  for (const f of await readdir(SHARED)) {
    if (f.endsWith('.py')) { await copyFile(path.join(SHARED, f), path.join(py, f)); n++; }
  }
  for (const f of await readdir(path.join(PYSRC, 'common'))) {
    if (f.endsWith('.py')) { await copyFile(path.join(PYSRC, 'common', f), path.join(py, 'common', f)); n++; }
  }
  // cópias antigas do deep mode do app: fora do kit (spec 005)
  await rm(path.join(py, 'query_api.py'), { force: true });
  await rm(path.join(py, 'perguntas'), { recursive: true, force: true });
  await rm(path.join(dir, 'perguntas.md'), { force: true });
  // viewer offline: sem ele o gerar.py grava só as camadas, sem relatorio.html
  try {
    const vd = path.join(dir, 'viewer');
    await mkdir(vd, { recursive: true });
    for (const f of await readdir(VIEWER)) { await copyFile(path.join(VIEWER, f), path.join(vd, f)); n++; }
  } catch { throw new Error(`kit ${slug}: public/viewer/ não existe — rode 'npm run build' antes`); }
  return { slug, engine: engine || 'livre', files: n };
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
