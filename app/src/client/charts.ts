/* charts.ts — ApexCharts option builder + chart lifecycle.
 *
 * buildOptions is a pure function of (def, theme) so it is unit-testable
 * without a DOM. ChartManager owns live instances for the current section so
 * filters can updateSeries in place instead of re-rendering the dashboard. */

import type { ChartType, ResolvedSeries } from '../shared/types.js';
import { buildTrendSeries, type TrendType } from './trend.js';

export interface ChartDef {
  type: ChartType;
  series: unknown;
  categories?: string[];
  labels?: string[];
  colors?: string[];
  distributed?: boolean;
  /** Bar only: color each bar by value sign (green ≥0 / red <0) for diverging metrics. */
  diverging?: boolean;
  /** Format the value axis + data labels as a rounded percentage ("15%"). */
  pct?: boolean;
  /** Fixed value-axis bounds (empty → auto-scale). */
  axisMin?: number;
  axisMax?: number;
  /** Dashed reference line at the mean of all plotted values, labeled "média X%". */
  meanLine?: boolean;
  stackType?: string;
  height?: number;
  options?: Record<string, unknown>;
  /** Scatter only: overlay a regression line of this kind, fitted from points. */
  trend?: TrendType;
  /** Donut/pie: show the summed total in the center hole. */
  donutTotal?: boolean;
  /** Caption under the donut center total (defaults to "Total"). */
  totalLabel?: string;
  /** Enable per-slice/point value labels (e.g. donut % on slices). */
  showLabels?: boolean;
  /** Mixed only: 0-based index (or indices) of the series on a right-hand axis. */
  secondaryAxis?: number | number[];
  /** Suffix appended to secondary-axis labels (e.g. "%"). */
  secondaryAxisSuffix?: string;
  /** Line only: render the last series dashed (a reference "Média" line). */
  dashLast?: boolean;
  /** Value formatting for axis/tooltip/labels: pct | money | x | int | num. */
  valueFormat?: string;
}

type Theme = 'light' | 'dark';

/* Export mode: the HTML snapshot exporter renders every section once per channel
 * and clones the drawn SVG. ApexCharts' entry animation is rAF-driven, so in a
 * backgrounded tab render() never settles and the bars never paint — leaving the
 * "broken charts" (axes only, no bars) the user reported. Forcing animations off
 * makes each chart draw synchronously. A module flag (not a buildOptions arg) so
 * the change reaches every call site without threading a parameter through. */
let EXPORT_MODE = false;
export function setChartExportMode(on: boolean): void { EXPORT_MODE = on; }

interface Base {
  dark: boolean;
  labelColor: string;
  defColors: string[];
  base: Record<string, Record<string, unknown>>;
}

/** Series palette = the design-system accent tokens, read live from CSS so a
 *  single source of truth (style.css) drives both the UI and the charts. Falls
 *  back to the literal design-system hex when no DOM/stylesheet is available
 *  (Node tests), so buildOptions stays a pure function there. */
function readPalette(fallback: string[]): string[] {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const cs = getComputedStyle(document.documentElement);
  const tokens = ['--purple', '--green', '--amber', '--orange', '--red'];
  const read = tokens.map(t => cs.getPropertyValue(t).trim());
  return read.every(Boolean) ? read : fallback;
}

