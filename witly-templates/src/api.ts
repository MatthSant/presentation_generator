/* api — rotas da UI (/api/*). Sessão por cookie (session.ts); escrita exige `editor`.
 * Regras: rascunho ≠ publicada (o MCP só vê a publicada); contexto geral publica ao salvar. */

import { parseBump } from './db/semver.js';
import { Hono, type Context } from 'hono';
import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import * as db from './db/index.js';
import { undeclaredParams, type ParamDef } from './kit/montar-query.js';
import { clearSessionCookie, sessionUser, setSessionCookie, signSession, startUiLogin } from './auth/session.js';
import { resolveAccess } from './auth/access.js';
import { diffVersions } from './kit/versions.js';
import { virarExemplo, virarRegra } from './kit/curate.js';

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
/** Escrita num template: editor, ou o dono se for pessoal. */
async function requireWriter(c: Ctx, slug: string): Promise<db.User | Response> {
  const u = await sessionUser(c);
  if (!u) return c.json({ error: 'sem sessão' }, 401);
  if (u.role === 'editor') return u;
  const t = await db.getTemplate(c.env.DB, slug);
  if (t && db.isOwner(t, u.email)) return u;
  return c.json({ error: 'só editores (ou o dono de um template pessoal) podem alterar' }, 403);
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
  return c.json(await db.listTemplates(c.env.DB, c.env.ORG_ID, u.role === 'editor' ? '*' : u.email));
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
      { path: 'guia.md', content: `# Guia de leitura: ${b.name.trim()}\n\n## Como funciona a mecânica\n\n## Definições\n\n## Como ler cada bloco\n` },
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
  if (!t || !(u.role === 'editor' || db.canSee(t, u.email))) return c.json({ error: 'não existe' }, 404);
  const state = c.req.query('state') === 'draft' ? 'draft' : 'published';
  const kit = state === 'draft' ? await db.getDraftKit(c.env.DB, slug) : await db.getPublishedKit(c.env.DB, slug);
  if (!kit) return c.json({ template: t, kit: null });
  return c.json({ template: t, kit: { version: kit.version, manifest: JSON.parse(kit.version.manifest_json), files: kit.files, tasks: kit.tasks, rules: kit.rules } });
});

api.patch('/api/templates/:slug', async (c) => {
  const u = await requireWriter(c, c.req.param('slug')); if (isResp(u)) return u;
  const b = await c.req.json<{ name?: string; objective?: string; when_to_use?: string }>();
  try { await db.updateTemplateMeta(c.env.DB, c.req.param('slug'), b); } catch (e) { return c.json({ error: (e as Error).message }, 404); }
  return c.json({ ok: true });
});

api.post('/api/templates/:slug/draft', async (c) => {
  const u = await requireWriter(c, c.req.param('slug')); if (isResp(u)) return u;
  try { return c.json({ ok: true, version: await db.ensureDraft(c.env.DB, c.req.param('slug'), u.email) }); }
  catch (e) { return c.json({ error: (e as Error).message }, 404); }
});

async function draftId(c: Ctx, slug: string, email: string): Promise<string> {
  return (await db.ensureDraft(c.env.DB, slug, email)).id;
}

api.put('/api/templates/:slug/draft/manifest', async (c) => {
  const u = await requireWriter(c, c.req.param('slug')); if (isResp(u)) return u;
  const b = await c.req.json<{ manifest?: unknown }>();
  if (!b.manifest || typeof b.manifest !== 'object') return c.json({ error: 'manifest deve ser um objeto JSON' }, 400);
  try { await db.saveManifest(c.env.DB, await draftId(c, c.req.param('slug'), u.email), b.manifest); }
  catch (e) { return c.json({ error: (e as Error).message }, 404); }
  return c.json({ ok: true });
});

/** Salva um arquivo do rascunho. Para queries/*.sql devolve `undeclared` (aviso, não bloqueia — US2.4). */
api.put('/api/templates/:slug/draft/files/*', async (c) => {
  const u = await requireWriter(c, c.req.param('slug')); if (isResp(u)) return u;
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
  const u = await requireWriter(c, c.req.param('slug')); if (isResp(u)) return u;
  const path = decodeURIComponent(c.req.path.split('/draft/files/')[1] || '');
  if (!PATH.test(path)) return c.json({ error: 'caminho inválido' }, 400);
  try { await db.deleteFile(c.env.DB, await draftId(c, c.req.param('slug'), u.email), path); }
  catch (e) { return c.json({ error: (e as Error).message }, 404); }
  return c.json({ ok: true });
});

api.put('/api/templates/:slug/draft/tasks/:task', async (c) => {
  const u = await requireWriter(c, c.req.param('slug')); if (isResp(u)) return u;
  const task_id = c.req.param('task');
  if (!TASK.test(task_id)) return c.json({ error: 'id de tarefa inválido' }, 400);
  const b = await c.req.json<{ title?: string; body_md?: string; sort?: number }>();
  if (!b.title?.trim() || typeof b.body_md !== 'string') return c.json({ error: 'title e body_md obrigatórios' }, 400);
  try { await db.saveContextTask(c.env.DB, await draftId(c, c.req.param('slug'), u.email), { task_id, title: b.title.trim(), body_md: b.body_md, sort: b.sort }); }
  catch (e) { return c.json({ error: (e as Error).message }, 404); }
  return c.json({ ok: true });
});

