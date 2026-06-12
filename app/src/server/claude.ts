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
import type { LayoutItem } from '../shared/types.js';
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

const CHART_GUIDE = `QUANDO usar cada gráfico — e quando NÃO usar (escolha pelo dado, não por estética):
- NUNCA um gráfico de valor único / 1 categoria (ex.: uma barra "Geral" sozinha): um número é um kpi, não um gráfico.
- bar / bar-horizontal: comparar 2–12 categorias discretas. Não use com 1 categoria nem com >16.
- line / area: evolução ao longo do tempo (≥3 pontos no eixo). Não use para categorias sem ordem temporal.
- stacked: composição que soma um todo (partes de 100%/total). Não use se as séries não compõem um todo.
- donut: participação de poucas fatias (≤6). Não use para evolução nem com muitas fatias.
- SÉRIES (agrupado/empilhado): no máximo ~6. Com mais (ex.: uma por lançamento) o gráfico fica ilegível —
  agregue, foque nas MAIORES variações, ou use heatmap. Tabela vazia (só cabeçalho) ou gráfico que não
  comunica é DEFEITO: corte ou troque por kpi/prosa.
- MULTI-LINHA / multi-série de MÉTRICAS de ESCALA COMPARÁVEL (ex.: leads pago × leads orgânico por dia,
  CPL × CPMQL por semana): PODE e DEVE. Chame a consulta "series_long" (devolve formato longo com colunas
  "serie" e "valor") e plote um line/bar com bind { x: <eixo>, y: "valor", series: "serie" } — vira 2+ linhas
  no mesmo eixo. Só exige que as métricas dividam ordem de grandeza parecida.
- LIMITE deste detalhamento: NÃO tem gráfico de DISPERSÃO (correlação ponto-a-ponto entre duas métricas) nem
  EIXO DUPLO (duas métricas de escalas MUITO diferentes em eixos y independentes, ex.: investimento R$ ×
  conversão %). Para esses casos NÃO finja eixo duplo: ponha as duas métricas como COLUNAS de uma TABLE — com
  a variação/Δ% já calculada quando der — e registre num find-note, em uma linha, que dispersão/eixo-duplo não
  está disponível aqui. (Métricas de MESMA escala → use series_long e plote multi-linha, acima.)`;

const GUARDRAIL = `GUARDRAIL — NUNCA perca de vista a PERGUNTA ORIGINAL (campo "pergunta_original" do input): toda a
saída existe para respondê-la. Pedidos de revisão/ajuste ("instrucao") refinam a FORMA (trocar gráfico,
encurtar, focar um grupo) — JAMAIS trocam o alvo. Se um ajuste afastaria a saída da pergunta original,
priorize a pergunta. A primeira coisa que o leitor deve extrair é a resposta DIRETA à pergunta original.`;

const ANSWER_RULES = `RESPOSTA — claim-first e no alvo:
- O PRIMEIRO widget é SEMPRE um highlight que responde a "pergunta_original" em UMA frase, com o número
  decisivo (ex.: "CPL explicou ~65% da dispersão do CPA; conversão, ~35%"). Nunca deixe a resposta só no fim.
- LINGUAGEM DO CLIENTE, não do analista: quem lê é o cliente final (dono do negócio), não um analista de dados.
  Escreva em português claro e direto; explique o porquê em termos de negócio (o que isso significa para a
  campanha/o resultado). Evite jargão estatístico cru (dispersão, R², variância, correlação, p.p. sem contexto,
  "qualificador/qualificante", nomes de coluna) — se um termo técnico for inevitável, dê o significado em
  meia linha. Prefira "explicou a maior parte da variação do custo" a "respondeu por 65% da dispersão".
- Pergunta ANALÍTICA (o que causou? qual fator pesa mais? qual a relação?) → entregue o DIAGNÓSTICO com
  números. NÃO a transforme em lista de "o que fazer": só inclua widgets de ação (ni/ni-vertical) quando a
  pergunta pedir recomendação explícita.
- EIXO DA PERGUNTA: nível (qual é MAIOR / converte mais) ≠ tendência (o que está MELHORANDO/PIORANDO) ≠
  causa (qual fator EXPLICA a variação). São perguntas diferentes — responda exatamente o eixo pedido; não
  troque "o que está mudando" por "o que mais converte".
- AMPLIAÇÃO DE CRITÉRIO: se a instrução pede VÁRIOS critérios macro (ex.: "renda, patrimônio, idade — não só
  renda"), traga cada um a partir dos DADOS daquele critério (no modo fundo, CONSULTE-o). É proibido citar
  grupos/números de um critério que não está nos dados — sem o dado, diga em um find-note que aquele critério
  não está disponível, nunca o invente.
- MÉTRICA DERIVADA: CPA = CPL ÷ Taxa de Conversão. Para EXPLICAR o CPA, atribua sua variação a CPL vs.
  conversão — nunca liste o próprio CPA como um terceiro fator independente ao lado deles.
- Use a métrica que o texto NOMEIA: se a frase diz "CPL", use o valor de CPL (não o de CPA); confira a ordem
  de grandeza (um CPL de leads costuma ser ~R$10–50, não milhares — um valor de milhares ali é quase sempre
  a métrica errada).
- RÓTULOS LEGÍVEIS: nomes de série, eixos e títulos de coluna NUNCA exibem código cru do dataset
  (ex.: "cls", "cup", "csn", "avgDiff_lcto"). Traduza para pt-BR humano ("Conversão paga", "Variação vs.
  benchmark"). Se uma sigla for inevitável, defina-a na prosa na primeira aparição.`;

