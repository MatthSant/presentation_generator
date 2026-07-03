/* validate.ts — runtime validation of the 3 layers.
 *
 * Inputs are untrusted JSON (typed `unknown`). Errors are collected, not thrown,
 * each pinpointing layer + path + message so a bad file fails early and loud:
 *   - `npm run validate` (skill checks before serving)
 *   - server (structured 4xx instead of a white screen)
 *   - renderer (invalid widget → clear error card) */

import {
  WIDGET_TYPES, BINDABLE_TYPES,
  type DataMap, type ValidationError, type ValidationResult, type ValidationLayer,
} from './types.js';

const CHART_TYPES = new Set([
  'bar', 'bar-horizontal', 'donut', 'pie', 'line', 'area',
  'mixed', 'stacked', 'radialBar', 'scatter', 'radar', 'treemap',
]);
const COLOR_TOKENS = new Set(['p', 'g', 'a', 'r', 'n']);
const WIDGET_SET = new Set<string>(WIDGET_TYPES);
const BINDABLE_SET = new Set<string>(BINDABLE_TYPES);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNonEmptyStr = (v: unknown): v is string => isStr(v) && v.trim().length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

class Collector {
  readonly errors: ValidationError[] = [];
  constructor(private layer: ValidationLayer) {}
  err(path: string, message: string): void {
    this.errors.push({ layer: this.layer, path, message });
  }
}

/* ─────────────────────────────  Dataset  ───────────────────────────── */

export function validateDataset(data: unknown): ValidationError[] {
  const c = new Collector('dataset');
  if (!isObj(data)) { c.err('$', 'dataset must be an object of named tables'); return c.errors; }

  for (const [name, table] of Object.entries(data)) {
    const p = name;
    if (!isObj(table)) { c.err(p, 'table must be an object'); continue; }
    if (!Array.isArray(table.dims) || !table.dims.every(isStr)) {
      c.err(`${p}.dims`, 'dims must be an array of column names');
    }
    if (table.filters !== undefined && (!Array.isArray(table.filters) || !table.filters.every(isStr))) {
      c.err(`${p}.filters`, 'filters must be an array of column names');
    }
    if (!Array.isArray(table.rows)) {
      c.err(`${p}.rows`, 'rows must be an array');
      continue;
    }
    const dims = Array.isArray(table.dims) ? (table.dims as string[]) : [];
    table.rows.forEach((row, i) => {
      if (!isObj(row)) { c.err(`${p}.rows[${i}]`, 'row must be an object'); return; }
      for (const d of dims) {
        if (!(d in row)) c.err(`${p}.rows[${i}]`, `missing dimension column "${d}"`);
      }
    });
  }
  return c.errors;
}

/** Column names present across a table's rows, for bind checks. */
function tableColumns(table: unknown): Set<string> {
  const cols = new Set<string>();
  if (isObj(table) && Array.isArray(table.rows)) {
    for (const r of table.rows) if (isObj(r)) for (const k of Object.keys(r)) cols.add(k);
  }
  return cols;
}

/** True when at least one row carries a real number under `col` — i.e. the column
 *  is plottable. Display tables hold formatted strings ("16,7%"), which aren't. */
function isNumericColumn(datasets: DataMap | undefined, dataset: unknown, col: string): boolean {
  if (!datasets || !isStr(dataset)) return true;     // can't verify → don't block
  const table = datasets[dataset] as unknown;
  if (!isObj(table) || !Array.isArray(table.rows)) return true;
  return table.rows.some((r) => isObj(r) && typeof r[col] === 'number');
}

/* ─────────────────────────────  View / Section  ───────────────────────────── */

