import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import * as db from '../src/db/index.js';
import { ORG, SAMPLE_FILES, SAMPLE_MANIFEST, seedPublished } from './helpers.js';

let n = 0;
const fresh = () => `f2-${++n}`;

describe('db — visibilidade e templates pessoais (spec 002 US6)', () => {
  it('pessoal só aparece para o dono; editor vê todos em listPersonal; promover mantém versões', async () => {
    const org = fresh(); await seedPublished(org);
    const mine = fresh();
    await db.createTemplate(env.DB, { slug: mine, org_id: ORG, name: 'Meu', manifest: SAMPLE_MANIFEST, files: SAMPLE_FILES, tasks: [], owner_email: 'A@witly.digital', publish: true });

    const a = await db.listTemplates(env.DB, ORG, 'a@witly.digital');
    const b = await db.listTemplates(env.DB, ORG, 'b@witly.digital');
    expect(a.map((t) => t.slug)).toEqual(expect.arrayContaining([org, mine]));
    expect(b.map((t) => t.slug)).toContain(org);
    expect(b.map((t) => t.slug)).not.toContain(mine);
    expect((await db.getPublishedKit(env.DB, mine))!.version.number).toBe(1);     // nasceu publicado

    const t = (await db.getTemplate(env.DB, mine))!;
    expect(db.canSee(t, 'a@witly.digital')).toBe(true);
    expect(db.canSee(t, 'b@witly.digital')).toBe(false);
    expect((await db.listPersonal(env.DB, ORG, '*')).some((x) => x.slug === mine)).toBe(true);
    expect((await db.listPersonal(env.DB, ORG, 'b@witly.digital')).some((x) => x.slug === mine)).toBe(false);

    const promoted = await db.promoteTemplate(env.DB, mine);
    expect(promoted.owner_email).toBeNull();
    expect(promoted.promoted_from).toBe('a@witly.digital');
    expect((await db.listTemplates(env.DB, ORG, 'b@witly.digital')).map((t) => t.slug)).toContain(mine);
    expect((await db.listVersions(env.DB, mine)).length).toBe(1);
  });

  it('promover com slug colidindo renomeia (versões, atividade, ratings acompanham)', async () => {
    const org = fresh(); await seedPublished(org);
    const mine = fresh();
    await db.createTemplate(env.DB, { slug: mine, org_id: ORG, name: 'Meu', manifest: {}, files: [], tasks: [], owner_email: 'a@witly.digital', publish: true });
    await db.insertActivity(env.DB, { org_id: ORG, email: 'a@witly.digital', evento: 'geracao', slug: mine, dados: {} });
    await expect(db.promoteTemplate(env.DB, mine, org)).rejects.toThrow(/já existe/);
    const p = await db.promoteTemplate(env.DB, mine, `${mine}-org`);
    expect(p.slug).toBe(`${mine}-org`);
    expect(await db.getTemplate(env.DB, mine)).toBeNull();
    expect((await db.listVersions(env.DB, `${mine}-org`)).length).toBe(1);
    expect((await db.listActivity(env.DB, ORG, { slug: `${mine}-org` })).length).toBe(1);
  });

  it('deleteTemplate remove versões e arquivos, mantém atividade', async () => {
    const s = fresh(); await seedPublished(s);
    await db.insertActivity(env.DB, { org_id: ORG, email: 'a@witly.digital', evento: 'aprofundamento', slug: s, dados: { pergunta: 'x' } });
    await db.deleteTemplate(env.DB, s);
    expect(await db.getTemplate(env.DB, s)).toBeNull();
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM template_files f JOIN template_versions v ON v.id = f.version_id WHERE v.slug = ?').bind(s).first<{ n: number }>())!.n).toBe(0);
    expect((await db.listActivity(env.DB, ORG, { slug: s })).length).toBe(1);
  });
});