const REVISION_RULE = `AJUSTE CIRÚRGICO: ao partir de "modal_anterior", mude SOMENTE o que a "instrucao" pede.
NÃO remova widgets que o consultor não pediu para remover (pediu para corrigir o gráfico → mantenha a tabela).
Reentregue a modal final completa, preservando todo o resto.`;

/** Enquadramento de DOMÍNIO por tipo de análise — injetado no prompt de deepen para
 *  que a orientação reflita o tipo certo. Sem isso, todo detalhamento herdava o texto
 *  de "conversão por perfil" (critério/grupos/benchmark da pesquisa), errado p/ criativos
 *  e histórico. `what` = o que a análise mede; `focus` = onde concentrar o aprofundamento. */
const DEEPEN_DOMAIN: Record<string, { what: string; focus: string }> = {
  'conversao-perfil': {
    what: 'conversão por perfil de lead ao longo de vários lançamentos: cada CRITÉRIO (renda, idade, patrimônio…) tem GRUPOS, comparados à conversão média (benchmark = respondentes da pesquisa)',
    focus: 'FOQUE no critério do card (campos "criterio"/"pagina" no input) — prefira as tabelas do catálogo desse critério; não troque por outro critério.',
  },
  'historico-lancamentos': {
    what: 'histórico de lançamentos: a evolução de métricas (investimento, faturamento líquido, ROAS, CPL, CPA, conversão paga, qualificação, reembolso, leads recapturados) entre eventos/lançamentos ao longo do tempo',
    focus: 'FOQUE na métrica e no período que o card mostra — compare lançamentos no tempo. NÃO existe "critério/grupo de pesquisa" nem benchmark de respondentes neste tipo.',
  },
  'criativos': {
    what: 'desempenho de criativos (anúncios) de Meta Ads — por anúncio, campanha e público — com investimento, ROAS, retorno, CPL, CPM, CAC, captação e qualidade de lead, em dois modos de leitura (Resultado × Captação)',
    focus: 'FOQUE no criativo/recorte que o card mostra (anúncio, campanha, público ou dia). NÃO existe "critério/grupo de pesquisa" nem benchmark de respondentes neste tipo.',
  },
  'acompanhamento-lancamento': {
    what: 'acompanhamento tático DIÁRIO de UM lançamento em curso: KPIs por dia (CPL, CPMQL, CTR, Hook, Hold, Connect, Conv. de Página, Taxa de Resposta/Qualidade) comparados a METAS e BENCHMARKS, com tendência dos últimos 3 dias e funil de tráfego (taxas vs benchmark)',
    focus: 'FOQUE na métrica/dia que o card mostra; o eixo é o DIA da campanha. Os BENCHMARKS/metas estão nas tabelas acom_kpis (colunas meta/dev/cls/trend_dir) e acom_funnel (colunas bench/gap/maior_furo) — SEMPRE compare o realizado contra elas e cite o benchmark. O maior furo do funil é a maior queda RELATIVA ao benchmark (gap), não a maior perda absoluta. NÃO existe "critério/grupo de pesquisa" nem benchmark de respondentes neste tipo.',
  },
};
const DEFAULT_DOMAIN = { what: 'uma análise de marketing/dados', focus: 'FOQUE no assunto que o card mostra (deduza por card.title, card.bind e card.tabs).' };
const domainOf = (t?: string) => (t && DEEPEN_DOMAIN[t]) || DEFAULT_DOMAIN;

