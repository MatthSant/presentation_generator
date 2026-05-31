/* format.ts — value formatters for kpi/table cells.
 *
 * `format` hints come from the view (KpiItem.format): "R$", "%", "0.0",
 * "int", or a thousands-grouped default. Kept dependency-free + pt-BR. */

const BRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const DEC1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatNumber(n: number, hint?: string): string {
  if (!Number.isFinite(n)) return '—';
  switch (hint) {
    case 'R$': return 'R$ ' + BRL.format(n);
    case '%':  return DEC1.format(n) + '%';
    case '0.0': return DEC1.format(n);
    case 'int': return INT.format(n);
    default: {
      const abs = Math.abs(n);
      return Number.isInteger(n) || abs >= 1000 ? INT.format(n) : DEC1.format(n);
    }
  }
}

/** Format a raw scalar for display. Numbers honor the hint; strings pass through. */
export function formatValue(value: unknown, hint?: string): string {
  if (value == null) return '—';
  if (typeof value === 'number') return formatNumber(value, hint);
  return String(value);
}