function validateBind(c: Collector, path: string, bind: unknown, datasets?: DataMap): void {
  if (!isObj(bind)) { c.err(path, 'bind must be an object'); return; }
  if (!isNonEmptyStr(bind.dataset)) { c.err(`${path}.dataset`, 'bind.dataset is required'); return; }
  if (!datasets) return;                      // dataset not provided → skip column checks

  const table = datasets[bind.dataset];
  if (!table) { c.err(`${path}.dataset`, `dataset "${bind.dataset}" does not exist`); return; }

  const cols = tableColumns(table);
  const checkCol = (field: string, val: unknown) => {
    if (val === undefined) return;
    if (!isStr(val)) { c.err(`${path}.${field}`, `${field} must be a string`); return; }
    if (!cols.has(val)) c.err(`${path}.${field}`, `column "${val}" not in dataset "${bind.dataset}"`);
  };
  checkCol('x', bind.x);
  // y pode ser uma coluna ou um array de colunas (uma série por coluna).
  if (Array.isArray(bind.y)) bind.y.forEach((col, i) => checkCol(`y[${i}]`, col));
  else checkCol('y', bind.y);
  checkCol('series', bind.series);
  if (bind.metrics !== undefined) {
    if (!Array.isArray(bind.metrics)) c.err(`${path}.metrics`, 'metrics must be an array');
    else bind.metrics.forEach((m, i) => checkCol(`metrics[${i}]`, m));
  }
  if (bind.where !== undefined) {
    if (!isObj(bind.where)) { c.err(`${path}.where`, 'where must be an object of column → value'); }
    else for (const [col, val] of Object.entries(bind.where)) {
      if (!cols.has(col)) c.err(`${path}.where.${col}`, `column "${col}" not in dataset "${bind.dataset}"`);
      if (!(isStr(val) || isNum(val))) c.err(`${path}.where.${col}`, 'where value must be a string or number');
    }
  }
}

