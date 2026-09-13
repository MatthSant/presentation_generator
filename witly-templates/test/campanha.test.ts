/* Spec 008 fase 5 — campanha: linha do tempo pelo registrar, ação estruturada, "proposto" até alguém
 * confirmar, fechar resultado, a tela Ações e as pendências vencidas na etapa 0 do roteiro. */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import * as kb from '../src/db/conhecimento.js';
import { normalizaEvento, pendentesVencidas, resumoCampanha, EventoError } from '../src/kit/campanha.js';
import { validarEntrada } from '../src/kit/conhecimento.js';
import { SESSION_COOKIE, signSession } from '../src/auth/session.js';
import { registrar } from '../src/kit/activity.js';
import { conhecimento } from '../src/kit/conhecimento-tools.js';
import { ORG, seedPublished, seedUser } from './helpers.js';

const ED = 'ed-cp@witly.digital'; const A = 'a-cp@witly.digital';
const U = (e: string) => ({ email: e, name: e.split('@')[0] });
const ontem = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
async function call(path: string, init: RequestInit & { as?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.as) headers.set('cookie', `${SESSION_COOKIE}=${await signSession(env.COOKIE_ENCRYPTION_KEY, init.as)}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return SELF.fetch(`http://x${path}`, { ...init, headers });
}
const grava = (input: Parameters<typeof validarEntrada>[0]) => kb.gravarConhecimento(env.DB, ORG, validarEntrada(input).entrada!, 'seed');

async function seedCampanha(id = 'vitalicia-set26') {
  await grava({ id: 'singular', tipo: 'cliente', titulo: 'Singular: perpétuo VSL, ticket R$ 497', dados: { modelo: 'infoproduto perpetuo', slug_delfos: 'singular' } });
  await grava({ id, tipo: 'campanha', titulo: 'Vitalícia set/26 (Singular)', corpo_md: 'Lançamento de setembro.',
    dados: { cliente_id: 'singular', funil: 'lancamento', periodo: '01–19/09/2026', metas: { cpl: 'R$ 6,50' }, tetos: 'CPL R$ 8', budgets: { 'hot-01': 'R$ 300/dia' }, pendencias: ['confirmar goals com o cliente'] } });
  return id;
}

describe('campanha: linha do tempo e ações', () => {
  it('normaliza e valida o evento; ação exige alvo e verbo', () => {
    expect(() => normalizaEvento({ tipo: 'nada', texto: 'x' }, { quem: 'a@x', proposto: false })).toThrow(EventoError);
    expect(() => normalizaEvento({ tipo: 'acao', acao: 'desligar' }, { quem: 'a@x', proposto: false })).toThrow(/exige `alvo`/);
    expect(() => normalizaEvento({ tipo: 'acao', alvo: 'ad42' }, { quem: 'a@x', proposto: false })).toThrow(/exige `acao`/);
    const e = normalizaEvento({ tipo: 'acao', area: 'Tráfego', nivel: 'Criativo', alvo: 'ad42', acao: 'Desligar', valor: '—', fato: 'CPL R$ 12 em 3d', causa: 'saturado', verificar_em: '2026-09-20' }, { quem: 'a@x', proposto: true });
    expect(e).toMatchObject({ tipo: 'acao', area: 'trafego', nivel: 'criativo', acao: 'desligar', resultado: 'pendente', proposto: true, verificar_em: '2026-09-20' });
    expect(e.texto).toBe('desligar ad42 (—)');
    // analise do agente nunca entra como proposta (é log)
    expect(normalizaEvento({ tipo: 'analise', texto: 'report de 12/09' }, { quem: 'a@x', proposto: true }).proposto).toBeUndefined();
  });

  it('registrar anexa na campanha: análise entra, achado e ação entram propostos; confirmar faz contar', async () => {
    await seedUser(ED, 'editor'); await seedUser(A);
    const id = await seedCampanha();
    const slug = `cp-${Date.now()}`; await seedPublished(slug);

    await expect(registrar(env, U(A), { evento: 'geracao', slug, eventos: [{ tipo: 'achado', texto: 'x' }] } as never)).rejects.toThrow(/exige `campanha`/);
    await expect(registrar(env, U(A), { evento: 'geracao', slug, campanha: 'nao-existe' } as never)).rejects.toThrow(/não existe no conhecimento/);
    await expect(registrar(env, U(A), { evento: 'geracao', slug, campanha: 'singular' } as never)).rejects.toThrow(/é do tipo cliente/);

    const out = await registrar(env, U(A), {
      evento: 'geracao', slug, campanha: id, resultado: { titulo: 'Report de 12/09' },
      eventos: [
        { tipo: 'achado', texto: 'hot concentra 70% do gasto e 40% dos checkouts' },
        { tipo: 'acao', area: 'trafego', nivel: 'criativo', alvo: 'ad42', acao: 'desligar', fato: 'custo por checkout R$ 41 em 3d, teto R$ 30', causa: 'criativo saturado; o consultor preferiu desligar só o ad42', verificar_em: ontem },
      ],
    } as never);
    expect(out).toContain(`3 evento(s) na campanha ${id}`);
    expect(out).toContain('2 entra(m) como PROPOSTO');

    const c1 = (await kb.obterConhecimento(env.DB, id))!;
    const linha = c1.dados.linha_do_tempo as Array<Record<string, unknown>>;
    expect(linha).toHaveLength(3);
    expect(linha.filter((e) => e.proposto)).toHaveLength(2);
    expect(linha.find((e) => e.tipo === 'analise')!.proposto).toBeUndefined();
    // proposta não conta como feita: fora da tela Ações
    expect(await kb.listarAcoes(env.DB, ORG)).toHaveLength(0);

    const acaoId = linha.find((e) => e.tipo === 'acao')!.id as string;
    expect((await call(`/api/campanhas/${id}/eventos/${acaoId}/confirmar`, { method: 'POST', as: ED, body: JSON.stringify({ ok: true }) })).status).toBe(200);
    const acoes = await kb.listarAcoes(env.DB, ORG);
    expect(acoes).toHaveLength(1);
    expect(acoes[0]).toMatchObject({ campanha_id: id, cliente_id: 'singular', acao: 'desligar', alvo: 'ad42', resultado: 'pendente' });

    // a data de verificar chegou: entra nas pendências vencidas (etapa 0 do roteiro)
    const c2 = (await kb.obterConhecimento(env.DB, id))!;
    expect(pendentesVencidas(c2.dados)).toHaveLength(1);
    const resumo = resumoCampanha(c2.titulo, c2.dados);
    expect(resumo).toContain('Ações a verificar (a data chegou)');
    expect(resumo).toContain('desligar ad42');
    expect(resumo).toContain('**Budgets (configurados');
    // o conhecimento({campanha}) devolve o resumo
    const texto = await conhecimento(env, U(A), { campanha: id });
    expect(texto).toContain('## Campanha: Vitalícia set/26 (Singular)');
    expect(texto).toContain('Ações a verificar');

    // fechar o resultado
    expect((await call(`/api/campanhas/${id}/eventos/${acaoId}/fechar`, { method: 'POST', as: ED, body: JSON.stringify({ resultado: 'confirmado', texto: 'custo por checkout R$ 41 → R$ 27 em 7d' }) })).status).toBe(200);
    const fechada = (await kb.listarAcoes(env.DB, ORG))[0];
    expect(fechada).toMatchObject({ resultado: 'confirmado', resultado_texto: 'custo por checkout R$ 41 → R$ 27 em 7d' });
    expect(pendentesVencidas((await kb.obterConhecimento(env.DB, id))!.dados)).toHaveLength(0);
  });

  it('API: lista campanhas, registra evento pela UI (nunca proposto), filtra ações e conta na saúde', async () => {
    await seedUser(ED, 'editor');
    const id = await seedCampanha('black-nov26');
    expect((await call(`/api/campanhas/${id}/eventos`, { method: 'POST', as: ED, body: JSON.stringify({ tipo: 'acao', alvo: 'adset hot-01' }) })).status).toBe(400);
    expect((await call(`/api/campanhas/${id}/eventos`, { method: 'POST', as: ED, body: JSON.stringify({ tipo: 'acao', alvo: 'x', acao: 'desligar', fato: 'fale com 11 99999-9999' }) })).status).toBe(400);
    const r = await (await call(`/api/campanhas/${id}/eventos`, { method: 'POST', as: ED, body: JSON.stringify({ tipo: 'acao', area: 'crm', nivel: 'fluxo', alvo: 'boas-vindas', acao: 'trocar', valor: 'v2', fato: 'abertura 18%', causa: 'assunto fraco' }) })).json() as { evento: { id: string; proposto?: boolean } };
    expect(r.evento.proposto).toBeUndefined();   // pessoa registrou: já conta como feito

    const lista = await (await call('/api/campanhas', { as: ED })).json() as Array<{ id: string; acoes: number; cliente_id: string }>;
    expect(lista.find((x) => x.id === id)).toMatchObject({ acoes: 1, cliente_id: 'singular' });
    const { acoes } = await (await call(`/api/acoes?area=crm&campanha=${id}`, { as: ED })).json() as { acoes: Array<{ alvo: string }> };
    expect(acoes.map((a) => a.alvo)).toEqual(['boas-vindas']);
    expect(((await (await call(`/api/acoes?area=trafego&campanha=${id}`, { as: ED })).json()) as { acoes: unknown[] }).acoes).toHaveLength(0);
    const saude = await (await call('/api/conhecimento/saude', { as: ED })).json() as { acoes: { total: number; pendentes: number } };
    expect(saude.acoes.total).toBeGreaterThanOrEqual(1);
    expect(saude.acoes.pendentes).toBeGreaterThanOrEqual(1);
  });
});
