import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import * as db from '../src/db/index.js';

const ORG = 'witly';

async function seedTemplate(slug = 'acomp') {
  return db.createTemplate(env.DB, {
    slug, org_id: ORG, name: 'Acompanhamento', objective: 'obj', when_to_use: 'quando',
    manifest: { params: [{ id: 'field_conversion', type: 'string', required: true }] },
    files: [{ path: 'queries/dump.sql', content: "select * from v where fc = '{{field_conversion}}'" }, { path: 'guia.md', content: '# guia' }],
    tasks: [{ task_id: 'temperatura', title: 'Temperatura', body_md: 'regra' }],
    author_email: 'a@witly.digital',
  });
}

describe('db — usuários', () => {
  it('upsert cria como leitor e preserva papel em novo upsert', async () => {
    const u = await db.upsertUser(env.DB, { email: 'X@Witly.digital', name: 'X', org_id: ORG, role: 'leitor' });
    expect(u.email).toBe('x@witly.digital');
    expect(u.role).toBe('leitor');
    await db.setUserRole(env.DB, u.email, 'editor');
    const again = await db.upsertUser(env.DB, { email: u.email, name: 'X2', org_id: ORG, role: 'leitor' });
    expect(again.role).toBe('editor');
    expect(again.name).toBe('X2');
  });

  it('setUserActive desativa', async () => {
    await db.upsertUser(env.DB, { email: 'y@witly.digital', org_id: ORG, role: 'leitor' });
    await db.setUserActive(env.DB, 'y@witly.digital', false);
    expect((await db.getUser(env.DB, 'y@witly.digital'))!.active).toBe(0);
  });
});

describe('db — templates e versões', () => {
  it('createTemplate nasce como rascunho v1, sem publicada', async () => {
    const v = await seedTemplate('t1');
    expect(v.number).toBe(1);
    expect(v.state).toBe('draft');
    expect(await db.getPublishedKit(env.DB, 't1')).toBeNull();
    const draft = await db.getDraftKit(env.DB, 't1');
    expect(draft!.files.map((f) => f.path)).toEqual(['guia.md', 'queries/dump.sql']);
    expect(draft!.tasks[0].task_id).toBe('temperatura');
  });

  it('publishDraft promove; ensureDraft copia a publicada como v2; MCP continua vendo v1', async () => {
    await seedTemplate('t2');
    const pub = await db.publishDraft(env.DB, 't2');
    expect(pub.state).toBe('published');
    expect((await db.getTemplate(env.DB, 't2'))!.draft_version_id).toBeNull();

    const d2 = await db.ensureDraft(env.DB, 't2', 'b@witly.digital');
    expect(d2.number).toBe(2);
    await db.saveFile(env.DB, d2.id, 'guia.md', '# guia novo');
    await db.saveContextTask(env.DB, d2.id, { task_id: 'metas', title: 'Metas', body_md: 'x' });

    const published = await db.getPublishedKit(env.DB, 't2');
    expect(published!.version.number).toBe(1);
    expect(published!.files.find((f) => f.path === 'guia.md')!.content).toBe('# guia');
    const draft = await db.getDraftKit(env.DB, 't2');
    expect(draft!.files.find((f) => f.path === 'guia.md')!.content).toBe('# guia novo');
    expect(draft!.tasks.map((t) => t.task_id).sort()).toEqual(['metas', 'temperatura']);

    // ensureDraft é idempotente
    expect((await db.ensureDraft(env.DB, 't2', null)).id).toBe(d2.id);
  });

  it('listTemplates traz números de publicada e rascunho', async () => {
    await seedTemplate('t3');
    const rows = await db.listTemplates(env.DB, ORG);
    const t3 = rows.find((r) => r.slug === 't3')!;
    expect(t3.published_number).toBeNull();
    expect(t3.draft_number).toBe(1);
  });
});

describe('db — contextos gerais e uso', () => {
  it('upsert/list/delete de contexto geral', async () => {
    await db.upsertGeneralContext(env.DB, { slug: 'numeros-pequenos', org_id: ORG, title: 'Números pequenos', body_md: 'cuidado' });
    await db.upsertGeneralContext(env.DB, { slug: 'numeros-pequenos', org_id: ORG, title: 'Números pequenos', body_md: 'cuidado v2' });
    const list = await db.listGeneralContexts(env.DB, ORG);
    expect(list).toHaveLength(1);
    expect(list[0].body_md).toBe('cuidado v2');
    await db.deleteGeneralContext(env.DB, 'numeros-pequenos');
    expect(await db.listGeneralContexts(env.DB, ORG)).toHaveLength(0);
  });

  it('logUsage grava', async () => {
    await db.logUsage(env.DB, { email: 'a@witly.digital', tool: 'obter_template', slug: 'acomp', version_number: 1 });
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM usage_log').first<{ n: number }>();
    expect(n!.n).toBe(1);
  });
});