function validateWidget(c: Collector, path: string, w: unknown, datasets?: DataMap): void {
  if (!isObj(w)) { c.err(path, 'widget must be an object'); return; }
  if (!isNonEmptyStr(w.id)) c.err(`${path}.id`, 'widget id is required');
  if (!isStr(w.type) || !WIDGET_SET.has(w.type)) {
    c.err(`${path}.type`, `unknown widget type "${String(w.type)}"`);
    return;
  }
  const type = w.type;
  const hasBind = isObj(w.bind);
  if (hasBind && !BINDABLE_SET.has(type)) {
    c.err(`${path}.bind`, `type "${type}" does not accept a bind`);
  }
  if (hasBind) validateBind(c, `${path}.bind`, w.bind, datasets);

  switch (type) {
    case 'kpi':
      if (!isNonEmptyStr(w.label)) c.err(`${path}.label`, 'kpi label is required');
      if (!hasBind && w.value === undefined) {
        c.err(`${path}.value`, 'kpi value is required when there is no bind');
      }
      if (w.color !== undefined && !COLOR_TOKENS.has(w.color as string)) {
        c.err(`${path}.color`, `invalid color token "${String(w.color)}"`);
      }
      break;
    case 'chart':
      if (!isStr(w.chartType) || !CHART_TYPES.has(w.chartType)) {
        c.err(`${path}.chartType`, `invalid chartType "${String(w.chartType)}"`);
      }
      if (!hasBind && w.series === undefined) {
        c.err(`${path}.series`, 'chart requires inline series when there is no bind');
      }
      // A chart's y must be a NUMERIC column — a formatted-string column (e.g. the
      // display "*_detail" tables: "16,7%") resolves to 0 and renders an empty chart.
      if (hasBind && datasets) {
        const b = w.bind as Obj;
        const ys = Array.isArray(b.y) ? b.y : (b.y !== undefined ? [b.y] : []);
        for (const yc of ys) {
          if (isStr(yc) && !isNumericColumn(datasets, b.dataset, yc)) {
            c.err(`${path}.bind.y`, `chart y "${yc}" is not numeric — bind to a numeric column (e.g. *_rank / *_grp), not a formatted *_detail column`);
          }
        }
      }
      break;
    case 'table':
      if (!Array.isArray(w.cols)) c.err(`${path}.cols`, 'table requires a cols array');
      if (!hasBind && !Array.isArray(w.rows)) {
        c.err(`${path}.rows`, 'table requires rows when there is no bind');
      }
      break;
    case 'heatmap':
      if (!hasBind) {
        if (!Array.isArray(w.cols)) c.err(`${path}.cols`, 'heatmap requires a cols array when there is no bind');
        if (!Array.isArray(w.rows)) c.err(`${path}.rows`, 'heatmap requires a rows array when there is no bind');
        else w.rows.forEach((r, i) => {
          if (!isObj(r) || !isStr(r.label) || !Array.isArray(r.cells)) {
            c.err(`${path}.rows[${i}]`, 'heatmap row needs { label, cells[] }');
          }
        });
      }
      break;
    case 'rank-card':
      if (!hasBind && !Array.isArray(w.cards)) {
        c.err(`${path}.cards`, 'rank-card requires cards[] when there is no bind');
      }
      if (Array.isArray(w.cards)) w.cards.forEach((card, i) => {
        if (!isObj(card) || !isNonEmptyStr(card.name)) {
          c.err(`${path}.cards[${i}]`, 'rank card needs a name');
        }
      });
      break;
    case 'find-block':
      if (!isNonEmptyStr(w.title)) c.err(`${path}.title`, 'find-block title is required');
      if (w.tagColor !== undefined && !COLOR_TOKENS.has(w.tagColor as string)) {
        c.err(`${path}.tagColor`, `invalid tagColor "${String(w.tagColor)}"`);
      }
      break;
    case 'ni':
    case 'ni-vertical':
      if (!isNonEmptyStr(w.title)) c.err(`${path}.title`, 'ni title is required');
      break;
    case 'highlight':
    case 'find-note':
    case 'request':
    case 'xs':
    case 'label-sec':
      if (!isNonEmptyStr(w.text)) c.err(`${path}.text`, `${type} text is required`);
      break;
    case 'embed':
      // url é OPCIONAL: sem ela o embed vira um placeholder ("preview indisponível" —
      // ex.: criativo sem link no dicionário). O renderer já trata os dois casos.
      if (w.url !== undefined && !isStr(w.url)) c.err(`${path}.url`, 'embed url must be a string');
      break;
    case 'link-card':
      if (!Array.isArray(w.cards)) c.err(`${path}.cards`, 'link-card requires a cards array');
      break;
    case 'scatter-picker':
      if (!Array.isArray(w.metrics)) c.err(`${path}.metrics`, 'scatter-picker requires a metrics array');
      if (!Array.isArray(w.points)) c.err(`${path}.points`, 'scatter-picker requires a points array');
      break;
    case 'evolution-picker':
      if (!Array.isArray(w.metrics)) c.err(`${path}.metrics`, 'evolution-picker requires a metrics array');
      if (!Array.isArray(w.points)) c.err(`${path}.points`, 'evolution-picker requires a points array');
      break;
    case 'qa-card': {
      if (!isNonEmptyStr(w.title)) c.err(`${path}.title`, 'qa-card title is required');
      const ch = w.chart as Obj | undefined;
      if (ch && isObj(ch) && isObj(ch.bind) && datasets) {
        const b = ch.bind as Obj;
        if (b.y !== undefined && isStr(b.y) && !isNumericColumn(datasets, b.dataset, b.y)) {
          c.err(`${path}.chart.bind.y`, `qa-card chart y "${b.y}" is not numeric`);
        }
      }
      break;
    }
    case 'funnel':
      if (!Array.isArray(w.steps) || w.steps.length === 0) c.err(`${path}.steps`, 'funnel requires a steps array');
      break;
    case 'strat-grid':
      if (!Array.isArray(w.cols) || w.cols.length === 0) c.err(`${path}.cols`, 'strat-grid requires a cols array');
      break;
    case 'bar-list':
      if (!Array.isArray(w.rows) || w.rows.length === 0) c.err(`${path}.rows`, 'bar-list requires a rows array');
      break;
    case 'cri-list':
      if (!Array.isArray(w.rows) || w.rows.length === 0) c.err(`${path}.rows`, 'cri-list requires a rows array');
      break;
    case 'meta-bars':
      if (!Array.isArray(w.rows) || w.rows.length === 0) c.err(`${path}.rows`, 'meta-bars requires a rows array');
      break;
    case 'escopo-cards':
      if (!Array.isArray(w.cards) || w.cards.length === 0) c.err(`${path}.cards`, 'escopo-cards requires a cards array');
      break;
    case 'channel-table':
      if (!Array.isArray(w.cols)) c.err(`${path}.cols`, 'channel-table requires a cols array');
      if (!Array.isArray(w.rows)) c.err(`${path}.rows`, 'channel-table requires a rows array');
      break;
    case 'bullet-groups':
      if (!Array.isArray(w.toggle) || w.toggle.length === 0) c.err(`${path}.toggle`, 'bullet-groups requires a toggle array');
      if (!Array.isArray(w.groups) || w.groups.length === 0) c.err(`${path}.groups`, 'bullet-groups requires a groups array');
      if (!Array.isArray(w.channels) && !(w.dims && typeof w.dims === 'object')) c.err(`${path}.channels`, 'bullet-groups requires a channels array or dims map');
      break;
    case 'quadrant-scatter':
      if (!Array.isArray(w.points)) c.err(`${path}.points`, 'quadrant-scatter requires a points array');
      if (!w.modes || typeof w.modes !== 'object' || !(w.modes as { meta?: unknown }).meta) c.err(`${path}.modes`, 'quadrant-scatter requires modes.meta');
      break;
    case 'def-step':
    case 'mdef-block':
      if (!isNonEmptyStr(w.title)) c.err(`${path}.title`, `${type} title is required`);
      break;
    case 'eyebrow':
      if (!isNonEmptyStr(w.title)) c.err(`${path}.title`, 'eyebrow title is required');
      break;
    case 'grp-list':
      if (!Array.isArray(w.items) || w.items.length === 0) c.err(`${path}.items`, 'grp-list requires an items array');
      break;
    case 'kpi-strip':
      if (!Array.isArray(w.items) || w.items.length === 0) c.err(`${path}.items`, 'kpi-strip requires an items array');
      break;
    case 'kpi-card':
      if (!isNonEmptyStr(w.label)) c.err(`${path}.label`, 'kpi-card label is required');
      if (!isNonEmptyStr(String(w.value ?? ''))) c.err(`${path}.value`, 'kpi-card value is required');
      break;
    case 'metric-toggle':
      if (!Array.isArray(w.metrics) || w.metrics.length === 0) c.err(`${path}.metrics`, 'metric-toggle requires a metrics array');
      if (!isNonEmptyStr(w.current)) c.err(`${path}.current`, 'metric-toggle current is required');
      break;
    case 'chart-toggle':
      if (!Array.isArray(w.tabs) || w.tabs.length === 0) c.err(`${path}.tabs`, 'chart-toggle requires a tabs array');
      else w.tabs.forEach((t, i) => {
        if (!isObj(t) || !isObj((t as Obj).chart)) c.err(`${path}.tabs[${i}].chart`, 'chart-toggle tab requires a chart');
      });
      break;
    case 'chart-table':
      if (!isObj(w.chart)) c.err(`${path}.chart`, 'chart-table requires a chart');
      break;
    case 'heatmap-toggle': {
      // Duas formas: `tabs[]` (toggle único de dimensão) ou `scopes[].tabs[]`
      // (toggle de escopo + dimensão). Exige pelo menos uma; cada aba precisa de bind.
      const tabs = Array.isArray(w.tabs) ? w.tabs : [];
      const scopes = Array.isArray(w.scopes) ? w.scopes : [];
      if (tabs.length === 0 && scopes.length === 0) {
        c.err(`${path}.tabs`, 'heatmap-toggle requires tabs[] or scopes[]');
      }
      const allTabs = [...tabs, ...scopes.flatMap((s) => (isObj(s) && Array.isArray((s as Obj).tabs) ? (s as Obj).tabs as unknown[] : []))];
      allTabs.forEach((t, i) => {
        if (!isObj(t) || !isObj((t as Obj).bind)) c.err(`${path}.tabs[${i}].bind`, 'heatmap-toggle tab requires a bind');
      });
      break;
    }
  }
}

