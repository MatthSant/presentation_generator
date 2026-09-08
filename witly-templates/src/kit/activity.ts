/* activity — tools `registrar` e `avaliar` (spec 002 US1/US3). Puras: validam a forma,
 * passam pelo gate de PII, gravam. O McpAgent só chama. */

import { canSee, getPublishedKit, getTemplate, insertActivity, insertRating, type Activity } from '../db/index.js';
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
}

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
  if (!['geracao', 'aprofundamento', 'edicao'].includes(evento)) throw new ToolError('evento deve ser geracao | aprofundamento | edicao');
  if (!input.slug) throw new ToolError('slug obrigatório');
  const { version } = await visibleSlug(env, user, input.slug);

  let dados: Record<string, unknown>;
  if (evento === 'geracao') {
    dados = { contexto: input.contexto ?? {}, resultado: input.resultado ?? {} };
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
  const avaliacao = input.avaliacao == null ? null : Number(input.avaliacao);
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