function getBase(theme: Theme): Base {
  const dark = theme === 'dark';
  const labelColor = dark ? '#9CA3AF' : '#6B6B73';
  const gridColor = dark ? 'rgba(255,255,255,.07)' : '#ECECEC';
  const defColors = readPalette(dark
    ? ['#8B5CF6', '#10B981', '#F59E0B', '#F97316', '#EF4444']
    : ['#7C3AED', '#059669', '#D97706', '#EA580C', '#DC2626']);
  const base = {
    chart: { background: 'transparent', fontFamily: "'Exo 2', system-ui, sans-serif", toolbar: { show: false }, zoom: { enabled: false }, selection: { enabled: false }, animations: EXPORT_MODE ? { enabled: false } : { enabled: true, speed: 400, dynamicAnimation: { enabled: true, speed: 350 } } },
    theme: { mode: dark ? 'dark' : 'light' },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    tooltip: { theme: dark ? 'dark' : 'light' },
    xaxis: { labels: { style: { colors: labelColor, fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false }, crosshairs: { show: false }, tooltip: { enabled: false } },
    yaxis: { labels: { style: { colors: labelColor, fontSize: '11px' } } },
    dataLabels: { enabled: false },
    legend: { labels: { colors: labelColor } },
  };
  return { dark, labelColor, defColors, base };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** True when any plotted value is < 0, so the axis must drop below the baseline
 *  (diff/variation charts) instead of being clamped at min:0. Handles both the
 *  flat numeric form (circular charts) and the {name,data[]} series form. */
function hasNegative(series: unknown): boolean {
  const flat = (v: unknown): number[] => {
    if (typeof v === 'number') return [v];
    if (Array.isArray(v)) return v.flatMap(flat);
    if (isObj(v) && 'data' in v) return flat((v as { data: unknown }).data);
    return [];
  };
  return flat(series).some(n => n < 0);
}

export function mergeDeep<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    if (isObj(sv)) {
      const tv = isObj(target[key]) ? (target[key] as Record<string, unknown>) : {};
      (target as Record<string, unknown>)[key] = mergeDeep(tv, sv);
    } else {
      (target as Record<string, unknown>)[key] = sv;
    }
  }
  return target;
}

