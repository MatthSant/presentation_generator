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
  const requireCol = (col: string | undefined, field: string) => {
    if (col && !allCols.has(col)) {
      throw new BindError(`bind.${field} "${col}" is not a column of dataset "${bind.dataset}"`);
    }
  };
  requireCol(bind.x, 'x');
  requireCol(bind.y, 'y');
  requireCol(bind.series, 'series');
  (bind.metrics ?? []).forEach((m, i) => requireCol(m, `metrics[${i}]`));

  const rows = applyFilters(table.rows, table.filters ?? [], active);
  const agg: AggFn = bind.agg ?? 'sum';

  // Totals per numeric column (kpi-row consumes these via item.key).
  const totals: Record<string, number> = {};
  for (const col of allCols) {
    const vals = rows.map(r => r[col]).filter(v => typeof v === 'number') as number[];
    if (vals.length) totals[col] = aggregate(rows.map(r => toNum(r[col])), agg === 'count' ? 'sum' : agg);
  }

  let categories: string[] = [];
  let series: ResolvedSeries[] = [];

  if (bind.x && bind.y) {
    categories = distinct(rows, bind.x);

    if (bind.series) {
      const seriesKeys = distinct(rows, bind.series);
      series = seriesKeys.map(sk => ({
        name: sk,
        data: categories.map(cat => {
          const vals = rows
            .filter(r => String(r[bind.x!] ?? '') === cat && String(r[bind.series!] ?? '') === sk)
            .map(r => toNum(r[bind.y!]));
          return aggregate(vals, agg);
        }),
      }));
    } else {
      series = [{
        name: bind.name ?? bind.y,
        data: categories.map(cat => {
          const vals = rows.filter(r => String(r[bind.x!] ?? '') === cat).map(r => toNum(r[bind.y!]));
          return aggregate(vals, agg);
        }),
      }];
    }
  }

  return { categories, series, rows, totals };
}
