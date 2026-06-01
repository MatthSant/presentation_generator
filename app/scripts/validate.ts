/* validate.ts — CLI gate over an analysis folder before it is served.
 *
 *   npm run validate -- <path-to-analysis-dir>
 *   npm run validate -- demo/vendas-2026          (relative to output/)
 *
 * Reads dataset.json + every sNN.json + layout.json, runs the shared validator,
 * and prints layer/path/message for each error. Exit code 1 on any error so it
 * can guard CI or a skill step. With no argument, validates every analysis under
 * output/. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAnalysis } from '../src/shared/validate.js';
import type { ValidationError } from '../src/shared/types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.APP_OUT || path.join(HERE, '..', '..', 'output');

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sectionFiles(dir: string): string[] {
  return fs.readdirSync(dir)
    .filter(f => /^s\d+\.json$/i.test(f))
    .sort()
    .map(f => path.join(dir, f));
}

/** Validate one analysis directory. Returns the error list (empty = ok). */
function validateDir(dir: string): ValidationError[] {
  const datasetFile = path.join(dir, 'dataset.json');
  const layoutFile = path.join(dir, 'layout.json');
  return validateAnalysis({
    dataset: fs.existsSync(datasetFile) ? readJson(datasetFile) : undefined,
    sections: sectionFiles(dir).map(readJson),
    layout: fs.existsSync(layoutFile) ? readJson(layoutFile) : undefined,
  }).errors;
}

/** Every output/<client>/<slug> that contains a data.json. */
function discoverAll(): string[] {
  const found: string[] = [];
  if (!fs.existsSync(OUT)) return found;
  for (const client of fs.readdirSync(OUT)) {
    const clientDir = path.join(OUT, client);
    if (!fs.statSync(clientDir).isDirectory()) continue;
    for (const slug of fs.readdirSync(clientDir)) {
      const slugDir = path.join(clientDir, slug);
      if (fs.statSync(slugDir).isDirectory() && fs.existsSync(path.join(slugDir, 'data.json'))) {
        found.push(slugDir);
      }
    }
  }
  return found;
}

function resolveTarget(arg: string): string {
  if (fs.existsSync(arg)) return path.resolve(arg);
  const underOut = path.join(OUT, arg);
  if (fs.existsSync(underOut)) return underOut;
  console.error(`✗ analysis not found: ${arg}`);
  process.exit(2);
}

function main(): void {
  const arg = process.argv[2];
  const dirs = arg ? [resolveTarget(arg)] : discoverAll();

  if (dirs.length === 0) {
    console.log('No analyses found under', OUT);
    return;
  }

  let totalErrors = 0;
  for (const dir of dirs) {
    const rel = path.relative(OUT, dir) || dir;
    const errors = validateDir(dir);
    if (errors.length === 0) {
      console.log(`✓ ${rel}`);
    } else {
      totalErrors += errors.length;
      console.log(`✗ ${rel} — ${errors.length} error(s)`);
      for (const e of errors) console.log(`    [${e.layer}] ${e.path}: ${e.message}`);
    }
  }

  if (totalErrors > 0) {
    console.error(`\n${totalErrors} validation error(s).`);
    process.exit(1);
  }
  console.log(`\nAll ${dirs.length} analysis folder(s) valid.`);
}

main();
