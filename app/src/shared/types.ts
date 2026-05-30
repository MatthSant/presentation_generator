/* types.ts — the 3-layer data contract (shared server ↔ client).
 *
 *   Layer 1  dataset.json  → numbers only (long-format tables, filters as columns)
 *   Layer 2  sXX.json      → view: a flat list of widgets that reference data via `bind`
 *   Layer 3  layout.json   → grid coordinates per widget
 *
 * The LLM/skill writes layers 2 and 3 and emits layer 1 from Python. Numbers are
 * never transcribed into the view — widgets bind to dataset columns. */

/* ─────────────────────────────  Layer 1 — Dataset  ───────────────────────────── */

export type Scalar = string | number | boolean | null;
export type DatasetRow = Record<string, Scalar>;

export interface DatasetTable {
  /** Dimension columns (group-by axes), e.g. ["mes"]. */
  dims: string[];
  /** Filter columns the dashboard can slice by, e.g. ["canal"]. */
  filters?: string[];
  /** Long-format rows: one object per combination of dims × filters. */
  rows: DatasetRow[];
}

/** Map of table name → table. This is the whole `dataset.json`. */
export type DataMap = Record<string, DatasetTable>;

/* ─────────────────────────────  Binding  ───────────────────────────── */

export type AggFn = 'sum' | 'avg' | 'min' | 'max' | 'count';

/** A widget's reference into a dataset table. */
export interface Bind {
  /** Table name in the DataMap. */
  dataset: string;
  /** Dimension column for categories (group-by axis). */
  x?: string;
  /** Numeric column projected into series values. */
  y?: string;
  /** Optional column whose distinct values split the data into multiple series. */
  series?: string;
  /** Numeric columns to total (used by kpi-row). */
  metrics?: string[];
  /** Aggregation applied when several rows collapse into one x/metric. Default "sum". */
  agg?: AggFn;
  /** Explicit series name when there is a single series (defaults to `y`). */
  name?: string;
}

/** One resolved series, ApexCharts-compatible. */
export interface ResolvedSeries {
  name: string;
  data: number[];
}

/** Output of resolveBind — everything a widget needs to render, numbers included. */
export interface ResolvedBind {
  /** Distinct x values in first-seen order (chart categories / table row keys). */
  categories: string[];
  /** One entry per series split (single entry when `series` is absent). */
  series: ResolvedSeries[];
  /** Filtered rows (after active filters), for table-style widgets. */
  rows: DatasetRow[];
  /** Aggregated total per numeric column over the filtered rows (for kpi-row). */
  totals: Record<string, number>;
}

/** Active dashboard filters: column → selected value. Absent column = "all". */
export type ActiveFilters = Record<string, string>;

/* ─────────────────────────────  Layer 2 — View / Widgets  ───────────────────────────── */

export type ColorToken = 'p' | 'g' | 'a' | 'r' | 'n';

export type ChartType =
  | 'bar' | 'bar-horizontal' | 'donut' | 'pie' | 'line' | 'area'
  | 'mixed' | 'stacked' | 'radialBar' | 'scatter' | 'radar' | 'treemap';

