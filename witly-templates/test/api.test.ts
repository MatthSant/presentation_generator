import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import * as db from '../src/db/index.js';
import { revokeAll } from '../src/api.js';
import { SESSION_COOKIE, signSession, verifySession } from '../src/auth/session.js';
import { seedPublished, seedUser } from './helpers.js';

let n = 0;
const fresh = () => `api-${++n}`;

async function cookieFor(email: string): Promise<string> {
  return `${SESSION_COOKIE}=${await signSession(env.COOKIE_ENCRYPTION_KEY, email)}`;
}
async function call(path: string, init: RequestInit & { as?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.as) headers.set('cookie', await cookieFor(init.as));
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return SELF.fetch(`http://x${path}`, { ...init, headers });
}

describe('session — cookie (T019)', () => {
  it('assina/verifica; expirado e adulterado falham', async () => {
    const c = await signSession('k', 'A@Witly.digital', 1_000_000_000_000, 60);
    expect(await verifySession('k', c, 1_000_000_000_000 + 30_000)).toEqual({ email: 'a@witly.digital' });
    expect(await verifySession('k', c, 1_000_000_000_000 + 61_000)).toBeNull();
    expect(await verifySession('outra', c, 1_000_000_000_000)).toBeNull();
    expect(await verifySession('k', c.slice(0, -3) + 'abc', 1_000_000_000_000)).toBeNull();
    expect(await verifySession('k', undefined)).toBeNull();
  });

  it('/api/me: sem cookie 401; leitor lê; papel vem do D1 (não do cookie)', async () => {
    expect((await call('/api/me')).status).toBe(401);
    await seedUser('l@witly.digital', 'leitor');
    expect(await (await call('/api/me', { as: 'l@witly.digital' })).json()).toMatchObject({ email: 'l@witly.digital', role: 'leitor' });
    await db.setUserRole(env.DB, 'l@witly.digital', 'editor');
    expect(await (await call('/api/me', { as: 'l@witly.digital' })).json()).toMatchObject({ role: 'editor' });
    await db.setUserActive(env.DB, 'l@witly.digital', false);
    expect((await call('/api/me', { as: 'l@witly.digital' })).status).toBe(401);   // desativado → sessão morre
  });
});

describe('api — templates (T020)', () => {
  it('leitor lê mas não escreve; editor edita rascunho e o MCP continua vendo a publicada; publicar troca', async () => {
    const slug = fresh();
    await seedPublished(slug);
    await seedUser('leitor@witly.digital', 'leitor');
    await seedUser('ed@witly.digital', 'editor');

    expect((await call('/api/templates', { as: 'leitor@witly.digital' })).status).toBe(200);
    expect((await call(`/api/templates/${slug}/draft/files/guia.md`, { method: 'PUT', as: 'leitor@witly.digital', body: JSON.stringify({ content: 'x' }) })).status).toBe(403);

    const r = await call(`/api/templates/${slug}/draft/files/guia.md`, { method: 'PUT', as: 'ed@witly.digital', body: JSON.stringify({ content: '# Guia v2' }) });
    expect(r.status).toBe(200);
    const pub = await db.getPublishedKit(env.DB, slug);
    expect(pub!.version.number).toBe(1);
    expect(pub!.files.find((f) => f.path === 'guia.md')!.content).toBe('# Guia\nLeia com cuidado.');
    const draft = await (await call(`/api/templates/${slug}?state=draft`, { as: 'ed@witly.digital' })).json() as { kit: { version: { number: number }; files: Array<{ path: string; content: string }> } };
    expect(draft.kit.version.number).toBe(2);
    expect(draft.kit.files.find((f) => f.path === 'guia.md')!.content).toBe('# Guia v2');

    expect((await call(`/api/templates/${slug}/publish`, { method: 'POST', as: 'ed@witly.digital' })).status).toBe(200);
    expect((await db.getPublishedKit(env.DB, slug))!.files.find((f) => f.path === 'guia.md')!.content).toBe('# Guia v2');
    expect((await call(`/api/templates/${slug}/publish`, { method: 'POST', as: 'ed@witly.digital' })).status).toBe(409);   // sem rascunho
  });

  it('salvar query com {{param}} não declarado devolve aviso sem bloquear (US2.4)', async () => {
    const slug = fresh();
    await seedPublished(slug);
    await seedUser('ed@witly.digital', 'editor');
    const r = await call(`/api/templates/${slug}/draft/files/queries/x.sql`, { method: 'PUT', as: 'ed@witly.digital', body: JSON.stringify({ content: 'SELECT {{field_conversion}}, {{nao_existe}}' }) });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { warnings: string[] }).warnings[0]).toContain('nao_existe');
  });

  it('tarefa de contexto, manifesto, meta do template e criação de template novo', async () => {
    const slug = fresh();
    await seedPublished(slug);
    await seedUser('ed@witly.digital', 'editor');
    expect((await call(`/api/templates/${slug}/draft/tasks/metas`, { method: 'PUT', as: 'ed@witly.digital', body: JSON.stringify({ title: 'Metas', body_md: 'como levantar', sort: 4 }) })).status).toBe(200);
    expect((await call(`/api/templates/${slug}/draft/manifest`, { method: 'PUT', as: 'ed@witly.digital', body: JSON.stringify({ manifest: { params: [] } }) })).status).toBe(200);
    expect((await call(`/api/templates/${slug}`, { method: 'PATCH', as: 'ed@witly.digital', body: JSON.stringify({ name: 'Novo nome' }) })).status).toBe(200);
    const d = await db.getDraftKit(env.DB, slug);
    expect(d!.tasks.map((t) => t.task_id).sort()).toEqual(['lancamento', 'metas']);
    expect(JSON.parse(d!.version.manifest_json)).toEqual({ params: [] });
    expect((await db.getTemplate(env.DB, slug))!.name).toBe('Novo nome');

    const c = await call('/api/templates', { method: 'POST', as: 'ed@witly.digital', body: JSON.stringify({ slug: `${slug}-novo`, name: 'Template novo' }) });
    expect(c.status).toBe(201);
    expect((await call('/api/templates', { method: 'POST', as: 'ed@witly.digital', body: JSON.stringify({ slug: 'Slug Inválido', name: 'x' }) })).status).toBe(400);
  });

  it('contexto geral: salvar publica na hora e aparece no kit do MCP', async () => {
    await seedUser('ed@witly.digital', 'editor');
    expect((await call('/api/general-contexts/regra-x', { method: 'PUT', as: 'ed@witly.digital', body: JSON.stringify({ title: 'Regra X', body_md: 'vale para tudo' }) })).status).toBe(200);
    const list = await (await call('/api/general-contexts', { as: 'ed@witly.digital' })).json() as Array<{ slug: string }>;
    expect(list.some((g) => g.slug === 'regra-x')).toBe(true);
    expect((await call('/api/general-contexts/regra-x', { method: 'DELETE', as: 'ed@witly.digital' })).status).toBe(200);
  });
});