const modalSystem = (analysisType?: string): string => {
  const d = domainOf(analysisType);
  return `Você aprofunda um card de ${d.what}, gerando uma MODAL
com widgets do app. Regras inegociáveis:
${GUARDRAIL}
${ANSWER_RULES}
- ${d.focus}
- Entenda O QUE O BLOCO MOSTRA por card.title, card.bind e card.tabs (datasets que
  ele usa) e aprofunde sobre ESSE assunto.
- Widgets de gráfico/tabela NÃO carregam números — eles fazem "bind" a uma tabela do
  CATÁLOGO. Use SOMENTE nomes de tabela e colunas que existem no catálogo fornecido.
- O "y" de um GRÁFICO tem que ser uma coluna NUMÉRICA (veja "numericCols" de cada
  tabela). Tabelas de exibição (colunas formatadas como "16,7%", tipicamente as "_detail")
  são TEXTO — use só em widgets de TABELA; num gráfico elas renderizam zerado. Para
  representatividade/diff/conversão num gráfico, use as tabelas numéricas (ex.: *_rank,
  *_grp).
- DECOMPONHA em blocos escaneáveis — não num paredão de prosa. Vocabulário disponível
  (use o que couber ao recorte; nem todos precisam aparecer):
  • highlight {text,label?,color?} — a ALEGAÇÃO central (1 linha) e a IMPLICAÇÃO ("e daí?").
  • kpi {label,value,color?,format?} — um número-chave isolado (chip), ex.: label "CPA", value "+35%".
  • table — a COMPARAÇÃO por segmento (uma linha por grupo, deltas por coluna): é o lugar
    do comparativo — NÃO descreva 3+ grupos em prosa.
  • chart — UM gráfico que conte a MESMA história do texto (achado sobre conversão → gráfico
    de conversão; não troque o eixo).
  • ni / ni-vertical {n,title,why,action} — cada AÇÃO recomendada como card (porquê + acionável),
    não como item de lista dentro de um parágrafo.
  • find-block {tag,tagColor,title,detail} — um achado nomeado e tagueado.
  • find-note {text} — só CONECTOR interpretativo curto entre blocos; NUNCA o depósito da
    análise inteira. Números são permitidos como narrativa em qualquer widget de texto e no
    value de um kpi, sempre extraídos das tabelas (nunca inventados).
  color/tagColor ∈ p(roxo) g(verde) a(âmbar) r(vermelho) n(eutro).
- RECORTE POR VALOR (where): cada linha da tabela é uma combinação das "dims". Para
  ISOLAR um valor de uma dimensão (um mês, uma categoria), use bind.where — ex.:
  {"dataset":"vendas","x":"canal","y":"receita","where":{"mes":"Jan"}}. Use SOMENTE
  colunas e valores que aparecem no catálogo (cada tabela traz "dims" e "dimValues" = os
  valores válidos). Com o where o filtro é REAL: aí PODE rotular o widget com o recorte
  (ex.: "Receita por canal em Janeiro").
- Se o recorte NÃO é representável — não há coluna nem valor para ele em tabela alguma
  (ex.: categoria por mês quando nenhuma tabela cruza os dois) — diga isso num find-note;
  nunca finja um filtro que o bind não aplica nem rotule um recorte que não foi aplicado.
- No máximo UM gráfico. Para a comparação por segmento, prefira a table (com deltas) à prosa;
  só evite a table quando ela ficaria longa demais (muitas linhas / vários períodos) — aí
  agregue num gráfico. Nunca despeje a tabela inteira.
${CHART_GUIDE}
- Estrutura sugerida (adapte ao recorte, não é obrigatória): alegação (highlight) → comparação
  (table ou 1 gráfico) → implicação (highlight/find-note) → ações (ni), quando houver.
- Se vier "modal_anterior", AJUSTE/aprofunde essa modal conforme a "instrucao",
  partindo dela e mantendo o que faz sentido (emita a modal final completa).
  ${REVISION_RULE}
- ENTREGUE A ANÁLISE EXECUTADA, NUNCA O MÉTODO: os find-note trazem números
  concretos extraídos das tabelas, comparações e uma conclusão acionável. É proibido
  descrever como a análise seria feita ("calcule…", "avalie…", "compare…",
  "seria necessário…") — execute-a. Se o corte pedido não existir nas tabelas
  disponíveis, diga em UMA linha o que falta e apresente o corte mais próximo
  disponível (com números).
- Se vier "exemplos_aprovados", são detalhamentos bem avaliados pelo consultor:
  siga o ESTILO e a ESTRUTURA deles (nunca os dados — os números saem das tabelas
  desta análise).
- Responda exclusivamente chamando a ferramenta emit_modal.`;
};

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
  const color = { type: 'string', enum: ['p', 'g', 'a', 'r', 'n'] };
  return {
    type: 'object',
    required: ['id', 'title', 'widgets'],
    properties: {
      id: { type: 'string', pattern: '^modal-' },
      title: { type: 'string' },
      widgets: {
        type: 'array', minItems: 1, maxItems: 9,
        items: {
          oneOf: [
            { type: 'object', required: ['type', 'text'], properties: { type: { const: 'find-note' }, id: { type: 'string' }, text: { type: 'string' } } },
            { type: 'object', required: ['type', 'text'], properties: { type: { const: 'highlight' }, id: { type: 'string' }, text: { type: 'string' }, label: { type: 'string' }, color } },
            { type: 'object', required: ['type', 'label', 'value'], properties: { type: { const: 'kpi' }, id: { type: 'string' }, label: { type: 'string' }, value: { type: ['string', 'number'] }, color, format: { type: 'string' } } },
            { type: 'object', required: ['type', 'title'], properties: { type: { const: 'find-block' }, id: { type: 'string' }, tag: { type: 'string' }, tagColor: color, title: { type: 'string' }, detail: { type: 'string' } } },
            { type: 'object', required: ['type', 'title'], properties: { type: { type: 'string', enum: ['ni', 'ni-vertical'] }, id: { type: 'string' }, n: { type: ['string', 'number'] }, title: { type: 'string' }, why: { type: 'string' }, action: { type: 'string' } } },
            { type: 'object', required: ['type', 'chartType', 'bind'], properties: { type: { const: 'chart' }, id: { type: 'string' }, title: { type: 'string' }, chartType: { type: 'string', enum: ['bar', 'bar-horizontal', 'line', 'stacked', 'donut', 'area'] }, diverging: { type: 'boolean' }, bind: bindSchema(tableNames) } },
            { type: 'object', required: ['type', 'cols', 'bind'], properties: { type: { const: 'table' }, id: { type: 'string' }, title: { type: 'string' }, cols: { type: 'array', items: { type: 'string' } }, bind: bindSchema(tableNames) } },
          ],
        },
      },
    },
  } as unknown as Anthropic.Tool.InputSchema;
}

