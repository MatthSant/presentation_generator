/* deepen.test.ts — B2 (raso) route. Forces CLAUDE_MOCK so the modal is generated
 * offline and bound to a real dataset table; asserts persistence + guards. */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, type CreatedApp } from '../../src/server/app.js';
import { openDb } from '../../src/server/db.js';

// Client/slug SINTÉTICO (nunca uma análise real): a rota de deepen consulta o
// app/.base/<client>/<slug> real; usar um slug de análise existente mudaria o
// comportamento (deep mode) e quebraria o teste hermético.
const CLIENT = 'testco';
const SLUG = 'deepen-fixture';

let tmp: string;
let created: CreatedApp;
let prevKey: string | undefined;
let prevMock: string | undefined;

const DATASET = {
  crit_renda_grp: {
    dims: ['grupo'], filters: ['canal'],
    rows: [
      { canal: 'Geral', grupo: 'Alta', diff_lcto: 42, conv_lcto: 8 },
      { canal: 'Geral', grupo: 'Baixa', diff_lcto: -55, conv_lcto: 1 },
    ],
  },
};
const SECTION = {
  id: 's10',
  header: { badge: 'Insights', title: 'Insights' },
  widgets: [{ id: 'f1', type: 'find-block', card: true, tag: 'Achado', tagColor: 'g', title: 'Renda lidera', detail: 'x' }],
};

function writeFixture(name: string, value: unknown): void {
  const dir = path.join(tmp, CLIENT, SLUG);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value), 'utf8');
}
const onDisk = (name: string) => JSON.parse(fs.readFileSync(path.join(tmp, CLIENT, SLUG, name), 'utf8'));
const url = (p: string) => `/api/${CLIENT}/${SLUG}${p}`;

beforeEach(() => {
  prevKey = process.env.ANTHROPIC_API_KEY;
  prevMock = process.env.CLAUDE_MOCK;
  delete process.env.ANTHROPIC_API_KEY;
  process.env.CLAUDE_MOCK = '1';
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deepen-'));
  created = createApp({ out: tmp, db: openDb(':memory:') });
});
afterEach(() => {
  created.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prevKey;
  if (prevMock === undefined) delete process.env.CLAUDE_MOCK; else process.env.CLAUDE_MOCK = prevMock;
});

test('deepen: generates a valid modal, attaches it + sets card.modal', async () => {
  writeFixture('dataset.json', DATASET);
  writeFixture('s10.json', SECTION);

  const res = await request(created.app).post(url('/section/s10/deepen'))
    .send({ blockId: 'f1', prompt: 'aprofunde a renda' });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.mocked, true);
  assert.match(res.body.modal.id, /^modal-f1-/);

  const sec = onDisk('s10.json');
  assert.equal(sec.modals.length, 1);
  assert.equal(sec.modals[0].id, res.body.modal.id);
  const f1 = sec.widgets.find((w: { id: string }) => w.id === 'f1');
  assert.equal(f1.modal, res.body.modal.id);

  // logged as attach-modal
  const edits = await request(created.app).get(url('/edits'));
  assert.equal(edits.body[0].action, 'attach-modal');
});

test('deepen: empty prompt → 400', async () => {
  writeFixture('dataset.json', DATASET);
  writeFixture('s10.json', SECTION);
  const res = await request(created.app).post(url('/section/s10/deepen')).send({ blockId: 'f1', prompt: '  ' });
  assert.equal(res.status, 400);
});

test('deepen: unknown blockId → 404', async () => {
  writeFixture('dataset.json', DATASET);
  writeFixture('s10.json', SECTION);
  const res = await request(created.app).post(url('/section/s10/deepen')).send({ blockId: 'nope', prompt: 'x' });
  assert.equal(res.status, 404);
});

test('deepen: missing dataset → 400', async () => {
  writeFixture('s10.json', SECTION);
  const res = await request(created.app).post(url('/section/s10/deepen')).send({ blockId: 'f1', prompt: 'x' });
  assert.equal(res.status, 400);
});

test('deepen: missing section → 404', async () => {
  const res = await request(created.app).post(url('/section/s10/deepen')).send({ blockId: 'f1', prompt: 'x' });
  assert.equal(res.status, 404);
});
