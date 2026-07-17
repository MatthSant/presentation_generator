/* auth.test.ts — consultant auth + multi-tenant isolation (auth: true). */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, type CreatedApp } from '../../src/server/app.js';
import { openDb, type DB } from '../../src/server/db.js';
import { createUser, assignClient, hashPassword, verifyPassword, mustChangePassword } from '../../src/server/auth.js';

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

test('must-change-password: gate prende o usuário na troca até ele escolher a senha', async () => {
  // consultor criado com senha temporária (mustChange=true)
  const temp = createUser(db, 'novo@witly.com', 'temp123', 'consultor', true);
  assert.equal(mustChangePassword(db, temp.id), true);

  const agent = request.agent(created.app);
  assert.equal((await agent.post('/auth/login').send({ email: 'novo@witly.com', password: 'temp123' })).status, 200);
  assert.equal((await agent.get('/auth/me')).body.mustChange, true);

  // preso: página redireciona p/ a troca, /api dá 403 com código
  const page = await agent.get('/');
  assert.equal(page.status, 302);
  assert.equal(page.headers.location, '/trocar-senha.html');
  const api = await agent.get('/api/analyses');
  assert.equal(api.status, 403);
  assert.equal(api.body.code, 'must_change_password');
  // a própria tela de troca é acessível
  assert.equal((await agent.get('/trocar-senha.html')).status, 200);

  // senha atual errada → 403; troca ok → libera a flag e o gate
  assert.equal((await agent.post('/auth/change-password').send({ current: 'errada', next: 'novasenha' })).status, 403);
  assert.equal((await agent.post('/auth/change-password').send({ current: 'temp123', next: 'curta' })).status, 400);
  assert.equal((await agent.post('/auth/change-password').send({ current: 'temp123', next: 'novasenha' })).status, 200);
  assert.equal(mustChangePassword(db, temp.id), false);
  assert.equal((await agent.get('/auth/me')).body.mustChange, false);
  assert.equal((await agent.get('/api/analyses')).status, 200);   // gate liberado
});

test('gate: unauthenticated /api → 401, page → redirect, login page public', async () => {
  assert.equal((await request(created.app).get('/api/acme/an1/data')).status, 401);

  const page = await request(created.app).get('/');
  assert.equal(page.status, 302);
  assert.equal(page.headers.location, '/login.html');

  assert.equal((await request(created.app).get('/login.html')).status, 200);
});

test('acesso compartilhado: qualquer consultor logado vê/abre todos os clientes', async () => {
  // Política atual (visibleClients → null): sem isolamento por consultor. B abre e lista
  // um cliente de A. Reativar o isolamento = trocar visibleClients por clientsOf (e este
  // teste volta a exigir posse).
  writeFixture('acme', 'an1', 'data.json', { meta: { client: 'ACME', title: 'A' }, pages: [{ id: 'p', sections: [{ id: 's01' }] }] });
  assignClient(db, userA.id, 'acme');

  const a = request.agent(created.app);
  await a.post('/auth/login').send({ email: 'a@witly.com', password: 'senhaA' });
  const b = request.agent(created.app);
  await b.post('/auth/login').send({ email: 'b@witly.com', password: 'senhaB' });

  assert.equal((await a.get('/api/acme/an1/data')).status, 200);   // dono
  assert.equal((await b.get('/api/acme/an1/data')).status, 200);   // não-dono também abre

  assert.equal((await a.get('/api/analyses')).body.length, 1);
  assert.equal((await b.get('/api/analyses')).body.length, 1);     // B vê a análise de A
});

test('cliente inexistente → 404 (a rota resolve a existência)', async () => {
  const a = request.agent(created.app);
  await a.post('/auth/login').send({ email: 'a@witly.com', password: 'senhaA' });
  assert.equal((await a.get('/api/novo/an1/data')).status, 404);
});
