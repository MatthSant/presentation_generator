/* claude.ts — Anthropic Messages API wrapper (NOT the Agent SDK).
 *
 * generateInsights() forces structured JSON via a single tool with tool_choice,
 * so there's no fragile parsing. The static system prompt + schema are marked for
 * prompt caching. Falls back to a deterministic MOCK when no API key is set (or
 * CLAUDE_MOCK=1), so the whole flow is testable offline. Claude only ever sees the
 * aggregated digest — never raw CSV rows. */

import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { Digest, DeepenCatalog } from './datasetCatalog.js';
import { CLAUDE_LOG } from './paths.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

// USD per 1M tokens: [input, output, cache-write-5m, cache-read]. Defaults are
// public list prices by model family; override exactly via env if they change.
const PRICES: Record<string, [number, number, number, number]> = {
  opus: [15, 75, 18.75, 1.5],
  sonnet: [3, 15, 3.75, 0.3],
  haiku: [1, 5, 1.25, 0.1],
};
function rates(): [number, number, number, number] {
  const env = process.env;
  if (env.ANTHROPIC_PRICE_IN) {
    return [Number(env.ANTHROPIC_PRICE_IN), Number(env.ANTHROPIC_PRICE_OUT) || 0,
      Number(env.ANTHROPIC_PRICE_CACHE_WRITE) || 0, Number(env.ANTHROPIC_PRICE_CACHE_READ) || 0];
  }
  const m = MODEL.toLowerCase();
  for (const k of ['opus', 'haiku', 'sonnet']) if (m.includes(k)) return PRICES[k];
  return PRICES.sonnet;
}

interface Usage { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }
function costOf(usage: Usage | null | undefined): Record<string, unknown> | undefined {
  if (!usage) return undefined;
  const i = usage.input_tokens || 0, o = usage.output_tokens || 0;
  const cw = usage.cache_creation_input_tokens || 0, cr = usage.cache_read_input_tokens || 0;
  const [pi, po, pcw, pcr] = rates();
  const usd = (i * pi + o * po + cw * pcw + cr * pcr) / 1e6;
  return { usd: Number(usd.toFixed(6)), tokens: { in: i, out: o, cache_write: cw, cache_read: cr } };
}

/** Append a record of one Claude call (what was sent + what came back) to the
 *  JSONL log. Never throws — logging must not break the call. */
function logClaude(kind: string, request: unknown, result: Record<string, unknown>): void {
  try {
    fs.mkdirSync(path.dirname(CLAUDE_LOG), { recursive: true });
    fs.appendFileSync(CLAUDE_LOG, JSON.stringify({ ts: new Date().toISOString(), kind, model: MODEL, request, ...result }) + '\n');
  } catch { /* ignore logging failures */ }
}

/** messages.create wrapped so every call (and its result or error) is logged. */
async function loggedCreate(client: Anthropic, params: Anthropic.MessageCreateParamsNonStreaming, kind: string): Promise<Anthropic.Message> {
  try {
    const msg = await client.messages.create(params);
    logClaude(kind, params, { response: msg.content, usage: msg.usage, cost: costOf(msg.usage as Usage), stop_reason: msg.stop_reason });
    return msg;
  } catch (e) {
    logClaude(kind, params, { error: (e as Error).message });
    throw e;
  }
}

const SYSTEM = `Você é um analista sênior de marketing/dados. A partir de um DIGEST de números
JÁ CALCULADOS (agregados, sem dados brutos) de uma análise de conversão por perfil,
escreva a prosa autoral de Insights — em português do Brasil, direto e acionável.

REGRAS:
- Use SOMENTE os números do digest. Nunca invente valores nem cite dados que não estão lá.
- Números aparecem só na prosa dos cards (campo "detail"); pode usar <strong> e <em>.
- 2 a 3 zonas: Conclusões (✓ verde), Aprofundamento (↗ âmbar), Atenção (! vermelho).
  Cada zona com 2 a 4 cards. Priorize fatores de ALTA amplitude e papel "qualificador";
  trate "proxy de X" e "baixo impacto" como ressalvas.
- "method" = uma frase curta sobre a metodologia (benchmark = respondentes da pesquisa).
- Responda exclusivamente chamando a ferramenta emit_content.`;

