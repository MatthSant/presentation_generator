/* activity — tools `registrar` e `avaliar` (spec 002 US1/US3). Puras: validam a forma,
 * passam pelo gate de PII, gravam. O McpAgent só chama. */

import { canSee, CONTEXTO_TIPOS, getPublishedKit, getTemplate, insertActivity, insertRating, type Activity, type ContextoTipo } from '../db/index.js';
import { checkPii, piiMessage } from './pii.js';
import { ToolError, type ToolEnv, type ToolUser } from './tools.js';

export const MAX_DADOS_BYTES = 200 * 1024;

export interface RegistrarInput {
  evento: Activity['evento'];
  slug: string;
  versao?: number | null;
  cliente?: string | null;
  /** geracao: resultado das tarefas de contexto + o que saiu (título, seções, problemas). */
  contexto?: unknown;
  resultado?: unknown;
  /** aprofundamento */
  pergunta?: string;
  pergunta_id?: string | null;
  resposta?: string;
  consultas?: unknown[];
  avaliacao?: number | null;
  descartado?: boolean;
  motivo?: string | null;
  /** edicao */
  mudanca?: string;
  /** feedback de uso (ao fechar o trabalho): o que segurou, o que custou rodada, a medida e a nota */
  segurou?: string[];
  custou?: Array<{ item?: string; prioridade?: string; pedido?: string; rodadas?: number }>;
  medida?: { apresentacao?: number; filtro?: number; analise?: number; total?: number };
  nota?: number;
  resumo?: string;
}

const PRIORIDADES = ['alta', 'media', 'baixa'];

function str(v: unknown, max = 20000): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

async function visibleSlug(env: ToolEnv, user: ToolUser, slug: string): Promise<{ slug: string; version: number | null }> {
  const t = await getTemplate(env.DB, slug);
  if (!t || !canSee(t, user.email)) throw new ToolError(`template "${slug}" não existe (ou não é visível para você). Use listar_templates.`);
  const kit = await getPublishedKit(env.DB, slug);
  return { slug, version: kit?.version.number ?? null };
}

export async function registrar(env: ToolEnv, user: ToolUser, input: RegistrarInput): Promise<string> {
  const evento = input.evento;
  if (!['geracao', 'aprofundamento', 'feedback'].includes(evento)) throw new ToolError('evento deve ser geracao | aprofundamento | feedback (sugestão de regra: sugerir_regra)');
  if (!input.slug) throw new ToolError('slug obrigatório');
  const { version } = await visibleSlug(env, user, input.slug);

  let dados: Record<string, unknown>;
  if (evento === 'geracao') {
    dados = { contexto: input.contexto ?? {}, resultado: input.resultado ?? {} };
  } else if (evento === 'feedback') {
    const nota = Number(input.nota);
    if (!(Number.isInteger(nota) && nota >= 1 && nota <= 5)) throw new ToolError('feedback exige `nota` (1 a 5)');
    const segurou = (Array.isArray(input.segurou) ? input.segurou : []).map((x) => str(x, 400)).filter(Boolean).slice(0, 20) as string[];
    const custou = (Array.isArray(input.custou) ? input.custou : []).slice(0, 30).map((c, i) => {
      const item = str(c?.item, 500); const pedido = str(c?.pedido, 500);
      if (!item && !pedido) throw new ToolError(`custou[${i}]: informe item (o que custou rodada) e pedido (o que mudar no kit)`);
      const prioridade = PRIORIDADES.includes(String(c?.prioridade || '').toLowerCase()) ? String(c!.prioridade).toLowerCase() : 'media';
      const rodadas = Number.isFinite(Number(c?.rodadas)) && Number(c?.rodadas) > 0 ? Math.round(Number(c!.rodadas)) : null;
      return { item, pedido, prioridade, rodadas };
    });
    const m = input.medida || {};
    const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0);
    const medida = { apresentacao: n(m.apresentacao), filtro: n(m.filtro), analise: n(m.analise) };
    (medida as { total?: number }).total = n(m.total) || (medida.apresentacao + medida.filtro + medida.analise);
    if (!segurou.length && !custou.length) throw new ToolError('feedback exige ao menos `segurou` ou `custou`');
    dados = { segurou, custou, medida, nota, resumo: str(input.resumo, 2000) };
  } else if (evento === 'aprofundamento') {
    const pergunta = str(input.pergunta, 2000);
    if (!pergunta) throw new ToolError('aprofundamento exige `pergunta`');
    const resposta = input.resposta == null ? '' : String(input.resposta);
    if (new TextEncoder().encode(resposta).length > MAX_DADOS_BYTES) throw new ToolError(`resposta grande demais (> ${MAX_DADOS_BYTES / 1024} KB): resuma a prosa e mande só as tabelas agregadas`);
    dados = { pergunta, resposta, consultas: Array.isArray(input.consultas) ? input.consultas.slice(0, 50) : [] };
  } else {
    const mudanca = str(input.mudanca, 5000);
    if (!mudanca) throw new ToolError('edicao exige `mudanca`');
    dados = { mudanca };
  }
  const avaliacao = evento === 'feedback' ? Number(input.nota) : (input.avaliacao == null ? null : Number(input.avaliacao));
  if (avaliacao != null && !(Number.isInteger(avaliacao) && avaliacao >= 1 && avaliacao <= 5)) throw new ToolError('avaliacao deve ser inteiro de 1 a 5');
  const motivo = str(input.motivo, 2000);
  if (input.descartado && !motivo) throw new ToolError('descartado exige `motivo`');

  const payload = { dados, cliente: input.cliente ?? null, motivo };
  const size = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (size > MAX_DADOS_BYTES) throw new ToolError(`registro grande demais (${Math.round(size / 1024)} KB > ${MAX_DADOS_BYTES / 1024} KB): resuma a resposta`);
  const pii = checkPii(payload, [user.email]);
  if (!pii.ok) throw new ToolError(piiMessage(pii));

  const id = await insertActivity(env.DB, {
    org_id: env.ORG_ID, email: user.email, evento, slug: input.slug,
    version_number: input.versao ?? version, cliente: str(input.cliente, 120), pergunta_id: str(input.pergunta_id, 120),
    dados, avaliacao, descartado: !!input.descartado, motivo, origem: 'mcp',
  });
  return `registrado (${evento}, ${input.slug} v${input.versao ?? version ?? '?'}) id=${id}`;
}

