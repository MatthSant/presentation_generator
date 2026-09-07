#!/usr/bin/env node
/* parity — prova que o kit gera o MESMO relatório que o app para o mesmo CSV
 * (spec US4.2): roda gerar.py do kit e build_report.py do app sobre a fixture
 * sintética e compara dataset.json, data.json (sem timestamps), layout.json e sXX.json. */

import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const APP = path.resolve(ROOT, '..', 'app');
const PY = process.platform === 'win32' ? 'python' : 'python3';
const slug = process.argv[2] || 'acompanhamento-diario';
const engine = process.argv[3] || 'acompanhamento-lancamento';

const kitPy = path.join(ROOT, 'seed', slug, 'python');
const tmp = await mkdtemp(path.join(os.tmpdir(), 'witly-parity-'));
try {
  execFileSync(PY, [path.join(kitPy, 'tests', 'make_fixture.py')], { stdio: 'ignore' });
  const csv = path.join(kitPy, 'tests', 'fixture.csv');
  const cfg = path.join(kitPy, 'tests', 'config.json');
  const outKit = path.join(tmp, 'kit'); const outApp = path.join(tmp, 'app');
  execFileSync(PY, [path.join(kitPy, 'gerar.py'), '--config', cfg, '--csv', csv, '--out', outKit], { stdio: ['ignore', 'ignore', 'inherit'] });
  const content = path.join(tmp, 'content.json');
  await writeFile(content, JSON.stringify({ insights: { header: { badge: 'Insights', title: 'Insights Estratégicos', sub: 'Análise descritiva gerada — insights autorais ainda pendentes.' }, zones: [], method: 'Os insights e detalhamentos autorais ainda não foram gerados para esta análise.' }, detalhamentos: {} }));
  execFileSync(PY, [path.join(APP, 'pysrc', engine, 'build_report.py'), cfg, content, csv, outApp], { stdio: ['ignore', 'ignore', 'inherit'] });

  const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'created_at' || k === 'generated_at' || k === 'updated_at' ? undefined : v)));
  const files = (await readdir(outApp)).filter((f) => f.endsWith('.json'));
  let bad = 0;
  for (const f of files) {
    const a = strip(JSON.parse(await readFile(path.join(outApp, f), 'utf8')));
    let k;
    try { k = strip(JSON.parse(await readFile(path.join(outKit, f), 'utf8'))); } catch { console.log(`✗ ${f}: ausente no kit`); bad++; continue; }
    const same = JSON.stringify(a) === JSON.stringify(k);
    console.log(`${same ? '✓' : '✗'} ${f}`);
    if (!same) bad++;
  }
  if (bad) { console.error(`paridade FALHOU em ${bad} arquivo(s)`); process.exit(1); }
  console.log(`paridade OK: ${files.length} arquivos idênticos (kit == app)`);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
