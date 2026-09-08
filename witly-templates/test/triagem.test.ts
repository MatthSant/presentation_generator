import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import * as db from '../src/db/index.js';
import { SESSION_COOKIE, signSession } from '../src/auth/session.js';
import { diffVersions } from '../src/kit/versions.js';
import { ORG, seedPublished, seedUser } from './helpers.js';

let n = 0;
const fresh = () => `triagem-${++n}`;
async function call(path: string, init: RequestInit & { as?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.as) headers.set('cookie', `${SESSION_COOKIE}=${await signSession(env.COOKIE_ENCRYPTION_KEY, init.as)}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return SELF.fetch(`http://x${path}`, { ...init, headers });
}
const ED = 'ed-tri@witly.digital'; const A = 'a-tri@witly.digital';

describe('triagem — veredito do editor', () => {
  it('aprofundamento nasce sem veredito; filtro "sem" o pega; PATCH e descartar fecham a fila', async () => {
    await seedUser(ED, 'editor'); await seedUser(A);
    const s = fresh(); await seedPublished(s);
    const id = await db.insertActivity(env.DB, { org_id: ORG, email: A, evento: 'aprofundamento', slug: s, version_number: 1, dados: { pergunta: 'CPL subiu?', resposta: 'leilão' } });
    const outro = await db.insertActivity(env.DB, { org_id: ORG, email: A, evento: 'aprofundamento', slug: s, version_number: 1, dados: { pergunta: 'canal pior?', resposta: 'meta' } });

    const semVeredito = await (await call(`/api/atividade?slug=${s}&veredito=sem&evento=aprofundamento`, { as: ED })).json() as Array<{ id: string }>;
    expect(semVeredito.map((r) => r.id).sort()).toEqual([id, outro].sort());
    const resumo = await (await call(`/api/atividade/resumo?slug=${s}`, { as: ED })).json() as { total: number; sem_veredito: number; desde: string | null };
    expect(resumo.total).toBe(2);
    expect(resumo.sem_veredito).toBeGreaterThanOrEqual(2);
    expect(resumo.desde).toBeTruthy();

    // veredito "ok" com nota
    expect((await call(`/api/atividade/${id}`, { method: 'PATCH', as: ED, body: JSON.stringify({ editor_nota: 4, editor_comentario: 'faltou a janela', veredito: 'ok' }) })).status).toBe(200);
    const depois = await db.getActivity(env.DB, id);
    expect(depois!.veredito).toBe('ok');
    expect(depois!.veredito_por).toBe(ED);
    expect(depois!.veredito_em).toBeTruthy();
    expect(depois!.editor_nota).toBe(4);

    // descartar: sai da fila, entra na taxa de descarte
    expect((await call(`/api/atividade/${outro}/descartar`, { method: 'POST', as: ED, body: JSON.stringify({ motivo: 'inventou meta' }) })).status).toBe(200);
    const desc = await db.getActivity(env.DB, outro);
    expect(desc!.descartado).toBe(1);
    expect(desc!.motivo).toBe('inventou meta');
    expect(desc!.veredito).toBe('descarte');

    expect((await (await call(`/api/atividade?slug=${s}&veredito=sem&evento=aprofundamento`, { as: ED })).json() as unknown[]).length).toBe(0);
    // veredito inválido é recusado; leitor não decide nada
    expect((await call(`/api/atividade/${id}`, { method: 'PATCH', as: ED, body: JSON.stringify({ veredito: 'talvez' }) })).status).toBe(400);
    expect((await call(`/api/atividade/${id}/descartar`, { method: 'POST', as: A, body: '{}' })).status).toBe(403);
  });

  it('virar exemplo e virar regra já fecham o veredito', async () => {
    await seedUser(ED, 'editor'); await seedUser(A);
    const s = fresh(); await seedPublished(s);
    const ex = await db.insertActivity(env.DB, { org_id: ORG, email: A, evento: 'aprofundamento', slug: s, version_number: 1, dados: { pergunta: 'p', resposta: 'r' } });
    const rg = await db.insertActivity(env.DB, { org_id: ORG, email: A, evento: 'aprofundamento', slug: s, version_number: 1, dados: { pergunta: 'q', resposta: 'r' }, descartado: true, motivo: 'não somar %' });
    expect((await call(`/api/atividade/${ex}/virar-exemplo`, { method: 'POST', as: ED })).status).toBe(200);
    expect((await call(`/api/atividade/${rg}/virar-regra`, { method: 'POST', as: ED, body: '{}' })).status).toBe(200);
    expect((await db.getActivity(env.DB, ex))!.veredito).toBe('exemplo');
    expect((await db.getActivity(env.DB, rg))!.veredito).toBe('regra');
  });

  it('busca livre acha por pergunta, cliente e e-mail', async () => {
    await seedUser(ED, 'editor'); await seedUser(A);
    const s = fresh(); await seedPublished(s);
    await db.insertActivity(env.DB, { org_id: ORG, email: A, evento: 'aprofundamento', slug: s, cliente: 'enxoval', dados: { pergunta: 'por que o CPMQL subiu' } });
    await db.insertActivity(env.DB, { org_id: ORG, email: A, evento: 'aprofundamento', slug: s, cliente: 'outro', dados: { pergunta: 'qual criativo escalar' } });
    const achou = await (await call(`/api/atividade?slug=${s}&busca=CPMQL`, { as: ED })).json() as unknown[];
    expect(achou.length).toBe(1);
    expect((await (await call(`/api/atividade?slug=${s}&busca=enxoval`, { as: ED })).json() as unknown[]).length).toBe(1);
    expect((await (await call(`/api/atividade?slug=${s}&busca=nada-disso`, { as: ED })).json() as unknown[]).length).toBe(0);
  });
});

describe('catálogo e saúde', () => {
  it('catálogo traz os quatro números e o uso por template', async () => {
    await seedUser(ED, 'editor');
    const s = fresh(); await seedPublished(s);
    await db.insertActivity(env.DB, { org_id: ORG, email: ED, evento: 'geracao', slug: s, version_number: 1, dados: {} });
    const r = await (await call('/api/catalogo', { as: ED })).json() as { stats: db.CatalogStats; templates: db.TemplateRow[]; desde30: string };
    expect(r.stats.publicados).toBeGreaterThanOrEqual(1);
    expect(r.stats.ultima_publicacao).toBeTruthy();
    const linha = r.templates.find((t) => t.slug === s)!;
    expect(linha.geracoes).toBe(1);
    expect(linha.ultimo_uso).toBeTruthy();
    expect(linha.ultimo_uso! >= r.desde30).toBe(true);   // usado agora: não conta como parado
  });

  it('saúde: descarte, fila sem veredito e lacunas repetidas; só editor', async () => {
    await seedUser(ED, 'editor'); await seedUser(A);
    const s = fresh(); await seedPublished(s);
    await db.insertActivity(env.DB, { org_id: ORG, email: A, evento: 'aprofundamento', slug: s, dados: { pergunta: 'a mesma pergunta' } });
    await db.insertActivity(env.DB, { org_id: ORG, email: A, evento: 'aprofundamento', slug: s, dados: { pergunta: 'a mesma pergunta' }, descartado: true, motivo: 'x' });
    expect((await call('/api/saude', { as: A })).status).toBe(403);
    const h = await (await call('/api/saude', { as: ED })).json() as { templates: db.HealthRow[]; lacunas: Array<{ slug: string; n: number }> };
    const linha = h.templates.find((t) => t.slug === s)!;
    expect(linha.aprofundamentos).toBe(2);
    expect(linha.descartados).toBe(1);
    expect(linha.sem_veredito).toBe(2);
    expect(h.lacunas.find((l) => l.slug === s)!.n).toBe(2);
  });
});

describe('diff — regras entram na comparação', () => {
  it('regra nova aparece como added no diff da versão', async () => {
    const s = fresh(); await seedPublished(s);
    const d = await db.ensureDraft(env.DB, s, ED);
    await db.saveTemplateRule(env.DB, d.id, { rule_id: 'nao-somar-porcentagem', tipo: 'regra', title: 'Não somar porcentagens', body_md: 'média ponderada', sort: 0 });
    const diff = await diffVersions(env.DB, s, 1, d.number);
    expect(diff.rules.map((r) => [r.path, r.kind])).toEqual([['nao-somar-porcentagem', 'added']]);
  });
});