api.put('/api/templates/:slug/draft/regras/:id', async (c) => {
  const u = await requireWriter(c, c.req.param('slug')); if (isResp(u)) return u;
  const rule_id = c.req.param('id');
  if (!SLUG.test(rule_id)) return c.json({ error: 'id da regra inválido' }, 400);
  const b = await c.req.json<{ title?: string; body_md?: string; tipo?: string; sort?: number }>();
  if (!b.title?.trim()) return c.json({ error: 'title obrigatório (a regra em uma frase)' }, 400);
  const tipo = (['regra', 'recomendacao', 'definicao'] as const).find((t) => t === b.tipo) ?? 'regra';
  const d = await db.ensureDraft(c.env.DB, c.req.param('slug'), u.email);
  await db.saveTemplateRule(c.env.DB, d.id, { rule_id, tipo, title: b.title.trim(), body_md: b.body_md ?? '', sort: b.sort ?? 0 });
  return c.json({ ok: true, version: d.number });
});

api.delete('/api/templates/:slug/draft/regras/:id', async (c) => {
  const u = await requireWriter(c, c.req.param('slug')); if (isResp(u)) return u;
  const d = await db.ensureDraft(c.env.DB, c.req.param('slug'), u.email);
  await db.deleteTemplateRule(c.env.DB, d.id, c.req.param('id'));
  return c.json({ ok: true });
});

api.post('/api/templates/:slug/publish', async (c) => {
  const u = await requireWriter(c, c.req.param('slug')); if (isResp(u)) return u;
  const b = await c.req.json<{ changelog?: string; bump?: string }>().catch(() => ({} as { changelog?: string; bump?: string }));
  try { return c.json({ ok: true, version: await db.publishDraft(c.env.DB, c.req.param('slug'), String(b.changelog || '').slice(0, 500), parseBump(b.bump)) }); }
  catch (e) { return c.json({ error: (e as Error).message }, 409); }
});


// ── Fase 2: pessoais, atividade, uso, versões, curadoria ────────────────────

api.get('/api/pessoais', async (c) => {
  const u = await requireUser(c); if (isResp(u)) return u;
  return c.json(await db.listPersonal(c.env.DB, c.env.ORG_ID, u.role === 'editor' ? '*' : u.email));
});
api.post('/api/templates/:slug/promover', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const b = await c.req.json<{ novo_slug?: string }>().catch(() => ({} as { novo_slug?: string }));
  if (b.novo_slug && !SLUG.test(b.novo_slug)) return c.json({ error: 'novo_slug inválido' }, 400);
  try { return c.json({ ok: true, template: await db.promoteTemplate(c.env.DB, c.req.param('slug'), b.novo_slug) }); }
  catch (e) { return c.json({ error: (e as Error).message }, 409); }
});
api.delete('/api/templates/:slug', async (c) => {
  const u = await requireUser(c); if (isResp(u)) return u;
  const t = await db.getTemplate(c.env.DB, c.req.param('slug'));
  if (!t) return c.json({ error: 'não existe' }, 404);
  if (!(u.role === 'editor' || db.isOwner(t, u.email))) return c.json({ error: 'só o dono ou um editor remove' }, 403);
  await db.deleteTemplate(c.env.DB, t.slug);
  return c.json({ ok: true });
});