export async function avaliar(env: ToolEnv, user: ToolUser, slug: string, nota: number, comentario?: string | null): Promise<string> {
  const n = Number(nota);
  if (!(Number.isInteger(n) && n >= 1 && n <= 5)) throw new ToolError('nota deve ser inteiro de 1 a 5');
  const { version } = await visibleSlug(env, user, slug);
  const c = str(comentario, 4000);
  if (c) {
    const pii = checkPii(c, [user.email]);
    if (!pii.ok) throw new ToolError(piiMessage(pii));
  }
  await insertRating(env.DB, { org_id: env.ORG_ID, slug, version_number: version, email: user.email, nota: n, comentario: c });
  return `avaliação registrada: ${slug} v${version ?? '?'} — nota ${n}${c ? ` ("${c.slice(0, 80)}")` : ''}`;
}

// ── sugerir_regra ────────────────────────────────────────────────────────────

export interface SugerirInput { slug: string; tipo: ContextoTipo; titulo: string; corpo?: string | null; motivo?: string | null }

/** O agente propõe uma entrada; cai na triagem do editor (evento 'sugestao', sem veredito). */
export async function sugerir(env: ToolEnv, user: ToolUser, input: SugerirInput): Promise<string> {
  if (!input.slug) throw new ToolError('slug obrigatório');
  if (!CONTEXTO_TIPOS.includes(input.tipo)) throw new ToolError(`tipo deve ser ${CONTEXTO_TIPOS.join(' | ')}`);
  const titulo = str(input.titulo, 300);
  if (!titulo) throw new ToolError('titulo obrigatório: a regra/pergunta em uma frase');
  const { version } = await visibleSlug(env, user, input.slug);
  const dados = { tipo: input.tipo, titulo, corpo: str(input.corpo, 4000) ?? '', motivo: str(input.motivo, 2000) ?? '' };
  const pii = checkPii(dados, [user.email]);
  if (!pii.ok) throw new ToolError(piiMessage(pii));
  const id = await insertActivity(env.DB, { org_id: env.ORG_ID, email: user.email, evento: 'sugestao', slug: input.slug, version_number: version, dados, motivo: dados.motivo || null, origem: 'mcp' });
  return `sugestão registrada (${input.tipo}: "${titulo}") id=${id} — um editor decide na triagem; o kit não muda até lá.`;
}
