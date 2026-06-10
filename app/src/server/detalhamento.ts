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

interface DataTable { dims?: string[]; filters?: string[]; rows: Array<Record<string, unknown>> }
type DataMap = Record<string, DataTable>;
interface BaseConfig { criterios: Array<{ id: string; label?: string }>; channels?: string[] }

export interface DetalheInput {
  out: string; client: string; slug: string;
  /** Source block giving the detalhamento its subject/criterion context. */
  srcSecId: string; blockId: string;
  prompt: string; prev?: unknown;
  /** Id of the section to be created — used to namespace any on-demand query tables. */
  resultId: string;
}

export interface DetalheResult { widgets: Widget[]; mocked: boolean; datasetChanged: boolean; dataset: DataMap }

const widgetsOf = (modal: unknown): Widget[] =>
  Array.isArray((modal as Modal)?.widgets) ? (modal as Modal).widgets! : [];

export async function generateDetalhamento(inp: DetalheInput): Promise<DetalheResult> {
  const dir = path.join(inp.out, inp.client, inp.slug);
  const section = readJson<Section>(path.join(dir, `${inp.srcSecId}.json`));
  const dataset = readJson<DataMap>(path.join(dir, 'dataset.json'));
  if (!dataset) throw new Error('dataset ausente');
  const catalog = buildCatalog(dataset);

  const card = section?.widgets.find((w) => w.id === inp.blockId);
  const critIds = new Set<string>();
  for (const t of catalog.tables) { const mm = t.name.match(/^crit_([a-z0-9]+)_/i); if (mm) critIds.add(mm[1]); }
  const prefix = inp.blockId.includes('-') ? inp.blockId.slice(0, inp.blockId.indexOf('-')) : '';
  const rawTabs = (card as { tabs?: Array<Record<string, unknown>> } | undefined)?.tabs;
  const tabs = Array.isArray(rawTabs)
    ? rawTabs
        .map((t) => ({ label: t.label, dataset: (t.bind as { dataset?: string })?.dataset ?? (t.chart as { bind?: { dataset?: string } })?.bind?.dataset }))
        .filter((t) => t.dataset)
    : undefined;
  const cardCtx = {
    title: (card as { title?: string } | undefined)?.title,
    detail: (card as { detail?: string } | undefined)?.detail,
    type: (card as Widget | undefined)?.type,
    bind: (card as { bind?: unknown } | undefined)?.bind,
    tabs,
    pagina: section?.header?.title,
    criterio: critIds.has(prefix) ? prefix : undefined,
  };

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

  let mocked = false;
  let datasetChanged = false;
  let widgets: Widget[] | null = null;
  let errors: string[] = [];

  if (hasBase) {
    const config = readJson<BaseConfig>(path.join(baseDir, 'config.json'));
    let qn = 0;
    const deps: DeepDeps = {
      meta: {
        criterios: (config?.criterios || []).map((c) => ({ id: c.id, label: c.label || c.id })),
        canais: config?.channels || ['Geral'],
        metricas: ['conv_lcto', 'conv_12m', 'diff', 'uplift', 'rep'],
      },
      runQuery: async (fn, args) => (await runQuery(inp.client, inp.slug, fn, args)) ?? { status: 'erro', motivo: 'sem base' },
      registerTable: (table, _summary) => {
        const key = `q-${inp.resultId}-${qn++}`;
        dataset[key] = { dims: table.dims, filters: table.filters, rows: table.rows };
        datasetChanged = true;
        return key;
      },
      validate: (modal) => validate(widgetsOf(modal)),
    };
    const r = await generateModalDeep(inp.prompt, cardCtx, catalog, deps, inp.prev);
    mocked = r.mocked;
    const ws = widgetsOf(r.modal);
    errors = validate(ws);
    if (errors.length === 0) widgets = ws;
  } else {
    for (let attempt = 0; attempt < 2; attempt++) {
      const repair = attempt === 0 ? undefined : `A saída anterior foi rejeitada: ${errors.join('; ')}. Corrija usando só tabelas/colunas do catálogo.`;
      const r = await generateModal(inp.prompt, cardCtx, catalog, repair, inp.prev);
      mocked = r.mocked;
      const ws = widgetsOf(r.modal);
      errors = validate(ws);
      if (errors.length === 0) { widgets = ws; break; }
      if (mocked) break;
    }
  }

  if (!widgets) throw new Error(`detalhamento inválido: ${errors.join('; ')}`);
  widgets.forEach((w, i) => { if (!w.id) (w as { id: string }).id = `${inp.resultId}-w${i}`; });
  return { widgets, mocked, datasetChanged, dataset };
}
