/* api — rotas da UI (/api/*). Sessão por cookie (session.ts); escrita exige `editor`.
 * Regras: rascunho ≠ publicada (o MCP só vê a publicada); contexto geral publica ao salvar. */

import { Hono, type Context } from 'hono';
import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import * as db from './db/index.js';
import { undeclaredParams, type ParamDef } from './kit/montar-query.js';
import { clearSessionCookie, sessionUser, setSessionCookie, signSession, startUiLogin } from './auth/session.js';
import { resolveAccess } from './auth/access.js';

type Ctx = Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>;
export const api = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

const SLUG = /^[a-z0-9][a-z0-9-]{1,63}$/;
const TASK = /^[a-z0-9_-]{1,64}$/;
const PATH = /^(?!\.)(?!.*\.\.)[A-Za-z0-9_./-]{1,200}$/;

async function requireUser(c: Ctx, role?: db.Role): Promise<db.User | Response> {
  const u = await sessionUser(c);
  if (!u) return c.json({ error: 'sem sessão' }, 401);
  if (role === 'editor' && u.role !== 'editor') return c.json({ error: 'só editores podem alterar' }, 403);
  return u;
}
const isResp = (x: unknown): x is Response => x instanceof Response;

// ── sessão ──────────────────────────────────────────────────────────────────
api.get('/ui/login', (c) => startUiLogin(c));
api.get('/ui/logout', (c) => { clearSessionCookie(c); return c.redirect('/', 302); });
/** Login de DESENVOLVIMENTO: só em localhost e com DEV_LOGIN=1 (.dev.vars). Nunca em produção. */
api.get('/ui/dev-login', async (c) => {
  const host = new URL(c.req.url).hostname;
  if (c.env.DEV_LOGIN !== '1' || !['localhost', '127.0.0.1'].includes(host)) return c.text('Não encontrado', 404);
  const email = c.req.query('email') || c.env.EDITOR_SEED;
  if (!email) return c.text('email?', 400);
  const access = await resolveAccess(c.env, { email, name: email.split('@')[0] });
  if (!access.ok) return c.text(`acesso negado: ${access.reason}`, 403);
  setSessionCookie(c, await signSession(c.env.COOKIE_ENCRYPTION_KEY, access.user.email));
  return c.redirect('/', 302);
});
api.get('/api/me', async (c) => {
  const u = await sessionUser(c);
  return u ? c.json({ email: u.email, name: u.name, role: u.role }) : c.json({ error: 'sem sessão' }, 401);
});

// ── templates ───────────────────────────────────────────────────────────────
api.get('/api/templates', async (c) => {
  const u = await requireUser(c); if (isResp(u)) return u;
  return c.json(await db.listTemplates(c.env.DB, c.env.ORG_ID));
});

api.post('/api/templates', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const b = await c.req.json<{ slug?: string; name?: string; objective?: string; when_to_use?: string }>();
  if (!b.slug || !SLUG.test(b.slug)) return c.json({ error: 'slug inválido (a-z, 0-9, hífen)' }, 400);
  if (!b.name?.trim()) return c.json({ error: 'nome obrigatório' }, 400);
  if (await db.getTemplate(c.env.DB, b.slug)) return c.json({ error: 'slug já existe' }, 409);
  const v = await db.createTemplate(c.env.DB, {
    slug: b.slug, org_id: c.env.ORG_ID, name: b.name.trim(), objective: b.objective ?? '', when_to_use: b.when_to_use ?? '',
    manifest: { params: [], queries: [], tarefas_contexto: [], como_gerar: [] },
    files: [
      { path: 'guia.md', content: `# Guia de leitura: ${b.name.trim()}\n\n## Como funciona a mecânica\n\n## Definições\n\n## O que NÃO concluir\n` },
      { path: 'documento.md', content: `# Documento: ${b.name.trim()}\n` },
      { path: 'python/gerar.py', content: '#!/usr/bin/env python3\n"""gerar — TODO"""\n' },
    ],
    tasks: [], author_email: u.email,
  });
  return c.json({ ok: true, version: v }, 201);
});