const CONTENT_SCHEMA = {
  type: 'object',
  required: ['insights'],
  properties: {
    insights: {
      type: 'object',
      required: ['header', 'zones', 'method'],
      properties: {
        header: {
          type: 'object', required: ['title'],
          properties: { badge: { type: 'string' }, title: { type: 'string' }, sub: { type: 'string' } },
        },
        zones: {
          type: 'array',
          items: {
            type: 'object', required: ['n', 'color', 'title', 'cards'],
            properties: {
              n: { type: 'string', description: 'um emoji curto: ✓, ↗ ou !' },
              color: { type: 'string', enum: ['green', 'amber', 'red', 'purple'] },
              title: { type: 'string' },
              caption: { type: 'string' },
              cards: {
                type: 'array', minItems: 1, maxItems: 4,
                items: {
                  type: 'object', required: ['tag', 'tagColor', 'title', 'detail'],
                  properties: {
                    tag: { type: 'string' },
                    tagColor: { type: 'string', enum: ['p', 'g', 'a', 'r', 'n'] },
                    title: { type: 'string' },
                    detail: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        method: { type: 'string' },
      },
    },
  },
} as const;

export interface InsightsResult { content: unknown; mocked: boolean }

export async function generateInsights(digest: Digest, opts?: { tone?: string }): Promise<InsightsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.CLAUDE_MOCK === '1') return { content: mockContent(digest), mocked: true };

  const client = new Anthropic({ apiKey });
  const msg = await loggedCreate(client, {
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [{
      name: 'emit_content',
      description: 'Emite o objeto content (insights) no formato de blocos do app.',
      input_schema: CONTENT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
      cache_control: { type: 'ephemeral' },
    }],
    tool_choice: { type: 'tool', name: 'emit_content' },
    messages: [{ role: 'user', content: JSON.stringify({ digest, tone: opts?.tone ?? 'executivo' }) }],
  }, 'insights');
  const tu = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!tu) throw new Error('Claude não retornou tool_use');
  return { content: tu.input, mocked: false };
}

// --- B2: deepen a card into a modal -----------------------------------------

const MODAL_SYSTEM = `Você aprofunda um card de uma análise de conversão por perfil, gerando uma MODAL
com widgets do app. Regras inegociáveis:
- FOQUE no critério do card (campos "criterio"/"pagina" no input) — prefira as
  tabelas do catálogo desse critério; não troque por outro critério.
- Entenda O QUE O BLOCO MOSTRA por card.title, card.bind e card.tabs (datasets que
  ele usa) e aprofunde sobre ESSE assunto.
- Widgets de gráfico/tabela NÃO carregam números — eles fazem "bind" a uma tabela do
  CATÁLOGO. Use SOMENTE nomes de tabela e colunas que existem no catálogo fornecido.
- O "y" de um GRÁFICO tem que ser uma coluna NUMÉRICA (veja "numericCols" de cada
  tabela). Tabelas de exibição (colunas formatadas como "16,7%", tipicamente as "_detail")
  são TEXTO — use só em widgets de TABELA; num gráfico elas renderizam zerado. Para
  representatividade/diff/conversão num gráfico, use as tabelas numéricas (ex.: *_rank,
  *_grp).
- A prosa vai em widgets find-note (texto), onde números são permitidos como narrativa.
- RECORTE POR VALOR (where): cada linha da tabela é uma combinação das "dims". Para
  ISOLAR um valor de uma dimensão (um mês, uma categoria), use bind.where — ex.:
  {"dataset":"vendas","x":"canal","y":"receita","where":{"mes":"Jan"}}. Use SOMENTE
  colunas e valores que aparecem no catálogo (cada tabela traz "dims" e "dimValues" = os
  valores válidos). Com o where o filtro é REAL: aí PODE rotular o widget com o recorte
  (ex.: "Receita por canal em Janeiro").
- Se o recorte NÃO é representável — não há coluna nem valor para ele em tabela alguma
  (ex.: categoria por mês quando nenhuma tabela cruza os dois) — diga isso num find-note;
  nunca finja um filtro que o bind não aplica nem rotule um recorte que não foi aplicado.
- No máximo UM gráfico. Tabela só se for curta; para tabelas longas (muitas linhas /
  vários períodos), prefira um gráfico agregado ou a prosa — nunca despeje a tabela inteira.
- Se vier "modal_anterior", AJUSTE/aprofunde essa modal conforme a "instrucao",
  partindo dela e mantendo o que faz sentido (emita a modal final completa).
- Responda exclusivamente chamando a ferramenta emit_modal.`;

function bindSchema(tableNames: string[]): unknown {
  return {
    type: 'object', required: ['dataset'],
    properties: {
      dataset: { type: 'string', enum: tableNames },
      x: { type: 'string' }, y: { type: 'string' }, series: { type: 'string' },
      agg: { type: 'string', enum: ['sum', 'avg', 'min', 'max', 'count'] },
      where: { type: 'object', additionalProperties: { type: 'string' }, description: 'recorte por valor de dimensão, ex.: {"mes":"Jan"} — só colunas/valores do catálogo' },
    },
  };
}

function modalSchema(tableNames: string[]): Anthropic.Tool.InputSchema {
  return {
    type: 'object',
    required: ['id', 'title', 'widgets'],
    properties: {
      id: { type: 'string', pattern: '^modal-' },
      title: { type: 'string' },
      widgets: {
        type: 'array', minItems: 1, maxItems: 6,
        items: {
          oneOf: [
            { type: 'object', required: ['type', 'text'], properties: { type: { const: 'find-note' }, id: { type: 'string' }, text: { type: 'string' } } },
            { type: 'object', required: ['type', 'chartType', 'bind'], properties: { type: { const: 'chart' }, id: { type: 'string' }, title: { type: 'string' }, chartType: { type: 'string', enum: ['bar', 'bar-horizontal', 'line', 'stacked', 'donut', 'area'] }, diverging: { type: 'boolean' }, bind: bindSchema(tableNames) } },
            { type: 'object', required: ['type', 'cols', 'bind'], properties: { type: { const: 'table' }, id: { type: 'string' }, title: { type: 'string' }, cols: { type: 'array', items: { type: 'string' } }, bind: bindSchema(tableNames) } },
          ],
        },
      },
    },
  } as unknown as Anthropic.Tool.InputSchema;
}

export interface ModalResult { modal: unknown; mocked: boolean }
interface CardCtx { title?: string; detail?: string; type?: string; bind?: unknown; tabs?: unknown; pagina?: string; criterio?: string }

export async function generateModal(prompt: string, card: CardCtx, catalog: DeepenCatalog, repair?: string, prev?: unknown): Promise<ModalResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.CLAUDE_MOCK === '1') return { modal: mockModal(catalog, card), mocked: true };

  const names = catalog.tables.map((t) => t.name);
  const client = new Anthropic({ apiKey });
  // Drop the per-table sample rows: with dozens of tables they dominate the input
  // (the display "_detail" rows are huge), and columns + numericCols + dimValues
  // already tell the model what it needs.
  const lean = catalog.tables.map(({ sample, ...t }) => t);
  const payload = { instrucao: prompt, card, catalogo: lean, reparar: repair, modal_anterior: prev };
  const msg = await loggedCreate(client, {
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: MODAL_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [{ name: 'emit_modal', description: 'Emite a modal de aprofundamento.', input_schema: modalSchema(names) }],
    tool_choice: { type: 'tool', name: 'emit_modal' },
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
  }, 'modal-raso');
  const tu = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!tu) throw new Error('Claude não retornou tool_use');
  return { modal: tu.input, mocked: false };
}

