import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { gravarConhecimento } from '../src/db/conhecimento.js';
import { validarEntrada } from '../src/kit/conhecimento.js';
import { comecePorAqui } from '../src/kit/tools.js';
import { ORG, seedPublished, seedUser } from './helpers.js';

const A = 'a-comeco@witly.digital';
const USER = { email: A, name: 'Ana' };

async function entrada(id: string, titulo: string, sempre: boolean) {
  const v = validarEntrada({ id, tipo: 'regra', titulo, corpo_md: 'corpo', dominio: 'analise',
    nivel: 'tatico', escopo: 'geral', sempre, gatilho: sempre ? [] : ['ao_escrever'], tags: [], confianca: 'media', dados: {} });
  if (v.erros.length) throw new Error(v.erros.join('; '));
  await gravarConhecimento(env.DB, ORG, v.entrada!, 'seed');
}

describe('comece_por_aqui — a porta de entrada', () => {
  it('ensina o ciclo, como buscar conhecimento e o que devolver, com os números de agora', async () => {
    await seedUser(A);
    await seedPublished('cpa-1');
    await entrada('cpa-kb-1', 'REGRA que vale sempre', true);
    await entrada('cpa-kb-2', 'Só quando for escrever', false);

    const out = await comecePorAqui(env as never, USER as never);

    // o ciclo inteiro, na ordem
    for (const passo of ['listar_templates', 'obter_template', 'montar_query', 'gerar.py', 'registrar'])
      expect(out).toContain(passo);
    // como buscar o que não veio junto — era justamente o que faltava ao agente
    expect(out).toContain('conhecimento({gatilho:"ao_diagnosticar"');
    expect(out).toContain('conhecimento({q:');
    expect(out).toContain('conhecimento({cliente:');
    // como devolver
    expect(out).toContain('usadas');
    expect(out).toContain('sugerir');
    // o estado é vivo, não texto fixo
    expect(out).toMatch(/1 valem sempre|1 valem sempre/);
    expect(out).toContain('Olá, Ana');
    // e registra a própria chamada, para o painel de Uso enxergar a adoção
    const n = await env.DB.prepare("SELECT COUNT(*) n FROM usage_log WHERE tool='comece_por_aqui' AND email=?")
      .bind(A).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it('avisa das urgentes pendentes em vez de deixar o agente gerar por cima', async () => {
    await seedUser(A);
    // urgente de LEITOR tem de aparecer: quem opera a conta é quem vê a métrica errada
    await env.DB.prepare(
      `INSERT INTO proposta (id, org_id, modo, urgencia, conteudo_json, motivo, autor, estado)
       VALUES ('p-urg-1', ?, 'edicao', 'urgente', '{"titulo":"CPL está errado"}', 'divide por zero', ?, 'aberta')`,
    ).bind(ORG, A).run();

    const out = await comecePorAqui(env as never, USER as never);

    expect(out).toContain('urgente');
    expect(out).toContain('Antes de gerar, mostre ao consultor');
  });
});
