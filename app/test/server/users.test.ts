/* users.test.ts — gestão de usuários (admin) + guard de papel (auth: true). */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, type CreatedApp } from '../../src/server/app.js';
import { openDb, type DB } from '../../src/server/db.js';
import { createUser, ensureAdmin, assignClient } from '../../src/server/auth.js';

let tmp: string;
let db: DB;
let created: CreatedApp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'users-'));
  db = openDb(':memory:');
  created = createApp({ out: tmp, db, auth: true });
  createUser(db, 'admin@witly.com', 'senhaAdmin');
  ensureAdmin(db, 'admin@witly.com');
  createUser(db, 'cons@witly.com', 'senhaCons'); // consultor
});
afterEach(() => {
  created.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function loginAs(email: string, password: string) {
  const agent = request.agent(created.app);
  await agent.post('/auth/login').send({ email, password });
  return agent;
}

test('guard: consultor não acessa /api/users (403); admin acessa', async () => {
  const cons = await loginAs('cons@witly.com', 'senhaCons');
  assert.equal((await cons.get('/api/users')).status, 403);

  const admin = await loginAs('admin@witly.com', 'senhaAdmin');
  const r = await admin.get('/api/users');
  assert.equal(r.status, 200);
  assert.equal(r.body.users.length, 2);
});

test('me reflete o papel', async () => {
  const admin = await loginAs('admin@witly.com', 'senhaAdmin');
  assert.equal((await admin.get('/auth/me')).body.role, 'admin');
  const cons = await loginAs('cons@witly.com', 'senhaCons');
  assert.equal((await cons.get('/auth/me')).body.role, 'consultor');
});

test('admin cria usuário (valida e-mail, senha, duplicidade)', async () => {
  const admin = await loginAs('admin@witly.com', 'senhaAdmin');
  assert.equal((await admin.post('/api/users').send({ email: 'x', password: 'abcdef' })).status, 400);
  assert.equal((await admin.post('/api/users').send({ email: 'novo@witly.com', password: '123' })).status, 400);
  assert.equal((await admin.post('/api/users').send({ email: 'admin@witly.com', password: 'abcdef' })).status, 409);

  const ok = await admin.post('/api/users').send({ email: 'novo@witly.com', password: 'abcdef', role: 'consultor' });
  assert.equal(ok.status, 200);
  assert.equal((await admin.get('/api/users')).body.users.length, 3);
});

test('o novo usuário consegue logar com a senha definida', async () => {
  const admin = await loginAs('admin@witly.com', 'senhaAdmin');
  await admin.post('/api/users').send({ email: 'novo@witly.com', password: 'abcdef' });
  assert.equal((await loginAs('novo@witly.com', 'abcdef').then((a) => a.get('/auth/me'))).status, 200);
});

test('atribuição de clientes substitui a posse e filtra a home', async () => {
  fs.mkdirSync(path.join(tmp, 'acme', 'an1'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'acme', 'an1', 'data.json'),
    JSON.stringify({ meta: { client: 'ACME', title: 'A' }, pages: [{ id: 'p', sections: [{ id: 's01' }] }] }), 'utf8');

  const admin = await loginAs('admin@witly.com', 'senhaAdmin');
  const consId = (await admin.get('/api/users')).body.users.find((u: { email: string }) => u.email === 'cons@witly.com').id;

  assert.equal((await admin.post(`/api/users/${consId}/clients`).send({ clients: ['acme'] })).status, 200);
  const cons = await loginAs('cons@witly.com', 'senhaCons');
  assert.equal((await cons.get('/api/acme/an1/data')).status, 200);    // agora é dono
  assert.equal((await cons.get('/api/analyses')).body.length, 1);

  await admin.post(`/api/users/${consId}/clients`).send({ clients: [] }); // remove
  assert.equal((await cons.get('/api/acme/an1/data')).status, 404);
});

test('reset de senha derruba sessão antiga e vale a nova', async () => {
  const admin = await loginAs('admin@witly.com', 'senhaAdmin');
  const consId = (await admin.get('/api/users')).body.users.find((u: { email: string }) => u.email === 'cons@witly.com').id;
  const cons = await loginAs('cons@witly.com', 'senhaCons');

  assert.equal((await admin.post(`/api/users/${consId}/password`).send({ password: 'novaSenha' })).status, 200);
  assert.equal((await cons.get('/auth/me')).status, 401);                            // sessão antiga morta
  assert.equal((await loginAs('cons@witly.com', 'novaSenha').then((a) => a.get('/auth/me'))).status, 200);
});

test('protege o último admin: não rebaixa nem remove', async () => {
  const admin = await loginAs('admin@witly.com', 'senhaAdmin');
  const adminId = (await admin.get('/api/users')).body.users.find((u: { email: string }) => u.email === 'admin@witly.com').id;

  assert.equal((await admin.post(`/api/users/${adminId}/role`).send({ role: 'consultor' })).status, 409);
  assert.equal((await admin.delete(`/api/users/${adminId}`)).status, 409);

  // com 2 admins, já dá para rebaixar um
  const consId = (await admin.get('/api/users')).body.users.find((u: { email: string }) => u.email === 'cons@witly.com').id;
  await admin.post(`/api/users/${consId}/role`).send({ role: 'admin' });
  assert.equal((await admin.post(`/api/users/${adminId}/role`).send({ role: 'consultor' })).status, 200);
});

test('admin não remove a si mesmo', async () => {
  const admin = await loginAs('admin@witly.com', 'senhaAdmin');
  const adminId = (await admin.get('/api/users')).body.users.find((u: { email: string }) => u.email === 'admin@witly.com').id;
  // cria um 2º admin para que o guard de "último admin" não mascare o de "si mesmo"
  await admin.post('/api/users').send({ email: 'admin2@witly.com', password: 'abcdef', role: 'admin' });
  assert.equal((await admin.delete(`/api/users/${adminId}`)).status, 409);
});

test('available-clients lista pastas de output com o dono atual', async () => {
  fs.mkdirSync(path.join(tmp, 'acme', 'an1'), { recursive: true });
  const admin = await loginAs('admin@witly.com', 'senhaAdmin');
  const adminId = (await admin.get('/api/users')).body.users.find((u: { email: string }) => u.email === 'admin@witly.com').id;
  assignClient(db, adminId, 'acme');

  const r = await admin.get('/api/users/available-clients');
  assert.equal(r.status, 200);
  const acme = r.body.clients.find((c: { slug: string }) => c.slug === 'acme');
  assert.equal(acme.owner, adminId);
});