export const WIDGET_TYPES = [
  'kpi-row', 'chart', 'table', 'heatmap',
  'find-block', 'find-note', 'highlight', 'ni', 'ni-vertical',
  'label-sec', 'request', 'xs',
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

interface WidgetBase {
  /** Stable id, unique within the section. Used by layout + block editor. */
  id: string;
  type: WidgetType;
}

export interface KpiItem {
  /** Dataset column to total when the row has a `bind`; else inline value is used. */
  key?: string;
  label: string;
  value?: string | number;
  color?: ColorToken;
  /** printf-ish hint for the client formatter, e.g. "R$", "%", "0.0". */
  format?: string;
}
export interface KpiRowWidget extends WidgetBase {
  type: 'kpi-row';
  items: KpiItem[];
  bind?: Bind;
}

export interface ChartWidget extends WidgetBase {
  type: 'chart';
  chartType: ChartType;
  title?: string;
  height?: number;
  bind?: Bind;
  /** Inline series (used when there is no bind). */
  series?: unknown;
  categories?: string[];
  labels?: string[];
  colors?: string[];
  distributed?: boolean;
  stackType?: string;
  /** Raw ApexCharts options override; may contain serialized "function(){}" strings. */
  options?: Record<string, unknown>;
  /** Filter column this chart responds to (informational; binding uses activeFilters). */
  filterBy?: string;
}

export type TableCell = string | number | { value: string | number; cls?: string; title?: string };
export interface TableWidget extends WidgetBase {
  type: 'table';
  cols: string[];
  rows?: TableCell[][];
  bind?: Bind;
  caption?: string;
}

export interface HeatCell { value: string | number; cls?: string; title?: string }
export interface HeatRow { label: string; cells: HeatCell[] }
export interface HeatmapWidget extends WidgetBase {
  type: 'heatmap';
  cols: string[];
  rows: HeatRow[];
  caption?: string;
}

export interface FindBlockWidget extends WidgetBase {
  type: 'find-block';
  tag?: string;
  tagColor?: ColorToken;
  title: string;
  detail?: string;
  /** Id of a modal in the section's `modals`. */
  modal?: string;
}

export interface FindNoteWidget extends WidgetBase {
  type: 'find-note';
  text: string;
}

export interface HighlightWidget extends WidgetBase {
  type: 'highlight';
  text: string;
  label?: string;
  color?: ColorToken;
}

export interface NiWidget extends WidgetBase {
  type: 'ni' | 'ni-vertical';
  n?: number | string;
  title: string;
  why?: string;
  action?: string;
}

export interface LabelSecWidget extends WidgetBase {
  type: 'label-sec';
  text: string;
  sub?: string;
}

export interface RequestWidget extends WidgetBase {
  type: 'request';
  text: string;
  status?: 'pending' | 'done' | string;
}

export interface XsWidget extends WidgetBase {
  type: 'xs';
  text: string;
}

export type Widget =
  | KpiRowWidget | ChartWidget | TableWidget | HeatmapWidget
  | FindBlockWidget | FindNoteWidget | HighlightWidget | NiWidget
  | LabelSecWidget | RequestWidget | XsWidget;

/** Widgets that carry a data binding. */
export const BINDABLE_TYPES = ['kpi-row', 'chart', 'table', 'heatmap'] as const;

export interface Modal {
  id: string;
  title?: string;
  /** A modal renders a nested flat widget list. */
  widgets?: Widget[];
}

export interface SectionHeader {
  badge?: string;
  title: string;
  sub?: string;
}

/** A section view (`sXX.json`). */
export interface Section {
  id: string;
  header: SectionHeader;
  widgets: Widget[];
  modals?: Modal[];
}

/* ─────────────────────────────  Layer 3 — Layout  ───────────────────────────── */

export interface LayoutItem {
  id: string;
  type?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  sections: Record<string, LayoutItem[]>;
  updatedAt?: string;
}

/* ─────────────────────────────  Navigation map (`data.json`)  ───────────────────────────── */

export interface FilterDef {
  id: string;
  label: string;
  options: string[];
  default?: string;
  /** Option value that means "no narrowing" (e.g. "Geral"). Omitted from active filters. */
  allValue?: string;
}

export interface ReportMeta {
  client?: string;
  title?: string;
  type?: string;
  theme?: 'light' | 'dark';
  created_at?: string;
  filters?: FilterDef[];
}

export interface PageRef {
  id: string;
  label: string;
  sections: { id: string; label: string }[];
}

export interface ReportData {
  meta: ReportMeta;
  pages: PageRef[];
}

/* ─────────────────────────────  Validation  ───────────────────────────── */

export type ValidationLayer = 'dataset' | 'view' | 'layout';

export interface ValidationError {
  layer: ValidationLayer;
  /** Dotted path to the offending node, e.g. "widgets[2].bind.x". */
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}
