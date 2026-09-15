import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { gravarConhecimento } from '../src/db/conhecimento.js';
import { validarEntrada } from '../src/kit/conhecimento.js';
import { obterTemplate } from '../src/kit/tools.js';
import { registrar } from '../src/kit/activity.js';
import { ORG, seedPublished, seedUser } from './helpers.js';

let n = 0;
const fresh = () => `uso-kb-${++n}`;
const A = 'a-kb@witly.digital';
const USER = { email: A, role: 'leitor' as const };

async function entrada(id: string, titulo: string, sempre: boolean, gatilho: string[]) {
  const v = validarEntrada({ id, tipo: 'regra', titulo, corpo_md: 'corpo da ' + id, dominio: 'analise',
    nivel: 'tatico', escopo: 'geral', sempre, gatilho, tags: [], confianca: 'media', dados: {} });
  if (v.erros.length) throw new Error(v.erros.join('; '));
  await gravarConhecimento(env.DB, ORG, v.entrada!, 'seed');
}

const contar = async (origem: string) =>
  (await env.DB.prepare('SELECT COUNT(*) n FROM conhecimento_uso WHERE origem = ?').bind(origem).first<{ n: number }>())!.n;

describe('conhecimento — chegar ao agente e ser contado', () => {
  it('o que vai embutido no obter_template conta como uso `entregue`', async () => {
    await seedUser(A); const slug = fresh(); await seedPublished(slug);
    await entrada('kb-sempre-1', 'REGRA Vale sempre', true, []);
    const antes = await contar('entregue');

    const out = await obterTemplate(env as never, USER as never, slug);

    expect(out).toContain('REGRA Vale sempre');
    expect(await contar('entregue')).toBe(antes + 1);
    // entregar não é consultar: a origem tem de separar as duas
    expect(await contar('consulta')).toBe(0);
  });

  it('o índice lista as `geral` que NÃO são sempre, agrupadas por gatilho', async () => {
    await seedUser(A); const slug = fresh(); await seedPublished(slug);
    await entrada('kb-diag-1', 'Quando o CPL sobe sem o CPM subir', false, ['ao_diagnosticar']);
    await entrada('kb-escr-1', 'Como abrir o achado', false, ['ao_escrever']);

    const out = await obterTemplate(env as never, USER as never, slug);

    // antes destas mudanças o bloco saía vazio: tudo é escopo 'geral' e o índice o filtrava
    expect(out).not.toContain('nenhuma entrada escopada a este template');
    expect(out).toContain('Quando o CPL sobe sem o CPM subir');
    expect(out).toContain('Como abrir o achado');
    expect(out).toContain('`ao_diagnosticar`');
    expect(out).toContain('conhecimento({gatilho:"ao_escrever", detalhe:"completo"})');
    // e ensina a buscar, não só os atalhos
    expect(out).toContain('q:"cpl subiu"');
  });

  it('registrar sem `usadas` devolve o que foi entregue e pede a confirmação', async () => {
    await seedUser(A); const slug = fresh(); await seedPublished(slug);
    await entrada('kb-sempre-2', 'REGRA Outra que vale sempre', true, []);
    await obterTemplate(env as never, USER as never, slug);

    const r = await registrar(env as never, USER as never,
      { evento: 'geracao', slug, dados: { titulo: 'x' } } as never);

    expect(r).toContain('⚠');
    expect(r).toContain('kb-sempre-2');
    expect(r).toContain('usadas');
  });

  it('com `usadas` não cobra, e o uso entra como `registro`', async () => {
    await seedUser(A); const slug = fresh(); await seedPublished(slug);
    await entrada('kb-reg-1', 'REGRA Usada de verdade', true, []);
    await obterTemplate(env as never, USER as never, slug);
    const antes = await contar('registro');

    const r = await registrar(env as never, USER as never,
      { evento: 'geracao', slug, dados: { titulo: 'x' }, usadas: [{ id: 'kb-reg-1', ajudou: true }] } as never);

    expect(r).not.toContain('⚠');
    expect(r).toContain('1 entrada(s) de conhecimento marcadas como usadas');
    expect(await contar('registro')).toBe(antes + 1);
  });
});
