/* auth.test.ts — consultant auth + multi-tenant isolation (auth: true). */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, type CreatedApp } from '../../src/server/app.js';
import { openDb, type DB } from '../../src/server/db.js';
import { createUser, assignClient, hashPassword, verifyPassword } from '../../src/server/auth.js';

let tmp: string;
let db: DB;
let created: CreatedApp;
let userA: { id: string; email: string };
let _userB: { id: string; email: string };   // segundo usuário do cenário multi-tenant (não lido)

function writeFixture(client: string, slug: string, name: string, value: unknown): void {
  const dir = path.join(tmp, client, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value), 'utf8');
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-'));
  db = openDb(':memory:');
  created = createApp({ out: tmp, db, auth: true });
  userA = createUser(db, 'a@witly.com', 'senhaA');
  _userB = createUser(db, 'b@witly.com', 'senhaB');
});
afterEach(() => {
  created.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('password hashing: verify roundtrip, reject wrong', () => {
  const h = hashPassword('segredo');
  assert.equal(verifyPassword('segredo', h), true);
  assert.equal(verifyPassword('errado', h), false);
});

test('login → me → logout lifecycle', async () => {
  const agent = request.agent(created.app);
  assert.equal((await agent.post('/auth/login').send({ email: 'a@witly.com', password: 'errada' })).status, 401);

  const ok = await agent.post('/auth/login').send({ email: 'a@witly.com', password: 'senhaA' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.email, 'a@witly.com');

  const me = await agent.get('/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.email, 'a@witly.com');

  assert.equal((await agent.post('/auth/logout')).status, 200);
  assert.equal((await agent.get('/auth/me')).status, 401);
});

test('gate: unauthenticated /api → 401, page → redirect, login page public', async () => {
  assert.equal((await request(created.app).get('/api/acme/an1/data')).status, 401);

  const page = await request(created.app).get('/');
  assert.equal(page.status, 302);
  assert.equal(page.headers.location, '/login.html');

  assert.equal((await request(created.app).get('/login.html')).status, 200);
});

test('multi-tenant: a consultant sees/opens only the clients they own', async () => {
  writeFixture('acme', 'an1', 'data.json', { meta: { client: 'ACME', title: 'A' }, pages: [{ id: 'p', sections: [{ id: 's01' }] }] });
  assignClient(db, userA.id, 'acme');

  const a = request.agent(created.app);
  await a.post('/auth/login').send({ email: 'a@witly.com', password: 'senhaA' });
  const b = request.agent(created.app);
  await b.post('/auth/login').send({ email: 'b@witly.com', password: 'senhaB' });

  assert.equal((await a.get('/api/acme/an1/data')).status, 200);   // owner
  assert.equal((await b.get('/api/acme/an1/data')).status, 404);   // not owner → not even discoverable

  assert.equal((await a.get('/api/analyses')).body.length, 1);     // A sees its analysis
  assert.deepEqual((await b.get('/api/analyses')).body, []);       // B sees nothing
});

test('tenant: unclaimed client is 404 for reads (only generate may claim it)', async () => {
  const a = request.agent(created.app);
  await a.post('/auth/login').send({ email: 'a@witly.com', password: 'senhaA' });
  assert.equal((await a.get('/api/novo/an1/data')).status, 404);
});