api.get('/api/atividade', async (c) => {
  const u = await requireUser(c); if (isResp(u)) return u;
  const q = c.req.query();
  const f: db.ActivityFilter = {
    slug: q.slug || undefined, cliente: q.cliente || undefined, evento: q.evento || undefined,
    desde: q.desde || undefined, ate: q.ate || undefined,
    avaliacao: q.avaliacao ? Number(q.avaliacao) : undefined,
    descartado: q.descartado === '1' ? true : q.descartado === '0' ? false : undefined,
    limit: q.limit ? Number(q.limit) : undefined, offset: q.offset ? Number(q.offset) : undefined,
    email: u.role === 'editor' ? (q.email || undefined) : u.email,   // leitor: só as suas
  };
  const rows = await db.listActivity(c.env.DB, c.env.ORG_ID, f);
  // lista = resumo (a resposta completa vai no detalhe)
  return c.json(rows.map((r) => {
    let d: Record<string, unknown> = {};
    try { d = JSON.parse(r.dados_json) as Record<string, unknown>; } catch { /* ignora */ }
    const resposta = typeof d.resposta === 'string' ? d.resposta : '';
    return { ...r, dados_json: undefined, resumo: { pergunta: d.pergunta ?? null, resposta: resposta.slice(0, 240), mudanca: d.mudanca ?? null, resultado: d.resultado ?? null } };
  }));
});
api.get('/api/atividade/:id', async (c) => {
  const u = await requireUser(c); if (isResp(u)) return u;
  const a = await db.getActivity(c.env.DB, c.req.param('id'));
  if (!a || (u.role !== 'editor' && a.email !== u.email)) return c.json({ error: 'não existe' }, 404);
  return c.json({ ...a, dados: JSON.parse(a.dados_json) });
});
api.patch('/api/atividade/:id', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const b = await c.req.json<{ editor_nota?: number | null; editor_comentario?: string | null }>();
  if (b.editor_nota != null && !(Number.isInteger(b.editor_nota) && b.editor_nota >= 1 && b.editor_nota <= 5)) return c.json({ error: 'editor_nota 1–5' }, 400);
  try { await db.updateActivityEditor(c.env.DB, c.req.param('id'), { editor_nota: b.editor_nota, editor_comentario: b.editor_comentario }); }
  catch (e) { return c.json({ error: (e as Error).message }, 404); }
  return c.json({ ok: true });
});
api.post('/api/atividade/:id/virar-exemplo', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const r = await virarExemplo(c.env.DB, c.req.param('id'), u.email);
  return r.ok ? c.json(r) : c.json({ error: r.motivo }, 409);
});
api.post('/api/atividade/:id/virar-regra', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const b = await c.req.json<{ texto?: string }>().catch(() => ({} as { texto?: string }));
  const r = await virarRegra(c.env.DB, c.req.param('id'), u.email, b.texto);
  return r.ok ? c.json(r) : c.json({ error: r.motivo }, 409);
});

api.get('/api/uso', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const slug = c.req.query('slug') || undefined;
  const [stats, top] = await Promise.all([db.usageStats(c.env.DB, c.env.ORG_ID), db.topQuestions(c.env.DB, c.env.ORG_ID, slug, 10)]);
  return c.json({ stats: slug ? stats.filter((s) => s.slug === slug) : stats, top_perguntas: top });
});

api.get('/api/templates/:slug/versoes', async (c) => {
  const u = await requireUser(c); if (isResp(u)) return u;
  const t = await db.getTemplate(c.env.DB, c.req.param('slug'));
  if (!t || !(u.role === 'editor' || db.canSee(t, u.email))) return c.json({ error: 'não existe' }, 404);
  return c.json(await db.listVersions(c.env.DB, t.slug));
});
api.get('/api/templates/:slug/versoes/diff', async (c) => {
  const u = await requireUser(c); if (isResp(u)) return u;
  const from = Number(c.req.query('de')); const to = Number(c.req.query('para'));
  if (!Number.isInteger(from) || !Number.isInteger(to)) return c.json({ error: 'de/para inválidos' }, 400);
  try { return c.json(await diffVersions(c.env.DB, c.req.param('slug'), from, to)); }
  catch (e) { return c.json({ error: (e as Error).message }, 404); }
});
api.post('/api/templates/:slug/versoes/:n/restaurar', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  try { return c.json({ ok: true, version: await db.restoreVersion(c.env.DB, c.req.param('slug'), Number(c.req.param('n')), u.email) }); }
  catch (e) { return c.json({ error: (e as Error).message }, 404); }
});

// ── documentos da plataforma (design system…) ───────────────────────────────
api.get('/api/platform-docs', async (c) => {
  const u = await requireUser(c); if (isResp(u)) return u;
  return c.json(await db.listPlatformDocs(c.env.DB, c.env.ORG_ID));
});
api.put('/api/platform-docs/:slug', async (c) => {
  const u = await requireUser(c, 'editor'); if (isResp(u)) return u;
  const slug = c.req.param('slug');
  if (!SLUG.test(slug)) return c.json({ error: 'slug inválido' }, 400);
  const b = await c.req.json<{ title?: string; body_md?: string; kit_file?: string | null }>();
  if (!b.title?.trim() || typeof b.body_md !== 'string') return c.json({ error: 'title e body_md obrigatórios' }, 400);
  if (b.kit_file != null && b.kit_file !== '' && !PATH.test(b.kit_file)) return c.json({ error: 'kit_file inválido' }, 400);
  await db.upsertPlatformDoc(c.env.DB, { slug, org_id: c.env.ORG_ID, title: b.title.trim(), body_md: b.body_md, kit_file: b.kit_file === '' ? null : b.kit_file, author_email: u.email });
  return c.json({ ok: true });
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
  const b = await c.req.json<{ title?: string; body_md?: string; tipo?: string }>();
  if (!b.title?.trim() || typeof b.body_md !== 'string') return c.json({ error: 'title e body_md obrigatórios' }, 400);
  const tipo = (['regra', 'recomendacao', 'definicao'] as const).find((t) => t === b.tipo) ?? 'regra';
  await db.upsertGeneralContext(c.env.DB, { slug, org_id: c.env.ORG_ID, title: b.title.trim(), body_md: b.body_md, tipo, author_email: u.email });
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