// --- B2 deep: model-driven query loop over the retained base ----------------

export interface QueryReply { status: string; table?: { dims: string[]; filters: string[]; rows: Array<Record<string, unknown>> }; summary?: string; motivo?: string }
export interface DeepDeps {
  meta: { criterios: Array<{ id: string; label: string }>; canais: string[]; metricas: string[] };
  /** Run a catalog query (the app computes; returns only aggregates). */
  runQuery: (fn: string, args: Record<string, unknown>) => Promise<QueryReply>;
  /** Merge a returned table into the dataset; returns the new dataset key to bind to. */
  registerTable: (table: { dims: string[]; filters: string[]; rows: Array<Record<string, unknown>> }, summary: string) => string;
  /** Validate an emitted modal (same guard as the renderer). Returns [] when ok. */
  validate?: (modal: unknown) => string[];
}

const DEEP_SYSTEM = `Você aprofunda um card de uma análise de conversão por perfil. Você NÃO recebe o
dado bruto: para olhar QUALQUER recorte, chame a tool "consultar" — o app calcula e
devolve só agregados. Cada resultado ganha um "dataset_key" para usar no bind de um
gráfico/tabela. Quando tiver o suficiente, chame "emit_modal".

A modal deve ser ENXUTA e legível — qualidade, não quantidade:
- NO MÁXIMO UM gráfico, o mais informativo do recorte. Para um cruzamento, prefira
  barras agrupadas (chartType "bar", x="grupo", series="cruzar", y="valor").
- NUNCA use gráfico de valor único (ex.: associação / Cramér's V) — comente
  associação na PROSA, não num gráfico.
- Use tabela só se for curta; NUNCA despeje a tabela inteira de um cruzamento.
- 1 a 2 find-note curtos que interpretam o número e dão a implicação prática.
- Estrutura sugerida: nota de contexto → 1 gráfico → nota de conclusão.

FOCO (importante): o card pertence à página de um critério específico — campos
"criterio" e "pagina" no input. FOQUE nesse critério: use card.criterio como
\`criterio\` nas consultas e mantenha-o como eixo principal. Só envolva OUTRO
critério se o pedido pedir explicitamente um cruzamento — e ainda assim cruzando
COM o critério do card, nunca trocando por outro.

O QUE O BLOCO MOSTRA: use card.title, card.bind e card.tabs (os datasets/rótulos
que o bloco usa) para entender o assunto exato do bloco e escolher o recorte mais
relevante a ELE (ex.: um bloco de "proporção/representatividade" pede métrica de
participação por lançamento; um bloco de conversão pede a métrica de conversão).

AJUSTE/ITERAÇÃO: se vier "modal_anterior", o consultor quer AJUSTAR ou APROFUNDAR
essa modal já existente — PARTA dela, mantenha o que ainda faz sentido e aplique
exatamente o que a "instrucao" pede (ex.: trocar o gráfico, encurtar, focar num
grupo, adicionar um cruzamento). Emita a modal final completa (não um diff).

Regras duras: gráficos/tabelas só via bind a um dataset_key retornado (ou tabela do
catálogo inicial); números só na prosa dos find-note. Se uma consulta voltar
"nao_disponivel", diga isso na prosa — nunca invente número.

BIND: para isolar um valor de uma dimensão numa tabela já existente, use bind.where
(ex.: {"mes":"Jan"}) com valores que existam na tabela — o filtro é real e aí PODE
rotular o widget com o recorte. Para um corte que exige NOVO cálculo (não está em tabela
alguma), peça via "consultar". Se nem assim der, diga na prosa — nunca finja o filtro.`;