export function validateSection(section: unknown, datasets?: DataMap): ValidationError[] {
  const c = new Collector('view');
  if (!isObj(section)) { c.err('$', 'section must be an object'); return c.errors; }
  if (!isNonEmptyStr(section.id)) c.err('id', 'section id is required');
  if (!isObj(section.header) || !isNonEmptyStr((section.header as Obj).title)) {
    c.err('header.title', 'section header.title is required');
  }
  if (!Array.isArray(section.widgets)) {
    c.err('widgets', 'widgets must be an array');
    return c.errors;
  }
  const seen = new Set<string>();
  section.widgets.forEach((w, i) => {
    validateWidget(c, `widgets[${i}]`, w, datasets);
    if (isObj(w) && isStr(w.id)) {
      if (seen.has(w.id)) c.err(`widgets[${i}].id`, `duplicate widget id "${w.id}"`);
      seen.add(w.id);
    }
  });
  if (section.modals !== undefined) {
    if (!Array.isArray(section.modals)) c.err('modals', 'modals must be an array');
    else section.modals.forEach((m, i) => {
      if (!isObj(m) || !isNonEmptyStr(m.id)) { c.err(`modals[${i}].id`, 'modal id is required'); return; }
      if (m.widgets !== undefined) {
        if (!Array.isArray(m.widgets)) c.err(`modals[${i}].widgets`, 'modal widgets must be an array');
        else m.widgets.forEach((mw, j) => validateWidget(c, `modals[${i}].widgets[${j}]`, mw, datasets));
      }
    });
  }
  return c.errors;
}

