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

/* ── breadcrumb do relatório ── Cliente / Tipo de análise / Campanha.
 *  Vive aqui porque o app (main.ts) e o viewer offline (standalone.ts) montam a
 *  mesma barra: sem isso o HTML entregue ao cliente mostrava só o nome do cliente,
 *  que já está no switcher da lateral, e nunca dizia que relatório era aquele. */
const TIPO_LABELS: Record<string, string> = {
  'acompanhamento-lancamento': 'Acompanhamento de Campanha',
  'debriefing-lancamento': 'Debriefing de Lançamento',
  'historico-lancamentos': 'Histórico de Lançamentos',
  'conversao-perfil': 'Conversão por Perfil',
  'criativos': 'Análise de Criativos',
};

export interface CrumbMeta {
  client?: string; client_name?: string; campaign_label?: string;
  title?: string; report_type?: string; controls?: { kind?: string };
}

export function reportCrumbs(meta: CrumbMeta, slug?: string): string[] {
  const titulo = (s?: string): string => (s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const campanha = meta.campaign_label || titulo(slug);
  return [
    meta.client_name || meta.client || '',
    TIPO_LABELS[meta.controls?.kind || ''] || TIPO_LABELS[meta.report_type || ''] || '',
    campanha,
  ].filter(Boolean);
}