export interface ModalUsage { tokensIn: number; tokensOut: number; costUsd: number; model: string }
export interface ModalResult { modal: unknown; mocked: boolean; usage?: ModalUsage }
interface CardCtx { title?: string; detail?: string; type?: string; bind?: unknown; tabs?: unknown; pagina?: string; criterio?: string }

/** Exemplo aprovado (few-shot): instrução original + resumo da modal emitida. */
export interface FewShotExample { instrucao: string; modal: unknown }

function usageOf(msg: Anthropic.Message): ModalUsage {
  const u = (msg.usage || {}) as Usage;
  const c = costOf(u) as { usd?: number } | undefined;
  return { tokensIn: u.input_tokens || 0, tokensOut: u.output_tokens || 0, costUsd: c?.usd || 0, model: MODEL };
}

export function sumUsage(a: ModalUsage | undefined, b: ModalUsage): ModalUsage {
  if (!a) return b;
  return { tokensIn: a.tokensIn + b.tokensIn, tokensOut: a.tokensOut + b.tokensOut,
    costUsd: Number((a.costUsd + b.costUsd).toFixed(6)), model: b.model };
}

export async function generateModal(prompt: string, card: CardCtx, catalog: DeepenCatalog, repair?: string, prev?: unknown, fewShot?: FewShotExample[], objetivo?: string, analysisType?: string): Promise<ModalResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.CLAUDE_MOCK === '1') return { modal: mockModal(catalog, card), mocked: true };

  const names = catalog.tables.map((t) => t.name);
  const client = new Anthropic({ apiKey });
  // Drop the per-table sample rows: with dozens of tables they dominate the input
  // (the display "_detail" rows are huge), and columns + numericCols + dimValues
  // already tell the model what it needs.
  const lean = catalog.tables.map(({ sample, ...t }) => t);
  const payload = { pergunta_original: objetivo, instrucao: prompt, card, catalogo: lean, reparar: repair, modal_anterior: prev,
    exemplos_aprovados: fewShot?.length ? fewShot : undefined };
  const msg = await loggedCreate(client, {
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: modalSystem(analysisType), cache_control: { type: 'ephemeral' } }],
    tools: [{ name: 'emit_modal', description: 'Emite a modal de aprofundamento.', input_schema: modalSchema(names) }],
    tool_choice: { type: 'tool', name: 'emit_modal' },
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
  }, 'modal-raso');
  const tu = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!tu) throw new Error('Claude não retornou tool_use');
  return { modal: tu.input, mocked: false, usage: usageOf(msg) };
}

// --- Critic: valida SEMANTICAMENTE o detalhamento contra a pergunta original --

const CRITIQUE_SCHEMA = {
  type: 'object',
  required: ['answersQuestion', 'numbersGrounded', 'issues'],
  properties: {
    answersQuestion: { type: 'boolean', description: 'a saída responde DIRETAMENTE a pergunta_original?' },
    numbersGrounded: { type: 'boolean', description: 'todo número da prosa bate com os "dados" (ou é derivável deles)?' },
    issues: { type: 'array', items: { type: 'string' }, description: 'até 5 problemas acionáveis (vazio = ok)' },
  },
} as const;

