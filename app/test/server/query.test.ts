/* query.test.ts — Fase 3b query route guards (hermetic: the Python catalog is
 * only invoked when a retained base exists, which these cases avoid). The full
 * query_api e2e is exercised manually against the real inde base. */

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
const URL = '/api/inde/conversao-perfil/query';

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'query-'));
  created = createApp({ out: tmp, db: openDb(':memory:') });
});
afterEach(() => {
  created.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// A whitelist de fns vem do registry via o config RETIDO — sem base não há como
// validar a fn, então tudo é 404 (o 400 "fn inválida" é coberto no e2e com base real).
test('query: unknown fn sem base retida → 404', async () => {
  const res = await request(created.app).post(URL).send({ fn: 'rm_rf' });
  assert.equal(res.status, 404);
  assert.match(res.body.error, /dado-base/);
});

test('query: known fn but no retained base → 404', async () => {
  const res = await request(created.app).post(URL).send({ fn: 'crosstab', criterio: 'perfil', cruzar_com: 'patrimonio' });
  assert.equal(res.status, 404);
  assert.match(res.body.error, /dado-base/);
});

test('query: bad path segment → 400', async () => {
  const res = await request(created.app).post('/api/inde/..%2fetc/query').send({ fn: 'meta' });
  assert.equal(res.status, 400);
});
