/* trend.ts — regression helpers for scatter trend-lines. Pure math, no DOM, so
 * buildOptions can synthesize a fitted line series during option building and
 * stay unit-testable. Ports the four fits the design system documents
 * (linear/exp/log/pow), each reported with its R². */

export type TrendType = 'linear' | 'exp' | 'log' | 'pow';
export type Point = [number, number];

interface Fit { fn: (x: number) => number; label: string; }

function linear(pts: Point[]): Fit {
  const n = pts.length;
  const sx = pts.reduce((s, [x]) => s + x, 0);
  const sy = pts.reduce((s, [, y]) => s + y, 0);
  const sxy = pts.reduce((s, [x, y]) => s + x * y, 0);
  const sx2 = pts.reduce((s, [x]) => s + x * x, 0);
  const m = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
  const b = (sy - m * sx) / n;
  return { fn: x => m * x + b, label: 'Linear' };
}

function exp(pts: Point[]): Fit {
  const lp = pts.filter(([, y]) => y > 0).map(([x, y]) => [x, Math.log(y)] as Point);
  const { fn } = linear(lp);
  return { fn: x => Math.exp(fn(x)), label: 'Exponencial' };
}

function log(pts: Point[]): Fit {
  const lp = pts.filter(([x]) => x > 0).map(([x, y]) => [Math.log(x), y] as Point);
  const { fn } = linear(lp);
  return { fn: x => fn(Math.log(x)), label: 'Logarítmica' };
}

function pow(pts: Point[]): Fit {
  const lp = pts.filter(([x, y]) => x > 0 && y > 0).map(([x, y]) => [Math.log(x), Math.log(y)] as Point);
  const { fn } = linear(lp);
  return { fn: x => Math.exp(fn(Math.log(x))), label: 'Potência' };
}

const FITS: Record<TrendType, (pts: Point[]) => Fit> = { linear, exp, log, pow };

/** Coefficient of determination (R²) of a fit over the observed points. */
export function calcR2(pts: Point[], fn: (x: number) => number): number {
  const my = pts.reduce((s, [, y]) => s + y, 0) / pts.length;
  const ssRes = pts.reduce((s, [x, y]) => s + (y - fn(x)) ** 2, 0);
  const ssTot = pts.reduce((s, [, y]) => s + (y - my) ** 2, 0);
  return ssTot === 0 ? 1 : 1 - ssRes / ssTot;
}

export interface TrendSeries { name: string; type: 'line'; data: Point[]; }

/** R² de um ajuste sobre os pontos (p/ exibir em evidência). null se < 2 pontos. */
export function trendR2(pts: Point[], type: TrendType = 'linear'): number | null {
  if (!pts || pts.length < 2) return null;
  const { fn } = (FITS[type] || linear)(pts);
  return calcR2(pts, fn);
}

export interface FitResult { type: TrendType; r2: number; }
/** Testa vários ajustes e devolve o de MAIOR R² (default: reta/log/exp). */
export function bestFit(pts: Point[], types: TrendType[] = ['linear', 'log', 'exp']): FitResult | null {
  if (!pts || pts.length < 2) return null;
  let best: FitResult | null = null;
  for (const t of types) {
    const { fn } = (FITS[t] || linear)(pts);
    const r2 = calcR2(pts, fn);
    if (Number.isFinite(r2) && (!best || r2 > best.r2)) best = { type: t, r2 };
  }
  return best;
}

/** Sample a fitted curve across the x-range into an ApexCharts line series,
 *  labelled with the fit name and its R². Returns null when there aren't enough
 *  points to fit (fewer than 2). */
export function buildTrendSeries(pts: Point[], type: TrendType = 'linear', steps = 60): TrendSeries | null {
  if (!pts || pts.length < 2) return null;
  const { fn, label } = (FITS[type] || linear)(pts);
  const r2 = calcR2(pts, fn);
  const xs = pts.map(([x]) => x);
  const xMin = Math.min(...xs), xMax = Math.max(...xs), dx = (xMax - xMin) / (steps - 1);
  const data: Point[] = [];
  for (let i = 0; i < steps; i++) {
    const x = xMin + i * dx, y = fn(x);
    if (Number.isFinite(y)) data.push([+x.toFixed(1), +y.toFixed(2)]);
  }
  return { name: `${label} (R² = ${r2.toFixed(2)})`, type: 'line', data };
}
