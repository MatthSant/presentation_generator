/* conhecimento-tools — as tools do MCP sobre o conhecimento (spec 008 §6): `conhecimento`
 * (busca em camadas), `sugerir` (proposta), `confirmar` (voto do consultor) e os blocos que o
 * obter_template/guia injetam (nível 0 + índice). Puras: db + env + usuário → texto. */

import { criarProposta, getProposta, listarConhecimento, obterConhecimento, parecidas, registrarUso, urgentesPendentes, usoDe, votar, type Filtro } from '../db/conhecimento.js';
import { getUser, logUsage, type Kit } from '../db/index.js';
import { bytes, DOMINIOS, FAMILIAS, GATILHOS, LIMITES, linhaIndice, linhaSempre, NIVEIS, parseEscopo, textoCompleto, TIPO_NOMES, URGENCIAS, validarEntrada, type Gatilho, type Urgencia } from './conhecimento.js';
import { checkPii, piiMessage } from './pii.js';
import { ToolError, type ToolEnv, type ToolUser } from './tools.js';

export interface ConhecimentoInput {
  familia?: string; tipo?: string | string[]; dominio?: string; escopo?: string | string[]; nivel?: string; tags?: string[]; q?: string;
  cliente?: string; funil?: string; campanha?: string; gatilho?: string; ids?: string[]; resultado?: string; origem?: string;
  situacao?: Record<string, string>; detalhe?: 'indice' | 'completo'; limite?: number;
}

const lista = (v: unknown): string[] => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map((x) => String(x).trim().toLowerCase()).filter(Boolean);

export async function conhecimento(env: ToolEnv, user: ToolUser, input: ConhecimentoInput): Promise<string> {
  const detalhe = input.detalhe === 'completo' ? 'completo' : 'indice';
  const f: Filtro = {};
  if (input.familia) { if (!(FAMILIAS as readonly string[]).includes(input.familia)) throw new ToolError(`familia: ${FAMILIAS.join(' | ')}`); f.familia = input.familia; }
  const tipos = lista(input.tipo);
  for (const t of tipos) if (!TIPO_NOMES.includes(t)) throw new ToolError(`tipo inválido: ${t} (${TIPO_NOMES.join(', ')})`);
  if (tipos.length) f.tipo = tipos;
  if (input.dominio) { if (!(DOMINIOS as readonly string[]).includes(input.dominio)) throw new ToolError(`dominio: ${DOMINIOS.join(' | ')}`); f.dominio = input.dominio; }
  if (input.nivel) { if (!(NIVEIS as readonly string[]).includes(input.nivel)) throw new ToolError(`nivel: ${NIVEIS.join(' | ')}`); f.nivel = input.nivel; }
  const escopos = lista(input.escopo);
  for (const e of escopos) if (!parseEscopo(e)) throw new ToolError(`escopo inválido: ${e}`);
  if (escopos.length) f.escopo = escopos;
  if (input.cliente) f.cliente = String(input.cliente).toLowerCase();
  if (input.funil) f.funil = String(input.funil).toLowerCase();
  if (input.campanha) f.campanha = String(input.campanha).toLowerCase();
  if (input.gatilho) { if (!(GATILHOS as readonly string[]).includes(input.gatilho)) throw new ToolError(`gatilho: ${GATILHOS.join(' | ')}`); f.gatilho = input.gatilho; }
  if (input.tags?.length) f.tags = lista(input.tags);
  if (input.ids?.length) f.ids = lista(input.ids);
  if (input.resultado) f.resultado = String(input.resultado).toLowerCase();
  if (input.origem) f.origem = String(input.origem).toLowerCase();
  // situação (caso): funil/nivel/sintoma/metrica viram termos de busca + tags
  const q = [input.q ?? '', ...Object.values(input.situacao ?? {})].filter(Boolean).join(' ').trim();
  if (q) f.q = q;
  f.limit = Math.min(Math.max(1, Number(input.limite) || (detalhe === 'completo' ? LIMITES.tool_completo : LIMITES.tool_indice)), detalhe === 'completo' ? LIMITES.tool_completo : LIMITES.tool_indice);
  if (!Object.keys(f).some((k) => k !== 'limit')) throw new ToolError('informe ao menos um filtro: tipo, familia, dominio, escopo, cliente, funil, campanha, gatilho, tags, ids, q ou situacao');

  const rows = await listarConhecimento(env.DB, env.ORG_ID, f);
  await logUsage(env.DB, { email: user.email, tool: 'conhecimento' });
  if (!rows.length) return 'Nada encontrado com esses filtros. Afrouxe (menos filtros, outro termo em `q`) ou proponha a entrada que faltou com `sugerir`.';
  if (detalhe === 'indice') {
    const out = [`# Conhecimento — ${rows.length} entrada(s) (índice)`, '', 'Peça o corpo do que precisar: `conhecimento({ids:[…], detalhe:"completo"})`.', ''];
    for (const e of rows) out.push(linhaIndice(e, e.verificado_em ? '' : '(não verificada)'));
    return out.join('\n');
  }
  await registrarUso(env.DB, rows.map((e) => ({ id: e.id })), user.email, null);
  const partes: string[] = [];
  for (const e of rows) {
    const u = await usoDe(env.DB, e.id);
    partes.push(textoCompleto(e, { usos: u.usos }));
  }
  return partes.join('\n\n---\n\n') + '\n\nAo registrar (geracao/aprofundamento/feedback), inclua `usadas:[{id, ajudou}]` com os ids que entraram na análise.';
}

