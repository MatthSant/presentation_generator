/* renderer.ts — widget → DOM. The only module that knows design-system classes.
 *
 * Numbers come from `ctx.resolve(bind)` (dataset + active filters), never from
 * the view JSON. Unknown widgets render an error card; bound widgets with no
 * rows render an empty state — the dashboard never goes blank or throws. */

import type {
  Widget, Bind, ResolvedBind, KpiWidget, ChartWidget, TableWidget,
  HeatmapWidget, HeatRow, HeatCell, FindBlockWidget, FindNoteWidget, HighlightWidget, NiWidget,
  LabelSecWidget, RequestWidget, XsWidget, TableCell,
  DefStepWidget, MdefBlockWidget, GrpListWidget, RankCardWidget, RankCard, RankClass,
  EyebrowWidget, KpiStripWidget, HeatmapToggleWidget, ChartToggleWidget,
} from '../shared/types.js';
import { formatValue } from './format.js';
import { defFromResolved, type ChartDef } from './charts.js';

export interface RenderCtx {
  /** Resolve a bind against the loaded datasets + active filters, or null if unbound/error. */
  resolve(bind?: Bind): ResolvedBind | null;
  /** Collector for charts that must be instantiated after DOM insertion. */
  charts: { elId: string; def: ChartDef }[];
  /** Chart canvas height (px) derived from the saved layout cell, if any. When
   *  present it overrides the widget's authored height so the read path renders
   *  charts at the size the editor saved instead of a fixed default. */
  chartHeight?(widgetId: string): number | undefined;
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
  d.append(
    el('div', 'widget-error-tag', 'Bloco não exibido'),
    el('div', 'widget-error-hint', 'Não foi possível carregar este bloco. Os demais continuam disponíveis.'),
    el('div', 'widget-error-msg', `${type}: ${detail}`),
  );
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