export function currentTheme(): Theme {
  return (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark') ? 'dark' : 'light';
}

/* Brazilian number formatting: comma decimal, period thousands; integers without ",0". */
function brNum(v: number, dec: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function autoBr(v: number): string {
  if (v == null || !Number.isFinite(v)) return '';
  return brNum(v, Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 1);
}
function moneyBr(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `R$ ${brNum(v / 1e6, 1)}M`;
  if (a >= 1e3) return `R$ ${brNum(v / 1e3, 0)}k`;
  return `R$ ${brNum(v, 0)}`;
}
function valueFmt(kind?: string): (v: number) => string {
  switch (kind) {
    case 'pct': return (v) => `${autoBr(v)}%`;
    case 'money': return (v) => moneyBr(v);
    case 'x': return (v) => `${autoBr(v)}×`;
    case 'int': return (v) => brNum(Math.round(Number(v) || 0), 0);
    default: return autoBr;
  }
}

export function buildOptions(def: ChartDef, theme: Theme = currentTheme()): Record<string, unknown> {
  const { dark, labelColor, defColors, base } = getBase(theme);
  const b = JSON.parse(JSON.stringify(base)) as typeof base;

  let resolvedType: string = (def.type === 'mixed' || def.type === 'stacked') ? 'bar'
    : def.type === 'bar-horizontal' ? 'bar'
      : def.type;

  // Scatter trend-line: keep the observations as scatter series and append a
  // fitted line series. The chart itself must be a 'line' so the curve renders.
  let series = def.series;
  if (def.type === 'scatter' && def.trend) {
    const pointSeries = (Array.isArray(def.series) ? def.series : [])
      .map(s => ({ ...(s as Record<string, unknown>), type: 'scatter' }));
    const pts = pointSeries.flatMap(s => ((s as { data?: [number, number][] }).data) || []);
    const trend = buildTrendSeries(pts, def.trend);
    series = trend ? [...pointSeries, trend] : pointSeries;
    resolvedType = 'line';
  }

  const opts: Record<string, unknown> = {
    chart: { ...b.chart, type: resolvedType, height: def.height ?? 300 },
    series,
    colors: def.colors || defColors,
    // No hover dim / persistent active tint — a report render (and print) should
    // show clean marks with no ghost highlight behind a column.
    states: { hover: { filter: { type: 'none' } }, active: { filter: { type: 'none' } } },
  };

  if (def.categories) opts.xaxis = { ...b.xaxis, categories: def.categories };
  if (def.labels) opts.labels = def.labels;

  const chart = opts.chart as Record<string, unknown>;
  // When the data dips below zero, never clamp the axis to 0 — let ApexCharts
  // auto-scale so negative bars extend downward from the baseline.
  const neg = hasNegative(series);
  const axisMin = neg ? undefined : 0;

  if (def.type === 'donut' || def.type === 'pie') {
    opts.legend = { position: 'bottom', labels: { colors: labelColor } };
    const donut: Record<string, unknown> = { size: '55%' };
    if (def.donutTotal) {
      donut.labels = {
        show: true,
        total: { show: true, label: def.totalLabel || 'Total', color: labelColor, fontSize: '11px', fontWeight: 400 },
        value: { fontSize: '22px', fontWeight: 700, color: dark ? '#FFFFFF' : '#0E0E10', offsetY: 4 },
        name: { fontSize: '11px', color: labelColor, offsetY: -4 },
      };
    }
    opts.plotOptions = { pie: { donut } };
  }
  if (def.type === 'bar' || def.type === 'mixed') {
    const bar: Record<string, unknown> = { borderRadius: 4, columnWidth: '55%', ...(def.distributed ? { distributed: true } : {}) };
    // Diverging metric (diff vs. benchmark): color by sign from the palette —
    // green = green token, red = red token — so the accent carries meaning and
    // the single source of truth (CSS) drives it. ranges win over `colors`.
    if (def.diverging) {
      const green = '#97C459', red = '#E24B4A';
      bar.colors = { ranges: [
        { from: -1e12, to: -0.0001, color: red },
        { from: 0, to: 1e12, color: green },
      ] };
      bar.columnWidth = '78%';
    }
    opts.plotOptions = { bar };
    opts.yaxis = { ...b.yaxis, min: axisMin };
  }
  if (def.type === 'mixed') {
    // line series get a visible stroke; bar series get none (width 0).
    const arr = Array.isArray(series) ? (series as { type?: string }[]) : [];
    opts.stroke = { width: arr.map(s => (s.type === 'line' ? 3 : 0)) };
    if (def.secondaryAxis != null) {
      const secs = Array.isArray(def.secondaryAxis) ? def.secondaryAxis : [def.secondaryAxis];
      const suffix = def.secondaryAxisSuffix || '';
      const firstSec = secs[0];
      const firstPrim = arr.findIndex((_, i) => !secs.includes(i));
      const lbl = { style: { colors: labelColor, fontSize: '11px' } };
      // Series sharing an axis (e.g. complementary %s) must share a scale to overlay.
      // Show labels on the first axis of each side; force 0..100 for % secondaries.
      opts.yaxis = arr.map((_, i) => secs.includes(i)
        ? { opposite: true, show: i === firstSec, min: 0, ...(suffix === '%' ? { max: 100 } : {}),
            labels: { ...lbl, ...(suffix ? { formatter: (v: number) => `${v}${suffix}` } : {}) } }
        : { show: i === firstPrim, min: axisMin, labels: lbl });
    }
  }
  if (def.type === 'stacked') {
    chart.stacked = true;
    if (def.stackType) chart.stackType = def.stackType;
    opts.plotOptions = { bar: { borderRadius: 0, columnWidth: '55%' } };
    opts.yaxis = { ...b.yaxis, min: axisMin };
  }
  if (def.type === 'bar-horizontal') {
    const bar: Record<string, unknown> = { horizontal: true, borderRadius: 4, barHeight: def.diverging ? '70%' : '55%' };
    if (def.diverging) {
      const green = '#97C459', red = '#E24B4A';
      bar.colors = { ranges: [
        { from: -1e12, to: -0.0001, color: red },
        { from: 0, to: 1e12, color: green },
      ] };
    }
    opts.plotOptions = { bar };
    opts.yaxis = { labels: { style: { colors: labelColor, fontSize: '11px' } } };
    opts.xaxis = { ...b.xaxis, categories: def.categories, min: axisMin };
  }
  if (def.type === 'line') {
    const n = Array.isArray(series) ? series.length : 0;
    if (def.dashLast && n > 1) {
      opts.stroke = { curve: 'smooth', width: Array.from({ length: n }, (_, i) => (i === n - 1 ? 2 : 3.5)),
        dashArray: Array.from({ length: n }, (_, i) => (i === n - 1 ? 5 : 0)) };
      opts.markers = { size: Array.from({ length: n }, (_, i) => (i === n - 1 ? 0 : 3)) };
    } else {
      opts.stroke = { curve: 'smooth', width: 3.5 };
      opts.markers = { size: 3 };
    }
    opts.yaxis = { ...b.yaxis, min: axisMin };
  }
  if (def.type === 'area') {
    opts.stroke = { curve: 'smooth', width: 2 };
    opts.fill = { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.2, opacityTo: 0 } };
    opts.yaxis = { ...b.yaxis, min: axisMin };
  }
  if (def.type === 'radialBar') {
    chart.type = 'radialBar';
    opts.plotOptions = { radialBar: { hollow: { size: '40%' }, dataLabels: {
      name: { color: labelColor, fontSize: '12px' },
      value: { color: dark ? '#E5E7EB' : '#0E0E10', fontSize: '20px', fontWeight: 700 },
    } } };
    opts.legend = { show: true, position: 'bottom', labels: { colors: labelColor } };
  }
  if (def.type === 'scatter') {
    chart.type = def.trend ? 'line' : 'scatter';
    opts.markers = { size: def.trend ? 6 : 5, strokeWidth: 0 };
    opts.xaxis = { ...b.xaxis, type: 'numeric' };
    if (def.trend) {
      // scatter point-series get no connecting stroke; the trend line gets one.
      const arr = Array.isArray(series) ? (series as { type?: string }[]) : [];
      opts.stroke = { width: arr.map(s => (s.type === 'line' ? 3 : 0)), curve: 'smooth' };
    }
  }
  if (def.type === 'radar') {
    chart.type = 'radar';
    opts.stroke = { width: 1.5 };
    opts.fill = { opacity: 0.1 };
    opts.xaxis = { categories: def.categories, labels: { style: { colors: Array(def.categories?.length || 6).fill(labelColor), fontSize: '11px' } } };
    opts.yaxis = { show: false };
  }
  if (def.type === 'treemap') {
    chart.type = 'treemap';
    opts.plotOptions = { treemap: { distributed: true, enableShades: true, shadeIntensity: 0.3 } };
    opts.legend = { show: false };
  }

  mergeDeep(opts, { chart: b.chart, grid: b.grid, tooltip: b.tooltip, dataLabels: b.dataLabels });
  // re-apply resolved type (mergeDeep above restored base chart without it)
  (opts.chart as Record<string, unknown>).type = chart.type ?? resolvedType;
  (opts.chart as Record<string, unknown>).height = def.height ?? 300;
  if (chart.stacked) (opts.chart as Record<string, unknown>).stacked = true;
  // After the base re-merge (which forces data labels off) re-enable them so the
  // flag wins; def.options still has the final say below.
  if (def.showLabels) {
    opts.dataLabels = { enabled: true, style: { fontSize: '11px', fontWeight: 600 }, dropShadow: { enabled: false } };
  }
  // Diverging metric (diff vs. benchmark): bars colored by sign from a benchmark
  // baseline, value just past each bar's end in muted ink, a light value axis with
  // its own gridlines (the 0 line included) — auto-scaled per chart. Mirrors the
  // approved reference field-for-field.
  if (def.diverging && (def.type === 'bar' || def.type === 'bar-horizontal')) {
    const horiz = def.type === 'bar-horizontal';
    const count = (Array.isArray(series) && isObj(series[0]) && Array.isArray((series[0] as { data?: unknown }).data))
      ? ((series[0] as { data: unknown[] }).data).length
      : (Array.isArray(series) ? series.length : 0);
    const axisInk = dark ? '#7A7A86' : '#A1A1AD';
    const catInk = dark ? '#C9C9D2' : '#3A3A45';
    const gridLine = dark ? 'rgba(255,255,255,.06)' : '#ECECF1';

    const bar = ((opts.plotOptions as Record<string, unknown>)?.bar ?? {}) as Record<string, unknown>;
    bar.borderRadius = 3;
    bar.borderRadiusApplication = 'end';
    if (horiz) bar.barHeight = count > 6 ? '70%' : '58%';
    else bar.columnWidth = `${Math.min(64, Math.max(24, count * 7))}%`;
    opts.plotOptions = { bar };

    const dvf = def.valueFormat ? valueFmt(def.valueFormat) : null;
    if (def.showLabels) {
      opts.dataLabels = {
        enabled: true,
        formatter: dvf ? (v: number) => dvf(v) : (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}%`,
        offsetX: 0,
        style: { fontSize: '10px', fontWeight: 800, colors: [dark ? '#C9C9D2' : '#33333D'] },
        dropShadow: { enabled: false },
      };
    }

    const pctFmt = dvf ? (v: number) => dvf(v) : (v: number) => `${Math.round(v)}%`;
    const valueAxis = { tickAmount: 4, labels: { formatter: pctFmt, style: { colors: axisInk, fontSize: '9.5px' } }, axisBorder: { show: false }, axisTicks: { show: false } };
    // minWidth floors the label column so ApexCharts' under-measured auto-width
    // doesn't clip group names (e.g. "250-500k" → "50-500k"); maxWidth caps long ones.
    const catAxis = { labels: { minWidth: 66, maxWidth: 200, style: { colors: catInk, fontSize: '10.5px', fontWeight: 600 } } };
    if (horiz) {
      opts.xaxis = { ...(opts.xaxis as Record<string, unknown>), ...valueAxis, crosshairs: { show: false } };
      opts.yaxis = catAxis;
    } else {
      opts.yaxis = { ...(opts.yaxis as Record<string, unknown>), ...valueAxis };
      opts.xaxis = { ...(opts.xaxis as Record<string, unknown>), labels: { ...catAxis.labels, rotate: -22, trim: false, hideOverlappingLabels: false }, axisBorder: { show: false }, axisTicks: { show: false }, crosshairs: { show: false }, tooltip: { enabled: false } };
    }
    // Value-axis gridlines (the 0 line lives among them); category side stays clean.
    opts.grid = {
      show: true, borderColor: gridLine, strokeDashArray: 0,
      xaxis: { lines: { show: horiz } }, yaxis: { lines: { show: !horiz } },
      padding: { left: 2, right: 10, top: -8, bottom: -8 },
    };
    // Tooltip reads as the metric, not the raw field name: drop the series title and
    // format the value as "+106.5% vs. benchmark" (matches the approved reference).
    opts.tooltip = {
      ...(isObj(opts.tooltip) ? (opts.tooltip as Record<string, unknown>) : {}),
      y: {
        formatter: dvf ? (v: number) => dvf(v) : (v: number) => `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}% vs. benchmark`,
        title: { formatter: () => '' },
      },
    };
  }
  // Value formatting — Brazilian (comma decimal, period thousands), integers w/o ",0".
  // pct/money/x get suffix/prefix; default auto-trims decimals. Keeps any explicit
  // formatter already set (e.g. secondary-axis suffix, diverging diff tooltip).
  {
    const f = valueFmt(def.valueFormat || (def.pct ? 'pct' : undefined));
    const apply = (axis: unknown) => {
      if (!isObj(axis)) return;
      if (isObj(axis.labels) && (axis.labels as Record<string, unknown>).formatter) return;
      axis.labels = { ...(isObj(axis.labels) ? axis.labels : {}), formatter: f };
    };
    const ax = opts[def.type === 'bar-horizontal' ? 'xaxis' : 'yaxis'];
    if (Array.isArray(ax)) ax.forEach(apply); else apply(ax);
    const tt = (isObj(opts.tooltip) ? opts.tooltip : (opts.tooltip = {})) as Record<string, unknown>;
    if (!isObj(tt.y) || !(tt.y as Record<string, unknown>).formatter) tt.y = { ...(isObj(tt.y) ? tt.y : {}), formatter: f };
    if (isObj(opts.dataLabels) && opts.dataLabels.enabled && !opts.dataLabels.formatter) opts.dataLabels.formatter = f;
  }
  // Explicit value-axis bounds (shared domain → comparable charts). Empty = auto.
  if (def.axisMin != null || def.axisMax != null) {
    const key = def.type === 'bar-horizontal' ? 'xaxis' : 'yaxis';
    const ax = (isObj(opts[key]) ? opts[key] : (opts[key] = {})) as Record<string, unknown>;
    if (def.axisMin != null) ax.min = def.axisMin;
    if (def.axisMax != null) ax.max = def.axisMax;
    // Respect the bounds exactly: nice-scaling would otherwise stretch the max to a
    // round number and defeat the shared domain. Keep the diverging tickAmount so
    // round bounds (e.g. ±120) yield clean ticks.
    ax.forceNiceScale = false;
  }
  // Mean reference line: a dashed marker at the average of all plotted values, so a
  // group reads as above/below the set's mean at a glance. Vertical (xaxis) on
  // horizontal bars; horizontal (yaxis) otherwise.
  if (def.meanLine) {
    const vals: number[] = [];
    if (Array.isArray(series)) for (const s of series) {
      const data = isObj(s) && Array.isArray((s as { data?: unknown }).data) ? (s as { data: unknown[] }).data : (Array.isArray(s) ? s : null);
      if (data) for (const v of data) {
        const n = typeof v === 'number' ? v : (isObj(v) && typeof (v as { y?: unknown }).y === 'number' ? (v as { y: number }).y : Number(v));
        if (Number.isFinite(n)) vals.push(n);
      }
    }
    if (vals.length) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const ink = dark ? '#EDEDF2' : '#1A1A22';
      const onInk = dark ? '#0C0C0C' : '#fff';
      const text = `média ${mean.toFixed(1).replace('.', ',')}%`;
      // Line width + a contrasting halo come from CSS (.apexcharts-*-annotations line)
      // so the dark dashed line stays legible over both the pale grid and the bars.
      const line = {
        strokeDashArray: 5, borderColor: ink, opacity: 1,
        label: {
          text, position: def.type === 'bar-horizontal' ? 'top' : 'right',
          orientation: 'horizontal', borderColor: ink, borderWidth: 0,
          style: { color: onInk, background: ink, fontSize: '10.5px', fontWeight: 800, padding: { left: 6, right: 6, top: 3, bottom: 3 } },
        },
      };
      opts.annotations = def.type === 'bar-horizontal' ? { xaxis: [{ x: mean, ...line }] } : { yaxis: [{ y: mean, ...line }] };
    }
  }
  if (def.options) mergeDeep(opts, def.options);

  if (!neg) {
    const yaxis = opts.yaxis as Record<string, unknown> | Record<string, unknown>[] | undefined;
    if (Array.isArray(yaxis)) {
      yaxis.forEach(y => { if (y.min === undefined) y.min = 0; });
    } else if (yaxis && yaxis.min === undefined && def.type !== 'donut' && def.type !== 'pie' && def.type !== 'radialBar' && def.type !== 'radar' && def.type !== 'treemap') {
      yaxis.min = 0;
    }
  }
  // ApexCharts renders legend labels via innerHTML, so a series name with "<"
  // (e.g. "<R$1,5k") is parsed as a tag and vanishes. Escape it unless overridden.
  {
    const lg = (isObj(opts.legend) ? opts.legend : (opts.legend = {})) as Record<string, unknown>;
    if (lg.formatter == null) {
      lg.formatter = (name: unknown) => String(name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }
  return opts;
}

/** Build a chart def from resolved binding output (series come pre-aggregated). */
export function defFromResolved(
  chartType: ChartType,
  resolved: { categories: string[]; series: ResolvedSeries[] },
  extra: Partial<ChartDef> = {},
): ChartDef {
  const isCircular = chartType === 'donut' || chartType === 'pie' || chartType === 'radialBar' || chartType === 'treemap';
  if (isCircular) {
    const first = resolved.series[0];
    return { type: chartType, series: first ? first.data : [], labels: resolved.categories, ...extra };
  }
  return { type: chartType, series: resolved.series, categories: resolved.categories, ...extra };
}

/** Tracks live ApexCharts instances for the current section. */
export class ChartManager {
  private charts = new Map<string, ApexInstance>();
  /** One shared observer for every chart element in this section; fires a single
   *  coalesced reflow per frame whenever any tile's size lands or changes. */
  private ro?: ResizeObserver;
  private roPending = false;

  create(elId: string, def: ChartDef): void {
    if (typeof ApexCharts === 'undefined') return;
    const el = document.getElementById(elId);
    if (!el) return;
    const inst = new ApexCharts(el, buildOptions(def));
    this.charts.set(elId, inst);
    // render() is async; in a freshly (re)built grid it can measure a transient or
    // zero container size, collapsing bar/area geometry to the baseline (horizontal
    // bars then render at zero length). Once render settles, a resize triggers
    // ApexCharts' own geometry recompute against the now-final size. Deterministic
    // — keyed to render completion, not a guessed delay.
    Promise.resolve(inst.render())
      .then(() => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('resize')); })
      .catch(() => { /* noop */ });
    // The shared observer keeps geometry correct on later layout changes (window
    // resize, layout editor) and tiles whose size lands after first paint.
    this.observe(el);
  }

  private observe(el: Element): void {
    if (typeof ResizeObserver === 'undefined' || typeof requestAnimationFrame !== 'function') return;
    if (!this.ro) {
      this.ro = new ResizeObserver(() => {
        if (this.roPending) return;
        this.roPending = true;
        requestAnimationFrame(() => { this.roPending = false; window.dispatchEvent(new Event('resize')); });
      });
    }
    this.ro.observe(el);
  }

  update(elId: string, def: ChartDef): void {
    const inst = this.charts.get(elId);
    if (!inst) { this.create(elId, def); return; }
    // 1) Rebuild geometry silently (fixes plotOptions for series-count changes
    //    in bar charts — a bare updateSeries leaves stale grouped-bar widths).
    // 2) Then animate only the data transition with updateSeries.
    const opts = buildOptions(def);
    void inst.updateOptions(opts, false, false);
    void inst.updateSeries(def.series as unknown[], true);
  }

  /** Re-fit a chart to a new pixel height (width re-measures from the parent).
   *  Used by the layout editor so a chart fills its cell as it's resized. */
  resize(elId: string, height: number): void {
    const inst = this.charts.get(elId);
    if (inst) void inst.updateOptions({ chart: { height } }, true, false);
  }

  /** Immediate post-batch nudge for charts that mounted already-sized; the shared
   *  ResizeObserver handles tiles whose layout lands later. Both paths converge on
   *  ApexCharts' own window-resize geometry recompute. */
  reflow(): void {
    if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') return;
    requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))));
  }

  has(elId: string): boolean { return this.charts.has(elId); }

  destroyAll(): void {
    this.ro?.disconnect();
    this.ro = undefined;
    this.roPending = false;
    for (const inst of this.charts.values()) { try { inst.destroy(); } catch { /* noop */ } }
    this.charts.clear();
  }
}
