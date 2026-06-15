/* auth.ts — consultant auth: scrypt password hashing, cookie sessions, and the
 * multi-tenant ownership map (a consultant sees only the clients they own).
 * Stdlib crypto only — no external auth dependency. */

import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { DB } from './db.js';

const SESSION_DAYS = 30;
const COOKIE = 'sid';

export type Role = 'admin' | 'consultor';
export interface User { id: string; email: string; role: Role }

function asRole(r: unknown): Role { return r === 'admin' ? 'admin' : 'consultor'; }

// --- password hashing (scrypt, salted, timing-safe verify) -------------------

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const got = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

// --- users -------------------------------------------------------------------

export function createUser(db: DB, email: string, password: string, role: Role = 'consultor'): User {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO users (id, email, pass_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, email.toLowerCase().trim(), hashPassword(password), role, new Date().toISOString());
  return { id, email: email.toLowerCase().trim(), role };
}

/** Idempotent seed (for env-based bootstrap). No-op if the email already exists. */
export function ensureUser(db: DB, email: string, password: string): void {
  const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!row) createUser(db, email, password);
}

/** Promove um usuário a admin pelo e-mail (idempotente). Usado no bootstrap do seed. */
export function ensureAdmin(db: DB, email: string): void {
  db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email.toLowerCase().trim());
}

export function authenticate(db: DB, email: string, password: string): User | null {
  const row = db.prepare('SELECT id, email, pass_hash, role FROM users WHERE email = ?')
    .get(email.toLowerCase().trim()) as { id: string; email: string; pass_hash: string; role: string } | undefined;
  if (!row || !verifyPassword(password, row.pass_hash)) return null;
  return { id: row.id, email: row.email, role: asRole(row.role) };
}

// --- sessions ----------------------------------------------------------------

export function createSession(db: DB, userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const exp = new Date(now.getTime() + SESSION_DAYS * 864e5);
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, now.toISOString(), exp.toISOString());
  return token;
}

export function sessionUser(db: DB, token: string | undefined): User | null {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id AS id, u.email AS email, u.role AS role, s.expires_at AS expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(token) as
    { id: string; email: string; role: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) { destroySession(db, token); return null; }
  return { id: row.id, email: row.email, role: asRole(row.role) };
}

export function destroySession(db: DB, token: string | undefined): void {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// --- cookies -----------------------------------------------------------------

export function readSidCookie(req: Request): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function setSidCookie(res: Response, token: string): void {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_DAYS * 864e5, path: '/' });
}
export function clearSidCookie(res: Response): void { res.clearCookie(COOKIE, { path: '/' }); }

// --- tenant ownership --------------------------------------------------------

/** user_id that owns a client folder, or null if unclaimed. */
export function clientOwner(db: DB, client: string): string | null {
  const row = db.prepare('SELECT user_id FROM user_clients WHERE client = ?').get(client) as { user_id: string } | undefined;
  return row ? row.user_id : null;
}
export function ownsClient(db: DB, userId: string, client: string): boolean {
  return clientOwner(db, client) === userId;
}
export function assignClient(db: DB, userId: string, client: string): void {
  db.prepare('INSERT OR IGNORE INTO user_clients (user_id, client) VALUES (?, ?)').run(userId, client);
}
export function clientsOf(db: DB, userId: string): Set<string> {
  const rows = db.prepare('SELECT client FROM user_clients WHERE user_id = ?').all(userId) as Array<{ client: string }>;
  return new Set(rows.map((r) => r.client));
}
export function unassignClient(db: DB, userId: string, client: string): void {
  db.prepare('DELETE FROM user_clients WHERE user_id = ? AND client = ?').run(userId, client);
}
/** Substitui o conjunto de clientes de um usuário pela lista informada. */
export function setUserClients(db: DB, userId: string, clients: string[]): void {
  const tx = db.transaction((list: string[]) => {
    db.prepare('DELETE FROM user_clients WHERE user_id = ?').run(userId);
    const ins = db.prepare('INSERT OR IGNORE INTO user_clients (user_id, client) VALUES (?, ?)');
    for (const c of list) { const v = String(c).trim(); if (v) ins.run(userId, v); }
  });
  tx(clients);
}

// --- gestão de usuários (admin) ----------------------------------------------

export interface UserRow { id: string; email: string; role: Role; createdAt: string; clients: string[] }

export function listUsers(db: DB): UserRow[] {
  const users = db.prepare('SELECT id, email, role, created_at FROM users ORDER BY created_at ASC')
    .all() as Array<{ id: string; email: string; role: string; created_at: string }>;
  const owns = db.prepare('SELECT client FROM user_clients WHERE user_id = ? ORDER BY client');
  return users.map((u) => ({
    id: u.id, email: u.email, role: asRole(u.role), createdAt: u.created_at,
    clients: (owns.all(u.id) as Array<{ client: string }>).map((r) => r.client),
  }));
}

export function userById(db: DB, id: string): UserRow | null {
  const u = db.prepare('SELECT id, email, role, created_at FROM users WHERE id = ?')
    .get(id) as { id: string; email: string; role: string; created_at: string } | undefined;
  if (!u) return null;
  const clients = (db.prepare('SELECT client FROM user_clients WHERE user_id = ? ORDER BY client')
    .all(id) as Array<{ client: string }>).map((r) => r.client);
  return { id: u.id, email: u.email, role: asRole(u.role), createdAt: u.created_at, clients };
}

export function emailTaken(db: DB, email: string): boolean {
  return !!db.prepare('SELECT 1 FROM users WHERE email = ?').get(email.toLowerCase().trim());
}

export function countAdmins(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number }).n;
}

export function setUserRole(db: DB, id: string, role: Role): void {
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
}

export function setUserPassword(db: DB, id: string, password: string): void {
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(password), id);
  // Invalida sessões existentes ao trocar a senha.
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
}

/** Remove o usuário + suas sessões + sua posse de clientes (os clientes ficam órfãos). */
export function deleteUser(db: DB, id: string): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM user_clients WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });
  tx();
}
