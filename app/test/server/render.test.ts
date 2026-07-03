/* render.test.ts — guards da rota de recompute da vista interativa (hermetic:
 * sem base retida o Python nunca é invocado; o e2e real roda manualmente contra
 * a base inde/debriefing). */

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
const URL = '/api/acme/historico/render';

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'render-'));
  created = createApp({ out: tmp, db: openDb(':memory:') });
});
afterEach(() => {
  created.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('render: sem base retida → 404', async () => {
  const res = await request(created.app).post(URL).send({ launches: ['jul/23'], metric: 'conv' });
  assert.equal(res.status, 404);
  assert.match(res.body.error, /base retida|recompute/);
});

test('render: path segment inválido → 400', async () => {
  const res = await request(created.app).post('/api/acme/..%2fetc/render').send({});
  assert.equal(res.status, 400);
});

test('render: alias legado /historico/render responde igual', async () => {
  const res = await request(created.app).post('/api/acme/historico/historico/render').send({});
  assert.equal(res.status, 404);
  assert.match(res.body.error, /base retida|recompute/);
});
