/* charts.ts — ApexCharts option builder + chart lifecycle.
 *
 * buildOptions is a pure function of (def, theme) so it is unit-testable
 * without a DOM. ChartManager owns live instances for the current section so
 * filters can updateSeries in place instead of re-rendering the dashboard. */

import type { ChartType, ResolvedSeries } from '../shared/types.js';

export interface ChartDef {
  type: ChartType;
  series: unknown;
  categories?: string[];
  labels?: string[];
  colors?: string[];
  distributed?: boolean;
  stackType?: string;
  height?: number;
  options?: Record<string, unknown>;
}

type Theme = 'light' | 'dark';

interface Base {
  dark: boolean;
  labelColor: string;
  defColors: string[];
  base: Record<string, Record<string, unknown>>;
}

function getBase(theme: Theme): Base {
  const dark = theme === 'dark';
  const labelColor = dark ? '#9CA3AF' : '#9A9AA0';
  const gridColor = dark ? 'rgba(255,255,255,.06)' : '#ECECEC';
  const defColors = dark
    ? ['#8B5CF6', '#10B981', '#F59E0B', '#F97316', '#EF4444']
    : ['#6B4FD9', '#0E0E10', '#9A9AA0', '#4A4A50', '#B4322B'];
  const base = {
    chart: { background: 'transparent', toolbar: { show: false }, animations: { enabled: true, speed: 400, dynamicAnimation: { enabled: true, speed: 350 } } },
    theme: { mode: dark ? 'dark' : 'light' },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    tooltip: { theme: dark ? 'dark' : 'light' },
    xaxis: { labels: { style: { colors: labelColor, fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: labelColor, fontSize: '11px' } } },
    dataLabels: { enabled: false },
    legend: { labels: { colors: labelColor } },
  };
  return { dark, labelColor, defColors, base };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
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

export function buildOptions(def: ChartDef, theme: Theme = currentTheme()): Record<string, unknown> {
  const { dark, labelColor, defColors, base } = getBase(theme);
  const b = JSON.parse(JSON.stringify(base)) as typeof base;

  const resolvedType = (def.type === 'mixed' || def.type === 'stacked') ? 'bar'
    : def.type === 'bar-horizontal' ? 'bar'
      : def.type;

  const opts: Record<string, unknown> = {
    chart: { ...b.chart, type: resolvedType, height: def.height ?? 300 },
    series: def.series,
    colors: def.colors || defColors,
  };

  if (def.categories) opts.xaxis = { ...b.xaxis, categories: def.categories };
  if (def.labels) opts.labels = def.labels;

  const chart = opts.chart as Record<string, unknown>;

  if (def.type === 'donut' || def.type === 'pie') {
    opts.legend = { position: 'bottom', labels: { colors: labelColor } };
    opts.plotOptions = { pie: { donut: { size: '65%' } } };
  }
  if (def.type === 'bar' || def.type === 'mixed') {
    opts.plotOptions = { bar: { borderRadius: 2, columnWidth: '55%', ...(def.distributed ? { distributed: true } : {}) } };
    opts.yaxis = { ...b.yaxis, min: 0 };
  }
  if (def.type === 'stacked') {
    chart.stacked = true;
    if (def.stackType) chart.stackType = def.stackType;
    opts.plotOptions = { bar: { borderRadius: 2, columnWidth: '55%' } };
    opts.yaxis = { ...b.yaxis, min: 0 };
  }
  if (def.type === 'bar-horizontal') {
    opts.plotOptions = { bar: { horizontal: true, borderRadius: 2, barHeight: '55%' } };
    opts.yaxis = { labels: { style: { colors: labelColor, fontSize: '11px' } } };
    opts.xaxis = { ...b.xaxis, categories: def.categories, min: 0 };
  }
  if (def.type === 'line') {
    opts.stroke = { curve: 'smooth', width: 2 };
    opts.markers = { size: 3 };
    opts.yaxis = { ...b.yaxis, min: 0 };
  }
  if (def.type === 'area') {
    opts.stroke = { curve: 'smooth', width: 2 };
    opts.fill = { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.2, opacityTo: 0 } };
    opts.yaxis = { ...b.yaxis, min: 0 };
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
    chart.type = 'scatter';
    opts.markers = { size: 5 };
    opts.xaxis = { ...b.xaxis, type: 'numeric' };
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
  if (def.options) mergeDeep(opts, def.options);

  const yaxis = opts.yaxis as Record<string, unknown> | Record<string, unknown>[] | undefined;
  if (Array.isArray(yaxis)) {
    yaxis.forEach(y => { if (y.min === undefined) y.min = 0; });
  } else if (yaxis && yaxis.min === undefined && def.type !== 'donut' && def.type !== 'pie' && def.type !== 'radialBar' && def.type !== 'radar' && def.type !== 'treemap') {
    yaxis.min = 0;
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

  create(elId: string, def: ChartDef): void {
    if (typeof ApexCharts === 'undefined') return;
    const el = document.getElementById(elId);
    if (!el) return;
    const inst = new ApexCharts(el, buildOptions(def));
    void inst.render();
    this.charts.set(elId, inst);
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

  has(elId: string): boolean { return this.charts.has(elId); }

  destroyAll(): void {
    for (const inst of this.charts.values()) { try { inst.destroy(); } catch { /* noop */ } }
    this.charts.clear();
  }
}
