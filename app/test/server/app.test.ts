/* app.test.ts — supertest coverage of the TS server (3-layer model).
 *
 * Each test gets an isolated temp OUT dir + an in-memory SQLite store, so
 * nothing touches the real output/ folder or data/comments.db. */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, type CreatedApp } from '../../src/server/app.js';
import { openDb } from '../../src/server/db.js';

const CLIENT = 'acme';
const SLUG = 'ltv-mai-2026';

let tmp: string;
let created: CreatedApp;

function analysisPath(...parts: string[]): string {
  return path.join(tmp, CLIENT, SLUG, ...parts);
}
function writeFixture(name: string, value: unknown): void {
  const dir = path.join(tmp, CLIENT, SLUG);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value), 'utf8');
}

const DATA = {
  meta: { client: 'ACME', title: 'LTV', theme: 'light', created_at: '2026-05-01' },
  pages: [{ id: 'p1', label: 'Geral', sections: [{ id: 's01', label: 'Receita' }] }],
};
const DATASET = {
  receita_canal: {
    dims: ['mes'], filters: ['canal'],
    rows: [
      { mes: 'Jan', canal: 'Pago', receita: 1200, leads: 340 },
      { mes: 'Jan', canal: 'Organico', receita: 800, leads: 210 },
      { mes: 'Fev', canal: 'Pago', receita: 1500, leads: 360 },
    ],
  },
};
const SECTION = {
  id: 's01',
  header: { badge: '01', title: 'Receita por canal' },
  widgets: [
    { id: 'k1', type: 'kpi', key: 'receita', label: 'Receita',
      bind: { dataset: 'receita_canal', metrics: ['receita'] } },
    { id: 'c1', type: 'chart', chartType: 'bar', title: 'Receita',
      bind: { dataset: 'receita_canal', x: 'mes', y: 'receita' } },
    { id: 'f1', type: 'find-block', tag: 'Achado', tagColor: 'p', title: 'Pago domina', detail: '60%' },
  ],
  modals: [{ id: 'm1', title: 'Detalhe', widgets: [{ id: 'x1', type: 'xs', text: 'nota' }] }],
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ltv-srv-'));
  created = createApp({ out: tmp, db: openDb(':memory:') });
});
afterEach(() => {
  created.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/* ── analyses ── */

test('GET /api/analyses → [] when output is empty', async () => {
  const res = await request(created.app).get('/api/analyses');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('GET /api/analyses → one row with meta, sectionCount, commentCount', async () => {
  writeFixture('data.json', DATA);
  const res = await request(created.app).get('/api/analyses');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].client, CLIENT); // folder key wins over meta.client
  assert.equal(res.body[0].slug, SLUG);
  assert.equal(res.body[0].title, 'LTV');
  assert.equal(res.body[0].sectionCount, 1);
  assert.equal(res.body[0].commentCount, 0);
});

test('GET /api/analyses → skips malformed data.json', async () => {
  fs.mkdirSync(path.join(tmp, CLIENT, SLUG), { recursive: true });
  fs.writeFileSync(analysisPath('data.json'), '{ not json', 'utf8');
  const res = await request(created.app).get('/api/analyses');
  assert.deepEqual(res.body, []);
});

/* ── content (data / dataset / section) ── */

test('GET data/dataset/section → 200 with the file, 404 when missing', async () => {
  writeFixture('data.json', DATA);
  writeFixture('dataset.json', DATASET);
  writeFixture('s01.json', SECTION);

  const data = await request(created.app).get(`/api/${CLIENT}/${SLUG}/data`);
  assert.equal(data.status, 200);
  assert.equal(data.body.meta.title, 'LTV');

  const ds = await request(created.app).get(`/api/${CLIENT}/${SLUG}/dataset`);
  assert.equal(ds.status, 200);
  assert.ok(ds.body.receita_canal);

  const sec = await request(created.app).get(`/api/${CLIENT}/${SLUG}/section/s01`);
  assert.equal(sec.status, 200);
  assert.equal(sec.body.widgets.length, 3);

  const miss = await request(created.app).get(`/api/${CLIENT}/${SLUG}/section/s99`);
  assert.equal(miss.status, 404);
});

/* ── report shell ── */

test('GET /report/:client/:slug → serves the SPA shell', async () => {
  const res = await request(created.app).get(`/report/${CLIENT}/${SLUG}`);
  assert.equal(res.status, 200);
  assert.match(res.text, /id="export-root"/);
  assert.match(res.text, /src="\/js\/client\/main\.js"/);
});

test('GET / → serves the homepage that lists analyses', async () => {
  const res = await request(created.app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /id="home-list"/);
  assert.match(res.text, /\/api\/analyses/);
});

/* ── layout ── */

test('layout: default empty, PUT clamps coords, GET reflects, DELETE resets', async () => {
  const empty = await request(created.app).get(`/api/${CLIENT}/${SLUG}/layout`);
  assert.deepEqual(empty.body, { sections: {} });

  const put = await request(created.app).put(`/api/${CLIENT}/${SLUG}/layout`).send({
    sectionId: 's01',
    items: [{ id: 'c1', x: 99, y: -5, w: 99, h: 0 }],
  });
  assert.equal(put.status, 200);
  const item = put.body.layout.sections.s01[0];
  assert.equal(item.x, 11);  // clamped to COLS-1
  assert.equal(item.y, 0);   // clamped to >= 0
  assert.equal(item.w, 12);  // clamped to COLS
  assert.equal(item.h, 1);   // clamped to >= 1

  const got = await request(created.app).get(`/api/${CLIENT}/${SLUG}/layout`);
  assert.equal(got.body.sections.s01[0].id, 'c1');

  const del = await request(created.app).delete(`/api/${CLIENT}/${SLUG}/layout?section=s01`);
  assert.equal(del.status, 200);
  const after = await request(created.app).get(`/api/${CLIENT}/${SLUG}/layout`);
  assert.deepEqual(after.body.sections, {});
});

test('layout: PUT with invalid body → 400', async () => {
  const res = await request(created.app).put(`/api/${CLIENT}/${SLUG}/layout`).send({ nope: true });
  assert.equal(res.status, 400);
});

test('layout: PUT with non-array items → 400', async () => {
  const res = await request(created.app)
    .put(`/api/${CLIENT}/${SLUG}/layout`).send({ sectionId: 's01', items: 'x' });
  assert.equal(res.status, 400);
});

/* ── blocks (PATCH) ── */

test('PATCH section: update find-block field + logs edit', async () => {
  writeFixture('s01.json', SECTION);
  const res = await request(created.app)
    .patch(`/api/${CLIENT}/${SLUG}/section/s01`)
    .send({ action: 'update', blockId: 'f1', changes: { title: 'Pago domina mesmo' } });
  assert.equal(res.status, 200);
  const f1 = res.body.section.widgets.find((w: { id: string }) => w.id === 'f1');
  assert.equal(f1.title, 'Pago domina mesmo');

  const onDisk = JSON.parse(fs.readFileSync(analysisPath('s01.json'), 'utf8'));
  assert.equal(onDisk.widgets.find((w: { id: string }) => w.id === 'f1').title, 'Pago domina mesmo');

  const edits = await request(created.app).get(`/api/${CLIENT}/${SLUG}/edits`);
  assert.equal(edits.body.length, 1);
  assert.equal(edits.body[0].action, 'update');
  assert.equal(edits.body[0].blockId, 'f1');
});

test('PATCH section: update a widget nested in a modal', async () => {
  writeFixture('s01.json', SECTION);
  const res = await request(created.app)
    .patch(`/api/${CLIENT}/${SLUG}/section/s01`)
    .send({ action: 'update', blockId: 'x1', changes: { text: 'editado' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.section.modals[0].widgets[0].text, 'editado');
});

test('PATCH section: create find-block + request, then delete', async () => {
  writeFixture('s01.json', SECTION);

  const fb = await request(created.app)
    .patch(`/api/${CLIENT}/${SLUG}/section/s01`)
    .send({ action: 'create', blockType: 'find-block', changes: { title: 'Novo achado' } });
  assert.equal(fb.status, 200);
  assert.match(fb.body.blockId, /^fb-/);

  const rq = await request(created.app)
    .patch(`/api/${CLIENT}/${SLUG}/section/s01`)
    .send({ action: 'create', blockType: 'request', changes: { text: 'Pedido IA' } });
  assert.match(rq.body.blockId, /^rq-/);
  assert.equal(rq.body.section.widgets.length, 5);

  const del = await request(created.app)
    .patch(`/api/${CLIENT}/${SLUG}/section/s01`)
    .send({ action: 'delete', blockId: rq.body.blockId });
  assert.equal(del.status, 200);
  assert.equal(del.body.section.widgets.length, 4);
});

test('PATCH section: unknown block id → 404', async () => {
  writeFixture('s01.json', SECTION);
  const res = await request(created.app)
    .patch(`/api/${CLIENT}/${SLUG}/section/s01`)
    .send({ action: 'update', blockId: 'nope', changes: { title: 'x' } });
  assert.equal(res.status, 404);
});

test('PATCH section: missing section file → 404', async () => {
  const res = await request(created.app)
    .patch(`/api/${CLIENT}/${SLUG}/section/s01`)
    .send({ action: 'update', blockId: 'f1', changes: {} });
  assert.equal(res.status, 404);
});

/* ── comments ── */

test('comments: POST → GET → PATCH status → DELETE', async () => {
  const post = await request(created.app)
    .post(`/api/${CLIENT}/${SLUG}/comments`)
    .send({ sectionId: 's01', sectionLabel: 'Receita', widgetId: 'f1', type: 'detalhar', text: 'rever isto' });
  assert.equal(post.status, 200);
  const id = post.body.id;
  assert.ok(id);
  assert.equal(post.body.status, 'novo');
  assert.equal(post.body.widgetId, 'f1');

  const list = await request(created.app).get(`/api/${CLIENT}/${SLUG}/comments`);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].text, 'rever isto');
  assert.equal(list.body[0].widgetId, 'f1');

  const patch = await request(created.app)
    .patch(`/api/${CLIENT}/${SLUG}/comments/${id}`).send({ status: 'resolvido' });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.status, 'resolvido');

  const del = await request(created.app).delete(`/api/${CLIENT}/${SLUG}/comments/${id}`);
  assert.equal(del.status, 200);
  const empty = await request(created.app).get(`/api/${CLIENT}/${SLUG}/comments`);
  assert.equal(empty.body.length, 0);
});

test('comments: POST without text → 400', async () => {
  const res = await request(created.app).post(`/api/${CLIENT}/${SLUG}/comments`).send({ text: '' });
  assert.equal(res.status, 400);
});

test('comments: PATCH invalid status → 400', async () => {
  const post = await request(created.app)
    .post(`/api/${CLIENT}/${SLUG}/comments`).send({ text: 'x' });
  const res = await request(created.app)
    .patch(`/api/${CLIENT}/${SLUG}/comments/${post.body.id}`).send({ status: 'banana' });
  assert.equal(res.status, 400);
});

test('comments: CSV export has header + row', async () => {
  await request(created.app).post(`/api/${CLIENT}/${SLUG}/comments`)
    .send({ sectionId: 's01', text: 'linha um' });
  const res = await request(created.app).get(`/api/${CLIENT}/${SLUG}/comments.csv`);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  const lines = res.text.trim().split('\n');
  assert.equal(lines[0], 'id,sectionId,sectionLabel,widgetId,type,text,anchor,status,createdAt');
  assert.equal(lines.length, 2);
});

test('comments: legacy comments.csv migrates into SQLite (idempotent)', async () => {
  const dir = path.join(tmp, CLIENT, SLUG);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'comments.csv'),
    'id,sectionId,sectionLabel,type,text,anchor,status,createdAt\n' +
    'c1,s01,"Receita",detalhar,"texto legado","",novo,2026-05-02T00:00:00Z\n', 'utf8');

  const first = await request(created.app).get(`/api/${CLIENT}/${SLUG}/comments`);
  assert.equal(first.body.length, 1);
  assert.equal(first.body[0].text, 'texto legado');

  const second = await request(created.app).get(`/api/${CLIENT}/${SLUG}/comments`);
  assert.equal(second.body.length, 1); // not duplicated
});

/* ── edits (global) ── */

test('GET /api/edits → global log across analyses', async () => {
  writeFixture('s01.json', SECTION);
  await request(created.app).patch(`/api/${CLIENT}/${SLUG}/section/s01`)
    .send({ action: 'update', blockId: 'f1', changes: { title: 'a' } });
  const res = await request(created.app).get('/api/edits');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].client, CLIENT);
});

/* ── path safety ── */

test('rejects path traversal in segments', async () => {
  const res = await request(created.app).get(`/api/${CLIENT}/${SLUG}/layout`).query({});
  assert.equal(res.status, 200); // sanity
  const bad = await request(created.app)
    .put(`/api/${CLIENT}/..%2f..%2fetc/layout`).send({ sectionId: 's', items: [] });
  assert.equal(bad.status, 400);
});
