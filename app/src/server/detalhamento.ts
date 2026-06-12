/* detalhamento.ts — gera os WIDGETS de um detalhamento (prosa + ≤1 gráfico).
 *
 * Mesmo motor do "detalhar" por card (catálogo das tabelas já calculadas →
 * Claude emite widgets que fazem bind só a elas → validateSection), mas devolve
 * uma lista de widgets pronta para virar uma SEÇÃO própria na página
 * "Detalhamentos" — não uma modal presa ao bloco de origem. O bloco de origem é
 * usado só como CONTEXTO (assunto/critério) para a geração. */

import fs from 'node:fs';
import path from 'node:path';
import type { Section, Widget, Modal, LayoutItem } from '../shared/types.js';
import { readJson } from './fsutil.js';
import { BASE } from './paths.js';
import { buildCatalog } from './datasetCatalog.js';
import { generateModal, generateModalDeep, layoutSection, sumUsage, type DeepDeps } from './claude.js';
import { gateAndRepair } from './deepenLoop.js';
import { runQuery } from './pygen.js';
import { validateSection } from '../shared/validate.js';
import { typeOf } from './typeRegistry.js';
import { buildCardContext, type CardContext } from './cardContext.js';
import { methodologySmell } from './deepenHistory.js';
import type { ModalUsage, FewShotExample } from './claude.js';

interface DataTable { dims?: string[]; filters?: string[]; rows: Array<Record<string, unknown>> }
type DataMap = Record<string, DataTable>;

export interface DetalheInput {
  out: string; client: string; slug: string;
  /** Source block giving the detalhamento its subject/criterion context. */
  srcSecId: string; blockId: string;
  prompt: string; prev?: unknown;
  /** Id of the section to be created — used to namespace any on-demand query tables. */
  resultId: string;
  /** Exemplos bem avaliados (few-shot) injetados no prompt. */
  fewShot?: FewShotExample[];
  /** Pergunta original que o detalhamento DEVE responder — fica pinada pelo gate
   *  através de todas as revisões/reparos (guardrail). Default: o próprio prompt. */
  objetivo?: string;
  /** Callback de progresso (estágio) → tela de carregamento. */
  onProgress?: (msg: string) => void;
}

export interface DetalheResult {
  widgets: Widget[]; mocked: boolean; datasetChanged: boolean; dataset: DataMap;
  usage?: ModalUsage; cardContext: CardContext; analysisType: string;
  /** Disposição na grade (12 col) decidida pelo agente de layout — vira o
   *  layout.json da seção. Vazio = cliente usa o flow padrão. */
  layout: LayoutItem[];
  /** Telemetria do gate de qualidade para o histórico. */
  gate: { attempts: number; issues: string[]; residual: string[] };
}

const widgetsOf = (modal: unknown): Widget[] =>
  Array.isArray((modal as Modal)?.widgets) ? (modal as Modal).widgets! : [];