api.get('/api/templates/:slug', async (c) => {
  const u = await requireUser(c); if (isResp(u)) return u;
  const slug = c.req.param('slug');
  const t = await db.getTemplate(c.env.DB, slug);
  if (!t) return c.json({ error: 'não existe' }, 404);
  const state = c.req.query('state') === 'draft' ? 'draft' : 'published';
  const kit = state === 'draft' ? await db.getDraftKit(c.env.DB, slug) : await db.getPublishedKit(c.env.DB, slug);
  if (!kit) return c.json({ template: t, kit: null });
  return c.json({ template: t, kit: { version: kit.version, manifest: JSON.parse(kit.version.manifest_json), files: kit.files, tasks: kit.tasks } });
});

api.patch('/api/templates/:slug', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const b = await c.req.json<{ name?: string; objective?: string; when_to_use?: string }>();
  try { await db.updateTemplateMeta(c.env.DB, c.req.param('slug'), b); } catch (e) { return c.json({ error: (e as Error).message }, 404); }
  return c.json({ ok: true });
});

api.post('/api/templates/:slug/draft', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  try { return c.json({ ok: true, version: await db.ensureDraft(c.env.DB, c.req.param('slug'), u.email) }); }
  catch (e) { return c.json({ error: (e as Error).message }, 404); }
});

async function draftId(c: Ctx, slug: string, email: string): Promise<string> {
  return (await db.ensureDraft(c.env.DB, slug, email)).id;
}

api.put('/api/templates/:slug/draft/manifest', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const b = await c.req.json<{ manifest?: unknown }>();
  if (!b.manifest || typeof b.manifest !== 'object') return c.json({ error: 'manifest deve ser um objeto JSON' }, 400);
  try { await db.saveManifest(c.env.DB, await draftId(c, c.req.param('slug'), u.email), b.manifest); }
  catch (e) { return c.json({ error: (e as Error).message }, 404); }
  return c.json({ ok: true });
});

/** Salva um arquivo do rascunho. Para queries/*.sql devolve `undeclared` (aviso, não bloqueia — US2.4). */
api.put('/api/templates/:slug/draft/files/*', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const slug = c.req.param('slug');
  const path = decodeURIComponent(c.req.path.split('/draft/files/')[1] || '');
  if (!PATH.test(path)) return c.json({ error: 'caminho inválido' }, 400);
  const b = await c.req.json<{ content?: string }>();
  if (typeof b.content !== 'string') return c.json({ error: 'content (string) obrigatório' }, 400);
  let vid: string;
  try { vid = await draftId(c, slug, u.email); } catch (e) { return c.json({ error: (e as Error).message }, 404); }
  await db.saveFile(c.env.DB, vid, path, b.content);
  let warnings: string[] = [];
  if (path.endsWith('.sql')) {
    const v = await db.getVersion(c.env.DB, vid);
    const params = ((JSON.parse(v!.manifest_json) as { params?: ParamDef[] }).params) || [];
    const und = undeclaredParams(b.content, params);
    if (und.length) warnings = [`parâmetros usados no SQL e não declarados no manifesto: ${und.join(', ')}`];
  }
  return c.json({ ok: true, warnings });
});

api.delete('/api/templates/:slug/draft/files/*', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const path = decodeURIComponent(c.req.path.split('/draft/files/')[1] || '');
  if (!PATH.test(path)) return c.json({ error: 'caminho inválido' }, 400);
  try { await db.deleteFile(c.env.DB, await draftId(c, c.req.param('slug'), u.email), path); }
  catch (e) { return c.json({ error: (e as Error).message }, 404); }
  return c.json({ ok: true });
});

api.put('/api/templates/:slug/draft/tasks/:task', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const task_id = c.req.param('task');
  if (!TASK.test(task_id)) return c.json({ error: 'id de tarefa inválido' }, 400);
  const b = await c.req.json<{ title?: string; body_md?: string; sort?: number }>();
  if (!b.title?.trim() || typeof b.body_md !== 'string') return c.json({ error: 'title e body_md obrigatórios' }, 400);
  try { await db.saveContextTask(c.env.DB, await draftId(c, c.req.param('slug'), u.email), { task_id, title: b.title.trim(), body_md: b.body_md, sort: b.sort }); }
  catch (e) { return c.json({ error: (e as Error).message }, 404); }
  return c.json({ ok: true });
});