// ── sugerir ──────────────────────────────────────────────────────────────────

export interface SugerirInput {
  tipo: string; titulo: string; corpo?: string | null; dados?: Record<string, unknown>; escopo?: string; dominio?: string; nivel?: string; tags?: string[];
  motivo: string; urgencia?: string; evidencia?: unknown[]; entrada_id?: string | null; modo?: string; slug?: string;
}

/** O agente propõe conhecimento; vira proposta (nunca entrada direto). Idêntica = ocorrência; recusada recente = a recusa. */
export async function sugerir(env: ToolEnv, user: ToolUser, input: SugerirInput): Promise<string> {
  const modo = (input.modo || (input.entrada_id ? 'edicao' : 'nova')) as 'nova' | 'edicao' | 'substituta' | 'fechar_resultado';
  if (!['nova', 'edicao', 'substituta', 'fechar_resultado'].includes(modo)) throw new ToolError('modo: nova | edicao | substituta | fechar_resultado');
  if (modo !== 'nova' && !input.entrada_id) throw new ToolError(`modo ${modo} exige entrada_id`);
  if (input.entrada_id && !(await obterConhecimento(env.DB, input.entrada_id))) throw new ToolError(`entrada ${input.entrada_id} não existe`);
  const urgencia = String(input.urgencia || 'normal').toLowerCase() as Urgencia;
  if (!(URGENCIAS as readonly string[]).includes(urgencia)) throw new ToolError('urgencia: urgente | normal | baixa');
  const motivo = String(input.motivo ?? '').trim();
  if (motivo.length < 10) throw new ToolError('motivo obrigatório: o que aconteceu na análise que mostrou a falta (uma frase)');
  const evidencia = Array.isArray(input.evidencia) ? input.evidencia.slice(0, 10) : [];
  if (urgencia === 'urgente' && !evidencia.length) throw new ToolError('urgente exige `evidencia`: [{atividade?, trecho}] com o número ou o cálculo errado');
  const escopo = input.escopo || (input.slug ? `template:${input.slug}` : 'geral');
  const conteudo: Record<string, unknown> = { tipo: input.tipo, titulo: String(input.titulo ?? '').trim(), corpo_md: input.corpo ?? '', dados: input.dados ?? {}, escopo, dominio: input.dominio, nivel: input.nivel, tags: input.tags };
  for (const k of Object.keys(conteudo)) if (conteudo[k] == null) delete conteudo[k];
  if (modo === 'nova' || modo === 'substituta') {
    const v = validarEntrada(conteudo as never, { exigirCampos: modo === 'nova' });
    if (v.erros.length) throw new ToolError(`proposta inválida:\n- ${v.erros.join('\n- ')}`);
    conteudo.id = v.entrada!.id;
  } else if (modo === 'fechar_resultado') {
    const r = String(input.dados?.resultado ?? '').toLowerCase();
    if (!['confirmado', 'refutado'].includes(r)) throw new ToolError('fechar_resultado exige dados.resultado = confirmado | refutado (e opcional numero, aprendizado)');
    Object.assign(conteudo, { resultado: r, numero: input.dados?.numero, aprendizado: input.dados?.aprendizado });
  }
  const pii = checkPii({ conteudo, motivo, evidencia }, [user.email]);
  if (!pii.ok) throw new ToolError(piiMessage(pii));

  const r = await criarProposta(env.DB, env.ORG_ID, { entrada_id: input.entrada_id ?? null, modo, urgencia, conteudo, motivo, evidencia, origem: `mcp:${user.email}`, autor: user.email });
  await logUsage(env.DB, { email: user.email, tool: 'sugerir' });
  if (r.recusada) return `Já recusado em ${r.recusada.decidido_em?.slice(0, 10)}${r.recusada.motivo_decisao ? `: "${r.recusada.motivo_decisao}"` : ''} (proposta ${r.recusada.id}). Não reabri. Se a situação mudou, diga o que mudou no motivo e proponha de novo com outro título.`;
  if (r.duplicada) return `Proposta idêntica já aberta (${r.proposta.id}): contei mais uma ocorrência (${r.proposta.ocorrencias}). Ela sobe na fila.`;
  const out = [`Proposta registrada (${modo}, ${urgencia}) id=${r.proposta.id} — ${urgencia === 'urgente' ? 'um editor decide; até lá o agente mostra ao consultor antes de gerar' : 'entra na fila: editor ou votos decidem'}.`];
  if (modo === 'nova') {
    const sim = await parecidas(env.DB, env.ORG_ID, String(conteudo.titulo), 3);
    if (sim.length) out.push('', 'Parecidas já existentes (se for a mesma coisa, o editor funde; se a sua é melhor, proponha como substituta com `entrada_id`):', ...sim.map((e) => linhaIndice(e)));
  }
  return out.join('\n');
}