const CRITIC_SYSTEM = `Você é um revisor de qualidade de um detalhamento analítico do app. Recebe a
PERGUNTA que ele deve responder, os WIDGETS gerados (tipos + títulos + textos) e os
DADOS reais por trás dos gráficos/tabelas ("dados": números JÁ calculados, com os valores
e totais de cada widget). Avalie com rigor e responda chamando emit_critique.
- answersQuestion: o conjunto RESPONDE diretamente à pergunta? (não tangencia, não troca de assunto)
- numbersGrounded: confira a ARITMÉTICA. TODO número citado na prosa (find-note/highlight/find-block/ni)
  e no value de um kpi deve estar nos "dados" OU ser corretamente DERIVÁVEL deles (delta, variação
  p.p., %, razão, soma, média). Tolere arredondamento e formatação (R$, %, vírgula decimal, "p.p.",
  milhar). RUÍDO DE ARREDONDAMENTO NÃO É ERRO: ao recalcular um % derivado (variação relativa, razão,
  média), aceite diferença ≤ 0,5 p.p. OU ≤ 2% relativo do valor citado — só marque FALSE se o desvio
  for grande o bastante para MUDAR A CONCLUSÃO (sinal trocado, ordem de grandeza, fator errado). NÃO
  reprove por "23,4% vs 23,5%". Marque FALSE se: um número claramente não confere com os dados; a prosa
  cita números mas os "dados" estão vazios / não os sustentam; ou o recorte/consulta não faz sentido.
- issues (≤5, cada uma 1 linha ACIONÁVEL), p.ex.:
  • não responde à pergunta / responde outra coisa
  • EIXO trocado: respondeu nível (o que é maior) quando a pergunta era tendência (o que muda) ou causa, ou vice-versa
  • CRITÉRIO inventado: cita grupos/números de um critério que não está nos "dados" (deveria ter consultado ou dito que falta)
  • resposta ENTERRADA: o 1º widget não é um highlight respondendo à pergunta com o número decisivo
  • entregou AÇÕES ("o que fazer") quando a pergunta é analítica ("o que aconteceu / qual fator pesa mais")
  • número "X" não confere com os dados (esperado ~Y) — ou números sem tabela/gráfico que os sustente
  • métrica trocada: o texto nomeia uma métrica (ex.: "CPL") mas usa o valor de outra (ex.: CPA), ou ordem de
    grandeza implausível (CPL de leads em milhares); CPA tratado como fator independente de CPL e conversão
  • RÓTULO cru: série/eixo/coluna mostra código do dataset (ex.: "cls", "cup") sem tradução nem definição
  • o recorte/consulta não faz sentido para a pergunta
  • paredão de prosa em vez de blocos; falta conclusão acionável; gráfico inadequado (1 categoria, séries demais)
Não invente defeitos: se está bom, answersQuestion=true, numbersGrounded=true e issues=[].`;

/** Juízo semântico + NUMÉRICO de uma modal/seção já válida no schema: responde à
 *  pergunta? os números da prosa batem com os "dados" reais (factsheet resolvido dos
 *  binds)? o recorte faz sentido? Devolve {ok, issues} para o gate de reparo.
 *  No-op (ok) em modo mock/sem API key, para o fluxo offline seguir testável. */
export async function critiqueModal(modal: unknown, objetivo?: string, instrucao?: string, factsheet?: unknown): Promise<{ ok: boolean; issues: string[]; usage?: ModalUsage }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.CLAUDE_MOCK === '1') return { ok: true, issues: [] };
  const ws = ((modal as { widgets?: Array<Record<string, unknown>> })?.widgets) || [];
  const slim = ws.map((w) => ({ type: w.type, title: w.title, label: w.label, value: w.value, text: w.text, tag: w.tag, why: w.why, action: w.action, chartType: w.chartType, cols: w.cols }));
  const client = new Anthropic({ apiKey });
  const msg = await loggedCreate(client, {
    model: MODEL, max_tokens: 1024,
    system: [{ type: 'text', text: CRITIC_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [{ name: 'emit_critique', description: 'Emite o veredito de qualidade.', input_schema: CRITIQUE_SCHEMA as unknown as Anthropic.Tool.InputSchema }],
    tool_choice: { type: 'tool', name: 'emit_critique' },
    messages: [{ role: 'user', content: JSON.stringify({ pergunta_original: objetivo, instrucao, widgets: slim, dados: factsheet }) }],
  }, 'critic');
  const tu = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  const out = (tu?.input || {}) as { answersQuestion?: boolean; numbersGrounded?: boolean; issues?: string[] };
  const issues = Array.isArray(out.issues) ? out.issues.filter((s) => typeof s === 'string' && s.trim()) : [];
  const ok = out.answersQuestion !== false && out.numbersGrounded !== false && issues.length === 0;
  return { ok, issues, usage: usageOf(msg) };
}

// --- Agente de DISPOSIÇÃO: arruma os widgets numa grade de 12 colunas --------

/** Largura/altura padrão por tipo (espelha o DEFAULT_W do cliente) — usadas quando
 *  o agente omite w/h e no fallback determinístico. */
const LAY_W: Record<string, number> = {
  'label-sec': 12, 'find-note': 12, 'xs': 12, 'chart-table': 12, 'strat-grid': 12, 'eyebrow': 12,
  'chart': 6, 'table': 6, 'highlight': 6, 'request': 6, 'qa-card': 6, 'funnel': 6, 'evolution-picker': 6,
  'heatmap': 8, 'find-block': 4, 'ni': 4, 'ni-vertical': 4, 'kpi-card': 4, 'kpi': 3,
};
const LAY_H: Record<string, number> = {
  'kpi': 2, 'kpi-card': 3, 'find-note': 1, 'xs': 1, 'eyebrow': 1, 'highlight': 2, 'label-sec': 1,
  'find-block': 3, 'ni': 3, 'ni-vertical': 3, 'chart': 4, 'table': 4, 'heatmap': 4, 'chart-table': 5,
  'qa-card': 5, 'funnel': 5, 'strat-grid': 4, 'evolution-picker': 5,
};
const layW = (t: string): number => LAY_W[t] ?? 6;
const layH = (t: string): number => LAY_H[t] ?? 3;
const clampN = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(v)));