api.post('/api/templates/:slug/publish', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  try { return c.json({ ok: true, version: await db.publishDraft(c.env.DB, c.req.param('slug')) }); }
  catch (e) { return c.json({ error: (e as Error).message }, 409); }
});

// ── contextos gerais ────────────────────────────────────────────────────────
api.get('/api/general-contexts', async (c) => {
  const u = await requireUser(c); if (isResp(u)) return u;
  return c.json(await db.listGeneralContexts(c.env.DB, c.env.ORG_ID));
});
api.put('/api/general-contexts/:slug', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const slug = c.req.param('slug');
  if (!SLUG.test(slug)) return c.json({ error: 'slug inválido' }, 400);
  const b = await c.req.json<{ title?: string; body_md?: string }>();
  if (!b.title?.trim() || typeof b.body_md !== 'string') return c.json({ error: 'title e body_md obrigatórios' }, 400);
  await db.upsertGeneralContext(c.env.DB, { slug, org_id: c.env.ORG_ID, title: b.title.trim(), body_md: b.body_md, author_email: u.email });
  return c.json({ ok: true });
});
api.delete('/api/general-contexts/:slug', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  await db.deleteGeneralContext(c.env.DB, c.req.param('slug'));
  return c.json({ ok: true });
});

// ── usuários (corte de acesso, spec FR-014) ─────────────────────────────────
api.get('/api/users', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  return c.json(await db.listUsers(c.env.DB, c.env.ORG_ID));
});
api.post('/api/users', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const b = await c.req.json<{ email?: string; role?: db.Role }>();
  if (!b.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) return c.json({ error: 'e-mail inválido' }, 400);
  const role: db.Role = b.role === 'editor' ? 'editor' : 'leitor';
  const created = await db.upsertUser(c.env.DB, { email: b.email, org_id: c.env.ORG_ID, role });
  if (created.role !== role) await db.setUserRole(c.env.DB, created.email, role);
  await db.setUserActive(c.env.DB, created.email, true);
  return c.json({ ok: true, user: await db.getUser(c.env.DB, created.email) });
});
api.patch('/api/users/:email', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const email = decodeURIComponent(c.req.param('email')).toLowerCase();
  const target = await db.getUser(c.env.DB, email);
  if (!target) return c.json({ error: 'usuário não existe' }, 404);
  const b = await c.req.json<{ role?: db.Role; active?: boolean }>();
  if (email === u.email && (b.active === false || (b.role && b.role !== 'editor'))) return c.json({ error: 'você não pode se desativar nem se rebaixar' }, 400);
  if (b.role === 'editor' || b.role === 'leitor') await db.setUserRole(c.env.DB, email, b.role);
  if (typeof b.active === 'boolean') {
    await db.setUserActive(c.env.DB, email, b.active);
    if (!b.active) await revokeAll(c.env.OAUTH_PROVIDER, email);   // desativar = também mata as sessões MCP
  }
  return c.json({ ok: true, user: await db.getUser(c.env.DB, email) });
});
/** Encerrar sessões: revoga todos os grants OAuth (refresh tokens morrem; o access token expira em ≤1 h). */
api.post('/api/users/:email/revoke', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const email = decodeURIComponent(c.req.param('email')).toLowerCase();
  return c.json({ ok: true, revoked: await revokeAll(c.env.OAUTH_PROVIDER, email) });
});

export async function revokeAll(provider: Pick<OAuthHelpers, 'listUserGrants' | 'revokeGrant'> | undefined, email: string): Promise<number> {
  if (!provider) return 0;
  let n = 0;
  let cursor: string | undefined;
  do {
    const page = await provider.listUserGrants(email, cursor ? { cursor } : undefined);
    for (const g of page.items) { await provider.revokeGrant(g.id, email); n++; }
    cursor = page.cursor;
  } while (cursor);
  return n;
}
