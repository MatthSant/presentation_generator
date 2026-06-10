/* generate.test.ts — Layer A route guards (no Python subprocess invoked: every
 * case here fails validation BEFORE build_report runs, so the suite stays
 * hermetic). The full Python e2e is covered manually / by an integration run. */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, type CreatedApp } from '../../src/server/app.js';
import { openDb } from '../../src/server/db.js';

let tmp: string;
let created: CreatedApp;
let prevSecret: string | undefined;

const GEN_URL = '/api/inde/conversao-perfil/generate';
const CSV = Buffer.from('field_conversion,tipo_trafego,renda,total_leads,vendas_lancamento\nl1,Pago,Alta,10,2\n');
const CONFIG = JSON.stringify({ client: 'inde', title: 'X', slug: 'conversao-perfil', channels: ['Geral', 'Pago', 'Orgânico'], criterios: [{ id: 'renda', col: 'renda', label: 'Renda', order: ['Alta'] }] });

beforeEach(() => {
  prevSecret = process.env.GEN_SECRET;
  delete process.env.GEN_SECRET;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-'));
  created = createApp({ out: tmp, db: openDb(':memory:') });
});
afterEach(() => {
  created.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  if (prevSecret === undefined) delete process.env.GEN_SECRET; else process.env.GEN_SECRET = prevSecret;
});

test('generate: missing csv file → 400', async () => {
  const res = await request(created.app).post(GEN_URL).field('config', CONFIG);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /csv/i);
});

test('generate: malformed config JSON → 400', async () => {
  const res = await request(created.app).post(GEN_URL).attach('csv', CSV, 'd.csv').field('config', '{not json');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /config/i);
});

test('generate: empty criterios → 400', async () => {
  const res = await request(created.app).post(GEN_URL)
    .attach('csv', CSV, 'd.csv').field('config', JSON.stringify({ client: 'inde', criterios: [] }));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /criterios/i);
});

test('generate: GEN_SECRET set + missing header → 401', async () => {
  process.env.GEN_SECRET = 's3cr3t';
  const res = await request(created.app).post(GEN_URL).attach('csv', CSV, 'd.csv').field('config', CONFIG);
  assert.equal(res.status, 401);
});

test('generate: bad path segment → 400', async () => {
  const res = await request(created.app).post('/api/inde/..%2f..%2fetc/generate').attach('csv', CSV, 'd.csv').field('config', CONFIG);
  assert.equal(res.status, 400);
});