interface LayoutCell { id: string; w?: number; h?: number }
export interface LayWidget { id: string; type: string; title?: string; label?: string; text?: string }

const LAYOUT_SCHEMA = {
  type: 'object',
  required: ['rows'],
  properties: {
    rows: {
      type: 'array',
      description: 'linhas da grade, de cima para baixo; cada linha é uma lista de tiles lado a lado',
      items: {
        type: 'array',
        items: {
          type: 'object', required: ['id', 'w'],
          properties: {
            id: { type: 'string' }, w: { type: 'integer', minimum: 2, maximum: 12 },
            h: { type: 'integer', minimum: 1, maximum: 8 },
          },
        },
      },
    },
  },
} as const;

const LAYOUT_SYSTEM = `Você organiza a DISPOSIÇÃO dos widgets de um detalhamento numa grade de 12 colunas.
Recebe a PERGUNTA e os WIDGETS (id + tipo + título/resumo) e devolve "rows": linhas de cima para baixo;
cada linha é uma lista de tiles {id, w, h} lado a lado.
REGRAS DURAS (serão verificadas — se violar, será rejeitado):
- A soma dos "w" de CADA linha é NO MÁXIMO 12 (pode somar menos para dar respiro).
- Todo widget aparece EXATAMENTE UMA vez; não invente ids; não omita nenhum.
- w em colunas (2–12); h em linhas de grade (1–8).
DESIGN (boa leitura):
- O 1º widget (o highlight que responde à pergunta) sozinho no topo, w=12.
- Coloque NA MESMA LINHA o que se explica junto: um kpi/find-block pequeno (w3–4) ao lado da tabela ou
  gráfico que ele resume (w8–9); pares de find-block lado a lado (6+6).
- Tabela/gráfico: w6–12, h4–6. kpi: w3–4, h2–3. find-note/eyebrow: w12, h1. highlight: w12, h2.
- Não deixe um tile pequeno sozinho numa linha se ele cabe ao lado de outro. Evite vãos.
Responda chamando emit_layout.`;

function checkRows(rows: LayoutCell[][], ids: Set<string>): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  rows.forEach((row, ri) => {
    const sum = row.reduce((s, c) => s + (c.w ?? 6), 0);
    if (sum > 12) errs.push(`linha ${ri + 1} soma ${sum} de largura (> 12)`);
    for (const c of row) {
      if (!ids.has(c.id)) errs.push(`id desconhecido "${c.id}"`);
      else if (seen.has(c.id)) errs.push(`widget "${c.id}" repetido`);
      seen.add(c.id);
    }
  });
  for (const id of ids) if (!seen.has(id)) errs.push(`faltou posicionar o widget "${id}"`);
  return errs;
}

function rowsToItems(rows: LayoutCell[][], typeOf: Map<string, string>): LayoutItem[] {
  const items: LayoutItem[] = [];
  let y = 0;
  for (const row of rows) {
    let x = 0, rowH = 1;
    for (const cell of row) {
      const t = typeOf.get(cell.id) || '';
      const w = clampN(cell.w ?? layW(t), 2, 12);
      const h = clampN(cell.h ?? layH(t), 1, 12);
      if (x + w > 12) break;          // defensivo: nunca estoura a linha
      items.push({ id: cell.id, type: t, x, y, w, h });
      x += w; rowH = Math.max(rowH, h);
    }
    if (row.length) y += rowH;
  }
  return items;
}

/** Fallback determinístico: tipos largos ocupam a linha; pequenos são agrupados
 *  até somar 12. Garante um layout válido quando o agente falha/está offline. */
function packFallback(widgets: LayWidget[]): LayoutItem[] {
  const items: LayoutItem[] = [];
  let x = 0, y = 0, rowH = 1;
  const flush = (): void => { if (x > 0) { y += rowH; x = 0; rowH = 1; } };
  for (const wdg of widgets) {
    const t = wdg.type, h = layH(t);
    const w = clampN(layW(t), 2, 12);
    if (w >= 12) { flush(); items.push({ id: wdg.id, type: t, x: 0, y, w: 12, h }); y += h; continue; }
    if (x + w > 12) flush();
    items.push({ id: wdg.id, type: t, x, y, w, h }); x += w; rowH = Math.max(rowH, h);
  }
  return items;
}

/** Agente de disposição: 2ª passada que arruma os widgets do detalhamento numa
 *  grade de 12 colunas. Check fechado (soma de larguras ≤ 12 por linha + todos os
 *  ids exatamente uma vez); até 3 tentativas; cai no packer determinístico se não
 *  passar ou em modo mock/sem API key. */
