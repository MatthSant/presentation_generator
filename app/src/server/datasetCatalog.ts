/* datasetCatalog.ts — turns the computed dataset.json into a compact digest for
 * Claude. ONLY aggregated numbers cross this boundary (best/worst group per
 * criterion + the codependency roles already computed) — never raw CSV rows. */

interface Table { dims?: string[]; filters?: string[]; rows: Array<Record<string, unknown>> }
type DataMap = Record<string, Table>;
interface Criterio { id: string; label?: string; abbr?: string }
interface Config { client?: string; title?: string; criterios?: Criterio[] }

export interface CriterioDigest {
  id: string;
  label: string;
  grupos: number;
  melhor: { grupo: string; diff_lcto: number; conv_lcto: number } | null;
  pior: { grupo: string; diff_lcto: number; conv_lcto: number } | null;
  papel?: string;
  amplitude?: string;
  independencia?: string;
}

export interface Digest {
  client: string;
  title: string;
  criterios: CriterioDigest[];
  codependencia: Array<{ fator: string; amplitude: string; independencia: string; papel: string }>;
}

/** Closed catalog of bindable tables for the deepen-card modal: table name +
 *  columns + a couple sample rows. Claude may only `bind` to these names. */
export interface CatalogTable {
  name: string; columns: string[]; dims: string[]; filters: string[]; rowCount: number;
  /** Columns safe to plot as a chart y (real numbers, not formatted strings). */
  numericCols: string[];
  /** Distinct values per dimension (capped) — the valid keys for a bind.where filter. */
  dimValues: Record<string, string[]>;
  sample: Array<Record<string, unknown>>;
}
export interface DeepenCatalog { tables: CatalogTable[] }

const MAX_DIM_VALUES = 24;

export function buildCatalog(dataset: DataMap): DeepenCatalog {
  const tables: CatalogTable[] = [];
  for (const [name, t] of Object.entries(dataset)) {
    const rows = t.rows ?? [];
    const columns = rows.length ? Object.keys(rows[0]) : [];
    const dims = t.dims ?? [];
    const dimValues: Record<string, string[]> = {};
    for (const d of dims) {
      const seen = new Set<string>();
      for (const r of rows) {
        const v = String(r[d] ?? '');
        if (!seen.has(v)) seen.add(v);
        if (seen.size >= MAX_DIM_VALUES) break;
      }
      dimValues[d] = [...seen];
    }
    const numericCols = columns.filter((c) => rows.some((r) => typeof r[c] === 'number'));
    tables.push({ name, columns, dims, filters: t.filters ?? [], rowCount: rows.length, numericCols, dimValues, sample: rows.slice(0, 2) });
  }
  return { tables };
}

const numOf = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);

/** Best/worst group of a criterion, read from crit_<id>_grp (canal=Geral). */
function bestWorst(rows: Array<Record<string, unknown>>): { melhor: CriterioDigest['melhor']; pior: CriterioDigest['pior']; grupos: number } {
  const geral = rows.filter((r) => r.canal === 'Geral');
  if (geral.length === 0) return { melhor: null, pior: null, grupos: 0 };
  const sorted = [...geral].sort((a, b) => numOf(b.diff_lcto) - numOf(a.diff_lcto));
  const pick = (r: Record<string, unknown>) => ({ grupo: String(r.grupo), diff_lcto: numOf(r.diff_lcto), conv_lcto: numOf(r.conv_lcto) });
  return { melhor: pick(sorted[0]), pior: pick(sorted[sorted.length - 1]), grupos: geral.length };
}

export function buildDigest(config: Config, dataset: DataMap): Digest {
  const cod = (dataset['cod_fatores']?.rows ?? []).filter((r) => r.canal === 'Geral');
  const byAbbr = new Map(cod.map((r) => [String(r.Fator), r]));

  const criterios: CriterioDigest[] = (config.criterios ?? []).map((c) => {
    const grp = dataset[`crit_${c.id}_grp`]?.rows ?? [];
    const { melhor, pior, grupos } = bestWorst(grp);
    const f = c.abbr ? byAbbr.get(c.abbr) : undefined;
    return {
      id: c.id,
      label: c.label ?? c.id,
      grupos,
      melhor,
      pior,
      papel: f ? String(f.Papel) : undefined,
      amplitude: f ? String(f.Amplitude) : undefined,
      independencia: f ? String(f['Independ.']) : undefined,
    };
  });

  return {
    client: config.client ?? '',
    title: config.title ?? '',
    criterios,
    codependencia: cod.map((r) => ({
      fator: String(r.Fator), amplitude: String(r.Amplitude),
      independencia: String(r['Independ.']), papel: String(r.Papel),
    })),
  };
}
