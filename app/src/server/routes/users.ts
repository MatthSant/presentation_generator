/* users.ts — gestão de usuários (somente admin).
 *
 * Guard: quando o auth está ON, exige sessão de um usuário com role 'admin'
 * (a sessão já foi resolvida pelo gate global em authRoutes). Quando o auth está
 * OFF (dev, AUTH_DISABLED=1), libera — não há sessão para checar.
 *
 *   GET    /api/users                  → { users:[{id,email,role,createdAt,clients[]}], me }
 *   GET    /api/users/available-clients→ { clients:[{slug,name,owner}] }
 *   POST   /api/users {email,password,role,clients?} → cria
 *   POST   /api/users/:id/password {password}        → reseta senha (derruba sessões)
 *   POST   /api/users/:id/role {role}                → admin|consultor
 *   POST   /api/users/:id/clients {clients:[slug]}   → substitui a posse
 *   DELETE /api/users/:id                            → remove (clientes ficam órfãos) */

import fs from 'node:fs';
import type { Express, Response, NextFunction } from 'express';
import type { Ctx } from '../context.js';
import type { AuthedRequest } from './authRoutes.js';
import {
  listUsers, userById, createUser, emailTaken, countAdmins, setUserRole,
  setUserPassword, setUserClients, deleteUser, clientOwner, type Role,
} from '../auth.js';
import { clientName } from './clients.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const asRole = (r: unknown): Role => (r === 'admin' ? 'admin' : 'consultor');

export function registerUsers(app: Express, ctx: Ctx): void {
  // Guard de admin — só aplica quando o auth está ligado.
  const guard = (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!ctx.auth) { next(); return; }
    if (req.user?.role === 'admin') { next(); return; }
    res.status(403).json({ error: 'acesso restrito a administradores' });
  };
  app.use('/api/users', guard);

  app.get('/api/users', (req: AuthedRequest, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ users: listUsers(ctx.db), me: req.user?.id ?? null });
  });

  // Clientes disponíveis para atribuição: pastas em output/ + cadastro, com o dono atual.
  app.get('/api/users/available-clients', (_req, res) => {
    const slugs = new Set<string>();
    try {
      for (const d of fs.readdirSync(ctx.out, { withFileTypes: true })) {
        if (d.isDirectory()) slugs.add(d.name);
      }
    } catch { /* sem output ainda */ }
    const clients = [...slugs].sort().map((slug) => ({
      slug, name: clientName(slug) || slug, owner: clientOwner(ctx.db, slug),
    }));
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ clients });
  });

  app.post('/api/users', (req, res) => {
    const b = (req.body || {}) as Record<string, unknown>;
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const role = asRole(b.role);
    if (!EMAIL_RE.test(email)) { res.status(400).json({ error: 'e-mail inválido' }); return; }
    if (password.length < 6) { res.status(400).json({ error: 'senha precisa de ao menos 6 caracteres' }); return; }
    if (emailTaken(ctx.db, email)) { res.status(409).json({ error: 'e-mail já cadastrado' }); return; }
    const u = createUser(ctx.db, email, password, role);
    if (Array.isArray(b.clients)) setUserClients(ctx.db, u.id, b.clients.map(String));
    res.json({ ok: true, id: u.id });
  });

  app.post('/api/users/:id/password', (req, res) => {
    const u = userById(ctx.db, req.params.id);
    if (!u) { res.status(404).json({ error: 'usuário não encontrado' }); return; }
    const password = String((req.body as Record<string, unknown>)?.password || '');
    if (password.length < 6) { res.status(400).json({ error: 'senha precisa de ao menos 6 caracteres' }); return; }
    setUserPassword(ctx.db, u.id, password);
    res.json({ ok: true });
  });

  app.post('/api/users/:id/role', (req: AuthedRequest, res) => {
    const u = userById(ctx.db, req.params.id);
    if (!u) { res.status(404).json({ error: 'usuário não encontrado' }); return; }
    const role = asRole((req.body as Record<string, unknown>)?.role);
    // Não deixar a base ficar sem nenhum admin (rebaixar o último).
    if (u.role === 'admin' && role !== 'admin' && countAdmins(ctx.db) <= 1) {
      res.status(409).json({ error: 'não é possível rebaixar o último administrador' }); return;
    }
    setUserRole(ctx.db, u.id, role);
    res.json({ ok: true });
  });

  app.post('/api/users/:id/clients', (req, res) => {
    const u = userById(ctx.db, req.params.id);
    if (!u) { res.status(404).json({ error: 'usuário não encontrado' }); return; }
    const clients = (req.body as Record<string, unknown>)?.clients;
    if (!Array.isArray(clients)) { res.status(400).json({ error: 'clients deve ser uma lista' }); return; }
    setUserClients(ctx.db, u.id, clients.map(String));
    res.json({ ok: true });
  });

  app.delete('/api/users/:id', (req: AuthedRequest, res) => {
    const u = userById(ctx.db, req.params.id);
    if (!u) { res.status(404).json({ error: 'usuário não encontrado' }); return; }
    if (ctx.auth && req.user?.id === u.id) {
      res.status(409).json({ error: 'você não pode remover a si mesmo' }); return;
    }
    if (u.role === 'admin' && countAdmins(ctx.db) <= 1) {
      res.status(409).json({ error: 'não é possível remover o último administrador' }); return;
    }
    deleteUser(ctx.db, u.id);
    res.json({ ok: true });
  });
}
