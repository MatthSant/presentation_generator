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
  EyebrowWidget, KpiStripWidget, KpiCardWidget, MetricToggleWidget, HeatmapToggleWidget, HeatmapTab, ChartToggleWidget, ChartTableWidget, ResolvedSeries,
  EmbedWidget, LinkCardWidget, ScatterPickerWidget, ScatterPoint, EvolutionPickerWidget, QaCardWidget, FunnelWidget, StratGridWidget, BarListWidget, CriListWidget, MetaBarsWidget, EscopoCardsWidget, ChannelTableWidget, BulletGroupsWidget, BulletChannel, QuadrantScatterWidget,
} from '../shared/types.js';
import { formatValue } from './format.js';
import { defFromResolved, buildOptions, valueFmt, captureChart, chartExportMode, type ChartDef } from './charts.js';
import { trendR2, bestFit, type TrendType } from './trend.js';

const FIT_LBL: Record<string, string> = { linear: 'Linear', log: 'Log', exp: 'Exp', pow: 'Potência' };

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
/** Predicado de outlier robusto (MAD ∧ Tukey) p/ um vetor numérico — mesmas cercas
 *  conservadoras do dropOutliers (só sai pico claramente espúrio, não o extremo de
 *  uma tendência). <5 pontos → nunca marca. Reusado pelos pickers (evolução/dispersão). */
