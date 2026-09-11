/* Feedback de uso do kit (registrar evento='feedback'): validação, fila de triagem, saúde e
 * "virar sugestão" por item — o histórico de como o agente usou, para programar melhorias. */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import * as db from '../src/db/index.js';
import { SESSION_COOKIE, signSession } from '../src/auth/session.js';
import { registrar } from '../src/kit/activity.js';
import { obterTemplate } from '../src/kit/tools.js';
import { seedPublished, seedUser } from './helpers.js';

let n = 0;
const fresh = () => `fb-${++n}`;
async function call(path: string, init: RequestInit & { as?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.as) headers.set('cookie', `${SESSION_COOKIE}=${await signSession(env.COOKIE_ENCRYPTION_KEY, init.as)}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return SELF.fetch(`http://x${path}`, { ...init, headers });
}
const ED = 'ed-fb@witly.digital'; const A = 'a-fb@witly.digital';

describe('feedback de uso do kit', () => {
  it('registra com validação, cai na fila, aparece na saúde e um item vira sugestão', async () => {
    await seedUser(ED, 'editor'); await seedUser(A);
    const s = fresh(); await seedPublished(s);
    const u = { email: A, name: 'A' };
    await expect(registrar(env, u, { evento: 'feedback', slug: s, segurou: ['builder'] } as never)).rejects.toThrow(/nota/);
    await expect(registrar(env, u, { evento: 'feedback', slug: s, nota: 3, custou: [{}] } as never)).rejects.toThrow(/custou\[0\]/);
    await expect(registrar(env, u, { evento: 'feedback', slug: s, nota: 3, segurou: ['fale com 11 99999-9999'] } as never)).rejects.toThrow(/dado pessoal/);
    const out = await registrar(env, u, {
      evento: 'feedback', slug: s, cliente: 'enxoval', nota: 3, resumo: 'acompanhamento de disparo, 3 páginas, ~50 rodadas',
      segurou: ['Builder fluente e dataset com bind', 'Validador pegou 4 números inventados'],
      custou: [
        { item: 'Filtro não redesenha card', prioridade: 'alta', pedido: 'Card e destaque aceitam bind e redesenham no filtro', rodadas: 6 },
        { item: 'money() abrevia a partir de R$ 1.000', prioridade: 'MEDIA', pedido: 'kpi(formato=exato)' },
      ],
      medida: { apresentacao: 30, filtro: 10, analise: 10 },
    } as never);
    expect(out).toContain('registrado (feedback');

    const fila = await (await call(`/api/atividade?slug=${s}&evento=aprofundamento,sugestao,feedback&veredito=sem`, { as: ED })).json() as Array<{ id: string; evento: string; avaliacao: number; resumo: { nota: number; custou_n: number; medida: { total: number } } }>;
    expect(fila.length).toBe(1);
    expect(fila[0].evento).toBe('feedback');
    expect(fila[0].avaliacao).toBe(3);
    expect(fila[0].resumo).toMatchObject({ nota: 3, custou_n: 2, medida: { apresentacao: 30, filtro: 10, analise: 10, total: 50 } });
    const det = await (await call(`/api/atividade/${fila[0].id}`, { as: ED })).json() as { dados: { custou: Array<{ prioridade: string; rodadas: number | null }> } };
    expect(det.dados.custou[1].prioridade).toBe('media');   // normalizada
    expect(det.dados.custou[0].rodadas).toBe(6);

    const h = await (await call('/api/saude', { as: ED })).json() as { templates: Array<{ slug: string; feedbacks: number; nota_feedback: number; sem_veredito: number }> };
    const row = h.templates.find((t) => t.slug === s)!;
    expect(row.feedbacks).toBe(1);
    expect(row.nota_feedback).toBe(3);
    expect(row.sem_veredito).toBe(1);

    // um item "custou" vira sugestão na fila; aceitar = entrada no rascunho (fluxo já existente)
    expect((await call(`/api/atividade/${fila[0].id}/sugerir`, { method: 'POST', as: A, body: JSON.stringify({ indice: 0 }) })).status).toBe(403);
    expect((await call(`/api/atividade/${fila[0].id}/sugerir`, { method: 'POST', as: ED, body: JSON.stringify({ indice: 9 }) })).status).toBe(400);
    const r = await (await call(`/api/atividade/${fila[0].id}/sugerir`, { method: 'POST', as: ED, body: JSON.stringify({ indice: 0 }) })).json() as { ok: boolean; id: string };
    expect(r.ok).toBe(true);
    const sug = await db.getActivity(env.DB, r.id);
    expect(sug!.evento).toBe('sugestao');
    expect(JSON.parse(sug!.dados_json)).toMatchObject({ tipo: 'regra', titulo: 'Card e destaque aceitam bind e redesenham no filtro' });
    // fechar o feedback: veredito ok
    expect((await call(`/api/atividade/${fila[0].id}`, { method: 'PATCH', as: ED, body: JSON.stringify({ veredito: 'ok' }) })).status).toBe(200);
    expect((await db.getActivity(env.DB, fila[0].id))!.veredito).toBe('ok');
  });

  it('o obter_template manda registrar o feedback ao fechar o trabalho', async () => {
    await seedUser(ED, 'editor');
    const s = fresh(); await seedPublished(s);
    const texto = await obterTemplate(env, { email: ED, name: 'Ed' }, s);
    expect(texto).toContain('evento:"feedback"');
    expect(texto).toContain('custou:[{item, prioridade, pedido, rodadas}]');
  });
});
