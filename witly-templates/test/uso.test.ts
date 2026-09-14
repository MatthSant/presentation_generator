import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import * as db from '../src/db/index.js';
import { SESSION_COOKIE, signSession } from '../src/auth/session.js';
import { ORG, seedPublished, seedUser } from './helpers.js';

let n = 0;
const fresh = () => `uso-${++n}`;
async function call(path: string, as?: string) {
  const headers = new Headers();
  if (as) headers.set('cookie', `${SESSION_COOKIE}=${await signSession(env.COOKIE_ENCRYPTION_KEY, as)}`);
  return SELF.fetch(`http://x${path}`, { headers });
}
const ED = 'ed-uso@witly.digital'; const A = 'a-uso@witly.digital'; const B = 'b-uso@witly.digital';

type Dash = {
  dias: number;
  resumo: { chamadas: number; pessoas: number; templates: number; geracoes: number; aprofundamentos: number; clientes: number };
  semanas: Array<{ chamadas: number; pessoas: number }>;
  pessoas: Array<{ email: string; chamadas: number; geracoes: number; aprofundamentos: number }>;
  ferramentas: Array<{ tool: string; n: number; pessoas: number }>;
  templates: Array<{ slug: string; chamadas: number; geracoes: number }>;
  clientes: Array<{ cliente: string; geracoes: number; aprofundamentos: number }>;
  conhecimento: { total: number; usadas: number; consultas: number; top: Array<{ id: string; n: number }> };
};

describe('uso — painel de adoção', () => {
  it('conta chamadas, pessoas, ferramentas, templates e clientes na janela', async () => {
    await seedUser(ED, 'editor'); await seedUser(A); await seedUser(B);
    const s = fresh(); await seedPublished(s);

    await db.logUsage(env.DB, { email: A, tool: 'obter_template', slug: s, version_number: 1 });
    await db.logUsage(env.DB, { email: A, tool: 'obter_template', slug: s, version_number: 1 });
    await db.logUsage(env.DB, { email: B, tool: 'montar_query', slug: s });
    await db.insertActivity(env.DB, { org_id: ORG, email: A, evento: 'geracao', slug: s, cliente: 'acme', dados: {} });
    await db.insertActivity(env.DB, { org_id: ORG, email: B, evento: 'aprofundamento', slug: s, cliente: 'acme', dados: { pergunta: 'CPL?' } });

    const d = await (await call('/api/uso', ED)).json() as Dash;

    expect(d.resumo).toMatchObject({ chamadas: 3, pessoas: 2, templates: 1, geracoes: 1, aprofundamentos: 1, clientes: 1 });
    // a semana corrente concentra tudo o que acabou de ser gravado
    expect(d.semanas.at(-1)).toMatchObject({ chamadas: 3, pessoas: 2 });

    const pa = d.pessoas.find((p) => p.email === A)!;
    expect(pa).toMatchObject({ chamadas: 2, geracoes: 1, aprofundamentos: 0 });
    expect(d.pessoas[0].email).toBe(A);   // ordenado por chamadas

    expect(d.ferramentas.find((f) => f.tool === 'obter_template')).toMatchObject({ n: 2, pessoas: 1 });
    expect(d.ferramentas.find((f) => f.tool === 'montar_query')).toMatchObject({ n: 1, pessoas: 1 });

    expect(d.templates.find((t) => t.slug === s)).toMatchObject({ chamadas: 3, geracoes: 1 });
    expect(d.clientes.find((c) => c.cliente === 'acme')).toMatchObject({ geracoes: 1, aprofundamentos: 1 });
  });

  it('a janela recorta por data e o conhecimento nunca consultado aparece como tal', async () => {
    await seedUser(ED, 'editor'); await seedUser(A);
    const s = fresh(); await seedPublished(s);
    await db.logUsage(env.DB, { email: A, tool: 'guia', slug: s });
    // uma chamada de 200 dias atrás: entra em 365 dias, fica fora de 30
    await env.DB.prepare("INSERT INTO usage_log (email, tool, slug, at) VALUES (?, 'guia', ?, datetime('now', '-200 days'))").bind(A, s).run();

    const curto = await (await call('/api/uso?dias=30', ED)).json() as Dash;
    const longo = await (await call('/api/uso?dias=365', ED)).json() as Dash;
    expect(curto.dias).toBe(30);
    expect(longo.resumo.chamadas).toBe(curto.resumo.chamadas + 1);

    // sem nenhum registro em conhecimento_uso, "usadas" é 0 — é o que o painel avisa
    expect(curto.conhecimento.usadas).toBe(0);
    expect(curto.conhecimento.consultas).toBe(0);
    expect(curto.conhecimento.top).toHaveLength(0);
  });

  it('é só de editor', async () => {
    await seedUser(A);
    expect((await call('/api/uso', A)).status).toBe(403);
  });
});