  const height = ctx.chartHeight?.(w.id) ?? w.height;
  // First-class chart variants (scatter trend-line, donut center total, slice
  // labels, mixed secondary axis) — passed straight through to the builder.
  const variant = {
    trend: w.trend, donutTotal: w.donutTotal, totalLabel: w.totalLabel,
    showLabels: w.showLabels, secondaryAxis: w.secondaryAxis, secondaryAxisSuffix: w.secondaryAxisSuffix,
  };
  let def: ChartDef | null = null;
  if (w.bind) {
    const resolved = ctx.resolve(w.bind);
    if (!resolved || resolved.series.length === 0 || resolved.series.every(s => s.data.length === 0)) {
      wrap.appendChild(empty());
      return wrap;
    }
    def = defFromResolved(w.chartType, resolved, {
      height, colors: w.colors, distributed: w.distributed, diverging: w.diverging, pct: w.pct,
      axisMin: w.axisMin, axisMax: w.axisMax, meanLine: w.meanLine,
      stackType: w.stackType, options: w.options, ...variant,
    });
  } else if (w.series != null) {
    def = {
      type: w.chartType, series: w.series, categories: w.categories, labels: w.labels,
      colors: w.colors, distributed: w.distributed, diverging: w.diverging, pct: w.pct, axisMin: w.axisMin, axisMax: w.axisMax, meanLine: w.meanLine, stackType: w.stackType,
      height, options: w.options, ...variant,
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

/* ── eyebrow ── numbered zone separator (badge + title + caption + rule) */
function renderEyebrow(w: EyebrowWidget): HTMLElement {
  const wrap = el('div', `grp-eyebrow${w.color && w.color !== 'purple' ? ` ge-${w.color}` : ''}`);
  if (w.n != null && w.n !== '') wrap.appendChild(el('span', 'ge-i', String(w.n)));
  wrap.appendChild(el('span', 'ge-t', w.title));
  if (w.caption) wrap.appendChild(el('span', 'ge-c', w.caption));
  wrap.appendChild(el('span', 'ge-rule'));
  return wrap;
}

/* ── kpi-strip ── a row of tabular KPIs */
function renderKpiStrip(w: KpiStripWidget): HTMLElement {
  const wrap = el('div', 'kpi-strip');
  for (const item of w.items || []) {
    const k = el('div', 'kpi');
    const n = el('div', item.small ? 'kpi-n kpi-n--sm' : 'kpi-n');
    n.innerHTML = String(item.value).replace(/\s\/\s/g, '<span class="kpi-sep">/</span>');
    k.append(n, el('div', 'kpi-l', item.label));
    wrap.appendChild(k);
  }
  return wrap;
}

/* ── heat class from a cell value ── diverging diff scale or long-term uplift scale */
function heatClass(value: unknown, scale: 'diff' | 'uplift' | 'amp' | 'surv'): string {
  const n = parseFloat(String(value).replace(/−/g, '-').replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n)) return '';
  if (scale === 'amp') {            // amplitude / relevância (% vs benchmark)
    if (n >= 30) return 'cup';
    if (n >= 12) return 'cup3';
    return 'cn0';
  }
  if (scale === 'surv') {           // independência (% do sinal que sobrevive)
    return n >= 50 ? 'cp' : 'cn';
  }
  if (scale === 'uplift') {
    if (n <= 0) return 'cn0';
    if (n >= 80) return 'cup';
    if (n >= 50) return 'cup2';
    if (n >= 25) return 'cup3';
    return 'cup4';
  }
  if (n >= 70) return 'csp';
  if (n >= 25) return 'cp2';
  if (n >= 8) return 'cp';
  if (n > -8) return 'cn0';
  if (n > -28) return 'cn';
  if (n > -60) return 'csn';
  return 'cxn';
}

/* ── i-info badge ── small "i" with a native tooltip carrying the metric definition */
function infoBadge(def: string): HTMLElement {
  const i = el('span', 'th-i', 'i');
  i.title = def;
  i.setAttribute('aria-label', def);
  return i;
}

/* ── chart-toggle ── one card, N chart configs, switched by a segmented toggle.
 *  Every chart mounts up front (pushed to ctx.charts); the toggle shows/hides them
 *  (a hidden chart re-measures via the ChartManager observer when shown). */
function renderChartToggle(w: ChartToggleWidget, ctx: RenderCtx): HTMLElement {
  const tabs = w.tabs || [];
  const card = el('div', 'hm-card chart-toggle-card');
  const hd = el('div', 'hm-card-hd');
  const tt = el('div', 'tbl-title');
  const name = el('span', 'tt-name', w.title || '');
  const sub = el('span', 'tt-sub');
  tt.append(name, sub);
  const toggle = el('div', 'hm-toggle');
  hd.append(tt, toggle);
  const host = el('div', 'ct-host');
  card.append(hd, host);

  const panes: HTMLElement[] = [];
  tabs.forEach((tab, i) => {
    const pane = el('div', 'ct-pane');
    if (i !== 0) pane.style.display = 'none';
    pane.appendChild(renderChart({ type: 'chart', id: `${w.id}-t${i}`, ...tab.chart } as ChartWidget, ctx));
    host.appendChild(pane);
    panes.push(pane);

    const b = el('button', `hm-seg${i === 0 ? ' hm-seg-on' : ''}`, tab.label) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => {
      panes.forEach((p, j) => { p.style.display = j === i ? 'block' : 'none'; });
      [...toggle.children].forEach((btn, j) => btn.classList.toggle('hm-seg-on', j === i));
      sub.textContent = tab.sub || w.sub || '';
      window.dispatchEvent(new Event('resize')); // re-measure the now-visible chart
    });
    toggle.appendChild(b);
  });
  sub.textContent = tabs[0]?.sub || w.sub || '';
  return card;
}

/* ── table ── */
function renderTable(w: TableWidget, ctx: RenderCtx): HTMLElement {
  const wrap = el('div');
  if (w.title) {
    const tt = el('div', 'tbl-title');
    tt.appendChild(el('span', 'tt-name', w.title));
    if (w.sub) tt.appendChild(el('span', 'tt-sub', w.sub));
    wrap.appendChild(tt);
  }
  const tw = el('div', 'tw');
  const table = el('table');
  const thead = el('thead');
  const hrow = el('tr');
  for (const h of w.cols || []) {
    const th = el('th', '', h);
    const def = w.defs?.[h];
    if (def) { th.appendChild(document.createTextNode(' ')); th.appendChild(infoBadge(def)); }
    hrow.appendChild(th);
  }
  thead.appendChild(hrow);
  table.appendChild(thead);

  const tbody = el('tbody');
  let rows: TableCell[][];
  if (w.bind) {
    const resolved = ctx.resolve(w.bind);
    if (!resolved || resolved.rows.length === 0) { tw.append(table); wrap.append(tw, empty()); return wrap; }
    rows = resolved.rows.map(r => (w.cols || []).map(c => (r[c] ?? '') as TableCell));
  } else {
    rows = w.rows || [];
  }

  const cols = w.cols || [];
  for (const r of rows) {
    const tr = el('tr');
    r.forEach((cell, i) => {
      const td = el('td');
      const value = (cell && typeof cell === 'object') ? cell.value : cell;
      td.textContent = formatValue(value);
      if (cell && typeof cell === 'object') {
        if (cell.cls) td.classList.add(cell.cls);
        if (cell.title) td.title = cell.title;
      }
      const scale = w.colorScale?.[cols[i]];
      if (scale) { const cls = heatClass(value, scale); if (cls) td.classList.add(cls); }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tw.appendChild(table);
  wrap.appendChild(tw);
  if (w.caption) wrap.appendChild(el('p', 'xs', w.caption));
  return wrap;
}

/* ── heatmap ── inline rows, or bound (pivot a long-format table so the channel
 *  toggle re-filters it: one dataset row per cell → grid). */
interface HeatSpec { bind?: Bind; rowKey?: string; colKey?: string; valKey?: string; clsKey?: string; titleKey?: string }
function pivotHeatmap(w: HeatSpec, ctx: RenderCtx): { cols: string[]; rows: HeatRow[] } | null {
  const r = ctx.resolve(w.bind);
  if (!r || r.rows.length === 0) return null;
  const rowKey = w.rowKey || 'grupo';
  const colKey = w.colKey || 'lancamento';
  const valKey = w.valKey || 'valor';
  const clsKey = w.clsKey || 'cls';
  const titleKey = w.titleKey;
  const cols: string[] = [];
  const rowOrder: string[] = [];
  const byRow = new Map<string, Map<string, HeatCell>>();
  for (const row of r.rows) {
    const rk = String(row[rowKey] ?? '');
    const ck = String(row[colKey] ?? '');
    if (!cols.includes(ck)) cols.push(ck);
    if (!byRow.has(rk)) { byRow.set(rk, new Map()); rowOrder.push(rk); }
    byRow.get(rk)!.set(ck, {
      value: row[valKey] as string | number,
      cls: row[clsKey] != null ? String(row[clsKey]) : undefined,
      title: titleKey && row[titleKey] != null ? String(row[titleKey]) : undefined,
    });
  }
  const rows: HeatRow[] = rowOrder.map(rk => ({
    label: rk,
    cells: cols.map(ck => byRow.get(rk)!.get(ck) ?? { value: '—' }),
  }));
  return { cols, rows };
}

/** Build a heatmap grid element from cols + rows (shared by heatmap + toggle). */
function buildHeatGrid(cols: string[], rows: HeatRow[]): HTMLElement {
  const grid = el('div', 'hm-grid');
  grid.style.setProperty('--hm-cols', String(cols.length));
  grid.appendChild(el('div'));
  for (const c of cols) grid.appendChild(el('div', 'hm-th', c));
  for (const r of rows) {
    grid.appendChild(el('div', 'hm-rh', r.label));
    for (const cell of r.cells || []) {
      const td = el('div', `hm-cell ${cell.cls || 'hm-n'}`, formatValue(cell.value));
      if (cell.title) td.title = cell.title;
      grid.appendChild(td);
    }
  }
  return grid;
}

function renderHeatmap(w: HeatmapWidget, ctx: RenderCtx): HTMLElement {
  const wrap = el('div', 'hm-wrap');
  let cols = w.cols || [];
  let rows = w.rows || [];
  if (w.bind) {
    const pivoted = pivotHeatmap(w, ctx);
    if (!pivoted) { wrap.appendChild(empty()); return wrap; }
    cols = pivoted.cols;
    rows = pivoted.rows;
  }
  wrap.appendChild(buildHeatGrid(cols, rows));
  if (w.caption) { const cap = el('p', 'xs', w.caption); cap.style.marginTop = '8px'; wrap.appendChild(cap); }
  return wrap;
}

/* ── heatmap-toggle ── one card, N tabs, each a bound heatmap dataset. The tab
 *  count is data-driven; clicking a tab re-pivots with the current filters. */
function renderHeatmapToggle(w: HeatmapToggleWidget, ctx: RenderCtx): HTMLElement {
  const tabs = w.tabs || [];
  const card = el('div', 'hm-card');
  const hd = el('div', 'hm-card-hd');
  const tt = el('div', 'tbl-title');
  const name = el('span', 'tt-name');
  const sub = el('span', 'tt-sub');
  tt.append(name, sub);
  const toggle = el('div', 'hm-toggle');
  hd.append(tt, toggle);
  const host = el('div', 'hm-host');
  card.append(hd, host);

  const show = (idx: number) => {
    const tab = tabs[idx];
    if (!tab) return;
    name.textContent = w.title || tab.label;
    sub.textContent = tab.sub || '';
    const piv = pivotHeatmap(tab, ctx);
    host.replaceChildren(piv ? buildHeatGrid(piv.cols, piv.rows) : empty());
    [...toggle.children].forEach((b, i) => b.classList.toggle('hm-seg-on', i === idx));
  };
  tabs.forEach((tab, i) => {
    const b = el('button', 'hm-seg', tab.label) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => show(i));
    toggle.appendChild(b);
  });
  show(0);
  return card;
}

/* ── rank-card ── consistency ranking; renders its own grid of colored cards.
 *  Bound form re-filters on the channel toggle; inline form via `cards`. */
const RANK_LABEL: Record<RankClass, string> = {
  cons: 'Consistente', pos: 'Positivo', var: 'Variável', neg: 'Negativo', crit: 'Crítico',
};

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function pctSigned(v?: number): string {
  if (v === undefined) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}

function buildRankCard(card: RankCard, pos: number): HTMLElement {
  const cls: RankClass = card.classe || 'var';
  const div = el('div', `rank-card rk-${cls}`);
  const head = el('div', 'rank-pos');
  head.appendChild(el('span', '', `#${pos}`));
  if (card.classe) head.appendChild(el('span', 'rank-cls', RANK_LABEL[cls]));
  div.appendChild(head);
  div.appendChild(el('div', 'rank-name', card.name));
  div.appendChild(el('div', 'rank-diff-main', pctSigned(card.diffMain)));
  if (card.diff12m !== undefined) div.appendChild(el('div', 'rank-diff-12m', `12m: ${pctSigned(card.diff12m)}`));
  const meta = el('div', 'rank-meta');
  if (card.rep !== undefined) meta.appendChild(el('span', '', `Representa ${card.rep.toFixed(0)}% dos leads`));
  if (card.wins !== undefined && card.total !== undefined) {
    meta.appendChild(el('span', '', `${card.wins}/${card.total} lançamentos acima do benchmark`));
  }
  div.appendChild(meta);
  if (card.wins !== undefined && card.total) {
    const barWrap = el('div', 'rank-bar-wrap');
    const fill = el('div', 'rank-bar-fill');
    fill.style.width = `${Math.round((card.wins / card.total) * 100)}%`;
    barWrap.appendChild(fill);
    div.appendChild(barWrap);
  }
  return div;
}

function renderRankCard(w: RankCardWidget, ctx: RenderCtx): HTMLElement {
  const wrap = el('div', 'rank-wrap');
  if (w.title) wrap.appendChild(el('div', 'chart-title', w.title));
  let cards: RankCard[];
  if (w.bind) {
    const r = ctx.resolve(w.bind);
    if (!r || r.rows.length === 0) { wrap.appendChild(empty()); return wrap; }
    const nameK = w.nameKey || 'grupo';
    const mainK = w.mainKey || 'diff_lcto';
    const m12K = w.m12Key || 'diff_12m';
    const repK = w.repKey || 'rep';
    const winsK = w.winsKey || 'wins';
    const totalK = w.totalKey || 'n';
    const classeK = w.classeKey || 'classe';
    cards = r.rows.map(row => ({
      name: String(row[nameK] ?? ''),
      diffMain: num(row[mainK]) ?? 0,
      diff12m: num(row[m12K]),
      rep: num(row[repK]),
      wins: num(row[winsK]),
      total: num(row[totalK]),
      classe: row[classeK] as RankClass | undefined,
    }));
  } else {
    cards = w.cards || [];
  }
  const hasPos = cards.length > 0 && cards.every(c => typeof c.pos === 'number');
  cards = hasPos
    ? [...cards].sort((a, b) => (a.pos as number) - (b.pos as number))
    : [...cards].sort((a, b) => (b.diffMain ?? -Infinity) - (a.diffMain ?? -Infinity));
  const grid = el('div', 'rank-grid');
  cards.forEach((c, i) => grid.appendChild(buildRankCard(c, c.pos ?? i + 1)));
  wrap.appendChild(grid);
  return wrap;
}

/* ── narrative widgets ── */

/** Insight cards embed the takeaway as "…<strong>Implicação:</strong> …". Split it
 *  out so it renders as a labelled footer block (matches the design). */
function splitImplication(detail: string): { body: string; impl: string } {
  const m = detail.match(/(?:<strong>\s*)?implica[çc][ãa]o\s*:?\s*(?:<\/strong>)?\s*:?\s*/i);
  if (!m || m.index === undefined) return { body: detail, impl: '' };
  return { body: detail.slice(0, m.index).trim(), impl: detail.slice(m.index + m[0].length).trim() };
}

function renderFindBlock(w: FindBlockWidget): HTMLElement {
  const color = w.tagColor || 'p';
  const div = el('div', `find-block${w.card ? ' find-block--card' : ''} fb-${color}`);
  if (w.modal) { div.dataset.modal = w.modal; }
  div.appendChild(el('span', `find-tag find-tag-${color}`, w.tag || ''));
  div.appendChild(el('div', 'find-title', w.title || ''));
  if (w.detail) {
    const { body, impl } = splitImplication(w.detail);
    if (body) { const p = el('p', 'sm fb-body'); p.innerHTML = body; div.appendChild(p); }
    if (impl) {
      const f = el('div', 'fb-impl');
      f.appendChild(el('span', 'fb-impl-tag', 'Implicação'));
      const t = el('span', 'fb-impl-txt'); t.innerHTML = impl; f.appendChild(t);
      div.appendChild(f);
    }
  }
  if (w.modal) { const a = el('a', 'fn-link', w.linkLabel || '↗ ver detalhamento'); div.appendChild(a); }
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

/* ── methodology widgets ── bullets may carry inline <strong>/<em>, so each li
 *  is set via innerHTML (same trust model as find-block/ni). */
function bulletList(items: string[]): HTMLElement {
  const ul = el('ul', 'def-bullets');
  for (const b of items) { const li = el('li'); li.innerHTML = b; ul.appendChild(li); }
  return ul;
}

function renderDefStep(w: DefStepWidget): HTMLElement {
  const step = el('div', 'def-step');
  if (w.num) step.appendChild(el('div', 'def-step-num', w.num));
  const body = el('div', 'def-step-body');
  if (w.label) body.appendChild(el('div', 'def-step-label', w.label));
  body.appendChild(el('div', 'def-step-title', w.title || ''));
  if (w.stats?.length) {
    const stats = el('div', 'def-step-stats');
    for (const s of w.stats) {
      const cell = el('div');
      cell.append(
        el('div', s.color ? `def-step-stat-n c-${s.color}` : 'def-step-stat-n', formatValue(s.value)),
        el('div', 'def-step-stat-l', s.label),
      );
      stats.appendChild(cell);
    }
    body.appendChild(stats);
  }
  if (w.bullets?.length) body.appendChild(bulletList(w.bullets));
  step.appendChild(body);
  return step;
}

function renderMdefBlock(w: MdefBlockWidget): HTMLElement {
  const div = el('div', 'mdef-block');
  if (w.tag) div.appendChild(el('div', 'mdef-tag', w.tag));
  div.appendChild(el('div', 'mdef-title', w.title || ''));
  if (w.bullets?.length) div.appendChild(bulletList(w.bullets));
  if (w.subLabel) div.appendChild(el('div', 'mdef-sub-label', w.subLabel));
  if (w.subBullets?.length) div.appendChild(bulletList(w.subBullets));
  return div;
}

function renderGrpList(w: GrpListWidget): HTMLElement {
  const wrap = el('div');
  if (w.label) wrap.appendChild(el('div', 'grp-label', w.label));
  const list = el('div', 'grp-list');
  (w.items || []).forEach((it, i) => {
    const item = el('div', 'grp-item');
    item.appendChild(el('span', 'grp-n', String(i + 1).padStart(2, '0')));
    const body = el('div');
    body.appendChild(el('div', 'grp-name', it.name));
    if (it.example) body.appendChild(el('div', 'grp-ex', it.example));
    item.appendChild(body);
    list.appendChild(item);
  });
  wrap.appendChild(list);
  return wrap;
}

/* ── dispatch ── */
export function renderWidget(widget: Widget, ctx: RenderCtx): HTMLElement {
  try {
    switch (widget.type) {
      case 'kpi':         return renderKpi(widget, ctx);
      case 'kpi-strip':   return renderKpiStrip(widget);
      case 'eyebrow':     return renderEyebrow(widget);
      case 'chart':       return renderChart(widget, ctx);
      case 'table':       return renderTable(widget, ctx);
      case 'heatmap':     return renderHeatmap(widget, ctx);
      case 'heatmap-toggle': return renderHeatmapToggle(widget, ctx);
      case 'chart-toggle': return renderChartToggle(widget, ctx);
      case 'rank-card':   return renderRankCard(widget, ctx);
      case 'find-block':  return renderFindBlock(widget);
      case 'find-note':   return renderFindNote(widget);
      case 'highlight':   return renderHighlight(widget);
      case 'ni':
      case 'ni-vertical': return renderNi(widget);
      case 'label-sec':   return renderLabelSec(widget);
      case 'request':     return renderRequest(widget);
      case 'xs':          return renderXs(widget);
      case 'def-step':    return renderDefStep(widget);
      case 'mdef-block':  return renderMdefBlock(widget);
      case 'grp-list':    return renderGrpList(widget);
      default:            return errorCard((widget as { type: string }).type, 'tipo desconhecido');
    }
  } catch (e) {
    return errorCard(widget.type, (e as Error).message);
  }
}