/* ─────────────────────────────  Layout  ───────────────────────────── */

export function validateLayout(layout: unknown): ValidationError[] {
  const c = new Collector('layout');
  if (!isObj(layout)) { c.err('$', 'layout must be an object'); return c.errors; }
  if (layout.sections === undefined) return c.errors;        // empty layout is valid
  if (!isObj(layout.sections)) { c.err('sections', 'sections must be an object'); return c.errors; }

  for (const [secId, items] of Object.entries(layout.sections)) {
    if (!Array.isArray(items)) { c.err(`sections.${secId}`, 'must be an array of items'); continue; }
    items.forEach((it, i) => {
      const p = `sections.${secId}[${i}]`;
      if (!isObj(it)) { c.err(p, 'layout item must be an object'); return; }
      if (!isNonEmptyStr(it.id)) c.err(`${p}.id`, 'layout item id is required');
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        if (!isNum(it[k])) c.err(`${p}.${k}`, `${k} must be a number`);
      }
    });
  }
  return c.errors;
}

/* ─────────────────────────────  Combined  ───────────────────────────── */

export function validateAnalysis(input: {
  dataset?: unknown;
  sections?: unknown[];
  layout?: unknown;
}): ValidationResult {
  const errors: ValidationError[] = [];
  let datasets: DataMap | undefined;

  if (input.dataset !== undefined) {
    const dsErrors = validateDataset(input.dataset);
    errors.push(...dsErrors);
    if (dsErrors.length === 0) datasets = input.dataset as DataMap;
  }
  for (const s of input.sections ?? []) errors.push(...validateSection(s, datasets));
  if (input.layout !== undefined) errors.push(...validateLayout(input.layout));

  return { ok: errors.length === 0, errors };
}