function consultarTool(deps: DeepDeps): Anthropic.Tool {
  const ids = deps.meta.criterios.map((c) => c.id);
  return {
    name: 'consultar',
    description: 'Calcula um recorte agregado sobre o dado retido (o app computa).',
    input_schema: {
      type: 'object',
      required: ['funcao'],
      properties: {
        funcao: { type: 'string', enum: ['cut_by_criterion', 'trend', 'crosstab', 'association'] },
        criterio: { type: 'string', enum: ids },
        cruzar_com: { type: 'string', enum: ids },
        canal: { type: 'string', enum: deps.meta.canais },
        metrica: { type: 'string', enum: deps.meta.metricas },
      },
    } as unknown as Anthropic.Tool.InputSchema,
  };
}
function emitModalTool(tableNames: string[]): Anthropic.Tool {
  return { name: 'emit_modal', description: 'Emite a modal final.', input_schema: modalSchema(tableNames) };
}

const MAX_TURNS = 8;

export async function generateModalDeep(prompt: string, card: CardCtx, catalog: DeepenCatalog, deps: DeepDeps, prev?: unknown): Promise<ModalResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.CLAUDE_MOCK === '1') return { modal: await mockModalDeep(card, catalog, deps), mocked: true };

  const client = new Anthropic({ apiKey });
  const registered: string[] = [];
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: JSON.stringify({ instrucao: prompt, card, meta: deps.meta, modal_anterior: prev }) }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const names = [...catalog.tables.map((t) => t.name), ...registered];
    const msg = await loggedCreate(client, {
      model: MODEL, max_tokens: 4096,
      system: [{ type: 'text', text: DEEP_SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: [consultarTool(deps), emitModalTool(names)],
      tool_choice: { type: 'any' },
      messages,
    }, 'modal-fundo');
    messages.push({ role: 'assistant', content: msg.content });
    const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) throw new Error('Claude não chamou nenhuma tool');

    // A valid emitted modal ends the loop — we don't send another request, so any
    // sibling tool_uses left unanswered are fine.
    const emitted = toolUses.find((t) => t.name === 'emit_modal');
    if (emitted && (!deps.validate || deps.validate(emitted.input).length === 0)) {
      return { modal: emitted.input, mocked: false };
    }

    // Otherwise answer EVERY tool_use with a tool_result before the next turn —
    // Anthropic requires one per tool_use, including parallel ("any") calls.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const t of toolUses) {
      if (t.name === 'emit_modal') {
        const errs = deps.validate ? deps.validate(t.input) : ['modal inválida'];
        results.push({ type: 'tool_result', tool_use_id: t.id, content: JSON.stringify({ status: 'modal_invalida', erros: errs, instrucao: 'Corrija: gráficos/tabelas só com bind a um dataset_key retornado e colunas que existem nele.' }) });
        continue;
      }
      const { funcao, ...args } = t.input as { funcao: string; [k: string]: unknown };
      const r = await deps.runQuery(funcao, args);
      const content = r.status === 'ok' && r.table
        ? JSON.stringify({ status: 'ok', dataset_key: deps.registerTable(r.table, r.summary ?? ''), columns: Object.keys(r.table.rows[0] ?? {}), sample: r.table.rows.slice(0, 3), summary: r.summary })
        : JSON.stringify({ status: r.status, motivo: r.motivo });
      results.push({ type: 'tool_result', tool_use_id: t.id, content });
    }
    messages.push({ role: 'user', content: results });
  }
  throw new Error('loop de aprofundamento sem emit_modal');
}