// ── confirmar ────────────────────────────────────────────────────────────────

/** A resposta do consultor a uma proposta pendente: voto de quem está logado (aprovação definitiva é na UI). */
export async function confirmar(env: ToolEnv, user: ToolUser, proposta_id: string, ok: boolean, motivo?: string | null): Promise<string> {
  const p = await getProposta(env.DB, proposta_id);
  if (!p) throw new ToolError('proposta não existe');
  if (p.estado !== 'aberta') return `Proposta já ${p.estado}${p.aprovada_por ? ` (${p.aprovada_por})` : ''}; nada a confirmar.`;
  const r = await votar(env.DB, env.ORG_ID, proposta_id, user.email, ok ? 1 : -1, motivo ?? null);
  await logUsage(env.DB, { email: user.email, tool: 'confirmar' });
  const u = await getUser(env.DB, user.email);
  if (r.aprovada) return `Confirmado e aprovado por votos (${r.proposta.votos} a favor): já vale para as próximas análises.`;
  if (r.recusada) return `Recusado por votos (${r.proposta.votos_contra} contra).`;
  const papel = u?.role === 'editor' ? 'seu voto é de editor: a urgente passa a ser mostrada a todos e a aprovação definitiva é um clique na UI' : 'voto registrado';
  return `${ok ? 'Confirmação' : 'Recusa'} registrada (${r.proposta.votos} a favor, ${r.proposta.votos_contra} contra) — ${papel}. ${ok ? 'Siga aplicando nesta análise.' : 'Siga com a regra atual.'}`;
}

// ── blocos para obter_template / guia ────────────────────────────────────────

const ESCOPOS_DE = (slug: string | null, m: { funil?: unknown; tags?: unknown } = {}): string[] => {
  const out = ['geral'];
  if (slug) out.push(`template:${slug}`);
  for (const f of lista(m.funil)) out.push(`funil:${f}`);
  return out;
};