export async function layoutSection(widgets: LayWidget[], objetivo?: string): Promise<{ layout: LayoutItem[]; usage?: ModalUsage; mocked: boolean }> {
  const typeOf = new Map(widgets.map((w) => [w.id, w.type]));
  const ids = new Set(widgets.map((w) => w.id));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.CLAUDE_MOCK === '1') return { layout: packFallback(widgets), mocked: true };

  const slim = widgets.map((w) => ({
    id: w.id, tipo: w.type,
    titulo: (w.title || w.label || (w.text ? String(w.text) : '')).slice(0, 70),
  }));
  const client = new Anthropic({ apiKey });
  let usage: ModalUsage | undefined;
  let repair = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const payload = { pergunta_original: objetivo, widgets: slim, corrigir: repair || undefined };
    const msg = await loggedCreate(client, {
      model: MODEL, max_tokens: 1024,
      system: [{ type: 'text', text: LAYOUT_SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: [{ name: 'emit_layout', description: 'Emite a disposição (rows) dos widgets.', input_schema: LAYOUT_SCHEMA as unknown as Anthropic.Tool.InputSchema }],
      tool_choice: { type: 'tool', name: 'emit_layout' },
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    }, 'layout');
    usage = sumUsage(usage, usageOf(msg));
    const tu = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const rows = ((tu?.input as { rows?: LayoutCell[][] })?.rows) || [];
    const errs = checkRows(rows, ids);
    if (!errs.length && rows.length) return { layout: rowsToItems(rows, typeOf), usage, mocked: false };
    repair = `A disposição anterior tem erros: ${errs.join('; ')}. Reemita "rows" corrigindo: cada linha soma no MÁXIMO 12 de largura e TODO widget aparece exatamente uma vez.`;
  }
  // esgotou as tentativas sem passar no check → nunca bloqueia o detalhamento
  return { layout: packFallback(widgets), usage, mocked: false };
}

// --- B2 deep: model-driven query loop over the retained base ----------------

export interface QueryReply { status: string; table?: { dims: string[]; filters: string[]; rows: Array<Record<string, unknown>> }; summary?: string; motivo?: string }
/** Descritor genérico das CONSULTAS sob demanda de um tipo (modo fundo). Cada tipo
 *  declara suas `funcoes` e os `params` (com enum/descrição) — a tool "consultar" e o
 *  prompt são montados a partir disso, sem hardcode por tipo. */
export interface ConsultarSpec {
  funcoes: Array<{ id: string; desc: string }>;
  params: Record<string, { enum?: string[]; desc?: string }>;
}
export interface DeepDeps {
  meta: {
    consultar?: ConsultarSpec;
    // Legado (conversao-perfil): usado pelo fallback da tool e por buildFactsheet.
    criterios?: Array<{ id: string; label: string }>; canais?: string[]; metricas?: string[];
  };
  /** Run a catalog query (the app computes; returns only aggregates). */
  runQuery: (fn: string, args: Record<string, unknown>) => Promise<QueryReply>;
  /** Merge a returned table into the dataset; returns the new dataset key to bind to. */
  registerTable: (table: { dims: string[]; filters: string[]; rows: Array<Record<string, unknown>> }, summary: string) => string;
  /** Validate an emitted modal (same guard as the renderer). Returns [] when ok. */
  validate?: (modal: unknown) => string[];
}

const deepSystem = (analysisType?: string, spec?: ConsultarSpec): string => {
  const d = domainOf(analysisType);
  const funcs = spec && spec.funcoes.length
    ? 'CONSULTAS DISPONÍVEIS (campo "funcao" da tool "consultar"):\n'
      + spec.funcoes.map((f) => `  • ${f.id} — ${f.desc}`).join('\n') + '\n\n'
    : '';
  return `Você aprofunda um card de ${d.what}. Você NÃO recebe o
dado bruto: para olhar QUALQUER recorte, chame a tool "consultar" — o app calcula e
devolve só agregados. Cada resultado ganha um "dataset_key" para usar no bind de um
gráfico/tabela. Quando tiver o suficiente, chame "emit_modal".

${funcs}${GUARDRAIL}

${ANSWER_RULES}

ENTREGUE A ANÁLISE EXECUTADA, NUNCA O MÉTODO: a prosa traz os números consultados,
comparações e uma conclusão acionável — jamais instruções de como fazer ("calcule…",
"avalie…"). Se um recorte não estiver disponível nas tools, diga em uma linha o que
falta e apresente o corte mais próximo (com números). Se vierem "exemplos_aprovados",
siga o estilo/estrutura deles (nunca os dados).

A modal deve ser ENXUTA e ESCANEÁVEL — decomposta em blocos, não num paredão de prosa:
- NO MÁXIMO UM gráfico, o mais informativo do recorte.
- NUNCA use gráfico de valor único (ex.: uma correlação/associação isolada) — comente na PROSA.
- Use tabela só se for curta; NUNCA despeje a tabela inteira de um cruzamento.
${CHART_GUIDE}
- VOCABULÁRIO (use o que couber): highlight {text,label?,color?} p/ a ALEGAÇÃO e a
  IMPLICAÇÃO; kpi {label,value,color?} p/ um número-chave isolado; table p/ a comparação
  por grupo (deltas por coluna — não descreva grupos em prosa); ni/ni-vertical
  {n,title,why,action} p/ cada AÇÃO; find-block {tag,tagColor,title,detail} p/ um achado
  nomeado. O find-note é só conector curto, NUNCA o depósito da análise. color ∈ p/g/a/r/n.
- Estrutura sugerida (adapte ao recorte): alegação (highlight) → comparação (table ou 1
  gráfico) → implicação (highlight/find-note) → ações (ni), quando houver.

FOCO: ${d.focus}

O QUE O BLOCO MOSTRA: use card.title, card.bind e card.tabs (os datasets/rótulos que o
bloco usa) para entender o assunto exato do bloco e escolher a consulta/recorte mais
relevante a ELE.

AJUSTE/ITERAÇÃO: se vier "modal_anterior", o consultor quer AJUSTAR ou APROFUNDAR
essa modal já existente — PARTA dela, mantenha o que ainda faz sentido e aplique
exatamente o que a "instrucao" pede (ex.: trocar o gráfico, encurtar, focar num
grupo, adicionar um cruzamento). Emita a modal final completa (não um diff).
${REVISION_RULE}

Regras duras: gráficos/tabelas só via bind a um dataset_key retornado (ou tabela do
catálogo inicial); números só na prosa dos widgets de texto (find-note/highlight/
find-block/ni) e no value de um kpi — sempre extraídos das tabelas. Se uma consulta voltar
"nao_disponivel", diga isso na prosa — nunca invente número.

BIND: para isolar um valor de uma dimensão numa tabela já existente, use bind.where
(ex.: {"mes":"Jan"}) com valores que existam na tabela — o filtro é real e aí PODE
rotular o widget com o recorte. Para um corte que exige NOVO cálculo (não está em tabela
alguma), peça via "consultar". Se nem assim der, diga na prosa — nunca finja o filtro.`;
};

