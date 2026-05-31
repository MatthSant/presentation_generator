/* renderer.ts — widget → DOM. The only module that knows design-system classes.
 *
 * Numbers come from `ctx.resolve(bind)` (dataset + active filters), never from
 * the view JSON. Unknown widgets render an error card; bound widgets with no
 * rows render an empty state — the dashboard never goes blank or throws. */

import type {
  Widget, Bind, ResolvedBind, KpiWidget, ChartWidget, TableWidget,
  HeatmapWidget, FindBlockWidget, FindNoteWidget, HighlightWidget, NiWidget,
  LabelSecWidget, RequestWidget, XsWidget, TableCell,
} from '../shared/types.js';
import { formatValue } from './format.js';
import { defFromResolved, type ChartDef } from './charts.js';

export interface RenderCtx {
  /** Resolve a bind against the loaded datasets + active filters, or null if unbound/error. */
  resolve(bind?: Bind): ResolvedBind | null;
  /** Collector for charts that must be instantiated after DOM insertion. */
  charts: { elId: string; def: ChartDef }[];
}

function el(tag: string, cls = '', text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function empty(msg = 'Sem dados para este filtro'): HTMLElement {
  return el('div', 'widget-empty', msg);
}

function errorCard(type: string, detail: string): HTMLElement {
  const d = el('div', 'widget-error');
  d.append(el('div', 'widget-error-tag', 'Widget inválido'), el('div', 'widget-error-msg', `${type}: ${detail}`));
  return d;
}

/* ── kpi ── single metric tile (lay several side by side via the layout grid) */
function renderKpi(w: KpiWidget, ctx: RenderCtx): HTMLElement {
  const resolved = ctx.resolve(w.bind);
  const card = el('div', 'mr');
  const mi = el('div', 'mi');
  const mv = el('div', w.color ? `mv c-${w.color}` : 'mv');
  let value: unknown = w.value;
  if (resolved && w.key && w.key in resolved.totals) value = resolved.totals[w.key];
  mv.textContent = formatValue(value, w.format);
  mi.append(mv, el('div', 'ml', w.label));
  card.appendChild(mi);
  return card;
}

/* ── chart ── */
function renderChart(w: ChartWidget, ctx: RenderCtx): HTMLElement {
  const wrap = el('div', 'widget-chart');
  if (w.title) wrap.appendChild(el('div', 'chart-title', w.title));

  let def: ChartDef | null = null;
  if (w.bind) {
    const resolved = ctx.resolve(w.bind);
    if (!resolved || resolved.series.length === 0 || resolved.series.every(s => s.data.length === 0)) {
      wrap.appendChild(empty());
      return wrap;
    }
    def = defFromResolved(w.chartType, resolved, {
      height: w.height, colors: w.colors, distributed: w.distributed,
      stackType: w.stackType, options: w.options,
    });
  } else if (w.series != null) {
    def = {
      type: w.chartType, series: w.series, categories: w.categories, labels: w.labels,
      colors: w.colors, distributed: w.distributed, stackType: w.stackType,
      height: w.height, options: w.options,
    };
  } else {
    wrap.appendChild(empty('Gráfico sem dados'));
    return wrap;
  }

  const cw = el('div', 'chart-wrap');
  cw.id = `chart-${w.id}`;
  wrap.appendChild(cw);
  ctx.charts.push({ elId: cw.id, def });
  return wrap;
}

/* ── table ── */
function renderTable(w: TableWidget, ctx: RenderCtx): HTMLElement {
  const wrap = el('div', 'tw');
  const table = el('table');
  const thead = el('thead');
  const hrow = el('tr');
  for (const h of w.cols || []) hrow.appendChild(el('th', '', h));
  thead.appendChild(hrow);
  table.appendChild(thead);

  const tbody = el('tbody');
  let rows: TableCell[][];
  if (w.bind) {
    const resolved = ctx.resolve(w.bind);
    if (!resolved || resolved.rows.length === 0) { wrap.append(table); wrap.appendChild(empty()); return wrap; }
    rows = resolved.rows.map(r => (w.cols || []).map(c => (r[c] ?? '') as TableCell));
  } else {
    rows = w.rows || [];
  }

  for (const r of rows) {
    const tr = el('tr');
    for (const cell of r) {
      const td = el('td');
      if (cell && typeof cell === 'object') {
        td.textContent = formatValue(cell.value);
        if (cell.cls) td.classList.add(cell.cls);
        if (cell.title) td.title = cell.title;
      } else {
        td.textContent = formatValue(cell);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  if (w.caption) wrap.appendChild(el('p', 'xs', w.caption));
  return wrap;
}

/* ── heatmap ── */
function renderHeatmap(w: HeatmapWidget): HTMLElement {
  const wrap = el('div', 'hm-wrap');
  const grid = el('div', 'hm-grid');
  grid.style.setProperty('--hm-cols', String((w.cols || []).length));
  grid.appendChild(el('div'));
  for (const c of w.cols || []) grid.appendChild(el('div', 'hm-th', c));
  for (const r of w.rows || []) {
    grid.appendChild(el('div', 'hm-rh', r.label));
    for (const cell of r.cells || []) {
      const td = el('div', `hm-cell ${cell.cls || 'hm-n'}`, formatValue(cell.value));
      if (cell.title) td.title = cell.title;
      grid.appendChild(td);
    }
  }
  wrap.appendChild(grid);
  if (w.caption) { const cap = el('p', 'xs', w.caption); cap.style.marginTop = '8px'; wrap.appendChild(cap); }
  return wrap;
}

/* ── narrative widgets ── */
function renderFindBlock(w: FindBlockWidget): HTMLElement {
  const div = el('div', 'find-block');
  if (w.modal) { div.dataset.modal = w.modal; }
  div.appendChild(el('span', `find-tag find-tag-${w.tagColor || 'p'}`, w.tag || ''));
  div.appendChild(el('div', 'find-title', w.title || ''));
  if (w.detail) { const p = el('p', 'sm'); p.innerHTML = w.detail; div.appendChild(p); }
  if (w.modal) div.appendChild(el('span', 'fn-more', '↗ ver detalhamento'));
  return div;
}

function renderFindNote(w: FindNoteWidget): HTMLElement {
  const p = el('p', 'find-note find-note-p');
  p.innerHTML = w.text || '';
  return p;
}

function renderHighlight(w: HighlightWidget): HTMLElement {
  const div = el('div', w.color ? `hl hl-${w.color}` : 'hl');
  if (w.label) div.appendChild(el('span', 'label-sec', w.label));
  const body = el('span');
  body.innerHTML = w.text || '';
  div.appendChild(body);
  return div;
}

function renderNi(w: NiWidget): HTMLElement {
  const div = el('div', 'ni ni-v');
  const head = el('div', 'ni-head');
  head.append(el('div', 'ni-num', String(w.n ?? '')), el('div', 'ni-title', w.title || ''));
  div.appendChild(head);
  if (w.why) {
    const sec = el('div', 'ni-section');
    sec.append(el('span', 'ni-sl', 'Por quê?'));
    const b = el('span', 'ni-sb'); b.innerHTML = w.why; sec.appendChild(b);
    div.appendChild(sec);
  }
  if (w.action) {
    const sec = el('div', 'ni-section');
    sec.append(el('span', 'ni-sl c-g', 'Acionável'));
    const b = el('span', 'ni-sb'); b.innerHTML = w.action; sec.appendChild(b);
    div.appendChild(sec);
  }
  return div;
}

function renderLabelSec(w: LabelSecWidget): HTMLElement {
  const wrap = el('div');
  wrap.appendChild(el('p', 'label-sec', w.text || ''));
  wrap.appendChild(el('div', 'divl'));
  if (w.sub) { const sub = el('p', 'sm'); sub.innerHTML = w.sub; wrap.appendChild(sub); }
  return wrap;
}

function renderRequest(w: RequestWidget): HTMLElement {
  const div = el('div', 'req-block');
  const hd = el('div', 'req-hd');
  hd.append(el('span', 'req-dot'), el('span', 'req-chip', 'Pedido · IA'));
  const done = w.status === 'done';
  hd.appendChild(el('span', `req-status req-status-${done ? 'done' : 'pending'}`, done ? 'Feito' : 'Pendente'));
  div.appendChild(hd);
  div.appendChild(el('div', 'req-text', w.text || ''));
  return div;
}

function renderXs(w: XsWidget): HTMLElement {
  const p = el('p', 'xs');
  p.innerHTML = w.text || '';
  return p;
}

/* ── dispatch ── */
export function renderWidget(widget: Widget, ctx: RenderCtx): HTMLElement {
  try {
    switch (widget.type) {
      case 'kpi':         return renderKpi(widget, ctx);
      case 'chart':       return renderChart(widget, ctx);
      case 'table':       return renderTable(widget, ctx);
      case 'heatmap':     return renderHeatmap(widget);
      case 'find-block':  return renderFindBlock(widget);
      case 'find-note':   return renderFindNote(widget);
      case 'highlight':   return renderHighlight(widget);
      case 'ni':
      case 'ni-vertical': return renderNi(widget);
      case 'label-sec':   return renderLabelSec(widget);
      case 'request':     return renderRequest(widget);
      case 'xs':          return renderXs(widget);
      default:            return errorCard((widget as { type: string }).type, 'tipo desconhecido');
    }
  } catch (e) {
    return errorCard(widget.type, (e as Error).message);
  }
}
