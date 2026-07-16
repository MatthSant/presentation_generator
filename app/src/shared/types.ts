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
  /** Numeric column projected into series values. An ARRAY plots one series PER
   *  column (ex.: ["CPL","qual"] → duas linhas) — use com secondaryAxis quando as
   *  métricas têm escalas diferentes. Não combine y-array com `series`. */
  y?: string | string[];
  /** Optional column whose distinct values split the data into multiple series. */
  series?: string;
  /** Numeric columns to total (used by kpi widgets). */
  metrics?: string[];
  /** Aggregation applied when several rows collapse into one x/metric. Default "sum". */
  agg?: AggFn;
  /** Explicit series name when there is a single series (defaults to `y`). */
  name?: string;
  /** Static row filter: keep only rows where each column equals the given value
   *  (e.g. {mes:"Jan"}). Same mechanism as the active channel filter, but fixed
   *  per widget — lets a widget isolate one slice (a month, a category) honestly. */
  where?: Record<string, string | number>;
}

/** One resolved series, ApexCharts-compatible. */
export interface ResolvedSeries {
  name: string;
  /** null = a gap (no datum for that category) — charts break the line there. */
  data: (number | null)[];
}

/** Output of resolveBind — everything a widget needs to render, numbers included. */
export interface ResolvedBind {
  /** Distinct x values in first-seen order (chart categories / table row keys). */
  categories: string[];
  /** One entry per series split (single entry when `series` is absent). */
  series: ResolvedSeries[];
  /** Filtered rows (after active filters), for table-style widgets. */
  rows: DatasetRow[];
  /** Aggregated total per numeric column over the filtered rows (for kpi widgets). */
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
  'kpi', 'chart', 'table', 'heatmap', 'rank-card',
  'find-block', 'find-note', 'highlight', 'ni', 'ni-vertical',
  'label-sec', 'request', 'xs',
  'def-step', 'mdef-block', 'grp-list',
  'eyebrow', 'kpi-strip', 'kpi-card', 'metric-toggle', 'heatmap-toggle', 'chart-toggle', 'chart-table',
  'embed', 'link-card', 'scatter-picker', 'evolution-picker', 'qa-card', 'funnel', 'strat-grid', 'bar-list', 'cri-list', 'meta-bars', 'escopo-cards', 'channel-table', 'bullet-groups', 'quadrant-scatter',
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

interface WidgetBase {
  /** Stable id, unique within the section. Used by layout + block editor. */
  id: string;
  type: WidgetType;
}

/** A single metric tile. One KPI per block — lay several side by side via the
 *  layout grid rather than packing many into one widget. */
export interface KpiWidget extends WidgetBase {
  type: 'kpi';
  /** Dataset column to total when the widget has a `bind`; else inline value is used. */
  key?: string;
  label: string;
  value?: string | number;
  color?: ColorToken;
  /** printf-ish hint for the client formatter, e.g. "R$", "%", "0.0". */
  format?: string;
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
  /** Bar only: color each bar by the sign of its value — green when ≥0, red when
   *  <0 — for diverging metrics (diff vs. benchmark). Reads green/red from the
   *  live palette, so it stays theme-aware. Overrides `colors`/`distributed`. */
  diverging?: boolean;
  /** Format the value axis + data labels as a rounded percentage ("15%"). */
  pct?: boolean;
  /** Fixed value-axis bounds. Leave empty for auto-scale; set the same min/max on a
   *  group of charts to make them visually comparable (shared domain). */
  axisMin?: number;
  axisMax?: number;
  /** Draw a dashed reference line at the mean of all plotted values, with a "média X%"
   *  label. Vertical on horizontal bars, horizontal otherwise. */
  meanLine?: boolean;
  stackType?: string;
  /** Raw ApexCharts options override; may contain serialized "function(){}" strings. */
  options?: Record<string, unknown>;
  /** Filter column this chart responds to (informational; binding uses activeFilters). */
  filterBy?: string;
  /** Scatter only: overlay a regression line of this kind, fitted from the points. */
  trend?: 'linear' | 'exp' | 'log' | 'pow';
  /** Donut/pie: show the summed total in the center hole. */
  donutTotal?: boolean;
  /** Caption under the donut center total (defaults to "Total"). */
  totalLabel?: string;
  /** Enable per-slice/point value labels (e.g. donut % on slices). */
  showLabels?: boolean;
  /** Donut/pie: legenda à direita com valor absoluto + % por fatia (em vez do nome só). */
  legendValues?: boolean;
  /** Line only: render the last series dashed (a reference "Média" line). */
  dashLast?: boolean;
  /** Value formatting for axis/tooltip/labels: pct | money | x | int | num (pt-BR). */
  valueFormat?: string;
  /** When true, drop per-series outliers (Tukey IQR) before plotting. Toggled in UI. */
  outliers?: boolean;
  /** Mixed only: 0-based index (or indices) of the series to plot on a secondary
   *  right-hand axis. An array groups several series onto one shared right axis. */
  secondaryAxis?: number | number[];
  /** Suffix for secondary-axis labels (e.g. "%"). */
  secondaryAxisSuffix?: string;
  /** Pill exibido ao lado do título (ex.: "▲ 53.5% vs início"). */
  badge?: { text: string; tone?: 'pos' | 'neg' | 'neutral' };
  /** Número-destaque + legenda acima do gráfico (ex.: total de leads acumulado). */
  headline?: { value: string; caption?: string };
  /** Bar: destaca as últimas N barras na cor primária; demais na 1ª cor (lilás).
   *  Use colors:[claro, escuro]. */
  highlightLast?: number;
  /** Linhas de meta tracejadas (referência horizontal): meta total / to-date. */
  goalLines?: { value: number; label?: string; color?: string }[];
}

export type TableCell = string | number | {
  value: string | number; cls?: string; title?: string;
  /** Metric cell: variation vs the previous column, shown as a tinted pill + a
   *  muted relative-% line under the value. `tone` colors the pill. */
  delta?: string; rel?: string; tone?: 'pos' | 'neg' | 'neutral';
  /** Link cell: renders the value as an anchor opening in a new tab (ex.: criativo → post no IG). */
  link?: string;
};
export interface TableWidget extends WidgetBase {
  type: 'table';
  cols: string[];
  rows?: TableCell[][];
  bind?: Bind;
  caption?: string;
  /** Optional title block above the table (tt-name + tt-sub). */
  title?: string;
  sub?: string;
  /** Per-column metric definitions → an "i" info icon with a tooltip on the header. */
  defs?: Record<string, string>;
  /** Per-column heat coloring from the cell value: 'diff' (diverging vs. benchmark)
   *  or 'uplift' (long-term scale). Empty → no coloring. */
  colorScale?: Record<string, 'diff' | 'uplift' | 'amp' | 'surv'>;
}

export interface HeatCell { value: string | number; cls?: string; title?: string }
export interface HeatRow { label: string; cells: HeatCell[]; title?: string }
export interface HeatmapWidget extends WidgetBase {
  type: 'heatmap';
  /** Column headers. Optional when bound — derived from the `colKey` column. */
  cols?: string[];
  /** Inline rows. Optional when bound — pivoted from the dataset rows. */
  rows?: HeatRow[];
  caption?: string;
  /** Bind a long-format table (one row per cell) and pivot it into the grid so
   *  the channel toggle re-filters it. Row → `rowKey`, column → `colKey`, value
   *  → `valKey`, optional CSS class → `clsKey`, optional tooltip → `titleKey`. */
  bind?: Bind;
  rowKey?: string;
  colKey?: string;
  valKey?: string;
  clsKey?: string;
  titleKey?: string;
}

/** One tab of a heatmap-toggle: its own bound dataset + pivot keys. */
export interface HeatmapTab {
  label: string;
  sub?: string;
  bind: Bind;
  rowKey?: string;
  colKey?: string;
  valKey?: string;
  clsKey?: string;
  titleKey?: string;
  /** Optional per-cell class/tooltip used when the platform toggle is in 'hist' mode
   *  (comparação vs lançamento anterior). Ausente → a célula não muda no toggle. */
  clsHistKey?: string;
  titleHistKey?: string;
}
/** A single heatmap card whose content switches between N bound datasets via a
 *  segmented toggle. The tab count is data-driven (add/remove tabs in the JSON). */
/** Optional second-level toggle: each scope carries its own dimension tabs
 *  (e.g. Pago vs Orgânico, each with Canal/Campanha/…). */
export interface HeatmapScope { label: string; tabs: HeatmapTab[]; }
export interface HeatmapToggleWidget extends WidgetBase {
  type: 'heatmap-toggle';
  /** Fixed card title; if omitted, the active tab's label is shown. */
  title?: string;
  /** Single-toggle form: the dimension tabs directly. */
  tabs?: HeatmapTab[];
  /** Two-toggle form: a scope toggle on the left + dimension tabs on the right. */
  scopes?: HeatmapScope[];
}

/** One tab of a chart-toggle: a full chart config (minus type/id). */
export interface ChartToggleTab { label: string; sub?: string; chart: Omit<ChartWidget, 'type' | 'id'>; }
/** A single card whose chart switches between N configs via a segmented toggle.
 *  All charts mount up front; the toggle shows/hides them. Tab count is data-driven. */
export interface ChartToggleWidget extends WidgetBase {
  type: 'chart-toggle';
  title?: string;
  sub?: string;
  tabs: ChartToggleTab[];
}

/** Consistency classification of a ranking group, precomputed upstream. */
export type RankClass = 'cons' | 'pos' | 'var' | 'neg' | 'crit';

/** One ranking card (inline form). Numbers are percentages already in %. */
export interface RankCard {
  pos?: number;
  name: string;
  /** Main variation vs benchmark (launch window), in %. */
  diffMain: number;
  /** Long-term (12m) variation vs benchmark, in %. */
  diff12m?: number;
  /** Representativeness of the group, in %. */
  rep?: number;
  /** Launches above benchmark. */
  wins?: number;
  /** Total launches considered. */
  total?: number;
  classe?: RankClass;
}

/** A consistency ranking: renders its own grid of colored cards, one per group.
 *  Bind to a dataset (rows per group, filtered by channel) so the channel toggle
 *  re-filters it; or pass `cards` inline. Column keys default to the conversion
 *  analysis names. Sort is by `diffMain` desc unless rows carry `pos`. */
export interface RankCardWidget extends WidgetBase {
  type: 'rank-card';
  title?: string;
  bind?: Bind;
  cards?: RankCard[];
  /** Dataset column → card field overrides (bound form). */
  nameKey?: string;
  mainKey?: string;
  m12Key?: string;
  repKey?: string;
  winsKey?: string;
  totalKey?: string;
  classeKey?: string;
}

export interface FindBlockWidget extends WidgetBase {
  type: 'find-block';
  tag?: string;
  tagColor?: ColorToken;
  title: string;
  /** Linha de métrica estruturada (ex.: risco): valor-destaque + chip de desvio
   *  colorido + meta de referência. Quando presente, substitui o `title` no topo. */
  stat?: { value: string; delta: string; meta?: string; tone?: 'warn' | 'bad' };
  detail?: string;
  /** Id of a modal in the section's `modals`. Adds the "↗ ver detalhamento" link. */
  modal?: string;
  /** Override the modal link label (default "↗ ver detalhamento"). */
  linkLabel?: string;
  /** Render as an elevated card (white bg + border + left accent bar) instead of
   *  the flat read-path narrative. The two find-block formats. */
  card?: boolean;
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

/** One stat inside a def-step (value + caption, optional color token). */
export interface DefStepStat {
  value: string | number;
  label: string;
  color?: ColorToken;
}

/** A numbered methodology step (universe analysed, classification, etc.).
 *  One step per widget — stack several via the layout grid. Bullets may carry
 *  inline <strong>/<em>. */
export interface DefStepWidget extends WidgetBase {
  type: 'def-step';
  num?: string;
  label?: string;
  title: string;
  stats?: DefStepStat[];
  bullets?: string[];
}

/** A term/metric definition: tag + title + bullets, with an optional
 *  sub-classification (sub-label + its own bullets). Bullets allow inline HTML. */
export interface MdefBlockWidget extends WidgetBase {
  type: 'mdef-block';
  tag?: string;
  title: string;
  bullets?: string[];
  subLabel?: string;
  subBullets?: string[];
}

export interface GrpItem {
  name: string;
  example?: string;
}

/** An auto-numbered list of groups/segments (01, 02, …). */
export interface GrpListWidget extends WidgetBase {
  type: 'grp-list';
  label?: string;
  items: GrpItem[];
}

export interface EyebrowWidget extends WidgetBase {
  type: 'eyebrow';
  /** Badge content: a number/index ("1") or a glyph icon ("✓", "↗", "!"). */
  n?: string | number;
  /** Color variant of the badge: purple (default), green, amber, red. */
  color?: 'purple' | 'green' | 'amber' | 'red';
  title: string;
  caption?: string;
  /** Divisor de grupo (cabeçalho de seção): estilo mais forte que um eyebrow comum,
   *  para abrir um bloco que contém sub-seções (que usam eyebrows normais). */
  divider?: boolean;
  /** Tooltip (i) ao lado do título — ex.: critérios de cor/marcação de um widget. */
  info?: string;
}
export interface KpiStripItem {
  value: string; label: string; sub?: string; small?: boolean;
  /** Tone for `sub` (variation vs. previous): pos = green, neg = red, neutral = muted. */
  subTone?: 'pos' | 'neg' | 'neutral';
  /** Per-period series for a trend sparkline under the value (nulls = gaps). */
  spark?: (number | null)[];
}
export interface KpiStripWidget extends WidgetBase {
  type: 'kpi-strip';
  items: KpiStripItem[];
  /** >1 → o strip quebra em N linhas (4 por linha) em vez de espremer tudo numa
   *  só. Usado quando há muitos itens com rótulos longos (ex.: captação). */
  rows?: number;
}

/** One metric as an elevated card (vs the flat kpi-strip). `feature` = headline
 *  card with icon + variation pill + trend sparkline; `volume` = compact card
 *  with a proportion bar. Laid out one-per-tile on the dashboard grid. */
export interface KpiCardWidget extends WidgetBase {
  type: 'kpi-card';
  tier?: 'feature' | 'volume';
  /** Banda de atingimento (feature): card horizontal e compacto — rótulo + valor
   *  grande à esquerda, `delta` como pill grande à direita. Para metas / meta-to-date
   *  e qualquer "X / alvo · %". Recurso de plataforma, não exclusivo de um tipo. */
  band?: boolean;
  /** Destaque (feature): fundo roxo em degradê + texto claro — p/ a métrica-chave
   *  da seção (ex.: CPMQL nos KPIs macro). */
  emph?: boolean;
  /** Tom de fundo (tint) do card por categoria — p/g/a/r/n. Para grades de células
   *  categóricas (ex.: tipo de lead: roxo base, vermelho pago, verde orgânico). */
  tint?: ColorToken;
  label: string;
  value: string;
  sub?: string;
  /** Definição/fórmula opcional — renderiza um "i" com tooltip após o rótulo
   *  (ex.: indicadores calculados como ROI). */
  info?: string;
  icon?: string;
  iconColor?: string;
  /** Variation badge (feature tier), e.g. "↑ +3.0pp vs anterior". */
  delta?: string;
  deltaTone?: 'pos' | 'neg' | 'neutral' | 'emph';
  /** Dual delta for the meta/histórico toggle: [texto, tone] por modo. Quando
   *  presente, o badge troca ao vivo com o controle `compare` (feature de plataforma). */
  cmp?: { meta: [string, string]; hist: [string, string] };
  /** Hierarquia tática (acompanhamento): valor dos últimos 3 dias, flag de tendência
   *  e rodapé de meta com selo ✓/⚠/✕. Quando presentes, renderizam em linhas próprias. */
  d3?: { value: string; dir?: 'up' | 'down'; tone?: 'pos' | 'neg' | 'neutral' };
  flag?: { text: string; tone?: 'pos' | 'neg' | 'neutral' };
  goal?: { label: string; delta?: string; status?: 'ok' | 'neutral' | 'warn' | 'bad' };
  /** Rodapé de meta toggleável (meta/histórico): substitui o pill de comparação no
   *  topo — a base do card já mostra o desvio, então o controle `compare` troca o
   *  próprio rodapé ao vivo entre Meta e Histórico (sem pill redundante). */
  goalCmp?: {
    meta: { label: string; delta?: string; status?: 'ok' | 'neutral' | 'warn' | 'bad' };
    hist: { label: string; delta?: string; status?: 'ok' | 'neutral' | 'warn' | 'bad' };
  };
  /** Trend sparkline series (feature tier); nulls = gaps. */
  spark?: (number | null)[];
  /** Proportion bar segments (volume tier); remainder fills as a muted track. */
  bar?: { pct: number; color: string }[];
}

/** Inline indicator selector (histórico Panorama). Switching it recomputes the
 *  breakdown charts/tables below via a `historico-metric` DOM event. */
export interface MetricToggleWidget extends WidgetBase {
  type: 'metric-toggle';
  metrics: { id: string; label: string }[];
  current: string;
}

/** Combined block: one chart on top + its comparison table below, in a single
 *  card (histórico breakdowns). Full-width so the per-launch columns fit. */
export interface ChartTableWidget extends WidgetBase {
  type: 'chart-table';
  title?: string;
  chart: ChartWidget;
  table?: TableWidget;
}

/** Embed de uma publicação (preview do anúncio na ficha de criativo). Instagram via
 *  iframe /embed/; demais plataformas caem num placeholder com link. Recurso de
 *  plataforma — qualquer análise pode embutir um post. */
export interface EmbedWidget extends WidgetBase {
  type: 'embed';
  /** URL do post (ex.: https://www.instagram.com/p/CODE/). */
  url: string;
  title?: string;
  /** 'instagram' | 'facebook' | … (derivado da URL quando ausente). */
  platform?: string;
  caption?: string;
}

/** Card clicável que navega para uma seção (ficha). Grid de cards de criativo:
 *  nome + sub + tags + métricas 2×2 + indicador principal com barra. Recurso de
 *  plataforma — qualquer análise pode listar entidades que abrem outra seção. */
export interface LinkCard {
  title: string;
  sub?: string;
  tags?: Array<{ label: string; tone?: ColorToken }>;
  metrics?: Array<{ label: string; value: string }>;
  main?: { label: string; value: string; pct?: number; tone?: ColorToken };
  gotoPage?: string;
  gotoSection?: string;
}
export interface LinkCardWidget extends WidgetBase {
  type: 'link-card';
  title?: string;
  /** Cards já vêm ORDENADOS por `main` → numera 1..n e a barra lê como "vs o 1º".
   *  Opt-in: sem isso a posição não significa nada e o número mentiria. */
  ranked?: boolean;
  cards: LinkCard[];
}

/** Dispersão com seletor de métrica por eixo: dois dropdowns (X e Y) reconstroem o
 *  scatter client-side a partir das métricas embutidas. Recurso de plataforma. */
export interface ScatterMetric { id: string; label: string; fmt?: string; }
export interface ScatterPoint { name: string; vals: Record<string, number | null>; }
export interface ScatterPickerWidget extends WidgetBase {
  type: 'scatter-picker';
  title?: string;
  height?: number;
  metrics: ScatterMetric[];
  points: ScatterPoint[];
  x?: string;
  y?: string;
  /** Opt-in: toggle de DIMENSÃO (ex.: público/criativo) — troca o conjunto de pontos. */
  dimToggle?: { key: string; label: string }[];
  dims?: { [dimKey: string]: ScatterPoint[] };
  /** Opt-in: linha de tendência (regressão). 'best' = escolhe o melhor R² entre reta/log/exp. */
  trend?: 'linear' | 'exp' | 'log' | 'pow' | 'best';
  /** Opt-in: id de métrica que dimensiona o tamanho do ponto (bolha) — ex.: 'inv'. */
  sizeBy?: string;
}

/** Evolução no tempo com seletor de métrica: um dropdown reconstrói a linha
 *  client-side a partir das métricas embutidas (points.name = data do eixo X).
 *  Recurso de plataforma — opt-in via widget. */
export interface EvolutionPickerWidget extends WidgetBase {
  type: 'evolution-picker';
  title?: string;
  height?: number;
  metrics: ScatterMetric[];
  points: ScatterPoint[];
  current?: string;
  /** Opt-in DUAL mode: quando presente, um 2º seletor escolhe uma segunda métrica
   *  plotada no eixo da direita (escalas independentes). Sem ele, mono-métrica. */
  current2?: string;
  /** Opt-in COMBO (requer DUAL): 1ª métrica em BARRAS, 2ª em LINHA (eixos independentes). */
  combo?: boolean;
}

/** Gráfico embutido dentro de outro widget (qa-card) — subconjunto de ChartWidget. */
export type EmbeddedChart = Omit<ChartWidget, 'type'> & { type?: 'chart' };

/** qa-card — unidade "pergunta" da Análise 360°: chip + título + grade de números +
 *  chips de veredito + 1 gráfico embutido. */
export interface QaCardWidget extends WidgetBase {
  type: 'qa-card';
  /** Badge da pergunta (ex.: "Q5"). */
  q?: string;
  /** Cor do chip/accent: g|a|r|p|n. */
  qColor?: 'g' | 'a' | 'r' | 'p' | 'n';
  title: string;
  /** Chip de veredito do card (canto direito do header). */
  verdict?: { label: string; tone?: 'pos' | 'neg' | 'neutral' };
  /** Grade de 2–4 números-chave (cada um vira um stat-tile colorido). */
  stats?: { label: string; value: string; sub?: string; delta?: string; tone?: 'pos' | 'neg' | 'neutral' | 'purple' }[];
  /** Fila de chips de veredito (ex.: temperatura por ROAS). */
  chips?: { label: string; glyph?: string; tone?: 'pos' | 'neg' | 'neutral' }[];
  /** Gráfico embutido (reusa renderChart + bind). */
  chart?: EmbeddedChart;
}

/** funnel — funil visual: barras degradê por etapa + pills perda/migram por transição. */
export interface FunnelWidget extends WidgetBase {
  type: 'funnel';
  title?: string;
  sub?: string;
  /** palavra da base na tag de passagem (default "meta"; ex.: "bench" p/ funil de captação). */
  baseLabel?: string;
  /** esconde a tag de perda (▼ X%) — só mostra a taxa de passagem vs bench + MAIOR FURO. */
  hideLoss?: boolean;
  /** vlabel = rótulo do valor (ex.: "R$ 151k" p/ uma etapa em dinheiro); default = value formatado. */
  steps: { label: string; value: number; vlabel?: string }[];
  /** Liga steps[i] → steps[i+1]; loss/migrate em %; worst = MAIOR FURO; invalid = dado inválido.
   *  bench/gap = comparação vs meta; benchHist/gapHist = vs histórico (toggle de plataforma).
   *  note = tag (ex.: "CPM R$ 56,15 · bench R$ 60") quando a transição não é taxa de passagem;
   *  noteTone colore a tag (pos/warn/neg/neutral). */
  transitions?: { loss?: number; migrate?: number; bench?: number; gap?: number;
                  note?: string; noteTone?: 'pos' | 'warn' | 'neg' | 'neutral';
                  /** sobrescreve o baseLabel do widget nesta transição (ex.: "meta" p/ qualificação). */
                  baseLabel?: string;
                  /** casas decimais da taxa nesta transição (default 1; ex.: 2 p/ CTR). */
                  decimals?: number;
                  benchHist?: number; gapHist?: number; worst?: boolean; invalid?: boolean }[];
}

/** strat-grid — perguntas estratégicas: N colunas (cards), cada uma com título e
 *  linhas "pergunta · chip de achado · valor de apoio". Espelha o One Pager da fonte. */
export interface StratGridWidget extends WidgetBase {
  type: 'strat-grid';
  cols: { title: string; items: { q: string; chip?: { text: string; tone?: 'pos' | 'neg' | 'neutral' }; val?: string }[] }[];
}

/** bar-list — lista de barras horizontais com rótulo + valor + %, hierárquica
 *  (indent) e com cards de stat opcionais no rodapé. Cobre "Origem do Tráfego"
 *  (Pago/Orgânico + canais) e "Temperatura" (Quente/Morno + CPL médio). */
export interface BarListWidget extends WidgetBase {
  type: 'bar-list';
  title?: string;
  caption?: string;
  rows: { label: string; value: string; pct?: number; bar?: number; indent?: boolean; icon?: string; color?: string;
          /** Barra dividida (100% empilhada) em vez de barra única — ex.: split Pago/Orgânico
           *  por categoria. Cada segmento: largura % + cor + rótulo interno. */
          seg?: { pct: number; color: string; label?: string }[] }[];
  /** escala máxima das barras (default = maior `bar`). */
  max?: number;
  /** Legenda das séries no topo (ex.: Pago / Orgânico) — usada com linhas `seg`. */
  legend?: { label: string; color: string }[];
  /** cards de stat no rodapé (ex.: Quente/Morno com CPL médio em destaque). */
  cards?: { label: string; tone?: 'red' | 'amber' | 'orange' | 'green' | 'blue' | 'purple'; icon?: string;
            stats?: { label: string; value: string }[]; headline?: { label: string; value: string } }[];
}

/** meta-bars — comparativo Realizado vs Meta em linhas-card: indicador (nome + sub
 *  "real · meta X"), barra de atingimento (% da meta, cor por categoria), % grande,
 *  Δ vs meta (pill) e histórico. Usado no Panorama do debriefing (funil de indicadores). */
export interface MetaBarsWidget extends WidgetBase {
  type: 'meta-bars';
  title?: string;
  caption?: string;
  /** rótulos das colunas (default pt-BR). */
  cols?: { real?: string; bar?: string; delta?: string; meta?: string; hist?: string };
  rows: {
    label: string;
    /** valor realizado (coluna à esquerda da barra). */
    real?: string;
    /** atingimento = real/meta×100 — preenche a barra (cap 100%). */
    pct?: number;
    /** % do atingimento exibido ao lado da barra (ex.: "84%"). */
    pctLabel?: string;
    /** Δ vs meta (sinal real + tom de avaliação) — também colore a barra. */
    delta?: { value: string; tone?: 'pos' | 'neg' | 'neutral' };
    /** valor absoluto da meta. */
    meta?: string;
    /** valor absoluto do histórico (lançamento anterior). */
    hist?: string;
  }[];
}

/** escopo-cards — resumo executivo por escopo: cards (ex.: Geral · Pago · Orgânico)
 *  com rótulo + número grande (leads) + sub (vendas · conv.) e mini-cards coloridos
 *  do breakdown (ex.: Novos/Antigos/Clientes) com contagem + %. */
export interface EscopoCardsWidget extends WidgetBase {
  type: 'escopo-cards';
  title?: string;
  cards: {
    label: string;
    /** cor do rótulo + número grande. */
    tone?: 'purple' | 'green' | 'amber' | 'blue';
    value: string;
    /** unidade após o número grande (ex.: "vendas"), em fonte menor. */
    unit?: string;
    /** chip de relação com a meta (ex.: "82% da meta"). */
    chip?: { text: string; tone?: 'pos' | 'neg' | 'warn' | 'neutral' };
    /** chip vs histórico (toggle de plataforma) — substitui `chip` no modo hist. */
    chipHist?: { text: string; tone?: 'pos' | 'neg' | 'warn' | 'neutral' };
    sub?: string;
    minis: { label: string; value: string; pct?: string; tone?: 'purple' | 'amber' | 'green' | 'blue' }[];
  }[];
}

/** channel-table — tabela com acabamento de app: 1ª coluna = nome (bold), demais
 *  colunas com alinhamento/tom por célula (meta em âmbar, Δ como pill pos/neg,
 *  números à direita). Linha-card com hover; sem cara de tabela HTML crua. */
export interface ChannelTableWidget extends WidgetBase {
  type: 'channel-table';
  title?: string;
  caption?: string;
  /** cabeçalho — a 1ª coluna rotula o nome; as demais alinham as células. */
  cols: { label: string; align?: 'left' | 'right' | 'center' }[];
  rows: {
    name: string;
    /** células correspondentes a cols[1:]. */
    cells: { value: string; align?: 'left' | 'right' | 'center'; tone?: 'meta' | 'pos' | 'neg' | 'warn' | 'neutral' | 'muted'; pill?: boolean }[];
  }[];
  /** visões por modo de comparação (meta/planejado ↔ histórico); o client troca
   *  via toggle de plataforma. Quando presente, sobrepõe cols/rows. */
  cmp?: {
    meta: { cols: ChannelTableWidget['cols']; rows: ChannelTableWidget['rows'] };
    hist?: { cols: ChannelTableWidget['cols']; rows: ChannelTableWidget['rows'] };
  };
}

/** bullet-groups — 3 colunas de bullet-bars (realizado + marca de meta), agrupadas
 *  por desempenho vs meta (acima >5% · próximo ±5% · abaixo <−5%), com toggle local
 *  que troca a métrica (ex.: Vendas ↔ Conversão) — o bucket é recalculado no client. */
export interface BulletGroupsWidget extends WidgetBase {
  type: 'bullet-groups';
  /** rótulo do bloco (usado no compositor de detalhamento; não renderiza — a eyebrow é separada). */
  title?: string;
  /** botões do toggle de métrica; o 1º é o default. `invert` = custo (acima da base é PIOR). */
  toggle: { key: string; label: string; invert?: boolean }[];
  /** definição visual dos 3 grupos (a regra de bucket é fixa: >5% · ±5% · <−5%). */
  groups: { key: 'acima' | 'prox' | 'abaixo'; label: string; tone: 'pos' | 'warn' | 'neg' }[];
  /** canais com valor + base(s) por métrica. A base segue o toggle de plataforma
   *  (meta/planejado ou histórico); entrada nula = canal omitido para a métrica. */
  channels?: BulletChannel[];
  /** Opcional: toggle de DIMENSÃO (canal/temp/público/criativo). Quando presente,
   *  `dims[key]` traz os canais daquela dimensão e `channels` é ignorado. */
  dimToggle?: { key: string; label: string }[];
  dims?: { [dimKey: string]: BulletChannel[] };
}
export interface BulletChannel {
  name: string;
  /** nome completo p/ tooltip quando `name` vem truncado. */
  nameFull?: string;
  metrics: { [metricKey: string]: {
    value: number; vlabel: string;
    bases: { meta?: { v: number; label: string }; hist?: { v: number; label: string } };
  } | null };
}

/** quadrant-scatter — mapa 2×2 dos canais: x = desvio % vs meta de conversão, y =
 *  desvio % vs meta de leads, cor do ponto = avaliação de vendas vs meta (4 níveis).
 *  Cada quadrante tem um significado (escala+eficiência · volume sem conversão · etc). */
/** moldura textual por modo de comparação (planejado/meta · histórico). */
export interface QuadrantFrame {
  axes: { x: string; y: string; heat: string };
  /** nota no rodapé do guia (ex.: "Meta = o planejado de cada canal"). */
  note?: string;
  quadrants: { pos: 'tr' | 'tl' | 'br' | 'bl'; label: string; tone?: 'pos' | 'warn' | 'neutral' | 'neg'; desc?: string }[];
}
export interface QuadrantScatterWidget extends WidgetBase {
  type: 'quadrant-scatter';
  /** rótulo do bloco (compositor de detalhamento; não renderiza — eyebrow é separada). */
  title?: string;
  /** rótulo do tamanho da bolha (ex.: "% de leads"), igual nos dois modos. */
  size?: string;
  /** molduras por modo; o client escolhe via toggle de plataforma (meta↔hist). */
  modes: { meta: QuadrantFrame; hist?: QuadrantFrame };
  /** desvios são computados no client: valor realizado + base meta (e hist, se houver). */
  points: {
    name: string;
    size?: number; slabel?: string;
    conv: number; leads: number; vendas: number;
    meta: { conv: number; leads: number; vendas: number };
    hist?: { conv: number; leads: number; vendas: number };
  }[];
}

/** cri-list — lista de entidades ranqueadas (criativos): thumb + nome (link) +
 *  meta (sub-linha) + stats à direita (ex.: leads + CPMQL proj.). */
export interface CriListWidget extends WidgetBase {
  type: 'cri-list';
  title?: string;
  caption?: string;
  rows: { name: string; link?: string; meta?: string;
          stats: { value: string; label: string; tone?: 'pos' | 'neg' | 'neutral' }[] }[];
}

export type Widget =
  | KpiWidget | ChartWidget | TableWidget | HeatmapWidget | RankCardWidget
  | FindBlockWidget | FindNoteWidget | HighlightWidget | NiWidget
  | LabelSecWidget | RequestWidget | XsWidget
  | DefStepWidget | MdefBlockWidget | GrpListWidget
  | EyebrowWidget | KpiStripWidget | KpiCardWidget | MetricToggleWidget
  | HeatmapToggleWidget | ChartToggleWidget | ChartTableWidget | EmbedWidget | LinkCardWidget | ScatterPickerWidget | EvolutionPickerWidget
  | QaCardWidget | FunnelWidget | StratGridWidget | BarListWidget | CriListWidget | MetaBarsWidget | EscopoCardsWidget | ChannelTableWidget | BulletGroupsWidget | QuadrantScatterWidget;

/** Widgets that carry a data binding. */
export const BINDABLE_TYPES = ['kpi', 'chart', 'table', 'heatmap', 'rank-card'] as const;

export interface Modal {
  id: string;
  title?: string;
  /** A modal renders a nested flat widget list. */
  widgets?: Widget[];
  /** Entrada correspondente em deepen_history (âncora do rating ★1–5). */
  historyId?: string;
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
  /** Em seções det-*: entrada em deepen_history (âncora do rating ★1–5). */
  historyId?: string;
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
  /** Optional cover block shown once at the top of the report content. */
  cover?: { eyebrow?: string; title?: string; meta?: string[] };
  /** Feature flags do relatório. `outliers` controla o botão "Remover outliers"
   *  por gráfico — default LIGADO para qualquer tipo (desative com false). */
  features?: { outliers?: boolean };
  /** Interactive controls (kind = tipo que os interpreta; dispatch no client).
   *  When present, the SPA shows the filter FAB on `pages` and recomputes via
   *  the /render route. */
  controls?: {
    kind: string;
    pages: string[];
    launches: string[];
    metrics: { id: string; label: string }[];
  };
}

export interface PageRef {
  id: string;
  label: string;
  sections: { id: string; label: string }[];
  /** Special page renderers. Omitted → a normal section-grid page. "perguntas"
   *  renders the guiding-questions board instead of a section. */
  kind?: 'perguntas';
}

/* ─────────────────────────────  Perguntas norteadoras  ───────────────────────────── */

/** A mini-stat shown on a question card (label + already-formatted value). */
export interface PerguntaKpi { label: string; value: string }

/** Where "Adicionar" routes: the block whose Claude detalhamento answers the question. */
export interface PerguntaDeepen { sectionId: string; blockId: string; prompt: string }

/** Banda de relevância calculada em Python (perguntas_calc.py). */
export type PerguntaNivel = 'alta' | 'media' | 'baixa';

/** One guiding question, ranked by a fixed Python relevance calc. The prose is
 *  authored; the numbers (relevancia, kpis) come from the calc / signals. */
export interface Pergunta {
  id: string;
  pergunta: string;
  justificativa: string;
  kpis: PerguntaKpi[];
  /** 0–100, from perguntas_calc.py. Absent for custom (manually added) questions. */
  relevancia?: number;
  nivel?: PerguntaNivel;
  deepen: PerguntaDeepen;
  /** Manually added by the consultant — no relevance calc; detalhamento created on add. */
  custom?: boolean;
  /** Live status merged from perguntas_history; absent in the on-disk file. */
  status?: 'seguida' | 'ignorada';
  /** Where the generated detalhamento lives (a section on the Detalhamentos page). */
  det?: { pageId: string; sectionId: string };
}

export interface PerguntasDoc {
  pesos?: Record<string, number>;
  efeito_ref?: number;
  perguntas: Pergunta[];
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