function consultarTool(deps: DeepDeps): Anthropic.Tool {
  const spec = deps.meta.consultar;
  if (spec) {
    const props: Record<string, unknown> = {
      funcao: { type: 'string', enum: spec.funcoes.map((f) => f.id),
        description: spec.funcoes.map((f) => `${f.id} — ${f.desc}`).join(' | ') },
    };
    for (const [name, p] of Object.entries(spec.params)) {
      props[name] = { type: 'string', ...(p.enum ? { enum: p.enum } : {}), ...(p.desc ? { description: p.desc } : {}) };
    }
    return {
      name: 'consultar', description: 'Calcula um recorte agregado sobre o dado retido (o app computa; devolve só agregados).',
      input_schema: { type: 'object', required: ['funcao'], properties: props } as unknown as Anthropic.Tool.InputSchema,
    };
  }
  // Fallback legado (conversao-perfil sem meta.consultar).
  const ids = (deps.meta.criterios ?? []).map((c) => c.id);
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
        canal: { type: 'string', enum: deps.meta.canais ?? ['Geral'] },
        metrica: { type: 'string', enum: deps.meta.metricas ?? [] },
      },
    } as unknown as Anthropic.Tool.InputSchema,
  };
}
function emitModalTool(tableNames: string[]): Anthropic.Tool {
  return { name: 'emit_modal', description: 'Emite a modal final.', input_schema: modalSchema(tableNames) };
}

const MAX_TURNS = 8;

export async function generateModalDeep(prompt: string, card: CardCtx, catalog: DeepenCatalog, deps: DeepDeps, prev?: unknown, fewShot?: FewShotExample[], objetivo?: string, analysisType?: string): Promise<ModalResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.CLAUDE_MOCK === '1') return { modal: await mockModalDeep(card, catalog, deps), mocked: true };

  const client = new Anthropic({ apiKey });
  const registered: string[] = [];
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: JSON.stringify({ pergunta_original: objetivo, instrucao: prompt, card, meta: deps.meta, modal_anterior: prev,
    exemplos_aprovados: fewShot?.length ? fewShot : undefined }) }];
  let usage: ModalUsage | undefined;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const names = [...catalog.tables.map((t) => t.name), ...registered];
    const msg = await loggedCreate(client, {
      model: MODEL, max_tokens: 4096,
      system: [{ type: 'text', text: deepSystem(analysisType, deps.meta.consultar), cache_control: { type: 'ephemeral' } }],
      tools: [consultarTool(deps), emitModalTool(names)],
      tool_choice: { type: 'any' },
      messages,
    }, 'modal-fundo');
    usage = sumUsage(usage, usageOf(msg));
    messages.push({ role: 'assistant', content: msg.content });
    const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) throw new Error('Claude não chamou nenhuma tool');

    // A valid emitted modal ends the loop — we don't send another request, so any
    // sibling tool_uses left unanswered are fine.
    const emitted = toolUses.find((t) => t.name === 'emit_modal');
    if (emitted && (!deps.validate || deps.validate(emitted.input).length === 0)) {
      return { modal: emitted.input, mocked: false, usage };
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
  const ids = (deps.meta.criterios ?? []).map((c) => c.id);
  const bindName = (card.bind as { dataset?: string } | undefined)?.dataset || '';
  const m = bindName.match(/^crit_([a-z0-9]+)_/i);
  const criterio = (m && ids.includes(m[1]) ? m[1] : ids[0]) || ids[0];
  const cruzar = ids.find((x) => x !== criterio) || criterio;
  const canal = (deps.meta.canais ?? ['Geral'])[0] || 'Geral';

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
