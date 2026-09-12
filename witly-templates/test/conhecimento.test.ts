/* Spec 008 — conhecimento: esquema por tipo, banco (FTS5, histórico por trigger), tool em camadas,
 * propostas/votos/aprovação/reversão, urgência mostrada ao consultor, uso por entrada. */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import * as kb from '../src/db/conhecimento.js';
import * as db from '../src/db/index.js';
import { SESSION_COOKIE, signSession } from '../src/auth/session.js';
import { registrar } from '../src/kit/activity.js';
import { confirmar, conhecimento, sugerir } from '../src/kit/conhecimento-tools.js';
import { chaveTitulo, linhaIndice, termosBusca, TIPOS, validarEntrada } from '../src/kit/conhecimento.js';
import { obterTemplate, resourceText } from '../src/kit/tools.js';
import { ORG, seedPublished, seedUser } from './helpers.js';

const ED = 'ed-kb@witly.digital'; const A = 'a-kb@witly.digital'; const B = 'b-kb@witly.digital';
const U = (email: string) => ({ email, name: email.split('@')[0] });
let n = 0; const fresh = () => `kb-${++n}`;
async function call(path: string, init: RequestInit & { as?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.as) headers.set('cookie', `${SESSION_COOKIE}=${await signSession(env.COOKIE_ENCRYPTION_KEY, init.as)}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return SELF.fetch(`http://x${path}`, { ...init, headers });
}
const grava = async (input: Parameters<typeof validarEntrada>[0], autor = 'seed') => {
  const v = validarEntrada(input);
  if (v.erros.length) throw new Error(v.erros.join('; '));
  return kb.gravarConhecimento(env.DB, ORG, v.entrada!, autor);
};

describe('esquema dos tipos', () => {
  it('17 tipos em 6 famílias; valida limites, eixos e campos obrigatórios por tipo', () => {
    expect(TIPOS).toHaveLength(17);
    expect(new Set(TIPOS.map((t) => t.familia)).size).toBe(6);
    expect(validarEntrada({ tipo: 'regra', titulo: 'x'.repeat(201) }).erros[0]).toMatch(/máximo 200/);
    expect(validarEntrada({ tipo: 'conceito', titulo: 'Paradoxo de Simpson', dados: { o_que_e: 'teoria' } }).erros).toEqual(expect.arrayContaining([expect.stringMatching(/onde_aparece/), expect.stringMatching(/cuidado/)]));
    expect(validarEntrada({ tipo: 'metodo', titulo: 'CSD', dados: { origem: 'framework', passos: ['a'] } }).erros[0]).toMatch(/exige `framework`/);
    expect(validarEntrada({ tipo: 'regra', titulo: 'ok', escopo: 'cliente:Singular Ruim' }).erros[0]).toMatch(/escopo inválido/);
    expect(validarEntrada({ tipo: 'regra', titulo: 'ok', nivel: 'medio' }).erros[0]).toMatch(/nivel inválido/);
    const v = validarEntrada({ tipo: 'metrica', titulo: 'ROAS é líquido', dados: { formula: 'fat ÷ inv − 1', melhor: 'MAIOR' }, tags: ['Atribuição'], escopo: 'funil:perpetuo', nivel: 'tatico', sempre: true });
    expect(v.erros).toEqual([]);
    expect(v.entrada).toMatchObject({ id: 'roas-e-liquido', familia: 'saber', tags: ['atribuicao'], escopo: 'funil:perpetuo', dados: { melhor: 'maior' }, gatilho: ['sempre'] });
    expect(chaveTitulo('  ROAS é LÍQUIDO!! ')).toBe('roas e liquido');
    expect(termosBusca('Antes de concluir sobre variação agregada, segmente')).toBe('"concluir" OR "variacao" OR "agregada" OR "segmente"');
    expect(linhaIndice({ id: 'a', tipo: 'regra', titulo: 'T', gatilho: ['ao_escrever'], confianca: 'alta', nivel: 'tatico', escopo: 'geral' })).toBe('- `a` · regra · tatico · T — puxe antes de redigir a entrega');
  });
});

describe('banco: gravar, buscar sem acento, histórico por trigger, parecidas', () => {
  it('versão sobe só quando muda; FTS acha sem acento; histórico guarda cada versão', async () => {
    const r1 = await grava({ id: 'roas-liquido', tipo: 'metrica', titulo: 'ROAS é líquido', corpo_md: 'Não some 1.', dados: { formula: 'f ÷ i − 1' }, tags: ['atribuicao'], sempre: true });
    expect(r1).toMatchObject({ versao: 1, mudou: true });
    expect((await grava({ id: 'roas-liquido', tipo: 'metrica', titulo: 'ROAS é líquido', corpo_md: 'Não some 1.', dados: { formula: 'f ÷ i − 1' }, tags: ['atribuicao'], sempre: true })).mudou).toBe(false);
    expect((await grava({ id: 'roas-liquido', tipo: 'metrica', titulo: 'ROAS é líquido, sempre', corpo_md: 'Não some 1.', dados: { formula: 'f ÷ i − 1' }, tags: ['atribuicao'], sempre: true })).versao).toBe(2);
    expect((await kb.listarConhecimento(env.DB, ORG, { q: 'liquido' })).map((e) => e.id)).toEqual(['roas-liquido']);
    expect((await kb.listarConhecimento(env.DB, ORG, { tags: ['atribuicao'] })).length).toBe(1);
    expect((await kb.listarConhecimento(env.DB, ORG, { sempre: true })).length).toBe(1);
    const h = await kb.historico(env.DB, 'roas-liquido');
    expect(h.map((x) => x.versao)).toEqual([2, 1]);
    expect(h[1].snapshot.titulo).toBe('ROAS é líquido');
    await grava({ id: 'segmente-antes', tipo: 'regra', titulo: 'Antes de concluir sobre variação agregada, segmente por temperatura e canal', dados: { forca: 'sempre' } });
    expect((await kb.parecidas(env.DB, ORG, 'Segmentar antes de concluir a variação agregada')).map((e) => e.id)).toContain('segmente-antes');
  });
});

describe('tool conhecimento em camadas', () => {
  it('índice e completo; filtros por tipo/nível/escopo/situação; uso registrado no completo', async () => {
    await seedUser(A);
    await grava({ id: 'cpl-subiu', tipo: 'diagnostico', titulo: 'CPL subiu com CTR estável → conversão da página caiu', dados: { sintoma: 'cpl subiu', causas: ['página (nível campanha)'] }, nivel: 'tatico', escopo: 'funil:lancamento', tags: ['cpl'] });
    await grava({ id: 'caso-cpl-set', tipo: 'caso', titulo: 'CPL subiu no lançamento de setembro: trocar a página resolveu', dados: { situacao: { funil: 'lancamento', sintoma: 'cpl subiu' }, fato: 'CPL +40% 3d', causa: 'página', acao: 'trocar página', resultado: 'confirmado' }, tags: ['cpl', 'lancamento'], nivel: 'operacional' });
    await grava({ id: 'canal-dominante', tipo: 'principio', titulo: 'Canal com > 50% das vendas não se derruba', nivel: 'estrategico', dados: { origem: 'witly' } });
    const u = U(A);
    await expect(conhecimento(env, u, {})).rejects.toThrow(/ao menos um filtro/);
    const idx = await conhecimento(env, u, { tipo: 'diagnostico' });
    expect(idx).toContain('- `cpl-subiu` · diagnostico · tatico · CPL subiu');
    expect(idx).toContain('(não verificada)');
    expect(await conhecimento(env, u, { nivel: 'estrategico' })).toContain('canal-dominante');
    expect(await conhecimento(env, u, { funil: 'lancamento' })).toContain('cpl-subiu');
    const funcionou = await conhecimento(env, u, { tipo: 'caso', situacao: { funil: 'lancamento', sintoma: 'cpl subiu' }, resultado: 'confirmado', detalhe: 'completo' });
    expect(funcionou).toContain('# CPL subiu no lançamento de setembro');
    expect(funcionou).toContain('**acao:** trocar página');
    expect((await kb.usoDe(env.DB, 'caso-cpl-set')).usos).toBe(1);
    expect(await conhecimento(env, u, { tipo: 'metodo', origem: 'framework' })).toMatch(/Nada encontrado/);
  });

  it('obter_template injeta nível 0 (sempre + urgentes do escopo) e o índice do template; resource conhecimento://', async () => {
    await seedUser(ED, 'editor'); await seedUser(A);
    const slug = fresh(); await seedPublished(slug);
    await grava({ id: 'numero-com-janela', tipo: 'regra', titulo: 'Todo número vem com janela', corpo_md: 'Ontem, 3 dias, 7 dias.', sempre: true, dados: { forca: 'sempre' } });
    await grava({ id: 'so-deste', tipo: 'metodo', titulo: 'Método só deste template', escopo: `template:${slug}`, dados: { origem: 'witly', passos: ['a', 'b'] } });
    await grava({ id: 'de-outro', tipo: 'metodo', titulo: 'Método de outro template', escopo: 'template:outro', dados: { origem: 'witly', passos: ['a'] } });
    // urgente proposta por editor no escopo geral → aparece; por leitor sem +1 de editor → não
    await sugerir(env, U(ED), { tipo: 'metrica', titulo: 'ROAS deve ser líquido, não bruto', dados: { formula: 'f ÷ i − 1' }, motivo: 'o kit calculou bruto na análise de ontem', urgencia: 'urgente', evidencia: [{ trecho: 'ROAS 1,78 onde era 0,78' }] });
    await sugerir(env, U(A), { tipo: 'regra', titulo: 'Urgente de leitor ainda invisível', dados: { forca: 'sempre' }, motivo: 'motivo longo o bastante', urgencia: 'urgente', evidencia: [{ trecho: 'x' }] });
    const out = await obterTemplate(env, U(A), slug);
    expect(out).toContain('## ⚠ Pendente de aprovação (urgente)');
    expect(out).toContain('**ROAS deve ser líquido, não bruto**');
    expect(out).not.toContain('Urgente de leitor ainda invisível');
    expect(out).toContain('[REGRA] Todo número vem com janela — Ontem, 3 dias, 7 dias.');
    expect(out).toContain('- `so-deste` · metodo');
    expect(out).not.toContain('de-outro');
    expect(out).toContain('`usadas:[{id, ajudou}]`');
    expect(await resourceText(env, 'conhecimento://so-deste')).toContain('# Método só deste template');
    expect(await resourceText(env, 'conhecimento://nada')).toBeNull();
  });
});

describe('propostas: sugerir, parecida, recusa lembrada, votos, aprovação, urgência, reversão', () => {
  it('fluxo completo pelo MCP e pela API', async () => {
    await seedUser(ED, 'editor'); await seedUser(A); await seedUser(B);
    await grava({ id: 'taxa-nao-soma', tipo: 'regra', titulo: 'Taxa, custo e ROAS nunca se somam', dados: { forca: 'sempre' }, sempre: true });
    // validação da proposta
    await expect(sugerir(env, U(A), { tipo: 'metrica', titulo: 'CPMQL', motivo: 'curto' })).rejects.toThrow(/motivo obrigatório/);
    await expect(sugerir(env, U(A), { tipo: 'conceito', titulo: 'Simpson', motivo: 'faltou na análise de ontem' })).rejects.toThrow(/onde_aparece/);
    await expect(sugerir(env, U(A), { tipo: 'regra', titulo: 'x', motivo: 'faltou na análise de ontem', urgencia: 'urgente' })).rejects.toThrow(/evidencia/);
    await expect(sugerir(env, U(A), { tipo: 'regra', titulo: 'fale com 11 99999-9999', motivo: 'faltou na análise de ontem' })).rejects.toThrow(/dado pessoal/);
    // nova, normal; parecida aparece; idêntica só conta ocorrência
    const r1 = await sugerir(env, U(A), { tipo: 'regra', titulo: 'Taxa e custo nunca se somam entre canais', dados: { forca: 'sempre' }, motivo: 'a análise somou CPL de dois canais' });
    expect(r1).toMatch(/Proposta registrada \(nova, normal\)/);
    expect(r1).toContain('taxa-nao-soma');   // parecida
    const r2 = await sugerir(env, U(B), { tipo: 'regra', titulo: 'Taxa e custo nunca se somam entre canais!', dados: { forca: 'sempre' }, motivo: 'a análise somou CPL de dois canais' });
    expect(r2).toMatch(/idêntica já aberta.*ocorrência \(2\)/);
    const abertas = await kb.listarPropostas(env.DB, ORG, { estado: 'aberta', urgencia: 'normal' });
    expect(abertas).toHaveLength(1);
    const pid = abertas[0].id;
    // votos: N=2 → aprova sozinha (não urgente); a entrada nasce
    expect((await call(`/api/propostas/${pid}/votar`, { method: 'POST', as: A, body: JSON.stringify({ valor: 1 }) })).status).toBe(200);
    const v2 = await (await call(`/api/propostas/${pid}/votar`, { method: 'POST', as: B, body: JSON.stringify({ valor: 1 }) })).json() as { aprovada: boolean };
    expect(v2.aprovada).toBe(true);
    const nova = await kb.obterConhecimento(env.DB, 'taxa-e-custo-nunca-se-somam-entre-canais');
    expect(nova).toMatchObject({ tipo: 'regra', status: 'ativo', versao: 1 });
    expect((await kb.getProposta(env.DB, pid))!.aprovada_por).toBe('votos');
    // aprovada por votos aparece no painel (desde) e reverte: entrada some do ativo
    expect((await (await call('/api/propostas?estado=aprovada&desde=2000-01-01', { as: ED })).json() as Array<{ id: string }>).some((p) => p.id === pid)).toBe(true);
    expect((await call(`/api/propostas/${pid}/reverter`, { method: 'POST', as: A })).status).toBe(403);
    expect((await call(`/api/propostas/${pid}/reverter`, { method: 'POST', as: ED, body: JSON.stringify({ motivo: 'duplica a existente' }) })).status).toBe(200);
    expect((await kb.obterConhecimento(env.DB, 'taxa-e-custo-nunca-se-somam-entre-canais'))!.status).toBe('rascunho');
    // edição por editor: versão + 1 e versao_anterior guardada; reverter volta o título
    const ed = await (await call('/api/propostas', { method: 'POST', as: ED, body: JSON.stringify({ entrada_id: 'taxa-nao-soma', modo: 'edicao', conteudo: { titulo: 'Taxa, custo e ROAS nunca se somam: o geral é ponderado' }, motivo: 'faltava o como' }) })).json() as { proposta: { id: string } };
    expect((await call(`/api/propostas/${ed.proposta.id}/decidir`, { method: 'POST', as: ED, body: JSON.stringify({ decisao: 'aprovada' }) })).status).toBe(200);
    expect((await kb.obterConhecimento(env.DB, 'taxa-nao-soma'))!).toMatchObject({ titulo: 'Taxa, custo e ROAS nunca se somam: o geral é ponderado', versao: 2 });
    expect((await call(`/api/propostas/${ed.proposta.id}/reverter`, { method: 'POST', as: ED })).status).toBe(200);
    expect((await kb.obterConhecimento(env.DB, 'taxa-nao-soma'))!).toMatchObject({ titulo: 'Taxa, custo e ROAS nunca se somam', versao: 3 });
    // recusa lembrada: mesma proposta de novo devolve o motivo, não reabre
    const rc = await sugerir(env, U(A), { tipo: 'regra', titulo: 'Regra boba', dados: { forca: 'sempre' }, motivo: 'motivo longo o bastante aqui' });
    const rcId = rc.match(/id=([0-9a-f-]+)/)![1];
    expect((await call(`/api/propostas/${rcId}/decidir`, { method: 'POST', as: ED, body: JSON.stringify({ decisao: 'recusada', motivo: 'já coberta' }) })).status).toBe(200);
    expect(await sugerir(env, U(B), { tipo: 'regra', titulo: 'Regra boba', dados: { forca: 'sempre' }, motivo: 'motivo longo o bastante aqui' })).toMatch(/Já recusado em \d{4}-\d{2}-\d{2}: "já coberta"/);
    // urgente: votos não aprovam; confirmar do consultor = voto; editor aprova na UI → entrada `sempre`
    const ur = await sugerir(env, U(ED), { tipo: 'metrica', titulo: 'CPMQL = CPL ÷ qualificação, nunca invest ÷ MQL', dados: { formula: 'CPL ÷ (MQL ÷ respostas)' }, motivo: 'a análise mostrou invest ÷ MQL', urgencia: 'urgente', evidencia: [{ trecho: 'CPMQL R$ 41 (era R$ 118)' }] });
    const urId = ur.match(/id=([0-9a-f-]+)/)![1];
    expect(await confirmar(env, U(A), urId, true)).toMatch(/Confirmação registrada \(1 a favor, 0 contra\)/);
    expect(await confirmar(env, U(B), urId, true)).toMatch(/2 a favor/);
    expect((await kb.getProposta(env.DB, urId))!.estado).toBe('aberta');   // urgente não aprova por votos
    expect((await call(`/api/propostas/${urId}/decidir`, { method: 'POST', as: ED, body: JSON.stringify({ decisao: 'aprovada' }) })).status).toBe(200);
    const cpmql = await kb.obterConhecimento(env.DB, 'cpmql-cpl-qualificacao-nunca-invest-mql');
    expect(cpmql).toMatchObject({ tipo: 'metrica', sempre: true });
    expect(await confirmar(env, U(A), urId, true)).toMatch(/já aprovada/);
    // usadas no registrar → uso por entrada; saúde do conhecimento
    const slug = fresh(); await seedPublished(slug);
    const reg = await registrar(env, U(A), { evento: 'geracao', slug, usadas: [{ id: 'taxa-nao-soma', ajudou: true }, { id: 'nao-existe' }] } as never);
    expect(reg).toContain('1 entrada(s) de conhecimento marcadas como usadas');
    expect(await kb.usoDe(env.DB, 'taxa-nao-soma')).toMatchObject({ usos: 1, ajudou: 1 });
    const saude = await (await call('/api/conhecimento/saude', { as: ED })).json() as { sempre: { n: number }; propostas: { por_votos_30d: number } };
    expect(saude.sempre.n).toBeGreaterThanOrEqual(2);
    expect(saude.propostas.por_votos_30d).toBe(0);   // a aprovada por votos foi revertida acima
    // config: N de votos; esquema para a UI
    expect((await (await call('/api/config', { method: 'PUT', as: ED, body: JSON.stringify({ votos: 3 }) })).json() as { config: { votos: number } }).config.votos).toBe(3);
    const esq = await (await call('/api/conhecimento/esquema', { as: A })).json() as { familias: unknown[]; tipos: Array<{ tipo: string; campos: unknown[] }>; gatilhos: Array<{ id: string; label: string }>; limites: { titulo: number } };
    expect(esq.familias).toHaveLength(6); expect(esq.tipos).toHaveLength(17); expect(esq.limites.titulo).toBe(200);
    expect(esq.gatilhos.find((g) => g.id === 'ao_escrever')!.label).toBe('antes de redigir a entrega');
  }, 20000);
});