describe('api — usuários e corte de acesso (T018b, FR-014)', () => {
  it('desativar corta MCP e UI; reativar volta; editor não se desativa', async () => {
    await seedUser('ed@witly.digital', 'editor');
    await seedUser('x@witly.digital', 'leitor');
    expect((await call('/api/users', { as: 'x@witly.digital' })).status).toBe(403);
    expect((await call('/api/users/x%40witly.digital', { method: 'PATCH', as: 'ed@witly.digital', body: JSON.stringify({ active: false }) })).status).toBe(200);
    expect((await call('/api/me', { as: 'x@witly.digital' })).status).toBe(401);
    expect((await db.getUser(env.DB, 'x@witly.digital'))!.active).toBe(0);
    expect((await call('/api/users/x%40witly.digital', { method: 'PATCH', as: 'ed@witly.digital', body: JSON.stringify({ active: true, role: 'editor' }) })).status).toBe(200);
    expect(await (await call('/api/me', { as: 'x@witly.digital' })).json()).toMatchObject({ role: 'editor' });
    expect((await call('/api/users/ed%40witly.digital', { method: 'PATCH', as: 'ed@witly.digital', body: JSON.stringify({ active: false }) })).status).toBe(400);
  });

  it('convidar fora do domínio cria ativo; revoke sem grants devolve 0', async () => {
    await seedUser('ed@witly.digital', 'editor');
    const r = await call('/api/users', { method: 'POST', as: 'ed@witly.digital', body: JSON.stringify({ email: 'parceiro@outra.com', role: 'leitor' }) });
    expect(r.status).toBe(200);
    expect((await db.getUser(env.DB, 'parceiro@outra.com'))!.active).toBe(1);
    const rv = await call('/api/users/parceiro%40outra.com/revoke', { method: 'POST', as: 'ed@witly.digital' });
    expect(await rv.json()).toEqual({ ok: true, revoked: 0 });
  });

  it('revokeAll percorre páginas e revoga cada grant', async () => {
    const revoked: string[] = [];
    const provider = {
      listUserGrants: async (_u: string, o?: { cursor?: string }) => (o?.cursor ? { items: [{ id: 'g3' }], cursor: undefined } : { items: [{ id: 'g1' }, { id: 'g2' }], cursor: 'next' }),
      revokeGrant: async (id: string) => { revoked.push(id); },
    } as unknown as Parameters<typeof revokeAll>[0];
    expect(await revokeAll(provider, 'a@b.c')).toBe(3);
    expect(revoked).toEqual(['g1', 'g2', 'g3']);
  });
});