/** Offline deep modal: runs one real crosstab (card criterion × another factor)
 *  through the query catalog, registers it, and binds a chart to it. */
async function mockModalDeep(card: CardCtx, _catalog: DeepenCatalog, deps: DeepDeps): Promise<unknown> {
  const ids = deps.meta.criterios.map((c) => c.id);
  const bindName = (card.bind as { dataset?: string } | undefined)?.dataset || '';
  const m = bindName.match(/^crit_([a-z0-9]+)_/i);
  const criterio = (m && ids.includes(m[1]) ? m[1] : ids[0]) || ids[0];
  const cruzar = ids.find((x) => x !== criterio) || criterio;
  const canal = deps.meta.canais[0] || 'Geral';

  const widgets: unknown[] = [];
  const r = await deps.runQuery('crosstab', { criterio, cruzar_com: cruzar, canal });
  if (r.status === 'ok' && r.table) {
    const key = deps.registerTable(r.table, r.summary ?? '');
    widgets.push({ type: 'find-note', text: `Cruzamento sob demanda: <strong>${criterio}</strong> × <strong>${cruzar}</strong> (${canal}). ${r.summary ?? ''} <em>[mock]</em>` });
    widgets.push({ type: 'chart', title: r.summary ?? 'Cruzamento', chartType: 'bar', bind: { dataset: key, x: 'grupo', y: 'valor', series: 'cruzar' } });
  } else {
    widgets.push({ type: 'find-note', text: `Recorte não disponível: ${r.motivo ?? 'sem dados'}. <em>[mock]</em>` });
  }
  return { id: 'modal-mock', title: `Detalhe — ${card.title ?? 'card'}`, widgets };
}