export function outlierPredicate(nums: number[]): (v: number) => boolean {
  if (nums.length < 5) return () => false;
  const median = (a: number[]) => { const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const sorted = [...nums].sort((a, b) => a - b);
  const med = median(sorted);
  const mad = median(nums.map(v => Math.abs(v - med)).sort((a, b) => a - b));
  const q = (p: number) => { const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
  const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
  const madThr = mad > 0 ? 5 * 1.4826 * mad : Infinity;
  const lo = iqr > 0 ? q1 - 3 * iqr : -Infinity, hi = iqr > 0 ? q3 + 3 * iqr : Infinity;
  if (madThr === Infinity && !(iqr > 0)) return () => false;
  // Só marca se AMBAS as cercas robustas concordam — uma sozinha dispara fácil demais
  // no extremo de uma tendência (a queixa original).
  return (v: number) => Math.abs(v - med) > madThr && (v < lo || v > hi);
}

function dropOutliers(series: ResolvedSeries[]): ResolvedSeries[] {
  return series.map(s => {
    const nums = s.data.filter((v): v is number => typeof v === 'number');
    if (nums.length < 5) return s;
    const isOut = outlierPredicate(nums);
    return { name: s.name, data: s.data.map(v => (typeof v === 'number' && isOut(v)) ? null : v) };
  });
}

/** Nome de série legível p/ o tooltip/legenda. O bind guarda a coluna crua
 *  (ex.: "taxa_qual"); sem `bind.name` isso vazava sem tratamento. Série única →
 *  usa o título do gráfico (sem a unidade entre parênteses); chave crua
 *  (snake_case / camelCase) → humaniza. Nomes já legíveis passam intactos. */
function stripUnit(t: string): string { return t.replace(/\s*\([^)]*\)\s*$/, '').trim(); }
function humanizeKey(k: string): string {
  return k.replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2').trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}
function labelSeriesNames(series: ResolvedSeries[], w: ChartWidget): ResolvedSeries[] {
  const yRaw = typeof w.bind?.y === 'string' ? w.bind.y : undefined;
  return series.map(s => {
    const name = String(s.name ?? '');
    let label = name;
    if (series.length === 1 && w.bind && !w.bind.name && yRaw && name === yRaw && w.title) {
      label = stripUnit(w.title);
    } else if (name && !name.includes(' ') && /[_-]|[a-z][A-Z]/.test(name)) {
      label = humanizeKey(name);
    }
    return label === name ? s : { ...s, name: label };
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
    const cleaned = (w as { outliers?: boolean }).outliers ? dropOutliers(resolved.series) : resolved.series;
    const series = labelSeriesNames(cleaned, w);
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
  if (w.info) wrap.appendChild(infoBadge(w.info));
  if (w.caption) wrap.appendChild(el('span', 'ge-c', w.caption));
  wrap.appendChild(el('span', 'ge-rule'));
  return wrap;
}

/* ── kpi-strip ── a row of tabular KPIs (optional variation `sub` + trend spark) */
function renderKpiStrip(w: KpiStripWidget): HTMLElement {
  const wrap = el('div', 'kpi-strip' + ((w.rows ?? 1) > 1 ? ' kpi-strip--rows' : ''));
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
const PILL_TONE: Record<string, string> = { pos: 'pill--ok', neg: 'pill--err', neutral: 'pill--neutral', warn: 'pill--warn' };

/* Modo de comparação (meta | hist) do toggle de plataforma. Os badges com `cmp`
 * leem este modo no render e trocam ao vivo via setCmpMode (sem re-render). */
const goalSym = (st: string): string => (st === 'ok' ? '✓' : st === 'bad' ? '✕' : st === 'warn' ? '⚠' : '');
let cmpMode: 'meta' | 'hist' = 'meta';
/* Widgets que recomputam ao trocar meta↔histórico (mapa de canais, bullet, tabela)
 * registram um repaint aqui; o setCmpMode chama todos e poda os desconectados. */
const cmpListeners: { el: HTMLElement; cb: (m: 'meta' | 'hist') => void }[] = [];
export function onCmpChange(el: HTMLElement, cb: (m: 'meta' | 'hist') => void): void {
  cmpListeners.push({ el, cb });
}
/* Estado de UI dos widgets interativos (aba do heatmap, métrica/dimensão do bullet,
 * seletores dos pickers), keyed pelo id do widget — sobrevive ao re-render que o filtro
 * dispara, então a seleção do usuário não volta ao default. */
const uiState = new Map<string, Record<string, string | number>>();
function uiGet(id: string | undefined, key: string): string | number | undefined {
  return id ? uiState.get(id)?.[key] : undefined;
}
function uiSet(id: string | undefined, key: string, val: string | number): void {
  if (!id) return;
  const s = uiState.get(id) || {};
  s[key] = val; uiState.set(id, s);
}
/* Δ% + tom de avaliação (verde/âmbar/cinza/vermelho) — espelha `_dev` do motor. */
export function devTone(real: number | null | undefined, base: number | null | undefined, invert = false): { d: number | null; tone: 'pos' | 'warn' | 'neutral' | 'neg' } {
  if (real == null || !base) return { d: null, tone: 'neutral' };
  const d = (real - base) / base * 100;
  const ad = Math.abs(d);
  if (ad < 1) return { d, tone: 'neutral' };
  const good = invert ? d <= 0 : d >= 0;
  if (good) return { d, tone: 'pos' };
  return { d, tone: ad <= 10 ? 'warn' : 'neg' };
}
export function setCmpMode(m: 'meta' | 'hist'): void {
  cmpMode = m;
  document.querySelectorAll<HTMLElement>('.pill.kc-cmp').forEach((p) => {
    const val = p.dataset[m] ?? '';
    const tone = p.dataset[`${m}Tone`] ?? 'neutral';
    p.textContent = val;
    p.className = `pill ${PILL_TONE[tone] ?? PILL_TONE.neutral} kc-cmp`;
  });
  // rodapés de meta toggleáveis (goalCmp): troca Meta ↔ Histórico ao vivo
  document.querySelectorAll<HTMLElement>('.kc-goal.kc-goal-cmp').forEach((g) => {
    // bench-cards (sem hist) caem no meta/bench quando o hist não tem delta.
    const eff = (m === 'hist' && !g.dataset.histDelta) ? 'meta' : m;
    const lbl = g.dataset[`${eff}Lbl`];
    if (lbl === undefined) return;
    const lblEl = g.querySelector('.kc-goal-lbl');
    if (lblEl) lblEl.textContent = lbl;
    const valEl = g.querySelector<HTMLElement>('.kc-goal-val');
    if (valEl) {
      const delta = g.dataset[`${eff}Delta`] ?? '';
      const st = g.dataset[`${eff}Status`] ?? 'warn';
      valEl.textContent = goalSym(st) ? `${delta} ${goalSym(st)}` : delta;
      valEl.className = `kc-goal-val kg-${st}`;
    }
  });
  for (let i = cmpListeners.length - 1; i >= 0; i--) {
    const L = cmpListeners[i];
    if (!L.el.isConnected) { cmpListeners.splice(i, 1); continue; }
    try { L.cb(m); } catch { /* repaint resiliente: um widget não derruba os outros */ }
  }
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
    const blbl = el('div', 'kc-lbl', w.label);
    if (w.info) blbl.appendChild(infoBadge(w.info));
    main.appendChild(blbl);
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
    const flbl = el('div', 'kc-lbl', w.label);
    if (w.info) flbl.appendChild(infoBadge(w.info));
    head.appendChild(flbl);
    // O rodapé de meta (goal/goalCmp) já mostra o desvio — não duplica no topo.
    if (!w.goal && !w.goalCmp) {
      if (w.cmp) {
        const cur = w.cmp[cmpMode] || w.cmp.meta;
        const pill = el('span', `pill ${PILL_TONE[cur[1] || 'neutral']} kc-cmp`, cur[0]);
        pill.dataset.meta = w.cmp.meta[0]; pill.dataset.metaTone = w.cmp.meta[1];
        pill.dataset.hist = w.cmp.hist[0]; pill.dataset.histTone = w.cmp.hist[1];
        head.appendChild(pill);
      } else if (w.delta) {
        head.appendChild(el('span', `pill ${PILL_TONE[w.deltaTone || 'neutral']}`, w.delta));
      }
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
    // bench-cards (sem histórico) NÃO togglam: ficam no bench/meta mesmo em modo hist
    // (assim fica claro o que compara a histórico vs a bench).
    const gcMode: 'meta' | 'hist' = (w.goalCmp && cmpMode === 'hist' && !(w.goalCmp.hist && w.goalCmp.hist.delta)) ? 'meta' : cmpMode;
    const goalSrc = w.goalCmp ? (w.goalCmp[gcMode] || w.goalCmp.meta) : w.goal;
    if (goalSrc) {
      const g = el('div', 'kc-goal');
      g.appendChild(el('span', 'kc-goal-lbl', goalSrc.label));
      if (goalSrc.delta) {
        const st = goalSrc.status || 'warn';
        g.appendChild(el('span', `kc-goal-val kg-${st}`, goalSym(st) ? `${goalSrc.delta} ${goalSym(st)}` : goalSrc.delta));
      }
      if (w.goalCmp) {
        // toggleável: guarda meta/hist p/ o setCmpMode trocar o rodapé ao vivo
        g.classList.add('kc-goal-cmp');
        for (const mode of ['meta', 'hist'] as const) {
          const s = w.goalCmp[mode];
          g.dataset[`${mode}Lbl`] = s.label;
          g.dataset[`${mode}Delta`] = s.delta || '';
          g.dataset[`${mode}Status`] = s.status || 'warn';
        }
      }
      card.appendChild(g);
    }
  } else {
    const head = el('div', 'kc-head');
    head.appendChild(el('span', 'kc-lbl', w.label));
    if (w.icon) head.appendChild(iconBox(w.icon, w.iconColor));
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
  const n = parseFloat(String(value).replace(/−/g, '-').replace(/[^0-9.-]/g, ''));
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
interface HeatSpec { bind?: Bind; rowKey?: string; rowLabelKey?: string; rowTitleKey?: string; colKey?: string; valKey?: string; clsKey?: string; titleKey?: string; clsHistKey?: string; titleHistKey?: string }
function pivotHeatmap(w: HeatSpec, ctx: RenderCtx): { cols: string[]; rows: HeatRow[] } | null {
  const r = ctx.resolve(w.bind);
  if (!r || r.rows.length === 0) return null;
  const rowKey = w.rowKey || 'grupo';
  const colKey = w.colKey || 'lancamento';
  const valKey = w.valKey || 'valor';
  // toggle vs Histórico: usa as colunas *Hist quando existem (senão mantém a vs meta).
  const histMode = getCmpMode() === 'hist';
  const clsKey = (histMode && w.clsHistKey) || w.clsKey || 'cls';
  const titleKey = (histMode && w.titleHistKey) || w.titleKey;
  const cols: string[] = [];
  const rowOrder: string[] = [];
  // identidade da linha = rowKey (nome completo, único); rótulo exibido e tooltip opcionais.
  const byRow = new Map<string, Map<string, HeatCell>>();
  const rowMeta = new Map<string, { label: string; title?: string }>();
  for (const row of r.rows) {
    const rk = String(row[rowKey] ?? '');
    const ck = String(row[colKey] ?? '');
    if (!cols.includes(ck)) cols.push(ck);
    if (!byRow.has(rk)) {
      byRow.set(rk, new Map());
      rowOrder.push(rk);
      rowMeta.set(rk, {
        label: w.rowLabelKey && row[w.rowLabelKey] != null ? String(row[w.rowLabelKey]) : rk,
        title: w.rowTitleKey && row[w.rowTitleKey] != null ? String(row[w.rowTitleKey]) : undefined,
      });
    }
    byRow.get(rk)!.set(ck, {
      value: row[valKey] as string | number,
      cls: row[clsKey] != null ? String(row[clsKey]) : undefined,
      title: titleKey && row[titleKey] != null ? String(row[titleKey]) : undefined,
    });
  }
  const rows: HeatRow[] = rowOrder.map(rk => ({
    label: rowMeta.get(rk)!.label,
    title: rowMeta.get(rk)!.title,
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
    const rh = el('div', 'hm-rh', r.label);
    if (r.title && r.title !== r.label) rh.title = r.title;
    grid.appendChild(rh);
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
  // Dois modos: `tabs` (toggle único de dimensão) ou `scopes` (toggle de escopo
  // à esquerda — ex.: Pago/Orgânico — + as dimensões daquele escopo à direita).
  const scopes = w.scopes && w.scopes.length ? w.scopes : null;
  const card = el('div', 'card hm-card');
  const hd = el('div', 'hm-card-hd');
  const tt = el('div', 'tbl-title');
  const name = el('span', 'tt-name');
  const sub = el('span', 'tt-sub');
  tt.append(name, sub);
  const toggles = el('div', 'hm-toggles');
  const scopeSeg = el('div', 'seg seg--soft hm-scope');
  const toggle = el('div', 'seg seg--soft');
  if (scopes) toggles.appendChild(scopeSeg);
  toggles.appendChild(toggle);
  hd.append(tt, toggles);
  const host = el('div', 'hm-host');
  card.append(hd, host);

  let scopeIdx = scopes ? Math.min(Number(uiGet(w.id, 'scope') ?? 0), scopes.length - 1) : 0;
  let tabs: HeatmapTab[] = scopes ? scopes[Math.max(scopeIdx, 0)].tabs : (w.tabs || []);
  let cur = Math.min(Number(uiGet(w.id, 'tab') ?? 0), tabs.length - 1);

  const show = (idx: number) => {
    const tab = tabs[idx];
    if (!tab) return;
    cur = idx; uiSet(w.id, 'tab', idx);
    name.textContent = w.title || tab.label;
    sub.textContent = tab.sub || '';
    const piv = pivotHeatmap(tab, ctx);
    host.replaceChildren(piv ? buildHeatGrid(piv.cols, piv.rows) : empty());
    [...toggle.children].forEach((b, i) => b.classList.toggle('active', i === idx));
  };
  const buildTabs = () => {
    toggle.replaceChildren();
    tabs.forEach((tab, i) => {
      const b = el('button', 'seg-opt', tab.label) as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', () => show(i));
      toggle.appendChild(b);
    });
  };
  const setScope = (sIdx: number) => {
    if (!scopes) return;
    scopeIdx = sIdx; uiSet(w.id, 'scope', sIdx);
    tabs = scopes[sIdx].tabs;
    cur = Math.min(Math.max(cur, 0), tabs.length - 1);
    [...scopeSeg.children].forEach((b, i) => b.classList.toggle('active', i === sIdx));
    buildTabs();
    show(cur < 0 ? 0 : cur);
  };
  if (scopes) {
    scopes.forEach((sc, i) => {
      const b = el('button', 'seg-opt', sc.label) as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', () => setScope(i));
      scopeSeg.appendChild(b);
    });
    setScope(scopeIdx < 0 ? 0 : scopeIdx);
  } else {
    buildTabs();
    show(cur < 0 ? 0 : cur);
  }
  // re-pinta a aba ativa quando o toggle vs Meta/Histórico muda (só se algum tab tem hist).
  const allTabs = scopes ? scopes.flatMap(s => s.tabs) : tabs;
  if (allTabs.some(t => t.clsHistKey)) onCmpChange(card, () => show(cur));
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

/** Defesa em profundidade p/ prosa com HTML inline (motor determinístico ou LLM):
 *  mantém só <strong>/<em>/<br>/<code> — sem atributos — e DESEMBRULHA qualquer
 *  outra tag preservando o texto. Um JSON comprometido não injeta script/handler. */
function safeHtml(html: string): string {
  const tpl = document.createElement('template');   // content inerte: nada executa no parse
  tpl.innerHTML = html;
  const ALLOWED = new Set(['STRONG', 'EM', 'BR', 'CODE']);
  for (const node of Array.from(tpl.content.querySelectorAll('*'))) {
    if (ALLOWED.has(node.tagName)) {
      for (const a of Array.from(node.attributes)) node.removeAttribute(a.name);
    } else {
      node.replaceWith(...Array.from(node.childNodes));
    }
  }
  return tpl.innerHTML;
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
    if (body) { const p = el('p', 'sm fb-body'); p.innerHTML = w.card ? highlightFigures(safeHtml(body)) : safeHtml(body); div.appendChild(p); }
    if (impl) {
      const f = el('div', 'fb-impl');
      f.appendChild(el('span', 'fb-impl-tag', 'Implicação'));
      const t = el('span', 'fb-impl-txt'); t.innerHTML = safeHtml(impl); f.appendChild(t);
      div.appendChild(f);
    }
  }
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
  const hasHist = (w.transitions || []).some(t => t && t.benchHist != null);
  let body: HTMLElement | null = null;

  function paint(mode: 'meta' | 'hist'): void {
    const useHist = mode === 'hist' && hasHist;
    if (body) body.remove();
    body = el('div', 'funnel-body');
    const n = w.steps.length;
    w.steps.forEach((s, i) => {
      const bar = el('div', 'funnel-bar');
      bar.style.background = FUNNEL_GRAD[Math.min(i, FUNNEL_GRAD.length - 1)];
      // Afunilamento: largura decresce por etapa (100% → ~46%), dando a forma de funil.
      bar.style.width = `${(n > 1 ? 100 - i * (54 / (n - 1)) : 100).toFixed(1)}%`;
      bar.appendChild(el('span', 'funnel-bar-l', s.label));
      bar.appendChild(el('span', 'funnel-bar-v', s.vlabel ?? (s.value ?? 0).toLocaleString('pt-BR')));
      body!.appendChild(bar);
      const t = w.transitions?.[i];
      if (t && i < n - 1) {
        body!.appendChild(el('div', 'funnel-conn'));
        const pills = el('div', 'funnel-pills');
        if (t.invalid) {
          pills.appendChild(el('span', 'funnel-pill funnel-pill--invalid', '⚠️ Dado inválido'));
        } else if (t.note) {
          // transição com nota (ex.: CPM na etapa investimento → impressões), colorida por noteTone.
          const noteCls = t.noteTone === 'pos' ? 'funnel-pill--migrate'
            : t.noteTone === 'neg' ? 'funnel-pill--worst'
              : t.noteTone === 'warn' ? 'funnel-pill--alert' : 'funnel-pill--bench';
          pills.appendChild(el('span', `funnel-pill ${noteCls}`, t.note));
        } else {
          // base = meta ou histórico (toggle). ✓ verde quando ≥ base; ⚠ âmbar quando
          // ABAIXO — aí a base entra inline (ex.: connect 60% · meta 80% / · hist 72%).
          // só transições COM benchHist togglam p/ histórico; as de bench fixo ficam no bench.
          const useHistT = useHist && t.benchHist != null;
          const bench = useHistT ? t.benchHist : t.bench;
          const gap = useHistT ? t.gapHist : t.gap;
          const below = gap != null && gap > 0;
          if (!w.hideLoss && t.loss != null) pills.appendChild(el('span', `funnel-pill ${t.worst ? 'funnel-pill--worst' : 'funnel-pill--loss'}`,
            `${t.worst ? '⚠ ' : '▼ '}${t.loss.toFixed(1)}%${t.worst ? ' · MAIOR FURO' : ''}`));
          if (t.migrate != null) {
            const word = useHistT ? 'hist' : (t.baseLabel || w.baseLabel || 'meta');   // per-transição
            const dec = t.decimals ?? 1;
            const baseTxt = below && bench != null ? ` · ${word} ${bench.toFixed(t.decimals ?? (bench % 1 ? 1 : 0))}%` : '';
            // com hideLoss o MAIOR FURO migra p/ a tag de passagem (a de perda some).
            const furoTxt = (w.hideLoss && t.worst) ? ' · MAIOR FURO' : '';
            pills.appendChild(el('span', `funnel-pill ${below ? 'funnel-pill--alert' : 'funnel-pill--migrate'}`,
              `${below ? '⚠ ' : '✓ '}${t.migrate.toFixed(dec)}%${baseTxt}${furoTxt}`));
          }
        }
        body!.appendChild(pills);
      }
    });
    wrap.appendChild(body);
  }

  paint(getCmpMode());
  if (hasHist) onCmpChange(wrap, paint);
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

/* ── meta-bars ── comparativo em linhas-card. Colunas: Indicador · Realizado ·
 *  barra de atingimento (cor de AVALIAÇÃO: verde bom · vermelho ruim · âmbar
 *  neutro, com o % ao lado) · Δ vs Meta (pill) · valor da Meta · valor do Histórico. */
function renderMetaBars(w: MetaBarsWidget): HTMLElement {
  const wrap = el('div', 'meta-bars');
  if (w.title) { const h = el('div', 'chart-head'); h.appendChild(el('div', 'chart-title', w.title)); wrap.appendChild(h); }
  const c = w.cols || {};
  const head = el('div', 'mb-head');
  head.appendChild(el('span', 'mb-c-ind', 'INDICADOR'));
  head.appendChild(el('span', 'mb-c-real', c.real || 'REALIZADO'));
  head.appendChild(el('span', 'mb-c-bar', c.bar || 'ATINGIMENTO DA META'));
  head.appendChild(el('span', 'mb-c-delta', c.delta || 'Δ VS META'));
  head.appendChild(el('span', 'mb-c-meta', c.meta || 'META'));
  head.appendChild(el('span', 'mb-c-hist', c.hist || 'HISTÓRICO'));
  wrap.appendChild(head);
  for (const r of w.rows) {
    const row = el('div', 'mb-row');
    row.appendChild(el('div', 'mb-ind', r.label));
    row.appendChild(el('div', 'mb-real', r.real || '—'));

    const tone = r.delta?.tone || 'neutral';
    const barWrap = el('div', 'mb-bar');
    const track = el('div', 'mb-track');
    const fill = el('div', `mb-fill mb-fill--${tone}`);   // cor avalia o atingimento
    fill.style.width = `${Math.max(2, Math.min(100, r.pct ?? 0))}%`;
    track.appendChild(fill); barWrap.appendChild(track);
    if (r.pct != null) barWrap.appendChild(el('span', 'mb-bar-pct', r.pctLabel || `${Math.round(r.pct)}%`));
    row.appendChild(barWrap);

    const deltaEl = el('div', 'mb-delta');
    if (r.delta) deltaEl.appendChild(el('span', `pill ${PILL_TONE[tone]}`, r.delta.value));
    else deltaEl.appendChild(el('span', 'mb-dash', '—'));
    row.appendChild(deltaEl);

    row.appendChild(el('div', 'mb-meta', r.meta || '—'));
    row.appendChild(el('div', 'mb-hist', r.hist || '—'));
    wrap.appendChild(row);
  }
  return wrap;
}

/* ── bullet-groups ── 3 colunas (acima/próximo/abaixo) de bullet-bars: barra =
 *  realizado, marca = meta. Toggle local troca a métrica e re-agrupa no client
 *  (>5% acima · ±5% próximo · <−5% abaixo). */
function renderBulletGroups(w: BulletGroupsWidget): HTMLElement {
  const wrap = el('div', 'card bullet-groups');
  const dimKeys = (w.dimToggle && w.dims) ? w.dimToggle : null;
  const _sm = String(uiGet(w.id, 'metric') ?? '');
  let active = (w.toggle.some(t => t.key === _sm) ? _sm : '') || w.toggle[0]?.key || '';
  const _sd = String(uiGet(w.id, 'dim') ?? '');
  let activeDim = (dimKeys?.some(d => d.key === _sd) ? _sd : '') || dimKeys?.[0]?.key || '';
  const chansOf = (): BulletChannel[] => (w.dims ? (w.dims[activeDim] || []) : (w.channels || []));
  const allChans = w.dims ? Object.values(w.dims).flat() : (w.channels || []);
  const hasHist = allChans.some(ch => Object.values(ch.metrics).some(e => !!(e && e.bases.hist)));
  const invertOf = (k: string) => !!w.toggle.find(t => t.key === k)?.invert;

  const top = el('div', 'blt-top');

  // Os dois toggles lado a lado, à direita: DIMENSÃO (se houver) + MÉTRICA.
  const toggles = el('div', 'blt-toggles');
  if (dimKeys) {
    const dt = el('div', 'blt-toggle');
    const dtabs: HTMLElement[] = [];
    for (const d of dimKeys) {
      const b = el('button', 'blt-tab', d.label);
      if (d.key === activeDim) b.classList.add('is-active');
      b.addEventListener('click', () => {
        if (d.key === activeDim) return;
        activeDim = d.key; uiSet(w.id, 'dim', d.key);
        for (const x of dtabs) x.classList.toggle('is-active', x === b);
        paint();
      });
      dtabs.push(b); dt.appendChild(b);
    }
    toggles.appendChild(dt);
  }

  const toggle = el('div', 'blt-toggle');
  const tabs: HTMLElement[] = [];
  for (const m of w.toggle) {
    const t = el('button', 'blt-tab', m.label);
    if (m.key === active) t.classList.add('is-active');
    t.addEventListener('click', () => {
      if (m.key === active) return;
      active = m.key; uiSet(w.id, 'metric', m.key);
      for (const x of tabs) x.classList.toggle('is-active', x === t);
      paint();
    });
    tabs.push(t); toggle.appendChild(t);
  }
  toggles.appendChild(toggle);
  top.appendChild(toggles);
  wrap.appendChild(top);

  // Legenda abaixo dos toggles.
  const legend = el('div', 'blt-legend');
  legend.appendChild(el('span', 'blt-lg-bar'));
  legend.appendChild(el('span', '', 'Realizado'));
  legend.appendChild(el('span', 'blt-lg-mk'));
  const baseLbl = el('span', '', 'Meta');
  legend.appendChild(baseLbl);
  wrap.appendChild(legend);

  const cols = el('div', 'blt-cols');
  wrap.appendChild(cols);

  function paint(): void {
    const mode: 'meta' | 'hist' = (getCmpMode() === 'hist' && hasHist) ? 'hist' : 'meta';
    baseLbl.textContent = mode === 'hist' ? 'Histórico' : 'Meta';
    const invert = invertOf(active);
    cols.innerHTML = '';
    type Row = { name: string; full: string; value: number; base: number; dv: number; vlabel: string; blabel: string };
    const buckets: Record<string, Row[]> = {};
    for (const g of w.groups) buckets[g.key] = [];
    for (const ch of chansOf()) {
      const e = ch.metrics[active];
      if (!e) continue;
      const b = e.bases[mode] || e.bases.hist || e.bases.meta;   // sem a base do modo → cai p/ a que existir
      if (!b || !b.v) continue;
      const dv = (e.value - b.v) / b.v * 100;
      const eff = invert ? -dv : dv;   // custo: acima da base é PIOR
      const k = eff > 5 ? 'acima' : eff >= -5 ? 'prox' : 'abaixo';
      if (buckets[k]) buckets[k].push({ name: ch.name, full: ch.nameFull || ch.name, value: e.value, base: b.v, dv, vlabel: e.vlabel, blabel: b.label });
    }
    const baseWord = mode === 'hist' ? 'hist' : 'meta';
    for (const g of w.groups) {
      const list = (buckets[g.key] || []).sort((a, b) => invert ? a.value - b.value : b.value - a.value);
      const col = el('div', `blt-group blt-group--${g.tone}`);
      const head = el('div', 'blt-group-head');
      head.appendChild(el('span', 'blt-dot'));
      head.appendChild(el('span', 'blt-group-lbl', g.label));
      head.appendChild(el('span', 'blt-group-n', String(list.length)));
      col.appendChild(head);
      if (!list.length) {
        const empty = el('div', 'blt-empty');
        empty.appendChild(el('span', 'blt-empty-ic', '—'));
        empty.appendChild(el('span', '', 'Nenhum segmento nesta faixa'));
        col.appendChild(empty);
        cols.appendChild(col);
        continue;
      }
      const scale = Math.max(...list.map(r => Math.max(r.value, r.base))) * 1.12 || 1;
      for (const r of list) {
        const row = el('div', 'blt-row');
        const rhead = el('div', 'blt-row-head');
        const nm = el('span', 'blt-name', r.name); nm.title = r.full;
        rhead.appendChild(nm);
        rhead.appendChild(el('span', `blt-val blt-val--${g.tone}`, r.vlabel));
        row.appendChild(rhead);
        const barline = el('div', 'blt-barline');
        const track = el('div', 'blt-track');
        const fill = el('div', `blt-fill blt-fill--${g.tone}`);
        fill.style.width = `${Math.max(2, r.value / scale * 100)}%`;
        track.appendChild(fill);
        // % vs base, dentro da barra (à esquerda)
        const pct = el('span', 'blt-pct', `${r.dv >= 0 ? '+' : ''}${r.dv.toFixed(0)}%`);
        track.appendChild(pct);
        const mk = el('div', 'blt-marker');
        mk.style.left = `${Math.min(100, r.base / scale * 100)}%`;
        mk.title = `${mode === 'hist' ? 'Histórico' : 'Meta'} ${r.blabel}`;
        track.appendChild(mk);
        barline.appendChild(track);
        barline.appendChild(el('span', 'blt-metatxt', `${baseWord} ${r.blabel}`));
        row.appendChild(barline);
        col.appendChild(row);
      }
      cols.appendChild(col);
    }
  }
  paint();
  if (hasHist) onCmpChange(wrap, paint);
  return wrap;
}

/* ── quadrant-scatter ── mapa 2×2 dos canais: x = conversão vs base, y = leads vs
 *  base, cor = vendas vs base (4 níveis), tamanho = % de leads. A base (planejado/
 *  meta ou lançamento anterior) segue o toggle de plataforma; tudo recomputa no client. */
function renderQuadrantScatter(w: QuadrantScatterWidget): HTMLElement {
  const wrap = el('div', 'card quad-scatter');
  const E = (s: string) => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c));
  const pf = (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(0)}%`;
  const hasHist = !!w.modes.hist && (w.points || []).some(p => !!p.hist);

  function paint(mode: 'meta' | 'hist'): void {
    const m: 'meta' | 'hist' = (mode === 'hist' && hasHist) ? 'hist' : 'meta';
    const frame = (m === 'hist' && w.modes.hist) ? w.modes.hist : w.modes.meta;
    wrap.innerHTML = '';

    const top = el('div', 'qs-top');
    top.appendChild(el('div', 'qs-cap', `Cor = ${frame.axes.heat}` + (w.size ? ` · Tamanho = ${w.size}` : '')));
    const leg = el('div', 'qs-legend');
    const neutralLbl = m === 'hist' ? 'Igual' : 'Na meta';
    const tiers: [string, string][] = [['neg', 'Abaixo'], ['warn', 'Atenção'], ['neutral', neutralLbl], ['pos', 'Acima']];
    for (const [t, lab] of tiers) {
      const it = el('span', 'qs-lg-item');
      it.appendChild(el('span', `qs-lg-dot qs-lg-dot--${t}`));
      it.appendChild(el('span', '', lab));
      leg.appendChild(it);
    }
    top.appendChild(leg);
    wrap.appendChild(top);

    // computa desvios do modo ativo; pontos sem base no modo ficam de fora.
    const pts = (w.points || []).map(p => {
      const base = m === 'hist' ? p.hist : p.meta;
      if (!base) return null;
      const dx = devTone(p.conv, base.conv).d;
      const dy = devTone(p.leads, base.leads).d;
      const dv = devTone(p.vendas, base.vendas);
      if (dx == null || dy == null) return null;
      return { name: p.name, size: p.size, x: dx, y: dy, tone: dv.tone,
        xlabel: `conv ${pf(dx)}`, ylabel: `leads ${pf(dy)}`,
        vlabel: dv.d == null ? '' : `vendas ${pf(dv.d)}`, slabel: p.slabel };
    }).filter((p): p is NonNullable<typeof p> => p !== null);

    const maxAbs = Math.max(10, ...pts.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))));
    const R = Math.ceil(maxAbs / 10) * 10;
    const PL = 96, PR = 716, PT = 28, PB = 416, cx = (PL + PR) / 2, cy = (PT + PB) / 2;
    const sx = (v: number) => cx + (Math.max(-R, Math.min(R, v)) / R) * ((PR - PL) / 2);
    const sy = (v: number) => cy - (Math.max(-R, Math.min(R, v)) / R) * ((PB - PT) / 2);

    const qpos: Record<string, [number, number, string]> = {
      tr: [PR - 12, PT + 18, 'end'], tl: [PL + 12, PT + 18, 'start'],
      br: [PR - 12, PB - 12, 'end'], bl: [PL + 12, PB - 12, 'start'],
    };
    let quadSvg = '';
    for (const q of frame.quadrants || []) {
      const [qx, qy, anch] = qpos[q.pos] || qpos.tr;
      quadSvg += `<text x="${qx}" y="${qy}" class="qs-qlbl" text-anchor="${anch}">${E(q.label)}</text>`;
    }

    const maxSize = Math.max(1, ...pts.map(p => p.size || 0));
    const hasSize = pts.some(p => p.size != null);
    const rOf = (s?: number) => (hasSize ? Math.max(5, 17 * Math.sqrt((s || 0) / maxSize)) : 7);
    let ptsSvg = '';
    for (const p of pts) {
      const x = sx(p.x), y = sy(p.y), r = rOf(p.size);
      const right = x > cx;
      const lx = right ? x - (r + 5) : x + (r + 5);
      const anch = right ? 'end' : 'start';
      const title = [p.name, p.vlabel, p.xlabel, p.ylabel, p.slabel].filter(Boolean).join(' · ');
      ptsSvg += `<g class="qs-pt-g"><title>${E(title)}</title>`
        + `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" class="qs-pt qs-pt--${p.tone}"/>`
        + `<text x="${lx.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" class="qs-ptlbl" text-anchor="${anch}">${E(p.name)}</text></g>`;
    }

    const svg = `<svg viewBox="0 0 760 500" class="qs-svg" role="img" aria-label="Mapa de canais">`
      + `<rect x="${cx}" y="${PT}" width="${PR - cx}" height="${cy - PT}" class="qs-q qs-q--good"/>`
      + `<rect x="${PL}" y="${PT}" width="${cx - PL}" height="${cy - PT}" class="qs-q qs-q--warn"/>`
      + `<rect x="${cx}" y="${cy}" width="${PR - cx}" height="${PB - cy}" class="qs-q qs-q--neutral"/>`
      + `<rect x="${PL}" y="${cy}" width="${cx - PL}" height="${PB - cy}" class="qs-q qs-q--bad"/>`
      + `<rect x="${PL}" y="${PT}" width="${PR - PL}" height="${PB - PT}" class="qs-frame"/>`
      + `<line x1="${cx}" y1="${PT}" x2="${cx}" y2="${PB}" class="qs-axis"/>`
      + `<line x1="${PL}" y1="${cy}" x2="${PR}" y2="${cy}" class="qs-axis"/>`
      + quadSvg
      + `<text x="${PL}" y="${PB + 22}" class="qs-tick" text-anchor="start">−${R}%</text>`
      + `<text x="${PR}" y="${PB + 22}" class="qs-tick" text-anchor="end">+${R}%</text>`
      + `<text x="${cx}" y="${PB + 36}" class="qs-axttl" text-anchor="middle">${E(frame.axes.x)} →</text>`
      + `<text x="${PL - 14}" y="${PT + 5}" class="qs-tick" text-anchor="end">+${R}%</text>`
      + `<text x="${PL - 14}" y="${PB}" class="qs-tick" text-anchor="end">−${R}%</text>`
      + `<text transform="translate(${PL - 56},${cy}) rotate(-90)" class="qs-axttl" text-anchor="middle">${E(frame.axes.y)} →</text>`
      + ptsSvg
      + `</svg>`;
    const body = el('div', 'qs-body');
    const holder = el('div', 'qs-plot');
    holder.innerHTML = svg;
    body.appendChild(holder);

    if (frame.quadrants && frame.quadrants.length) {
      const guide = el('div', 'qs-guide');
      guide.appendChild(el('div', 'qs-guide-h', 'Como analisar'));
      const order = ['tr', 'tl', 'br', 'bl'];
      const sorted = [...frame.quadrants].sort((a, b) => order.indexOf(a.pos) - order.indexOf(b.pos));
      for (const q of sorted) {
        const it = el('div', 'qs-guide-item');
        it.appendChild(el('span', `qs-guide-sw qs-guide-sw--${q.tone || 'neutral'}`));
        const tx = el('div', 'qs-guide-tx');
        tx.appendChild(el('div', 'qs-guide-lbl', q.label));
        if (q.desc) tx.appendChild(el('div', 'qs-guide-desc', q.desc));
        it.appendChild(tx);
        guide.appendChild(it);
      }
      if (frame.note) guide.appendChild(el('div', 'qs-guide-note', frame.note));
      body.appendChild(guide);
    }
    wrap.appendChild(body);
  }

  paint(getCmpMode());
  if (hasHist) onCmpChange(wrap, paint);
  return wrap;
}

/* ── escopo-cards ── resumo executivo por escopo: cards (Geral · Pago · Orgânico)
 *  com número grande (leads) + sub e mini-cards coloridos do breakdown. */
function renderEscopoCards(w: EscopoCardsWidget): HTMLElement {
  const wrap = el('div', 'escopo-cards');
  const chips: { span: HTMLElement; c: EscopoCardsWidget['cards'][number] }[] = [];
  const hasHist = w.cards.some(c => !!c.chipHist);
  for (const c of w.cards) {
    const card = el('div', `card esc-card esc--${c.tone || 'purple'}`);
    card.appendChild(el('div', 'esc-eyebrow', c.label));
    const val = el('div', 'esc-val');
    const num = el('span', 'esc-num', c.value);
    if (c.unit) num.appendChild(el('span', 'esc-unit', c.unit));
    val.appendChild(num);
    if (c.chip || c.chipHist) {
      const span = el('span', 'esc-chip');
      val.appendChild(span);
      chips.push({ span, c });
    }
    card.appendChild(val);
    if (c.sub) card.appendChild(el('div', 'esc-sub', c.sub));
    const minis = el('div', 'esc-minis');
    for (const m of c.minis || []) {
      const mc = el('div', `esc-mini esc-mini--${m.tone || 'purple'}`);
      mc.appendChild(el('div', 'esc-mini-lbl', m.label));
      mc.appendChild(el('div', 'esc-mini-val', m.value));
      if (m.pct) mc.appendChild(el('div', 'esc-mini-pct', m.pct));
      minis.appendChild(mc);
    }
    card.appendChild(minis);
    wrap.appendChild(card);
  }
  function applyChips(mode: 'meta' | 'hist'): void {
    for (const { span, c } of chips) {
      const ch = (mode === 'hist' && c.chipHist) ? c.chipHist : c.chip;
      if (!ch) { span.style.display = 'none'; continue; }
      span.style.display = '';
      span.className = `pill ${PILL_TONE[ch.tone || 'neutral']} esc-chip`;
      span.textContent = ch.text;
    }
  }
  applyChips(getCmpMode());
  if (hasHist) onCmpChange(wrap, applyChips);
  return wrap;
}

/* ── channel-table ── tabela com acabamento de app: 1ª coluna = nome (bold), demais
 *  com alinhamento/tom por célula (meta âmbar, Δ como pill). Linha-card com hover. */
function renderChannelTable(w: ChannelTableWidget): HTMLElement {
  const wrap = el('div', 'card ch-table');
  if (w.title) wrap.appendChild(el('div', 'ch-title', w.title));
  const cmp = w.cmp;
  const hasHist = !!(cmp && cmp.hist);
  let grid: HTMLElement | null = null;
  function paint(mode: 'meta' | 'hist'): void {
    const view = cmp ? ((mode === 'hist' && cmp.hist) ? cmp.hist : cmp.meta) : { cols: w.cols, rows: w.rows };
    if (grid) grid.remove();
    grid = el('div', 'ch-grid');
    grid.style.setProperty('--ch-ncols', String(Math.max(1, view.cols.length - 1)));
    const head = el('div', 'ch-row ch-head');
    view.cols.forEach((c, i) => head.appendChild(el('span', `ch-th ch-a-${c.align || (i === 0 ? 'left' : 'right')}`, c.label)));
    grid.appendChild(head);
    for (const r of view.rows) {
      const row = el('div', 'ch-row');
      row.appendChild(el('span', 'ch-name', r.name));
      r.cells.forEach((cell, i) => {
        const al = cell.align || view.cols[i + 1]?.align || 'right';
        const td = el('span', `ch-td ch-a-${al}${cell.tone ? ` ch-t-${cell.tone}` : ''}`);
        if (cell.pill) td.appendChild(el('span', `pill ${PILL_TONE[cell.tone || 'neutral'] || PILL_TONE.neutral}`, cell.value));
        else td.textContent = cell.value;
        row.appendChild(td);
      });
      grid!.appendChild(row);
    }
    wrap.appendChild(grid);
  }
  paint(getCmpMode());
  if (hasHist) onCmpChange(wrap, paint);
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
  p.innerHTML = safeHtml(w.text || '');
  return p;
}

function renderHighlight(w: HighlightWidget): HTMLElement {
  const div = el('div', w.color ? `hl hl-${w.color}` : 'hl');
  if (w.label) div.appendChild(el('span', 'label-sec', w.label));
  const body = el('span');
  body.innerHTML = safeHtml(w.text || '');
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
    const b = el('span', 'ni-sb'); b.innerHTML = safeHtml(w.why); sec.appendChild(b);
    div.appendChild(sec);
  }
  if (w.action) {
    const sec = el('div', 'ni-section');
    sec.append(el('span', 'ni-sl c-g', 'Acionável'));
    const b = el('span', 'ni-sb'); b.innerHTML = safeHtml(w.action); sec.appendChild(b);
    div.appendChild(sec);
  }
  return div;
}

function renderLabelSec(w: LabelSecWidget): HTMLElement {
  const wrap = el('div');
  wrap.appendChild(el('p', 'label-sec', w.text || ''));
  wrap.appendChild(el('div', 'divl'));
  if (w.sub) { const sub = el('p', 'sm'); sub.innerHTML = safeHtml(w.sub); wrap.appendChild(sub); }
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
  p.innerHTML = safeHtml(w.text || '');
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
  for (const b of items) { const li = el('li'); li.innerHTML = safeHtml(b); ul.appendChild(li); }
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
/** Seletor de ordenação do link-card: reordena os cards no grid e RENUMERA os ranks
 *  (senão o "1" passa a mentir depois de reordenar). Clicar na chave ativa inverte a
 *  direção, como na sidebar. */
function buildLcSort(w: LinkCardWidget, grid: HTMLElement, ranks: HTMLElement[]): HTMLElement {
  const seg = el('div', 'seg lc-sort');
  const keys = w.sortKeys || [];
  let curKey = keys[0]?.key || 'name';
  let dir = keys[0]?.asc ? 1 : -1;
  const num = (e: HTMLElement, k: string): number => {
    const v = Number(e.dataset[k]);
    return Number.isFinite(v) ? v : (dir < 0 ? -Infinity : Infinity);   // sem valor vai p/ o fim
  };
  const apply = (): void => {
    const cards = [...grid.querySelectorAll<HTMLElement>('.lc-card')];
    cards.sort((a, b) => curKey === 'name'
      ? dir * (a.dataset.name || '').localeCompare(b.dataset.name || '', 'pt-BR')
      : dir * (num(a, curKey) - num(b, curKey)));
    for (const c of cards) grid.appendChild(c);
    // renumera: o rank é a posição NESTA ordem
    cards.forEach((c, i) => {
      const r = c.querySelector<HTMLElement>('.lc-rank');
      if (!r) return;
      r.textContent = String(i + 1);
      r.classList.toggle('lc-rank--top', i === 0);
      r.title = `${i + 1}º por ${keys.find((k) => k.key === curKey)?.label || curKey}`;
    });
    void ranks;
    for (const b of seg.querySelectorAll<HTMLElement>('.seg-opt')) {
      const on = b.dataset.key === curKey;
      b.classList.toggle('active', on);
      b.textContent = (keys.find((k) => k.key === b.dataset.key)?.label || '') + (on ? (dir < 0 ? ' ↓' : ' ↑') : '');
    }
  };
  for (const k of keys) {
    const b = el('button', 'seg-opt' + (k.key === curKey ? ' active' : '')) as HTMLButtonElement;
    b.type = 'button'; b.dataset.key = k.key;
    b.textContent = k.label + (k.key === curKey ? (dir < 0 ? ' ↓' : ' ↑') : '');
    b.addEventListener('click', () => {
      if (curKey === k.key) dir = -dir; else { curKey = k.key; dir = k.asc ? 1 : -1; }
      apply();
    });
    seg.appendChild(b);
  }
  return seg;
}

/* Card de entidade ranqueada (criativos). Hierarquia em 3 alturas, como manda o
 *  design system: identidade (rank + nome) → a MÉTRICA da ordenação, em tamanho de
 *  herói → os secundários, em micro. A barra só existe com `ranked`: aí ela lê como
 *  "distância até o 1º", que é o que a posição significa. */
function renderLinkCard(w: LinkCardWidget): HTMLElement {
  const wrap = el('div', 'lc-wrap');
  const grid = el('div', 'lc-grid');
  const ranks: HTMLElement[] = [];   // renumerados a cada reordenação

  // Cabeçalho: título + seletor de ordenação (quando o motor declara as chaves).
  const hd = el('div', 'lc-hd');
  if (w.title) hd.appendChild(el('div', 'chart-title', w.title));
  if (w.sortKeys?.length) hd.appendChild(buildLcSort(w, grid, ranks));
  if (hd.childNodes.length) wrap.appendChild(hd);

  for (const [i, c] of (w.cards || []).entries()) {
    const card = el('button', 'lc-card') as HTMLButtonElement;
    card.type = 'button';

    const top = el('div', 'lc-top');
    if (w.ranked) {
      const r = el('span', 'lc-rank' + (i === 0 ? ' lc-rank--top' : ''), String(i + 1));
      ranks.push(r);
      top.appendChild(r);
    }
    const id = el('div', 'lc-id');
    const name = el('div', 'lc-name', c.title);
    name.title = c.title;                       // o nome quebra em 2 linhas; o resto fica no hover
    id.appendChild(name);
    if (c.sub) id.appendChild(el('div', 'lc-sub', c.sub));
    top.appendChild(id);
    card.appendChild(top);
    // valores crus no DOM → o seletor de ordenação lê daqui
    card.dataset.name = c.title;
    for (const [k, v] of Object.entries(c.sort || {})) if (v != null) card.dataset[k] = String(v);

    if (c.tags?.length) {
      const t = el('div', 'lc-tags');
      for (const tg of c.tags) t.appendChild(el('span', `lc-tag lc-tag-${tg.tone || 'n'}`, tg.label));
      card.appendChild(t);
    }
    if (c.main) {
      const mn = el('div', `lc-main lc-main-${c.main.tone || 'p'}`);
      mn.append(el('div', 'lc-main-l', c.main.label), el('div', 'lc-main-v', c.main.value));
      if (w.ranked && typeof c.main.pct === 'number') {
        const bar = el('div', 'lc-bar');
        bar.title = i === 0 ? 'Melhor valor do recorte' : 'Proporção em relação ao 1º colocado';
        const fill = el('div', 'lc-bar-f');
        fill.style.width = `${Math.max(0, Math.min(100, c.main.pct))}%`;
        bar.appendChild(fill);
        mn.appendChild(bar);
      }
      card.appendChild(mn);
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
  const xSel = mkSel(String(uiGet(w.id, 'x') ?? '') || w.x || w.metrics[0]?.id || '');
  const ySel = mkSel(String(uiGet(w.id, 'y') ?? '') || w.y || w.metrics[1]?.id || w.metrics[0]?.id || '');
  const ctrls = el('div', 'sp-ctrls');
  // Toggle de DIMENSÃO opcional (ex.: público/criativo) — troca o conjunto de pontos.
  const dimKeys = (w.dimToggle && w.dims) ? w.dimToggle : null;
  const _spd = String(uiGet(w.id, 'dim') ?? '');
  let activeDim = (dimKeys?.some(d => d.key === _spd) ? _spd : '') || dimKeys?.[0]?.key || '';
  const pointsOf = (): ScatterPoint[] => (w.dims ? (w.dims[activeDim] || []) : (w.points || []));
  if (dimKeys) {
    const dt = el('div', 'sp-dimtog');
    const dtabs: HTMLElement[] = [];
    for (const d of dimKeys) {
      const b = el('button', 'sp-dimtab' + (d.key === activeDim ? ' is-active' : ''));
      (b as HTMLButtonElement).type = 'button'; b.textContent = d.label;
      b.addEventListener('click', () => { if (d.key === activeDim) return; activeDim = d.key; uiSet(w.id, 'dim', d.key); for (const x of dtabs) x.classList.toggle('is-active', x === b); build(); });
      dtabs.push(b); dt.appendChild(b);
    }
    ctrls.appendChild(dt);
  }
  ctrls.append(el('span', 'sp-lbl', 'X'), xSel, el('span', 'sp-lbl', 'Y'), ySel);
  const outBtn = el('button', 'sp-outlier' + ((w as { outliers?: boolean }).outliers ? ' on' : '')) as HTMLButtonElement;
  outBtn.type = 'button';
  outBtn.textContent = 'Sem outliers';
  outBtn.title = 'Descarta criativos fora das cercas de Tukey/MAD (em X ou Y) — pontos claramente espúrios.';
  outBtn.addEventListener('click', () => {
    const ww = w as { outliers?: boolean }; ww.outliers = !ww.outliers;
    outBtn.classList.toggle('on', !!ww.outliers); build();
  });
  ctrls.appendChild(outBtn);
  hd.appendChild(ctrls);
  wrap.appendChild(hd);
  // Badge de R² em evidência, abaixo do seletor Y (alinhado à direita) + nº de pontos.
  const r2Badge = w.trend ? el('span', 'sp-r2') : null;
  const r2note = w.trend ? el('span', 'sp-r2note') : null;
  if (r2Badge && r2note) {
    r2Badge.title = 'R² (0 a 1): quanto a métrica X explica a Y. Perto de 1 = relação forte; perto de 0 = sem relação. O motor testa reta, log e exp e mostra o melhor ajuste.';
    r2note.title = 'Nº de pontos no ajuste. Com poucos pontos, um R² alto pode ser ilusório — trate como sinal, não prova.';
    const r2row = el('div', 'sp-r2row');
    r2row.append(r2note, r2Badge);
    wrap.appendChild(r2row);
  }
  const host = el('div', 'sp-chart');
  wrap.appendChild(host);

  let chart: ApexInstance | null = null;
  const build = (): void => {
    const xk = xSel.value, yk = ySel.value;
    const xm = w.metrics.find(m => m.id === xk), ym = w.metrics.find(m => m.id === yk);
    // Pares [x,y] (não {x,y}) p/ compatibilizar com a linha de tendência (Point = [x,y]).
    let fpts = (pointsOf()).filter(p => p.vals[xk] != null && p.vals[yk] != null);
    if ((w as { outliers?: boolean }).outliers) {
      const px = outlierPredicate(fpts.map(p => p.vals[xk] as number));
      const py = outlierPredicate(fpts.map(p => p.vals[yk] as number));
      fpts = fpts.filter(p => !px(p.vals[xk] as number) && !py(p.vals[yk] as number));
    }
    const pairs = fpts.map(p => [p.vals[xk] as number, p.vals[yk] as number] as [number, number]);
    const series = fpts.map(p => ({ name: p.name, data: [[p.vals[xk] as number, p.vals[yk] as number]] }));
    // Tamanho do ponto (bolha) por uma métrica — raio ∝ √valor (área proporcional).
    let markerSizes: number[] | undefined;
    if (w.sizeBy) {
      const sv = fpts.map(p => Math.max(0, (p.vals[w.sizeBy as string] as number) ?? 0));
      const mx = Math.max(...sv, 1);
      markerSizes = sv.map(v => 4 + Math.sqrt(v / mx) * 15);
    }
    // 'best' → escolhe reta/log/exp pelo maior R²; senão usa o ajuste fixo.
    let resolvedTrend: TrendType | undefined;
    if (w.trend) {
      const fit = w.trend === 'best'
        ? bestFit(pairs)
        : (() => { const r2 = trendR2(pairs, w.trend as TrendType); return r2 == null ? null : { type: w.trend as TrendType, r2 }; })();
      resolvedTrend = fit?.type;
      if (r2Badge) {
        r2Badge.textContent = fit ? `${FIT_LBL[fit.type] || fit.type} · R² ${fit.r2.toFixed(2)}` : '';
        r2Badge.classList.toggle('sp-r2--strong', !!fit && fit.r2 >= 0.5);
      }
      if (r2note) {
        const n = pairs.length;
        const few = n > 0 && n < 10;   // poucos pontos → tendência pouco confiável
        r2note.textContent = n ? (few ? `n=${n} · poucos pontos` : `n=${n}`) : '';
        r2note.classList.toggle('sp-r2note--warn', few);
      }
    }
    const def = {
      type: 'scatter', series, height: w.height ?? 320, colors: ['#7C3AED'], trend: resolvedTrend, markerSizes,
      options: { legend: { show: false }, tooltip: { shared: false },
        xaxis: { type: 'numeric', title: { text: xm?.label } }, yaxis: { title: { text: ym?.label } } },
    } as unknown as ChartDef;
    const opts = buildOptions(def);
    if (chart) { void chart.updateOptions(opts); return; }
    if (typeof ApexCharts === 'undefined') return;
    if (!host.id) host.id = `${w.id}-xc`;
    captureChart(host.id, def);
    chart = new ApexCharts(host, opts);
    void chart.render();
  };
  xSel.addEventListener('change', () => { uiSet(w.id, 'x', xSel.value); build(); });
  ySel.addEventListener('change', () => { uiSet(w.id, 'y', ySel.value); build(); });
  // No export (aba em 2º plano) o rAF é estrangulado e o chart nunca monta/captura;
  // build síncrono garante o captureChart. O runtime remonta com o tamanho certo.
  if (chartExportMode()) build(); else requestAnimationFrame(build);
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
  const sel = mkSel(String(uiGet(w.id, 'm1') ?? '') || w.current || w.metrics[0]?.id || '');
  const sel2 = dual ? mkSel(String(uiGet(w.id, 'm2') ?? '') || w.current2 || w.metrics[1]?.id || w.metrics[0]?.id || '') : null;
  const ctrls = el('div', 'sp-ctrls');
  if (dual && sel2) ctrls.append(el('span', 'sp-lbl', 'Esq.'), sel, el('span', 'sp-lbl', 'Dir.'), sel2);
  else ctrls.append(el('span', 'sp-lbl', 'Métrica'), sel);
  const outBtn = el('button', 'sp-outlier' + ((w as { outliers?: boolean }).outliers ? ' on' : '')) as HTMLButtonElement;
  outBtn.type = 'button';
  outBtn.textContent = 'Sem outliers';
  outBtn.title = 'Substitui picos espúrios (fora das cercas de Tukey/MAD) por um vão na linha.';
  outBtn.addEventListener('click', () => {
    const ww = w as { outliers?: boolean }; ww.outliers = !ww.outliers;
    outBtn.classList.toggle('on', !!ww.outliers); build();
  });
  ctrls.appendChild(outBtn);
  hd.appendChild(ctrls);
  wrap.appendChild(hd);
  const host = el('div', 'sp-chart');
  wrap.appendChild(host);

  const cats = (w.points || []).map(p => p.name);
  const clean = (d: (number | null)[]): (number | null)[] =>
    (w as { outliers?: boolean }).outliers ? dropOutliers([{ name: '', data: d }])[0].data : d;
  let chart: ApexInstance | null = null;
  const build = (): void => {
    const mk = sel.value;
    const m = w.metrics.find(x => x.id === mk);
    const data = clean((w.points || []).map(p => (p.vals[mk] ?? null)));
    let def: ChartDef;
    if (dual && sel2) {
      const mk2 = sel2.value;
      const m2 = w.metrics.find(x => x.id === mk2);
      const data2 = clean((w.points || []).map(p => (p.vals[mk2] ?? null)));
      const f1 = valueFmt(m?.fmt), f2 = valueFmt(m2?.fmt);
      const combo = !!w.combo;   // 1ª métrica em barras, 2ª em linha
      def = {
        type: combo ? 'mixed' : 'line', categories: cats, height: w.height ?? 320,
        colors: ['#7C3AED', '#059669'], secondaryAxis: [1],
        series: combo
          ? [{ name: m?.label || mk, type: 'column', data }, { name: m2?.label || mk2, type: 'line', data: data2 }]
          : [{ name: m?.label || mk, data }, { name: m2?.label || mk2, data: data2 }],
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
    if (!host.id) host.id = `${w.id}-xc`;
    captureChart(host.id, def);
    chart = new ApexCharts(host, opts);
    void chart.render();
  };
  sel.addEventListener('change', () => { uiSet(w.id, 'm1', sel.value); build(); });
  sel2?.addEventListener('change', () => { uiSet(w.id, 'm2', sel2.value); build(); });
  if (chartExportMode()) build(); else requestAnimationFrame(build);
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
      case 'meta-bars':   return renderMetaBars(widget);
      case 'bullet-groups': return renderBulletGroups(widget);
      case 'quadrant-scatter': return renderQuadrantScatter(widget);
      case 'escopo-cards': return renderEscopoCards(widget);
      case 'channel-table': return renderChannelTable(widget);
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
