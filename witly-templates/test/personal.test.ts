import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import * as db from '../src/db/index.js';
import { removerTemplate, salvarTemplate } from '../src/kit/personal.js';
import { listarTemplates, obterTemplate, perguntas, resourceText } from '../src/kit/tools.js';
import { ORG, seedPublished } from './helpers.js';

const a = { email: 'a@witly.digital', name: 'A' };
const b = { email: 'b@witly.digital', name: 'B' };
let n = 0;
const fresh = () => `meu-${++n}`;

const KIT = {
  name: 'Recorte de temperatura por dia',
  objective: 'CPL por dia só do Quente',
  when_to_use: 'quando o consultor pede temperatura no tempo',
  manifest: { params: [{ id: 'field_conversion', type: 'string', required: true }], queries: [{ id: 'dump', file: 'queries/dump.sql' }] },
  arquivos: { 'queries/dump.sql': 'SELECT 1 WHERE fc = {{field_conversion}}', 'guia.md': '# Guia\nleia', 'perguntas.md': '# Perguntas\n- q1: CPL subiu?' },
  contexto: { lancamento: { title: 'Lançamento', body_md: 'ache o field_conversion' } },
};

describe('templates pessoais (spec 002 US6)', () => {
  it('salvar cria publicado e só o dono vê/obtém; salvar de novo = versão nova', async () => {
    const slug = fresh();
    const out = await salvarTemplate(env, a, { slug, ...KIT });
    expect(out).toContain(`template pessoal criado: ${slug} v1`);
    expect(await listarTemplates(env, a)).toContain('PESSOAL');
    expect(await listarTemplates(env, b)).not.toContain(slug);
    expect(await obterTemplate(env, a, slug)).toContain('— PESSOAL');
    await expect(obterTemplate(env, b, slug)).rejects.toThrow(/não existe/);
    expect(await perguntas(env, a, slug)).toContain('q1: CPL subiu?');
    expect(await resourceText(env, `template://${slug}/perguntas`, a.email)).toContain('q1');
    expect(await resourceText(env, `template://${slug}/perguntas`, b.email)).toBeNull();

    const out2 = await salvarTemplate(env, a, { slug, ...KIT, arquivos: { ...KIT.arquivos, 'guia.md': '# Guia v2' }, changelog: 'guia' });
    expect(out2).toContain(`v2`);
    const kit = await db.getPublishedKit(env.DB, slug);
    expect(kit!.version.number).toBe(2);
    expect(kit!.files.find((f) => f.path === 'guia.md')!.content).toBe('# Guia v2');
    expect(kit!.version.changelog).toBe('guia');
  });

  it('slug de outra pessoa ou da organização é recusado; slug inválido; PII; arquivo > 1 MB', async () => {
    const org = fresh(); await seedPublished(org);
    const mine = fresh(); await salvarTemplate(env, a, { slug: mine, ...KIT });
    await expect(salvarTemplate(env, b, { slug: mine, ...KIT })).rejects.toThrow(/de outra pessoa/);
    await expect(salvarTemplate(env, b, { slug: org, ...KIT })).rejects.toThrow(/da organização/);
    await expect(salvarTemplate(env, b, { slug: 'Slug Ruim', ...KIT })).rejects.toThrow(/slug inválido/);
    await expect(salvarTemplate(env, b, { slug: fresh(), ...KIT, notas: 'cliente maria@x.com' })).rejects.toThrow(/dado pessoal/);
    await expect(salvarTemplate(env, b, { slug: fresh(), ...KIT, arquivos: { 'guia.md': 'x'.repeat(1024 * 1024 + 1) } })).rejects.toThrow(/passa de 1 MB/);
  });

  it('remover: só o dono; org não; atividade fica', async () => {
    const mine = fresh(); await salvarTemplate(env, a, { slug: mine, ...KIT });
    await db.insertActivity(env.DB, { org_id: ORG, email: a.email, evento: 'geracao', slug: mine, dados: {} });
    await expect(removerTemplate(env, b, mine)).rejects.toThrow(/só o dono/);
    const org = fresh(); await seedPublished(org);
    await expect(removerTemplate(env, a, org)).rejects.toThrow(/editores na UI/);
    expect(await removerTemplate(env, a, mine)).toContain('removido');
    expect(await db.getTemplate(env.DB, mine)).toBeNull();
    expect((await db.listActivity(env.DB, ORG, { slug: mine })).length).toBe(1);
  });

  it('contrato://widgets vem do documento da PLATAFORMA (igual para todos)', async () => {
    expect(await resourceText(env, 'contrato://widgets', a.email)).toBeNull();
    await db.upsertPlatformDoc(env.DB, { slug: 'design-system', org_id: ORG, title: 'DS', body_md: '# Widgets\nkpi-card, chart…', kit_file: 'design-system.md' });
    expect(await resourceText(env, 'contrato://widgets', a.email)).toContain('kpi-card');
    expect(await resourceText(env, 'contrato://widgets', b.email)).toContain('kpi-card');
  });
});