/** Nível 0: urgentes pendentes do escopo + entradas `sempre` (título + 1 linha). */
export async function nivel0Block(env: ToolEnv, slug: string | null, manifest: { funil?: unknown; tags?: unknown } = {}): Promise<string> {
  const escopos = ESCOPOS_DE(slug, manifest);
  const [urg, sempre] = await Promise.all([urgentesPendentes(env.DB, env.ORG_ID, escopos), listarConhecimento(env.DB, env.ORG_ID, { sempre: true, limit: LIMITES.sempre })]);
  const out: string[] = [];
  if (urg.length) {
    out.push('', '## ⚠ Pendente de aprovação (urgente) — mostre ao consultor ANTES de gerar', '',
      'Cada item abaixo é uma correção proposta que ainda não foi aprovada. Pergunte ao consultor "isso está certo?". Sim → aplique e chame `confirmar(proposta_id, ok:true)`; não → siga a regra atual e chame `confirmar(proposta_id, ok:false, motivo)`. Uma pergunta por conversa.');
    for (const p of urg) {
      const c = p.conteudo as { titulo?: string; tipo?: string };
      out.push(`- \`${p.id}\` · ${c.tipo ?? p.modo} · **${c.titulo ?? p.modo}** — ${p.motivo} (${p.autor}, ${p.criado_em.slice(0, 10)})`);
    }
  }
  if (sempre.length) {
    out.push('', '## Contextos que valem para TODA análise', '',
      'Leia pelos títulos: REGRA = não descumpra · GERALMENTE = siga, salvo motivo dito · DEFINIÇÃO/MÉTRICA = é assim que o termo é entendido. Corpo completo: `conhecimento({ids:[…], detalhe:"completo"})` ou `conhecimento://<id>`.');
    for (const e of sempre) out.push(linhaSempre(e));
  }
  const txt = out.join('\n');
  if (bytes(txt) > LIMITES.nivel0_bytes) out.push('', `_(bloco geral com ${Math.round(bytes(txt) / 1024)} KB: acima do orçamento de ${LIMITES.nivel0_bytes / 1024} KB — a Saúde acusa; rebaixe entradas \`sempre\`)_`);
  return out.join('\n');
}

/** Nível 1: índice (só títulos) do conhecimento escopado ao template/funil/tags do manifesto. */
export async function indiceBlock(env: ToolEnv, kit: Kit): Promise<string> {
  let m: { funil?: unknown; tags?: unknown } = {};
  try { m = JSON.parse(kit.version.manifest_json) as typeof m; } catch { /* sem manifesto */ }
  const escopos = ESCOPOS_DE(kit.template.slug, m).filter((e) => e !== 'geral');
  const tags = lista(m.tags);
  const vistos = new Set<string>();
  const rows = [];
  if (escopos.length) for (const e of await listarConhecimento(env.DB, env.ORG_ID, { escopo: escopos, sempre: false, limit: LIMITES.indice })) if (!vistos.has(e.id)) { vistos.add(e.id); rows.push(e); }
  if (tags.length) for (const e of await listarConhecimento(env.DB, env.ORG_ID, { tags, sempre: false, limit: LIMITES.indice })) if (!vistos.has(e.id)) { vistos.add(e.id); rows.push(e); }
  const out = ['', '## Conhecimento relevante (índice — puxe o corpo quando a etapa pedir)', '',
    'Gatilhos: `conhecimento({gatilho:"ao_consultar_dados"})` antes de escrever SQL · `ao_diagnosticar` quando um número saiu da faixa · `ao_recomendar` antes de propor ação (inclui `tipo:"caso"` com `situacao` = o que já funcionou) · `ao_escrever` antes de redigir · `ao_fechar` no fim. Cliente ou campanha nomeados? `conhecimento({cliente:"<slug>"})` / `conhecimento({campanha:"<id>"})` antes de gerar.'];
  if (rows.length) { out.push(''); for (const e of rows.slice(0, LIMITES.indice)) out.push(linhaIndice(e)); }
  else out.push('', '_(nenhuma entrada escopada a este template ainda — o geral acima vale; busque por `q` ou `tipo` se precisar)_');
  return out.join('\n');
}

export type { Gatilho };
