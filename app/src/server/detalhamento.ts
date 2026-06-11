/* detalhamento.ts — gera os WIDGETS de um detalhamento (prosa + ≤1 gráfico).
 *
 * Mesmo motor do "detalhar" por card (catálogo das tabelas já calculadas →
 * Claude emite widgets que fazem bind só a elas → validateSection), mas devolve
 * uma lista de widgets pronta para virar uma SEÇÃO própria na página
 * "Detalhamentos" — não uma modal presa ao bloco de origem. O bloco de origem é
 * usado só como CONTEXTO (assunto/critério) para a geração. */

import fs from 'node:fs';
import path from 'node:path';
import type { Section, Widget, Modal } from '../shared/types.js';
import { readJson } from './fsutil.js';
import { BASE } from './paths.js';
import { buildCatalog } from './datasetCatalog.js';
import { generateModal, generateModalDeep, type DeepDeps } from './claude.js';
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
}

export interface DetalheResult {
  widgets: Widget[]; mocked: boolean; datasetChanged: boolean; dataset: DataMap;
  usage?: ModalUsage; cardContext: CardContext; analysisType: string;
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

  let mocked = false;
  let datasetChanged = false;
  let widgets: Widget[] | null = null;
  let errors: string[] = [];
  let usage: ModalUsage | undefined;

  if (deepenMeta) {
    let qn = 0;
    const deps: DeepDeps = {
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
    };
    const r = await generateModalDeep(framedPrompt, cardCtx, catalog, deps, inp.prev, inp.fewShot);
    mocked = r.mocked;
    usage = r.usage;
    const ws = widgetsOf(r.modal);
    errors = validate(ws);
    if (errors.length === 0) widgets = ws;
  } else {
    for (let attempt = 0; attempt < 2; attempt++) {
      const repair = attempt === 0 ? undefined : `A saída anterior foi rejeitada: ${errors.join('; ')}. Corrija usando só tabelas/colunas do catálogo.`;
      const r = await generateModal(framedPrompt, cardCtx, catalog, repair, inp.prev, inp.fewShot);
      mocked = r.mocked;
      if (r.usage) usage = usage ? { ...r.usage, tokensIn: usage.tokensIn + r.usage.tokensIn, tokensOut: usage.tokensOut + r.usage.tokensOut, costUsd: Number((usage.costUsd + r.usage.costUsd).toFixed(6)) } : r.usage;
      const ws = widgetsOf(r.modal);
      errors = validate(ws);
      if (errors.length === 0) errors = methodologySmell(r.modal);
      if (errors.length === 0) { widgets = ws; break; }
      if (mocked) break;
    }
  }

  if (!widgets) throw new Error(`detalhamento inválido: ${errors.join('; ')}`);
  widgets.forEach((w, i) => { if (!w.id) (w as { id: string }).id = `${inp.resultId}-w${i}`; });
  return { widgets, mocked, datasetChanged, dataset, usage, cardContext: cardCtx, analysisType };
}
