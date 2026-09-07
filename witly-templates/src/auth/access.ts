/* access — quem entra e com que papel (plano §D2, spec FR-008).
 *
 *  - e-mail do domínio ALLOWED_DOMAIN → entra; se novo, vira `leitor`.
 *  - e-mail fora do domínio → só entra se já estiver em `users` e ativo.
 *  - usuário com active=0 → barrado, mesmo do domínio.
 *  - EDITOR_SEED → promovido a editor no login (bootstrap do primeiro editor).
 */

import { getUser, setUserRole, upsertUser, type User } from '../db/index.js';

export type AccessResult = { ok: true; user: User } | { ok: false; reason: 'domain' | 'inactive' };

export interface GoogleProfile { email: string; name?: string | null }

function domainOf(email: string): string {
  return email.toLowerCase().split('@')[1] ?? '';
}

export function isAllowedDomain(email: string, allowedDomain: string): boolean {
  const d = (allowedDomain || '').toLowerCase().trim();
  return !!d && domainOf(email) === d;
}

/** Decide o acesso no login (Google callback ou UI) e materializa o usuário. */
export async function resolveAccess(env: Pick<Env, 'DB' | 'ALLOWED_DOMAIN' | 'EDITOR_SEED' | 'ORG_ID'>, p: GoogleProfile): Promise<AccessResult> {
  const email = p.email.toLowerCase();
  const existing = await getUser(env.DB, email);
  if (existing && !existing.active) return { ok: false, reason: 'inactive' };
  if (!existing && !isAllowedDomain(email, env.ALLOWED_DOMAIN)) return { ok: false, reason: 'domain' };

  let user = existing ?? await upsertUser(env.DB, { email, name: p.name ?? null, org_id: env.ORG_ID, role: 'leitor' });
  if (p.name && user.name !== p.name) user = await upsertUser(env.DB, { email, name: p.name, org_id: user.org_id, role: user.role });

  const seed = (env.EDITOR_SEED || '').toLowerCase().trim();
  if (seed && email === seed && user.role !== 'editor') {
    await setUserRole(env.DB, email, 'editor');
    user = { ...user, role: 'editor' };
  }
  return { ok: true, user };
}

/** Revalidação barata a cada chamada de tool/API: o token não sobrevive à remoção. */
export async function isStillActive(db: D1Database, email: string): Promise<User | null> {
  const u = await getUser(db, email);
  return u && u.active ? u : null;
}
