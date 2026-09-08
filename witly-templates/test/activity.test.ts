import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import * as db from '../src/db/index.js';
import { avaliar, registrar } from '../src/kit/activity.js';
import { ORG, seedPublished, seedUser } from './helpers.js';

const user = { email: 'a@witly.digital', name: 'A' };
let n = 0;
const fresh = () => `act-${++n}`;

describe('registrar (spec 002 US1)', () => {
  it('geracao grava com e-mail, versão publicada e devolve id', async () => {
    const slug = fresh(); await seedPublished(slug); await seedUser(user.email);
    const out = await registrar(env, user, { evento: 'geracao', slug, cliente: 'enxoval', contexto: { temperatura: ['Quente', 'Frio'] }, resultado: { titulo: 'X', secoes: 1 } });
    expect(out).toMatch(/registrado \(geracao, .* v1\) id=/);
    const rows = await db.listActivity(env.DB, ORG, { slug });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: 'a@witly.digital', evento: 'geracao', version_number: 1, cliente: 'enxoval', origem: 'mcp' });
    expect(JSON.parse(rows[0].dados_json)).toEqual({ contexto: { temperatura: ['Quente', 'Frio'] }, resultado: { titulo: 'X', secoes: 1 } });
  });

  it('aprofundamento guarda pergunta/resposta/consultas/veredito; exige pergunta; descartado exige motivo', async () => {
    const slug = fresh(); await seedPublished(slug);
    await registrar(env, user, { evento: 'aprofundamento', slug, pergunta: 'Por que o CPL subiu?', pergunta_id: 'custo_subindo', resposta: 'CPM subiu 30% com CTR estável.', consultas: [{ fn: 'decomposicao', metrica: 'cpl' }], avaliacao: 4 });
    const a = (await db.listActivity(env.DB, ORG, { slug }))[0];
    expect(a.pergunta_id).toBe('custo_subindo'); expect(a.avaliacao).toBe(4);
    expect(JSON.parse(a.dados_json)).toMatchObject({ pergunta: 'Por que o CPL subiu?', consultas: [{ fn: 'decomposicao' }] });
    await expect(registrar(env, user, { evento: 'aprofundamento', slug, resposta: 'x' })).rejects.toThrow(/exige `pergunta`/);
    await expect(registrar(env, user, { evento: 'aprofundamento', slug, pergunta: 'q', descartado: true })).rejects.toThrow(/exige `motivo`/);
    await expect(registrar(env, user, { evento: 'aprofundamento', slug, pergunta: 'q', avaliacao: 9 })).rejects.toThrow(/1 a 5/);
  });

  it('PII recusa e nada é gravado; slug inexistente/invisível recusa', async () => {
    const slug = fresh(); await seedPublished(slug);
    await expect(registrar(env, user, { evento: 'aprofundamento', slug, pergunta: 'lead joao@gmail.com converteu?', resposta: 'x' })).rejects.toThrow(/dado pessoal/);
    await expect(registrar(env, user, { evento: 'geracao', slug, resultado: { obs: 'ligar para (11) 98888-7777' } })).rejects.toThrow(/telefone/);
    expect(await db.listActivity(env.DB, ORG, { slug })).toHaveLength(0);
    await expect(registrar(env, user, { evento: 'geracao', slug: 'nao-existe' })).rejects.toThrow(/não existe/);
    const other = fresh();
    await db.createTemplate(env.DB, { slug: other, org_id: ORG, name: 'de outro', manifest: {}, files: [], tasks: [], owner_email: 'b@witly.digital', publish: true });
    await expect(registrar(env, user, { evento: 'geracao', slug: other })).rejects.toThrow(/não é visível/);
  });

  it('registro acima de 200 KB é recusado', async () => {
    const slug = fresh(); await seedPublished(slug);
    await expect(registrar(env, user, { evento: 'aprofundamento', slug, pergunta: 'q', resposta: 'x'.repeat(210 * 1024) })).rejects.toThrow(/grande demais/);
  });
});

describe('avaliar (US3)', () => {
  it('grava nota com a versão publicada; nota fora de 1–5 recusa; PII no comentário recusa', async () => {
    const slug = fresh(); await seedPublished(slug);
    expect(await avaliar(env, user, slug, 4, 'faltou temperatura por dia')).toContain('nota 4');
    const u = (await db.usageStats(env.DB, ORG)).find((r) => r.slug === slug)!;
    expect(u.avaliacoes).toBe(1); expect(u.nota_media).toBe(4); expect(u.version_number).toBe(1);
    await expect(avaliar(env, user, slug, 0)).rejects.toThrow(/1 a 5/);
    await expect(avaliar(env, user, slug, 5, 'fale com x@y.com')).rejects.toThrow(/dado pessoal/);
  });
});
