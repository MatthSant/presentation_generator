/* bind.ts — resolve a widget's `bind` into ready-to-render numbers.
 *
 * Pure and dependency-free so it runs identically on server and client and is
 * trivial to unit-test. The client applies active dashboard filters in-place by
 * re-resolving binds and feeding ApexCharts `updateSeries` — no refetch, no
 * duplicated per-filter files. */

import type {
  Bind, DataMap, DatasetRow, ResolvedBind, ResolvedSeries, ActiveFilters, AggFn, Scalar,
} from './types.js';

/** Thrown when a bind points at a missing dataset/column. Renderer → error card. */
export class BindError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BindError';
  }
}

function toNum(v: Scalar): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function aggregate(values: number[], fn: AggFn): number {
  if (fn === 'count') return values.length;
  if (values.length === 0) return 0;
  switch (fn) {
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min': return Math.min(...values);
    case 'max': return Math.max(...values);
    case 'sum':
    default:    return values.reduce((a, b) => a + b, 0);
  }
}

/** Distinct values of a column, in first-seen order, coerced to string. */
function distinct(rows: DatasetRow[], col: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const key = String(r[col] ?? '');
    if (!seen.has(key)) { seen.add(key); out.push(key); }
  }
  return out;
}

/** Keep only rows matching every active filter that the table actually declares. */
function applyFilters(
  rows: DatasetRow[],
  filterCols: string[],
  active: ActiveFilters,
): DatasetRow[] {
  const cols = filterCols.filter(c => c in active);
  if (cols.length === 0) return rows;
  return rows.filter(r => cols.every(c => String(r[c] ?? '') === String(active[c])));
}

/**
 * Resolve a bind against the datasets and current filters.
 * @throws BindError if the dataset or a referenced column is absent.
 */
export function resolveBind(
  bind: Bind,
  datasets: DataMap,
  active: ActiveFilters = {},
): ResolvedBind {
  const table = datasets[bind.dataset];
  if (!table) throw new BindError(`dataset "${bind.dataset}" not found`);

  const allCols = new Set<string>();
  for (const r of table.rows) for (const k of Object.keys(r)) allCols.add(k);
  // Tolerância a nome-de-coluna: o gerador (deepen) às vezes escreve um RÓTULO onde a
  // coluna é a chave (ex.: y "ROAS" → coluna "roas"). Casa exato → case-insensitive antes
  // de validar, então um descasamento só de caixa não estoura BindError nem some o widget.
  const byLower = new Map([...allCols].map((k) => [k.toLowerCase(), k]));
  const resolveCol = (c?: string): string | undefined =>
    (c == null || allCols.has(c)) ? c : (byLower.get(c.toLowerCase()) ?? c);
  // y pode ser uma coluna (1 série) ou várias colunas (1 série por coluna).
  const yList: string[] = Array.isArray(bind.y) ? bind.y.map((c) => resolveCol(c) as string) : [];
  bind = {
    ...bind,
    x: resolveCol(bind.x),
    y: Array.isArray(bind.y) ? yList : resolveCol(bind.y as string | undefined),
    series: resolveCol(bind.series),
    metrics: bind.metrics?.map((m) => resolveCol(m) as string),
    where: bind.where ? Object.fromEntries(Object.entries(bind.where).map(([k, v]) => [resolveCol(k) ?? k, v])) : bind.where,
  };
  const requireCol = (col: string | undefined, field: string) => {
    if (col && !allCols.has(col)) {
      throw new BindError(`bind.${field} "${col}" is not a column of dataset "${bind.dataset}"`);
    }
  };
  requireCol(bind.x, 'x');
  if (Array.isArray(bind.y)) bind.y.forEach((c, i) => requireCol(c, `y[${i}]`));
  else requireCol(bind.y, 'y');
  requireCol(bind.series, 'series');
  (bind.metrics ?? []).forEach((m, i) => requireCol(m, `metrics[${i}]`));
  for (const col of Object.keys(bind.where ?? {})) requireCol(col, `where.${col}`);

  let rows = applyFilters(table.rows, table.filters ?? [], active);
  if (bind.where) {
    const conds = Object.entries(bind.where);
    rows = rows.filter(r => conds.every(([c, v]) => String(r[c] ?? '') === String(v)));
  }
  const agg: AggFn = bind.agg ?? 'sum';

  // Totals per numeric column (kpi widgets consume these via the `key` field).
  const totals: Record<string, number> = {};
  for (const col of allCols) {
    const vals = rows.map(r => r[col]).filter(v => typeof v === 'number') as number[];
    if (vals.length) totals[col] = aggregate(rows.map(r => toNum(r[col])), agg === 'count' ? 'sum' : agg);
  }

  let categories: string[] = [];
  let series: ResolvedSeries[] = [];

  // Aggregate a category's y values, but return null (a CHART GAP) when there is
  // no real datum — so missing/empty points break the line instead of plunging to
  // 0. An explicit numeric 0 is kept (it's real data, not a gap).
  const aggOrNull = (subset: DatasetRow[], col: string): number | null => {
    const raw = subset.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '');
    return raw.length ? aggregate(raw.map(toNum), agg) : null;
  };

  if (bind.x && bind.y) {
    categories = distinct(rows, bind.x);
    const rowsFor = (cat: string) => rows.filter(r => String(r[bind.x!] ?? '') === cat);

    if (Array.isArray(bind.y)) {
      // y-array: uma série por coluna (ex.: ["CPL","qual"] → duas linhas).
      series = bind.y.map(col => ({
        name: col,
        data: categories.map(cat => aggOrNull(rowsFor(cat), col)),
      }));
    } else if (bind.series) {
      const seriesKeys = distinct(rows, bind.series);
      series = seriesKeys.map(sk => ({
        name: sk,
        data: categories.map(cat => aggOrNull(
          rowsFor(cat).filter(r => String(r[bind.series!] ?? '') === sk), bind.y as string)),
      }));
    } else {
      series = [{
        name: bind.name ?? (bind.y as string),
        data: categories.map(cat => aggOrNull(rowsFor(cat), bind.y as string)),
      }];
    }
  }

  return { categories, series, rows, totals };
}