describe('db — versões: changelog, restaurar (US4)', () => {
  it('publica com changelog; restaurar v1 vira rascunho v3 idêntico à v1', async () => {
    const s = fresh(); await seedPublished(s);
    const d = await db.ensureDraft(env.DB, s, 'e@witly.digital');
    await db.saveFile(env.DB, d.id, 'guia.md', '# Guia v2');
    const v2 = await db.publishDraft(env.DB, s, 'guia reescrito');
    expect(v2.changelog).toBe('guia reescrito');
    const r = await db.restoreVersion(env.DB, s, 1, 'e@witly.digital');
    expect(r.number).toBe(3);
    expect(r.state).toBe('draft');
    expect(r.changelog).toBe('restaurada da v1');
    const draft = await db.getDraftKit(env.DB, s);
    expect(draft!.files.find((f) => f.path === 'guia.md')!.content).toBe('# Guia\nLeia com cuidado.');
    expect((await db.getPublishedKit(env.DB, s))!.version.number).toBe(2);
    expect((await db.listVersions(env.DB, s)).map((v) => v.number)).toEqual([3, 2, 1]);
  });

  it('publishNewVersion (pessoal via MCP) publica direto como max+1', async () => {
    const s = fresh(); await seedPublished(s);
    const v = await db.publishNewVersion(env.DB, s, { manifest: { params: [] }, files: [{ path: 'guia.md', content: 'novo' }], tasks: [], author_email: 'a@witly.digital' });
    expect(v.number).toBe(2);
    expect((await db.getPublishedKit(env.DB, s))!.files[0].content).toBe('novo');
  });
});

describe('db — atividade, avaliações, uso (US1/US3)', () => {
  it('insere, filtra, atualiza campos do editor; uso agrega; top perguntas agrupa', async () => {
    const s = fresh(); await seedPublished(s);
    const id = await db.insertActivity(env.DB, { org_id: ORG, email: 'A@witly.digital', evento: 'aprofundamento', slug: s, version_number: 1, cliente: 'enxoval', dados: { pergunta: 'Por que o CPL subiu?', resposta: 'x' }, avaliacao: 5 });
    await db.insertActivity(env.DB, { org_id: ORG, email: 'a@witly.digital', evento: 'aprofundamento', slug: s, version_number: 1, dados: { pergunta: 'por que o CPL subiu' }, descartado: true, motivo: 'inventou meta' });
    await db.insertActivity(env.DB, { org_id: ORG, email: 'b@witly.digital', evento: 'geracao', slug: s, version_number: 1, cliente: 'enxoval', dados: {} });
    await db.insertRating(env.DB, { org_id: ORG, slug: s, version_number: 1, email: 'a@witly.digital', nota: 4 });
    await db.insertRating(env.DB, { org_id: ORG, slug: s, version_number: 1, email: 'b@witly.digital', nota: 2 });

    expect((await db.listActivity(env.DB, ORG, { slug: s })).length).toBe(3);
    expect((await db.listActivity(env.DB, ORG, { slug: s, email: 'a@witly.digital' })).length).toBe(2);
    expect((await db.listActivity(env.DB, ORG, { slug: s, descartado: true })).length).toBe(1);
    expect((await db.listActivity(env.DB, ORG, { slug: s, avaliacao: 5 })).length).toBe(1);

    await db.updateActivityEditor(env.DB, id, { editor_nota: 3, virou_exemplo: true });
    const a = (await db.getActivity(env.DB, id))!;
    expect(a.editor_nota).toBe(3); expect(a.virou_exemplo).toBe(1); expect(a.avaliacao).toBe(5);

    const u = (await db.usageStats(env.DB, ORG)).find((r) => r.slug === s)!;
    expect(u).toMatchObject({ geracoes: 1, aprofundamentos: 2, descartados: 1, avaliacoes: 2 });
    expect(u.nota_media).toBe(3);
    const top = await db.topQuestions(env.DB, ORG, s);
    expect(top[0].n).toBe(2);   // as duas formas de "por que o CPL subiu" agrupam
  });
});
