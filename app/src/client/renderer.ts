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
  EyebrowWidget, KpiStripWidget, KpiCardWidget, MetricToggleWidget, HeatmapToggleWidget, ChartToggleWidget, ChartTableWidget, ResolvedSeries,
  EmbedWidget, LinkCardWidget, ScatterPickerWidget, EvolutionPickerWidget, QaCardWidget, FunnelWidget, StratGridWidget, BarListWidget, CriListWidget,
} from '../shared/types.js';
import { formatValue } from './format.js';
import { defFromResolved, buildOptions, valueFmt, type ChartDef } from './charts.js';

export interface RenderCtx {
  /** Resolve a bind against the loaded datasets + active filters, or null if unbound/error. */
  resolve(bind?: Bind): ResolvedBind | null;
  /** Collector for charts that must be instantiated after DOM insertion. */
  charts: { elId: string; def: ChartDef }[];
  /** Chart canvas height (px) derived from the saved layout cell, if any. When
   *  present it overrides the widget's authored height so the read path renders
   *  charts at the size the editor saved instead of a fixed default. */
  chartHeight?(widgetId: string): number | undefined;
  /** True when this widget directly follows an `eyebrow` in the section — its
   *  own title would just repeat the eyebrow label, so header-style widgets
   *  (table, rank-card) suppress it to match the source design. */
  afterEyebrow?: boolean;
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

/** Robust per-series outlier removal — turns outliers into gaps. Combines MAD
 *  (median absolute deviation) and Tukey IQR fences: MAD catches a single big spike
 *  even in sparse series (≈3–4 pts), where IQR fails because the spike inflates Q3
 *  (and 2σ fails because it inflates σ). Used by the per-chart "outliers" toggle.
 *
 *  Cercas DELIBERADAMENTE conservadoras (IQR "far-out" 3×, MAD 5×): numa série
 *  temporal com tendência (ex.: investimento que cresce a cada lançamento) o ponto
 *  mais recente é legítimo, não ruído — cercas apertadas (1.5×IQR / 3.5 MAD) o
 *  cortavam indevidamente. Aqui só sai o pico claramente espúrio (erro de dado),
 *  não o extremo natural de uma tendência. */
function dropOutliers(series: ResolvedSeries[]): ResolvedSeries[] {
  const median = (a: number[]) => { const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  return series.map(s => {
    const nums = s.data.filter((v): v is number => typeof v === 'number');
    if (nums.length < 5) return s;
    const sorted = [...nums].sort((a, b) => a - b);
    const med = median(sorted);
    const mad = median(nums.map(v => Math.abs(v - med)).sort((a, b) => a - b));
    const q = (p: number) => { const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
    const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
    const madThr = mad > 0 ? 5 * 1.4826 * mad : Infinity;
    const lo = iqr > 0 ? q1 - 3 * iqr : -Infinity, hi = iqr > 0 ? q3 + 3 * iqr : Infinity;
    // Só remove um ponto se AMBAS as cercas robustas concordam que é espúrio — uma
    // sozinha dispara fácil demais no extremo de uma tendência (a queixa original).
    const madOut = (v: number) => Math.abs(v - med) > madThr;
    const tukeyOut = (v: number) => v < lo || v > hi;
    const isOut = (v: number) => madOut(v) && tukeyOut(v);
    if (madThr === Infinity && !(iqr > 0)) return s;
    return { name: s.name, data: s.data.map(v => (typeof v === 'number' && isOut(v)) ? null : v) };
  });
}

/* ── chart ── */
function renderChart(w: ChartWidget, ctx: RenderCtx): HTMLElement {
  const wrap = el('div', 'widget-chart');
  if (w.title || w.badge) {
    const head = el('div', 'chart-head');
    if (w.title) head.appendChild(el('div', 'chart-title', w.title));
    if (w.badge) head.appendChild(el('span', `pill ${PILL_TONE[w.badge.tone || 'neutral']} chart-badge`, w.badge.text));
    wrap.appendChild(head);
  }
  if (w.headline) {
    wrap.appendChild(el('div', 'chart-headline', w.headline.value));
    if (w.headline.caption) wrap.appendChild(el('div', 'chart-headline-cap', w.headline.caption));
  }

  const height = ctx.chartHeight?.(w.id) ?? w.height;
  // First-class chart variants (scatter trend-line, donut center total, slice
  // labels, mixed secondary axis) — passed straight through to the builder.
  const variant = {
    trend: w.trend, donutTotal: w.donutTotal, totalLabel: w.totalLabel,
    showLabels: w.showLabels, legendValues: w.legendValues, secondaryAxis: w.secondaryAxis, secondaryAxisSuffix: w.secondaryAxisSuffix,
    dashLast: w.dashLast, valueFormat: w.valueFormat, goalLines: w.goalLines, highlightLast: w.highlightLast,
  };
  let def: ChartDef | null = null;
  if (w.bind) {
    const resolved = ctx.resolve(w.bind);
    if (!resolved || resolved.series.length === 0 || resolved.series.every(s => s.data.length === 0)) {
      wrap.appendChild(empty());
      return wrap;
    }
    const series = (w as { outliers?: boolean }).outliers ? dropOutliers(resolved.series) : resolved.series;
    def = defFromResolved(w.chartType, { categories: resolved.categories, series }, {
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
  // Legenda das linhas de meta abaixo do gráfico — assim os rótulos saem de cima das
  // barras (cobriam as últimas) e ganham swatch tracejado, como no padrão da fonte.
  if (w.goalLines?.length) wrap.appendChild(goalLegend(w, def));
  return wrap;
}

/** Legenda inferior para gráficos com linhas de meta: série(s) sólida(s) + cada meta
 *  como swatch tracejado colorido. Mantém os rótulos fora da área de plotagem. */
function goalLegend(w: ChartWidget, def: ChartDef | null): HTMLElement {
  const lg = el('div', 'chart-goal-legend');
  const srcSeries = Array.isArray(w.series) ? w.series : (Array.isArray(def?.series) ? def!.series : []);
  const primColor = (w.colors && w.colors[w.colors.length - 1]) || '#7C3AED';
  for (const s of srcSeries as { name?: string }[]) {
    if (!s?.name) continue;
    const item = el('span', 'cgl-item');
    const sw = el('span', 'cgl-sw'); sw.style.background = primColor;
    item.append(sw, el('span', 'cgl-lbl', s.name));
    lg.appendChild(item);
  }
  for (const g of w.goalLines || []) {
    const item = el('span', 'cgl-item');
    const sw = el('span', 'cgl-sw cgl-sw--dash'); sw.style.color = g.color || '#EF9F27';
    item.append(sw, el('span', 'cgl-lbl', g.label || ''));
    lg.appendChild(item);
  }
  return lg;
}

/* ── eyebrow ── numbered zone separator (badge + title + caption + rule) */
function renderEyebrow(w: EyebrowWidget): HTMLElement {
  const wrap = el('div', `grp-eyebrow${w.divider ? ' ge-divider' : ''}${w.color && w.color !== 'purple' ? ` ge-${w.color}` : ''}`);
  if (w.n != null && w.n !== '') wrap.appendChild(el('span', 'ge-i', String(w.n)));
  wrap.appendChild(el('span', 'ge-t', w.title));
  if (w.caption) wrap.appendChild(el('span', 'ge-c', w.caption));
  wrap.appendChild(el('span', 'ge-rule'));
  return wrap;
}

/* ── kpi-strip ── a row of tabular KPIs (optional variation `sub` + trend spark) */
function renderKpiStrip(w: KpiStripWidget): HTMLElement {
  const wrap = el('div', 'kpi-strip');
  for (const item of w.items || []) {
    const k = el('div', 'kpi');
    const n = el('div', item.small ? 'kpi-n kpi-n--sm' : 'kpi-n');
    n.innerHTML = String(item.value).replace(/\s\/\s/g, '<span class="kpi-sep">/</span>');
    k.append(n, el('div', 'kpi-l', item.label));
    if (item.sub) k.appendChild(el('div', `kpi-sub kpi-sub--${item.subTone || 'neutral'}`, item.sub));
    if (item.spark && item.spark.length > 1) { const s = sparkSvg(item.spark); if (s) k.appendChild(s); }
    wrap.appendChild(k);
  }
  return wrap;
}

/** Tiny inline trend sparkline (SVG polyline). Nulls are skipped (gaps). */
function sparkSvg(data: (number | null)[]): SVGElement | null {
  const W = 96, H = 20, P = 2;
  const pts = data.map((v, i) => ({ v, i })).filter(p => typeof p.v === 'number') as { v: number; i: number }[];
  if (pts.length < 2) return null;
  const vals = pts.map(p => p.v);
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = (mx - mn) || 1;
  const lastX = data.length - 1 || 1;
  const x = (i: number) => P + (i / lastX) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - mn) / rng) * (H - 2 * P);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'kpi-spark');
  const d = pts.map((p, j) => `${j ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linejoin', 'round'); path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);
  const last = pts[pts.length - 1];
  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('cx', x(last.i).toFixed(1)); dot.setAttribute('cy', y(last.v).toFixed(1));
  dot.setAttribute('r', '1.8'); dot.setAttribute('fill', 'currentColor');
  svg.appendChild(dot);
  return svg;
}

/* tone → base .pill color modifier (kpi deltas, rich table cells) */
const PILL_TONE: Record<string, string> = { pos: 'pill--ok', neg: 'pill--err', neutral: 'pill--neutral' };

/* Modo de comparação (meta | hist) do toggle de plataforma. Os badges com `cmp`
 * leem este modo no render e trocam ao vivo via setCmpMode (sem re-render). */
let cmpMode: 'meta' | 'hist' = 'meta';
export function setCmpMode(m: 'meta' | 'hist'): void {
  cmpMode = m;
  document.querySelectorAll<HTMLElement>('.pill.kc-cmp').forEach((p) => {
    const val = p.dataset[m] ?? '';
    const tone = p.dataset[`${m}Tone`] ?? 'neutral';
    p.textContent = val;
    p.className = `pill ${PILL_TONE[tone] ?? PILL_TONE.neutral} kc-cmp`;
  });
}
export function getCmpMode(): 'meta' | 'hist' { return cmpMode; }

/* ── kpi-card ── one elevated metric card (feature = icon+pill+spark; volume = bar) */
const ICONS: Record<string, string> = {
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.6"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  bolt: '<path d="M13 2.5 L5 13.5 H11 L10 21.5 L19 9.5 H13 Z" fill="currentColor" stroke="none"/>',
  'trending-up': '<path d="M3 17 L9.5 10.5 L13.5 14.5 L21 7"/><path d="M15.5 7 H21 V12.5"/>',
  database: '<ellipse cx="12" cy="5.5" rx="7" ry="2.8"/><path d="M5 5.5 V18 c0 1.55 3.13 2.8 7 2.8 s7 -1.25 7 -2.8 V5.5"/><path d="M5 11.8 c0 1.55 3.13 2.8 7 2.8 s7 -1.25 7 -2.8"/>',
  coin: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.3 V16.7 M9.6 9.2 a2.6 2 0 0 1 4.8 -0.2 M9.6 14.8 a2.6 2 0 0 0 4.8 0.2"/>',
  users: '<circle cx="9" cy="8.5" r="3.1"/><path d="M3 19.5 a6 6 0 0 1 12 0"/><path d="M15.5 5.7 a3.1 3.1 0 0 1 0 5.6 M16.5 13.8 a6 6 0 0 1 4.5 5.7"/>',
  'shopping-cart': '<circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/><path d="M3 4 H5.2 L7.3 15 H18 L20 7 H6"/>',
  'arrow-back-up': '<path d="M9 7 L4.5 11.5 L9 16"/><path d="M4.5 11.5 H14 a5 5 0 0 1 5 5 V18.5"/>',
  refresh: '<path d="M20 11.5 a8 8 0 1 0 -2.2 6.2"/><path d="M20 5 V11.5 H13.5"/>',
  star: '<path d="M12 3 L14.6 9 L21 9.5 L16.1 13.8 L17.7 20 L12 16.5 L6.3 20 L7.9 13.8 L3 9.5 L9.4 9 Z" fill="currentColor" stroke="none"/>',
  'circle-check': '<circle cx="12" cy="12" r="8.8"/><path d="M8 12 l3 3 l5 -6"/>',
  'arrows-left-right': '<path d="M8 6.5 L4 11 H20"/><path d="M16 17.5 L20 13 H4"/>',
  flame: '<path d="M12 3 c2.5 3 4.5 5 4.5 8.5 a4.5 4.5 0 0 1 -9 0 c0 -1.4 .6 -2.6 1.4 -3.6 c.3 1 .9 1.6 1.6 1.9 c-.3 -2.4 .5 -4.8 1.5 -6.8 Z" fill="currentColor" stroke="none"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  'credit-card': '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 9.5h18"/>',
  sprout: '<path d="M12 21V11"/><path d="M12 11c0-3 2-5 5-5 0 3-2 5-5 5Z" fill="currentColor" stroke="none"/><path d="M12 13c0-2.5-2-4-4.5-4 0 2.5 2 4 4.5 4Z" fill="currentColor" stroke="none"/>',
  snowflake: '<path d="M12 2.5v19M3.85 7.25l16.3 9.5M20.15 7.25l-16.3 9.5M9.5 4.3 12 6.8l2.5-2.5M9.5 19.7 12 17.2l2.5 2.5M4.6 11l3.4.9.9-3.4M19.4 13l-3.4-.9-.9 3.4M19.4 11l-3.4.9-.9-3.4M4.6 13l3.4-.9.9 3.4"/>',
};

function iconBox(icon?: string, color?: string): HTMLElement {
  const box = el('div', 'kc-ico');
  if (color) box.style.setProperty('--ic', color);
  if (icon && ICONS[icon]) {
    box.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg>`;
  }
  return box;
}

function barEl(segs: { pct: number; color: string }[]): HTMLElement {
  const bar = el('div', 'kc-bar');
  let used = 0;
  for (const s of segs) {
    const pct = Math.max(0, Math.min(100, s.pct || 0));
    const seg = el('span', 'kc-seg');
    seg.style.width = `${pct}%`; seg.style.background = s.color;
    bar.appendChild(seg); used += pct;
  }
  if (100 - used > 0.5) {
    const t = el('span', 'kc-seg kc-seg--track');
    t.style.width = `${100 - used}%`;
    bar.appendChild(t);
  }
  return bar;
}

function renderKpiCard(w: KpiCardWidget): HTMLElement {
  const feature = w.tier !== 'volume';
  // Banda de atingimento: rótulo + valor à esquerda, % grande à direita. Compacta
  // o card numa faixa horizontal (metas / meta-to-date) sem inventar um componente novo.
  // O tom (pos/neg/neutral) tinge o card inteiro (fundo + borda + rótulo + pill).
  if (feature && w.band) {
    const tone = w.deltaTone || 'neutral';
    const card = el('div', `card kc kc--feature kc--band kc--band-${tone}`);
    const main = el('div', 'kc-band-main');
    main.appendChild(el('div', 'kc-lbl', w.label));
    const val = el('div', 'kc-val');
    val.innerHTML = String(w.value).replace(/\s\/\s/g, '<span class="kpi-sep">/</span>');
    main.appendChild(val);
    if (w.sub) main.appendChild(el('div', 'kc-sub', w.sub));
    card.appendChild(main);
    if (w.delta) card.appendChild(el('span', `pill ${PILL_TONE[tone] || ''} kc-band-pill`, w.delta));
    return card;
  }
  const tintCls = (w.tier === 'volume' && w.tint) ? ` kc--tint-${w.tint}` : '';
  const emphCls = (feature && w.emph) ? ' kc--emph' : '';
  const card = el('div', `card kc kc--${feature ? 'feature' : 'volume'}${tintCls}${emphCls}`);
  const val = el('div', 'kc-val');
  val.innerHTML = String(w.value).replace(/\s\/\s/g, '<span class="kpi-sep">/</span>');
  if (feature) {
    // Card de KPI no padrão da referência: SEM ícone — label uppercase + (opcional)
    // pill de comparação à direita; valor; "3d: X"; pill de tendência verde/vermelha;
    // linha de meta com ✓/✗.
    const head = el('div', 'kc-head');
    head.appendChild(el('div', 'kc-lbl', w.label));
    if (w.cmp) {
      const cur = w.cmp[cmpMode] || w.cmp.meta;
      const pill = el('span', `pill ${PILL_TONE[cur[1] || 'neutral']} kc-cmp`, cur[0]);
      pill.dataset.meta = w.cmp.meta[0]; pill.dataset.metaTone = w.cmp.meta[1];
      pill.dataset.hist = w.cmp.hist[0]; pill.dataset.histTone = w.cmp.hist[1];
      head.appendChild(pill);
    } else if (w.delta) {
      head.appendChild(el('span', `pill ${PILL_TONE[w.deltaTone || 'neutral']}`, w.delta));
    }
    card.appendChild(head);
    const row = el('div', 'kc-valrow');
    row.appendChild(val);
    // tendência (3d vs início) inline ao lado do valor
    if (w.flag) row.appendChild(el('span', `pill ${PILL_TONE[w.flag.tone || 'neutral']} kc-trend`, w.flag.text));
    if (w.spark && w.spark.length > 1) { const s = sparkSvg(w.spark); if (s) row.appendChild(s); }
    card.appendChild(row);
    if (w.sub) card.appendChild(el('div', 'kc-sub', w.sub));
    if (w.d3) {
      const c = w.d3.tone === 'pos' ? 'c-g' : w.d3.tone === 'neg' ? 'c-r' : 'c-a';
      const dd = el('div', `kc-d3 ${c}`);
      dd.appendChild(document.createTextNode(`3d: ${w.d3.value}`));
      if (w.d3.dir) dd.appendChild(el('span', 'kc-d3-arr', w.d3.dir === 'up' ? ' ↑' : ' ↓'));
      card.appendChild(dd);
    }
    if (w.goal) {
      const g = el('div', 'kc-goal');
      g.appendChild(el('span', 'kc-goal-lbl', w.goal.label));
      if (w.goal.delta) {
        const st = w.goal.status || 'warn';
        const sym = st === 'ok' ? '✓' : st === 'bad' ? '✕' : st === 'warn' ? '⚠' : '';
        g.appendChild(el('span', `kc-goal-val kg-${st}`, sym ? `${w.goal.delta} ${sym}` : w.goal.delta));
      }
      card.appendChild(g);
    }
  } else {
    const head = el('div', 'kc-head');
    head.appendChild(el('span', 'kc-lbl', w.label));
    head.appendChild(iconBox(w.icon, w.iconColor));
    card.appendChild(head);
    card.appendChild(val);
    if (w.sub) card.appendChild(el('div', 'kc-sub', w.sub));
    if (w.delta) card.appendChild(el('span', `pill ${PILL_TONE[w.deltaTone || 'neutral']} kc-vol-delta`, w.delta));
    card.appendChild(barEl(w.bar || []));
  }
  return card;
}

/* ── metric-toggle ── inline indicator selector; recomputes the breakdown below */
function renderMetricToggle(w: MetricToggleWidget): HTMLElement {
  const bar = el('div', 'seg');
  for (const m of w.metrics || []) {
    const b = el('button', 'seg-opt' + (m.id === w.current ? ' active' : ''));
    (b as HTMLButtonElement).type = 'button';
    b.textContent = m.label;
    b.addEventListener('click', () => {
      if (m.id === w.current) return;
      for (const x of bar.children) x.classList.toggle('active', x === b);
      document.dispatchEvent(new CustomEvent('metric-change', { detail: m.id }));
    });
    bar.appendChild(b);
  }
  return bar;
}

/* ── chart-table ── one card: chart on top + comparison table below (full-width) */
function renderChartTable(w: ChartTableWidget, ctx: RenderCtx): HTMLElement {
  const card = el('div', 'card ctbl');
  if (w.title) card.appendChild(el('div', 'ctbl-title', w.title));
  const chart = renderChart({ ...w.chart, title: undefined, outliers: (w as { outliers?: boolean }).outliers }, ctx);
  chart.classList.add('ctbl-chart');
  card.appendChild(chart);
  if (w.table) {
    const table = renderTable({ ...w.table, title: undefined }, ctx);
    table.classList.add('ctbl-table');
    card.appendChild(table);
  }
  return card;
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
  const card = el('div', 'card hm-card chart-toggle-card');
  const hd = el('div', 'hm-card-hd');
  const tt = el('div', 'tbl-title');
  const name = el('span', 'tt-name', w.title || '');
  const sub = el('span', 'tt-sub');
  tt.append(name, sub);
  const toggle = el('div', 'seg seg--soft');
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

    const b = el('button', `seg-opt${i === 0 ? ' active' : ''}`, tab.label) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => {
      panes.forEach((p, j) => { p.style.display = j === i ? 'block' : 'none'; });
      [...toggle.children].forEach((btn, j) => btn.classList.toggle('active', j === i));
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
  if (w.title && !ctx.afterEyebrow) {
    const tt = el('div', 'tbl-title');
    tt.appendChild(el('span', 'tt-name', w.title));
    if (w.sub) tt.appendChild(el('span', 'tt-sub', w.sub));
    wrap.appendChild(tt);
  }
  const tw = el('div', 'tw');
  const table = el('table');
  const thead = el('thead');
  const hrow = el('tr');

  // Resolução DEFENSIVA das colunas de uma tabela bindada: o `cols` é aplicado via
  // r[col], então um RÓTULO ("Tx.Conv") onde a coluna é a chave ("conv") deixaria a
  // célula vazia. Casa exato → case-insensitive; se NENHUMA coluna casar, cai para as
  // colunas reais do dataset — nunca uma tabela inteira vazia por mismatch de nome.
  let rows: TableCell[][];
  let cols: string[] = w.cols || [];
  if (w.bind) {
    const resolved = ctx.resolve(w.bind);
    if (!resolved || resolved.rows.length === 0) { tw.append(table); wrap.append(tw, empty()); return wrap; }
    const keys = Object.keys(resolved.rows[0] || {});
    const byLower = new Map(keys.map(k => [k.toLowerCase(), k]));
    const keyFor = (c: string): string | null => keys.includes(c) ? c : (byLower.get(c.toLowerCase()) ?? null);
    let mapped = (w.cols || []).map(c => ({ label: c, key: keyFor(c) }));
    if (!mapped.length || mapped.every(m => m.key === null)) {
      if (w.cols?.length) console.warn(`table "${w.title || w.id}": colunas ${JSON.stringify(w.cols)} não casam com o dataset (${keys.join(', ')}); usando as colunas reais.`);
      mapped = keys.map(k => ({ label: k, key: k }));
    }
    cols = mapped.map(m => m.label);
    rows = resolved.rows.map(r => mapped.map(m => (m.key ? (r[m.key] ?? '') : '') as TableCell));
  } else {
    rows = w.rows || [];
  }

  for (const h of cols) {
    const th = el('th', '', h);
    const def = w.defs?.[h];
    if (def) { th.appendChild(document.createTextNode(' ')); th.appendChild(infoBadge(def)); }
    hrow.appendChild(th);
  }
  thead.appendChild(hrow);
  table.appendChild(thead);

  const tbody = el('tbody');
  for (const r of rows) {
    const tr = el('tr');
    r.forEach((cell, i) => {
      const td = el('td');
      const value = (cell && typeof cell === 'object') ? cell.value : cell;
      const obj = (cell && typeof cell === 'object') ? cell : null;
      if (obj && obj.delta) {
        td.classList.add('td-metric');
        td.appendChild(el('span', 'tm-val', formatValue(value)));
        td.appendChild(el('span', `pill ${PILL_TONE[obj.tone || 'neutral']} tm-pill`, obj.delta));
        if (obj.rel) td.appendChild(el('span', 'tm-rel', obj.rel));
      } else if (obj && obj.rel) {
        td.classList.add('td-metric');
        td.appendChild(el('span', 'tm-val', formatValue(value)));
        td.appendChild(el('span', 'tm-rel', obj.rel));
      } else if (obj && obj.link) {
        const a = el('a', 'td-link') as HTMLAnchorElement;
        a.href = obj.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = formatValue(value); a.appendChild(el('span', 'td-link-ic', ' ↗'));
        td.appendChild(a);
      } else {
        td.textContent = formatValue(value);
      }
      if (obj) {
        if (obj.cls) td.classList.add(obj.cls);
        if (obj.title) td.title = obj.title;
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
  const card = el('div', 'card hm-card');
  const hd = el('div', 'hm-card-hd');
  const tt = el('div', 'tbl-title');
  const name = el('span', 'tt-name');
  const sub = el('span', 'tt-sub');
  tt.append(name, sub);
  const toggle = el('div', 'seg seg--soft');
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
    [...toggle.children].forEach((b, i) => b.classList.toggle('active', i === idx));
  };
  tabs.forEach((tab, i) => {
    const b = el('button', 'seg-opt', tab.label) as HTMLButtonElement;
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
  if (w.title && !ctx.afterEyebrow) wrap.appendChild(el('div', 'chart-title', w.title));
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

/** Bold currency + percentage figures so the zone color highlights them — the
 *  insight cards emphasise metrics, but generated prose often leaves them plain.
 *  Skipped when the text already carries its own <strong> emphasis. */
function highlightFigures(html: string): string {
  if (/<strong>[^<]*\d/.test(html)) return html;     // model already bolded a figure → leave it
  return html.replace(/(R\$\s?\d[\d.,]*(?:\s?(?:k|mil|M|mi|bi))?|[+\-−]?\d[\d.,]*\s?%)/g, '<strong>$1</strong>');
}

function renderFindBlock(w: FindBlockWidget): HTMLElement {
  const color = w.tagColor || 'p';
  const div = el('div', `find-block${w.card ? ' find-block--card' : ''} fb-${color}`);
  if (w.modal) { div.dataset.modal = w.modal; }
  div.appendChild(el('span', `find-tag find-tag-${color}`, w.tag || ''));
  if (w.stat) {
    const s = el('div', 'find-stat');
    s.appendChild(el('span', 'fs-val', w.stat.value));
    s.appendChild(el('span', `fs-delta sd-${w.stat.tone || 'warn'}`, w.stat.delta));
    if (w.stat.meta) s.appendChild(el('span', 'fs-meta', w.stat.meta));
    div.appendChild(s);
  } else {
    div.appendChild(el('div', 'find-title', w.title || ''));
  }
  if (w.detail) {
    const { body, impl } = splitImplication(w.detail);
    if (body) { const p = el('p', 'sm fb-body'); p.innerHTML = w.card ? highlightFigures(body) : body; div.appendChild(p); }
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

/* ── qa-card ── unidade "pergunta" da Análise 360°: chip + título + grade de
 * números-chave + chips de veredito + 1 gráfico embutido (reusa renderChart). */
function renderQaCard(w: QaCardWidget, ctx: RenderCtx): HTMLElement {
  const color = w.qColor || 'p';
  const card = el('div', `qa-card qa-${color}`);
  const head = el('div', 'qa-head');
  if (w.q) head.appendChild(el('span', `qa-chip qa-chip-${color}`, w.q));
  head.appendChild(el('span', 'qa-title', w.title));
  if (w.verdict) head.appendChild(el('span', `pill ${PILL_TONE[w.verdict.tone || 'neutral']} qa-verdict`, w.verdict.label));
  card.appendChild(head);
  if (w.stats?.length) {
    const grid = el('div', 'qa-stats');
    for (const s of w.stats) {
      const tile = el('div', `qa-stat qa-stat-${s.tone || 'neutral'}`);
      tile.appendChild(el('div', 'qa-stat-l', s.label));
      tile.appendChild(el('div', 'qa-stat-v', s.value));
      if (s.sub || s.delta) {
        const sub = el('div', 'qa-stat-s');
        if (s.sub) sub.appendChild(document.createTextNode(`${s.sub} `));
        if (s.delta) sub.appendChild(el('span', `pill ${PILL_TONE[s.tone === 'pos' ? 'pos' : s.tone === 'neg' ? 'neg' : 'neutral']}`, s.delta));
        tile.appendChild(sub);
      }
      grid.appendChild(tile);
    }
    card.appendChild(grid);
  }
  if (w.chips?.length) {
    const row = el('div', 'qa-chips');
    for (const ch of w.chips) row.appendChild(el('span', `qa-vchip qa-vchip-${ch.tone || 'neutral'}`, `${ch.glyph ? ch.glyph + ' ' : ''}${ch.label}`));
    card.appendChild(row);
  }
  if (w.chart) {
    const slot = el('div', 'qa-chart');
    slot.appendChild(renderChart({ ...w.chart, type: 'chart', id: `${w.id}-chart` } as ChartWidget, ctx));
    card.appendChild(slot);
  }
  return card;
}

/* ── funnel ── funil visual: barras degradê por etapa + pills perda/migram. */
const FUNNEL_GRAD = ['#7C3AED', '#6D28D9', '#5B21B6', '#4C1D95', '#3B1675', '#2E084B'];
function renderFunnel(w: FunnelWidget): HTMLElement {
  const wrap = el('div', 'funnel-card');
  if (w.title) wrap.appendChild(el('div', 'funnel-title', w.title));
  if (w.sub) wrap.appendChild(el('div', 'funnel-sub', w.sub));
  const body = el('div', 'funnel-body');
  const n = w.steps.length;
  w.steps.forEach((s, i) => {
    const bar = el('div', 'funnel-bar');
    bar.style.background = FUNNEL_GRAD[Math.min(i, FUNNEL_GRAD.length - 1)];
    // Afunilamento: largura decresce por etapa (100% → ~46%), dando a forma de funil.
    bar.style.width = `${(n > 1 ? 100 - i * (54 / (n - 1)) : 100).toFixed(1)}%`;
    bar.appendChild(el('span', 'funnel-bar-l', s.label));
    bar.appendChild(el('span', 'funnel-bar-v', (s.value ?? 0).toLocaleString('pt-BR')));
    body.appendChild(bar);
    const t = w.transitions?.[i];
    if (t && i < n - 1) {
      body.appendChild(el('div', 'funnel-conn'));
      const pills = el('div', 'funnel-pills');
      if (t.invalid) {
        pills.appendChild(el('span', 'funnel-pill funnel-pill--invalid', '⚠️ Dado inválido'));
      } else {
        // 2 tags: ▼ perda (MAIOR FURO na pior) + taxa de passagem. A passagem é ✓ verde
        // quando está no/acima do benchmark e ⚠ âmbar quando ABAIXO do recomendado —
        // aí a meta entra inline (ex.: connect rate 60% abaixo do recomendado 80%).
        const below = t.gap != null && t.gap > 0;
        if (t.loss != null) pills.appendChild(el('span', `funnel-pill ${t.worst ? 'funnel-pill--worst' : 'funnel-pill--loss'}`,
          `${t.worst ? '⚠ ' : '▼ '}${t.loss.toFixed(1)}%${t.worst ? ' · MAIOR FURO' : ''}`));
        if (t.migrate != null) {
          const meta = below && t.bench != null ? ` · meta ${t.bench.toFixed(0)}%` : '';
          pills.appendChild(el('span', `funnel-pill ${below ? 'funnel-pill--alert' : 'funnel-pill--migrate'}`,
            `${below ? '⚠ ' : '✓ '}${t.migrate.toFixed(1)}%${meta}`));
        }
      }
      body.appendChild(pills);
    }
  });
  wrap.appendChild(body);
  return wrap;
}

/* ── bar-list ── lista de barras horizontais (rótulo + barra + valor + %), com
 *  hierarquia (indent) e cards de stat opcionais. Origem do Tráfego / Temperatura. */
function svgInline(icon?: string): string {
  return icon && ICONS[icon]
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg>`
    : '';
}
function renderBarList(w: BarListWidget): HTMLElement {
  const wrap = el('div', 'bar-list');
  if (w.title) {
    const head = el('div', 'chart-head');
    head.appendChild(el('div', 'chart-title', w.title));
    wrap.appendChild(head);
  }
  if (w.legend?.length) {
    const lg = el('div', 'bl-legend');
    for (const s of w.legend) {
      const item = el('span', 'bl-legend-i');
      const sw = el('span', 'bl-legend-sw'); sw.style.background = s.color; item.appendChild(sw);
      item.appendChild(document.createTextNode(s.label)); lg.appendChild(item);
    }
    wrap.appendChild(lg);
  }
  const max = w.max ?? Math.max(1, ...w.rows.map(r => r.bar || 0));
  const rowsEl = el('div', 'bl-rows');
  for (const r of w.rows) {
    const row = el('div', `bl-row${r.indent ? ' bl-row--child' : ''}`);
    const lab = el('div', 'bl-label');
    if (r.icon && ICONS[r.icon]) {
      const ic = el('span', 'bl-ic'); if (r.color) ic.style.color = r.color; ic.innerHTML = svgInline(r.icon); lab.appendChild(ic);
    } else if (!r.indent) {
      const dot = el('span', 'bl-dot'); if (r.color) dot.style.background = r.color; lab.appendChild(dot);
    }
    lab.appendChild(el('span', 'bl-name', r.label));
    row.appendChild(lab);
    if (r.seg?.length) {
      const track = el('div', 'bl-track bl-track--seg');
      for (const s of r.seg) {
        const seg = el('div', 'bl-seg', s.label || '');
        seg.style.width = `${Math.max(0, s.pct)}%`; seg.style.background = s.color;
        track.appendChild(seg);
      }
      row.appendChild(track);
      const tot = el('div', 'bl-total');
      tot.appendChild(el('span', 'bl-val', r.value));
      if (r.pct != null) tot.appendChild(el('span', 'bl-totpct', `${r.pct.toFixed(1)}% do total`));
      row.appendChild(tot);
    } else {
      const track = el('div', 'bl-track');
      const fill = el('div', 'bl-fill');
      fill.style.width = `${Math.max(2, ((r.bar || 0) / max) * 100)}%`;
      if (r.color) fill.style.background = r.color;
      track.appendChild(fill); row.appendChild(track);
      row.appendChild(el('span', 'bl-val', r.value));
      row.appendChild(el('span', 'bl-pct', r.pct != null ? `${r.pct.toFixed(1)}%` : ''));
    }
    rowsEl.appendChild(row);
  }
  wrap.appendChild(rowsEl);
  if (w.cards?.length) {
    const cards = el('div', 'bl-cards');
    for (const c of w.cards) {
      const card = el('div', `bl-card bl-card--${c.tone || 'purple'}`);
      const hd = el('div', 'bl-card-hd');
      if (c.icon && ICONS[c.icon]) { const ic = el('span', 'bl-card-ic'); ic.innerHTML = svgInline(c.icon); hd.appendChild(ic); }
      hd.appendChild(el('span', 'bl-card-t', c.label));
      card.appendChild(hd);
      for (const s of c.stats || []) {
        const sr = el('div', 'bl-card-row');
        sr.appendChild(el('span', 'bl-card-l', s.label));
        sr.appendChild(el('span', 'bl-card-v', s.value));
        card.appendChild(sr);
      }
      if (c.headline) {
        const h = el('div', 'bl-card-hl');
        h.appendChild(el('div', 'bl-card-hl-v', c.headline.value));
        h.appendChild(el('div', 'bl-card-hl-l', c.headline.label));
        card.appendChild(h);
      }
      cards.appendChild(card);
    }
    wrap.appendChild(cards);
  }
  return wrap;
}

/* ── cri-list ── lista de criativos ranqueados: thumb + nome (link) + meta +
 *  stats à direita (leads + CPMQL proj.). Substitui a tabela de criativos. */
function renderCriList(w: CriListWidget): HTMLElement {
  const wrap = el('div', 'cri-list');
  if (w.title) {
    const head = el('div', 'chart-head');
    head.appendChild(el('div', 'chart-title', w.title));
    wrap.appendChild(head);
  }
  for (const r of w.rows) {
    const row = el('div', 'cri-row');
    const thumb = el('div', 'cri-thumb');
    thumb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/></svg>';
    row.appendChild(thumb);
    const info = el('div', 'cri-info');
    info.appendChild(el('div', 'cri-name', r.name));
    if (r.meta) info.appendChild(el('div', 'cri-meta', r.meta));
    if (r.metrics?.length) {
      const mr = el('div', 'cri-metrics');
      for (const m of r.metrics) {
        const item = el('div', `cri-m${m.emph ? ' cri-m--emph' : ''}`);
        item.appendChild(el('span', 'cri-m-v', m.value));
        item.appendChild(el('span', 'cri-m-l', m.label));
        mr.appendChild(item);
      }
      info.appendChild(mr);
    }
    if (r.link) {
      const a = el('a', 'cri-link', 'Ver criativo ↗') as HTMLAnchorElement;
      a.href = r.link; a.target = '_blank'; a.rel = 'noopener';
      info.appendChild(a);
    }
    row.appendChild(info);
    const stat = el('div', 'cri-stat');
    for (const s of r.stats || []) {
      const c = s.tone === 'pos' ? 'c-g' : s.tone === 'neg' ? 'c-r' : '';
      stat.appendChild(el('div', `cri-stat-v ${c}`, s.value));
      stat.appendChild(el('div', 'cri-stat-l', s.label));
    }
    row.appendChild(stat);
    wrap.appendChild(row);
  }
  if (w.caption) wrap.appendChild(el('div', 'cri-cap', w.caption));
  return wrap;
}

/* ── strat-grid ── perguntas estratégicas: colunas de cards com linhas
 *  "pergunta · chip de achado · valor de apoio" (espelha o One Pager da fonte). */
function renderStratGrid(w: StratGridWidget): HTMLElement {
  const grid = el('div', 'strat-grid');
  for (const col of w.cols || []) {
    const card = el('div', 'strat-col');
    card.appendChild(el('div', 'strat-col-t', col.title));
    for (const it of col.items || []) {
      const row = el('div', 'strat-row');
      row.appendChild(el('span', 'strat-q', it.q));
      if (it.chip) row.appendChild(el('span', `pill ${PILL_TONE[it.chip.tone || 'neutral']} strat-chip`, it.chip.text));
      if (it.val) row.appendChild(el('span', 'strat-val', it.val));
      card.appendChild(row);
    }
    grid.appendChild(card);
  }
  return grid;
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

/* ── embed ── preview de uma publicação (Instagram via iframe /embed/; demais
 *  plataformas caem num placeholder com link). */
function renderEmbed(w: EmbedWidget): HTMLElement {
  const card = el('div', 'embed-card');
  if (w.title) card.appendChild(el('div', 'embed-title', w.title));
  const url = (w.url || '').trim();
  const m = url.match(/instagram\.com\/(p|reel|reels|tv)\/([^/?#]+)/i);
  if (m) {
    const kind = m[1] === 'reels' ? 'reel' : m[1];
    const iframe = document.createElement('iframe');
    iframe.className = 'embed-ig';
    iframe.src = `https://www.instagram.com/${kind}/${m[2]}/embed/`;
    iframe.loading = 'lazy';
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('allowtransparency', 'true');
    iframe.setAttribute('title', w.title || 'Post do Instagram');
    card.appendChild(iframe);
    if (w.caption) card.appendChild(el('div', 'embed-cap', w.caption));
    return card;
  }
  const ph = el('div', 'embed-ph');
  ph.appendChild(el('div', 'embed-ph-t', w.platform === 'Facebook' ? 'Anúncio no Facebook' : 'Pré-visualização indisponível'));
  if (url) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.className = 'embed-link'; a.textContent = 'Abrir anúncio ↗';
    ph.appendChild(a);
  }
  card.appendChild(ph);
  if (w.caption) card.appendChild(el('div', 'embed-cap', w.caption));
  return card;
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

/* ── link-card ── grid de cards clicáveis que abrem uma seção (ficha). Cada card:
 *  nome + sub + tags + métricas 2×2 + indicador principal com barra. O clique
 *  dispara 'goto-section' (o main navega). */
function renderLinkCard(w: LinkCardWidget): HTMLElement {
  const wrap = el('div', 'lc-wrap');
  if (w.title) wrap.appendChild(el('div', 'chart-title', w.title));
  const grid = el('div', 'lc-grid');
  for (const c of w.cards || []) {
    const card = el('button', 'lc-card') as HTMLButtonElement;
    card.type = 'button';
    const head = el('div', 'lc-head');
    head.append(el('div', 'lc-name', c.title), el('div', 'lc-sub', c.sub || ''));
    card.appendChild(head);
    if (c.tags?.length) {
      const t = el('div', 'lc-tags');
      for (const tg of c.tags) t.appendChild(el('span', `lc-tag lc-tag-${tg.tone || 'n'}`, tg.label));
      card.appendChild(t);
    }
    if (c.metrics?.length) {
      const m = el('div', 'lc-metrics');
      for (const mt of c.metrics) {
        const cell = el('div', 'lc-metric');
        cell.append(el('div', 'lc-m-v', mt.value), el('div', 'lc-m-l', mt.label));
        m.appendChild(cell);
      }
      card.appendChild(m);
    }
    if (c.main) {
      const mn = el('div', `lc-main lc-main-${c.main.tone || 'p'}`);
      mn.append(el('div', 'lc-main-l', c.main.label), el('div', 'lc-main-v', c.main.value));
      if (typeof c.main.pct === 'number') {
        const bar = el('div', 'lc-bar');
        const fill = el('div', 'lc-bar-f');
        fill.style.width = `${Math.max(0, Math.min(100, c.main.pct))}%`;
        bar.appendChild(fill);
        mn.appendChild(bar);
      }
      card.appendChild(mn);
    }
    if (c.gotoSection) {
      card.addEventListener('click', () => document.dispatchEvent(
        new CustomEvent('goto-section', { detail: { page: c.gotoPage, section: c.gotoSection } })));
    }
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

/* ── scatter-picker ── dispersão com 2 dropdowns (X e Y). Reconstrói o scatter
 *  client-side a partir das métricas embutidas; gerencia a própria instância
 *  ApexCharts. Cada ponto = um criativo (nome no hover). */
function renderScatterPicker(w: ScatterPickerWidget): HTMLElement {
  const wrap = el('div', 'sp-wrap');
  const hd = el('div', 'sp-hd');
  if (w.title) hd.appendChild(el('div', 'chart-title', w.title));
  const mkSel = (cur: string): HTMLSelectElement => {
    const s = document.createElement('select');
    s.className = 'sp-sel';
    for (const m of w.metrics) {
      const o = document.createElement('option');
      o.value = m.id; o.textContent = m.label; if (m.id === cur) o.selected = true;
      s.appendChild(o);
    }
    return s;
  };
  const xSel = mkSel(w.x || w.metrics[0]?.id || '');
  const ySel = mkSel(w.y || w.metrics[1]?.id || w.metrics[0]?.id || '');
  const ctrls = el('div', 'sp-ctrls');
  ctrls.append(el('span', 'sp-lbl', 'X'), xSel, el('span', 'sp-lbl', 'Y'), ySel);
  hd.appendChild(ctrls);
  wrap.appendChild(hd);
  const host = el('div', 'sp-chart');
  wrap.appendChild(host);

  let chart: ApexInstance | null = null;
  const build = (): void => {
    const xk = xSel.value, yk = ySel.value;
    const xm = w.metrics.find(m => m.id === xk), ym = w.metrics.find(m => m.id === yk);
    const series = (w.points || [])
      .filter(p => p.vals[xk] != null && p.vals[yk] != null)
      .map(p => ({ name: p.name, data: [{ x: p.vals[xk], y: p.vals[yk] }] }));
    const def = {
      type: 'scatter', series, height: w.height ?? 320, colors: ['#7C3AED'],
      options: { legend: { show: false }, tooltip: { shared: false },
        xaxis: { type: 'numeric', title: { text: xm?.label } }, yaxis: { title: { text: ym?.label } } },
    } as unknown as ChartDef;
    const opts = buildOptions(def);
    if (chart) { void chart.updateOptions(opts); return; }
    if (typeof ApexCharts === 'undefined') return;
    chart = new ApexCharts(host, opts);
    void chart.render();
  };
  xSel.addEventListener('change', build);
  ySel.addEventListener('change', build);
  requestAnimationFrame(build);
  return wrap;
}

/* ── evolution-picker ── linha no tempo com dropdown(s) de métrica; reconstrói a
 *  série client-side a partir das métricas embutidas (reusa o chrome do scatter-picker).
 *  DUAL (w.current2 definido): dois seletores (M1/M2) e a 2ª métrica vai no eixo da
 *  direita — escalas independentes (ex.: Leads × CPL R$). */
function renderEvolutionPicker(w: EvolutionPickerWidget): HTMLElement {
  const wrap = el('div', 'sp-wrap');
  const hd = el('div', 'sp-hd');
  if (w.title) hd.appendChild(el('div', 'chart-title', w.title));
  const dual = w.current2 != null;
  const mkSel = (cur: string): HTMLSelectElement => {
    const s = document.createElement('select');
    s.className = 'sp-sel';
    for (const m of w.metrics) {
      const o = document.createElement('option');
      o.value = m.id; o.textContent = m.label; if (m.id === cur) o.selected = true;
      s.appendChild(o);
    }
    return s;
  };
  const sel = mkSel(w.current || w.metrics[0]?.id || '');
  const sel2 = dual ? mkSel(w.current2 || w.metrics[1]?.id || w.metrics[0]?.id || '') : null;
  const ctrls = el('div', 'sp-ctrls');
  if (dual && sel2) ctrls.append(el('span', 'sp-lbl', 'Esq.'), sel, el('span', 'sp-lbl', 'Dir.'), sel2);
  else ctrls.append(el('span', 'sp-lbl', 'Métrica'), sel);
  hd.appendChild(ctrls);
  wrap.appendChild(hd);
  const host = el('div', 'sp-chart');
  wrap.appendChild(host);

  const cats = (w.points || []).map(p => p.name);
  let chart: ApexInstance | null = null;
  const build = (): void => {
    const mk = sel.value;
    const m = w.metrics.find(x => x.id === mk);
    const data = (w.points || []).map(p => (p.vals[mk] ?? null));
    let def: ChartDef;
    if (dual && sel2) {
      const mk2 = sel2.value;
      const m2 = w.metrics.find(x => x.id === mk2);
      const data2 = (w.points || []).map(p => (p.vals[mk2] ?? null));
      const f1 = valueFmt(m?.fmt), f2 = valueFmt(m2?.fmt);
      def = {
        type: 'line', categories: cats, height: w.height ?? 320,
        colors: ['#7C3AED', '#059669'], secondaryAxis: [1],
        series: [{ name: m?.label || mk, data }, { name: m2?.label || mk2, data: data2 }],
        // Eixos de escalas distintas: cada um formata no seu próprio padrão (R$/%/int),
        // e o tooltip usa o formato da série correspondente.
        options: {
          yaxis: [{ labels: { formatter: f1 } }, { opposite: true, labels: { formatter: f2 } }],
          tooltip: { y: [{ formatter: f1 }, { formatter: f2 }] },
        },
      } as unknown as ChartDef;
    } else {
      def = {
        type: 'line', series: [{ name: m?.label || mk, data }], categories: cats,
        height: w.height ?? 320, colors: ['#7C3AED'], valueFormat: m?.fmt,
      } as unknown as ChartDef;
    }
    const opts = buildOptions(def);
    if (chart) { void chart.updateOptions(opts); return; }
    if (typeof ApexCharts === 'undefined') return;
    chart = new ApexCharts(host, opts);
    void chart.render();
  };
  sel.addEventListener('change', build);
  sel2?.addEventListener('change', build);
  requestAnimationFrame(build);
  return wrap;
}

/* ── dispatch ── */
export function renderWidget(widget: Widget, ctx: RenderCtx): HTMLElement {
  try {
    switch (widget.type) {
      case 'kpi':         return renderKpi(widget, ctx);
      case 'kpi-strip':   return renderKpiStrip(widget);
      case 'kpi-card':    return renderKpiCard(widget);
      case 'metric-toggle': return renderMetricToggle(widget);
      case 'chart-table': return renderChartTable(widget, ctx);
      case 'eyebrow':     return renderEyebrow(widget);
      case 'chart':       return renderChart(widget, ctx);
      case 'table':       return renderTable(widget, ctx);
      case 'heatmap':     return renderHeatmap(widget, ctx);
      case 'heatmap-toggle': return renderHeatmapToggle(widget, ctx);
      case 'chart-toggle': return renderChartToggle(widget, ctx);
      case 'rank-card':   return renderRankCard(widget, ctx);
      case 'find-block':  return renderFindBlock(widget);
      case 'qa-card':     return renderQaCard(widget, ctx);
      case 'funnel':      return renderFunnel(widget);
      case 'bar-list':    return renderBarList(widget);
      case 'cri-list':    return renderCriList(widget);
      case 'strat-grid':  return renderStratGrid(widget);
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
      case 'embed':       return renderEmbed(widget);
      case 'link-card':   return renderLinkCard(widget);
      case 'scatter-picker': return renderScatterPicker(widget);
      case 'evolution-picker': return renderEvolutionPicker(widget);
      default:            return errorCard((widget as { type: string }).type, 'tipo desconhecido');
    }
  } catch (e) {
    return errorCard(widget.type, (e as Error).message);
  }
}