/** Offline modal: prose + the criterion's "variação por grupo" chart, bound to a
 *  real catalog table. Proves the mechanism without an API key. */
function mockModal(catalog: DeepenCatalog, card: CardCtx): unknown {
  const grp = catalog.tables.find((t) => t.columns.includes('grupo') && t.columns.includes('diff_lcto')) ?? catalog.tables[0];
  const widgets: unknown[] = [{ type: 'find-note', text: `Aprofundamento (mock) de "${card.title ?? 'card'}". Com ANTHROPIC_API_KEY, o Claude escreve a análise e escolhe o recorte. <em>[mock]</em>` }];
  if (grp && grp.columns.includes('grupo') && grp.columns.includes('diff_lcto')) {
    widgets.push({ type: 'chart', title: 'Variação por grupo (vs. benchmark)', chartType: 'bar-horizontal', diverging: true, bind: { dataset: grp.name, x: 'grupo', y: 'diff_lcto', agg: 'avg' } });
  }
  return { id: 'modal-mock', title: `Detalhe — ${card.title ?? 'card'}`, widgets };
}

const fmtDiff = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

/** Deterministic offline content — plausible insights straight from the digest.
 *  Replaced by the real model when ANTHROPIC_API_KEY is set. */
function mockContent(d: Digest): unknown {
  const withData = d.criterios.filter((c) => c.melhor && c.pior);
  const rank = [...withData].sort((a, b) => parseFloat(b.amplitude || '0') - parseFloat(a.amplitude || '0'));
  const conclus = rank.slice(0, 3).map((c) => ({
    tag: c.papel || 'Achado', tagColor: 'g',
    title: `${c.label}: "${c.melhor!.grupo}" puxa a conversão`,
    detail: `O grupo <strong>${c.melhor!.grupo}</strong> converte <strong>${fmtDiff(c.melhor!.diff_lcto)}</strong> vs. o benchmark, enquanto "${c.pior!.grupo}" fica em <strong>${fmtDiff(c.pior!.diff_lcto)}</strong>. Amplitude ${c.amplitude ?? '—'}, papel ${c.papel ?? '—'}. <em>[mock]</em>`,
  }));
  const atencao = rank.filter((c) => (c.papel || '').includes('proxy') || (c.papel || '').includes('baixo')).slice(0, 3).map((c) => ({
    tag: 'Ressalva', tagColor: 'a',
    title: `${c.label}: ${c.papel}`,
    detail: `Amplitude ${c.amplitude ?? '—'} e independência ${c.independencia ?? '—'} — priorize com cautela. <em>[mock]</em>`,
  }));
  const zones: unknown[] = [{ n: '✓', color: 'green', title: 'CONCLUSÕES', caption: 'principais achados', cards: conclus }];
  if (atencao.length) zones.push({ n: '!', color: 'red', title: 'ATENÇÃO', caption: 'ler com cuidado', cards: atencao });
  return {
    insights: {
      header: { badge: 'Insights', title: 'Insights Estratégicos', sub: 'Gerado automaticamente a partir dos números agregados.' },
      zones,
      method: 'Benchmark = respondentes da pesquisa. Insights gerados offline (mock); a geração real entra com ANTHROPIC_API_KEY.',
    },
    detalhamentos: {},
  };
}