export async function generateDetalhamento(inp: DetalheInput): Promise<DetalheResult> {
  const dir = path.join(inp.out, inp.client, inp.slug);
  const section = readJson<Section>(path.join(dir, `${inp.srcSecId}.json`));
  const dataset = readJson<DataMap>(path.join(dir, 'dataset.json'));
  if (!dataset) throw new Error('dataset ausente');
  const catalog = buildCatalog(dataset);

  const cardCtx = buildCardContext(section, inp.blockId, catalog);

  const ensureIds = (ws: Widget[]): Widget[] => {
    ws.forEach((w, i) => { if (!w.id) (w as { id: string }).id = `${inp.resultId}-w${i}`; });
    return ws;
  };
  const validate = (ws: Widget[]): string[] => {
    if (!Array.isArray(ws) || ws.length === 0) return ['widgets deve ser uma lista não-vazia'];
    const candidate = { id: inp.resultId, header: { title: 'Detalhamento' }, widgets: ensureIds(ws) } as Section;
    return validateSection(candidate, dataset as unknown as Parameters<typeof validateSection>[1])
      .map((e) => `${e.path}: ${e.message}`);
  };

  const baseDir = path.join(BASE, inp.client, inp.slug);
  const hasBase = fs.existsSync(path.join(baseDir, 'dump.csv')) && fs.existsSync(path.join(baseDir, 'config.json'));
  const baseConfig = hasBase ? readJson<Record<string, unknown>>(path.join(baseDir, 'config.json')) : null;
  const deepenMeta = hasBase ? typeOf(baseConfig).buildDeepenMeta(baseConfig) : null;

  const analysisType = typeOf(baseConfig ?? undefined).type;
  // Moldura: os prompts dos bancos são instruções — o modelo deve EXECUTÁ-las.
  const framedPrompt = `Execute esta análise sobre as tabelas e apresente os resultados (não descreva como fazê-la): ${inp.prompt}`;

  let datasetChanged = false;
  let qn = 0;
  // Caminho de fundo (query loop) só quando há base retida + tipo com deepenMeta.
  const deps: DeepDeps | null = deepenMeta ? {
    meta: deepenMeta,
    runQuery: async (fn, args) => (await runQuery(inp.client, inp.slug, fn, args)) ?? { status: 'erro', motivo: 'sem base' },
    registerTable: (table, _summary) => {
      const key = `q-${inp.resultId}-${qn++}`;
      dataset[key] = { dims: table.dims, filters: table.filters, rows: table.rows };
      datasetChanged = true;
      return key;
    },
    validate: (modal) => {
      const errs = validate(widgetsOf(modal));
      return errs.length ? errs : methodologySmell(modal);
    },
  } : null;

  // Loop máx-3 com gate (schema + qualidade + critic), repinando a pergunta original.
  const objetivo = inp.objetivo || inp.prompt;
  const gate = await gateAndRepair({
    dataset, objetivo, instrucao: inp.prompt, onProgress: inp.onProgress,
    generate: (repair, prevCand) => {
      const prev = prevCand ?? inp.prev;
      if (deps) {
        const dp = repair ? `${framedPrompt}\n\n${repair}` : framedPrompt;
        return generateModalDeep(dp, cardCtx, catalog, deps, prev, inp.fewShot, objetivo);
      }
      return generateModal(framedPrompt, cardCtx, catalog, repair, prev, inp.fewShot, objetivo);
    },
    normalize: (m) => ({ id: inp.resultId, title: 'Detalhamento', widgets: ensureIds(widgetsOf(m)) } as unknown as Modal),
    validateSchema: (m) => validate(((m as { widgets?: Widget[] }).widgets) ?? []),
  });

  // Sem modal renderável, OU renderável mas reprovado na verificação após todas as
  // tentativas: NÃO entrega um detalhamento pela metade — falha com as pendências
  // claras, para o client mostrar a tela de erro com a opção de rerodar.
  if (!gate.modal || gate.residualIssues.length) {
    console.warn(`[detalhamento] ${inp.client}/${inp.slug}/${inp.resultId}: reprovado após ${gate.attempts} tentativas →`, gate.residualIssues);
    throw new Error(`Não passou na verificação de qualidade após ${gate.attempts} tentativas: ${gate.residualIssues.join('; ')}`);
  }
  const widgets = ((gate.modal as { widgets: Widget[] }).widgets).map((w, i) => {
    if (!w.id) (w as { id: string }).id = `${inp.resultId}-w${i}`;
    return w;
  });
  // 2ª passada: agente de disposição arruma os widgets na grade (check fechado de
  // larguras ≤ 12 por linha; nunca bloqueia — cai no packer determinístico).
  inp.onProgress?.('Organizando a disposição…');
  const lay = await layoutSection(
    widgets.map((w) => ({ id: w.id, type: w.type,
      title: (w as { title?: string }).title, label: (w as { label?: string }).label,
      text: (w as { text?: string }).text })),
    objetivo,
  );
  if (lay.residual.length) {
    console.warn(`[layout] ${inp.client}/${inp.slug}/${inp.resultId}: ${lay.attempts} tentativas, resíduo →`, lay.residual);
  }
  return { widgets, layout: lay.layout, mocked: gate.mocked, datasetChanged, dataset,
    usage: sumUsage(gate.usage, lay.usage ?? { tokensIn: 0, tokensOut: 0, costUsd: 0, model: '' }),
    cardContext: cardCtx, analysisType,
    gate: { attempts: gate.attempts, issues: gate.issuesLog, residual: gate.residualIssues } };
}
