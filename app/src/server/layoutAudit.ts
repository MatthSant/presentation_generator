/* layoutAudit.ts — harness PURO (testável) do agente de disposição.
 *
 * O agente de layout devolve `rows`: linhas de tiles {id,w,h} numa grade de 12
 * colunas. Aqui ficam as regras FECHADAS que validam essa disposição e o packer
 * determinístico de fallback. Sem dependência de rede — só geometria + papéis.
 *
 * HARD (quebra o render se passar): soma de largura por linha ≤ 12; todo widget
 * exatamente uma vez; nada de id desconhecido.
 * SOFT (qualidade — empurra reparo, mas tolerável): linhas quase vazias (vão
 * horizontal), tiles de alturas muito diferentes na mesma linha (vão vertical),
 * gráfico/tabela longe de qualquer conclusão (e conclusão solta sem dado perto). */

import type { LayoutItem } from '../shared/types.js';

export interface LayoutCell { id: string; w?: number; h?: number }
export interface LayWidget { id: string; type: string; title?: string; label?: string; text?: string }

/** Largura/altura padrão por tipo (espelha o DEFAULT_W do cliente). */
const LAY_W: Record<string, number> = {
  'label-sec': 12, 'find-note': 12, 'xs': 12, 'chart-table': 12, 'strat-grid': 12, 'eyebrow': 12,
  'chart': 6, 'table': 6, 'highlight': 6, 'request': 6, 'qa-card': 6, 'funnel': 6, 'evolution-picker': 6,
  'heatmap': 8, 'find-block': 4, 'ni': 4, 'ni-vertical': 4, 'kpi-card': 4, 'kpi': 3,
};
const LAY_H: Record<string, number> = {
  'kpi': 2, 'kpi-card': 3, 'find-note': 1, 'xs': 1, 'eyebrow': 1, 'label-sec': 1, 'highlight': 2,
  'find-block': 3, 'ni': 3, 'ni-vertical': 3, 'chart': 4, 'table': 4, 'heatmap': 4, 'chart-table': 5,
  'qa-card': 5, 'funnel': 5, 'strat-grid': 4, 'evolution-picker': 5,
};
export const layW = (t: string): number => LAY_W[t] ?? 6;
export const layH = (t: string): number => LAY_H[t] ?? 3;
export const clampN = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(v)));

// Papéis (para a regra de adjacência conclusão ↔ evidência).
const DATA = new Set(['chart', 'table', 'heatmap', 'qa-card', 'funnel', 'evolution-picker', 'chart-table', 'scatter-picker', 'rank-card']);
const METRIC = new Set(['kpi', 'kpi-card', 'kpi-strip']);
const CONCL = new Set(['find-block', 'ni', 'ni-vertical']);
const TEXT = new Set([...CONCL, 'highlight', 'find-note', 'xs', 'request', 'mdef-block', 'def-step', 'grp-list', 'strat-grid']);

export interface Audit { hard: string[]; soft: string[] }

/** Valida a disposição (rows) contra os widgets. Pura. */
export function auditLayout(rows: LayoutCell[][], widgets: LayWidget[]): Audit {
  const hard: string[] = [], soft: string[] = [];
  const ids = new Set(widgets.map((w) => w.id));
  const typeOf = new Map(widgets.map((w) => [w.id, w.type]));
  const seen = new Set<string>();
  const rowOf = new Map<string, number>();

  rows.forEach((row, ri) => {
    const widths = row.map((c) => c.w ?? layW(typeOf.get(c.id) || ''));
    const sum = widths.reduce((s, w) => s + w, 0);
    if (sum > 12) hard.push(`linha ${ri + 1} soma ${sum} de largura (máximo 12)`);
    for (const c of row) {
      if (!ids.has(c.id)) hard.push(`id desconhecido "${c.id}"`);
      else if (seen.has(c.id)) hard.push(`widget "${c.id}" aparece mais de uma vez`);
      seen.add(c.id); rowOf.set(c.id, ri);
    }
    // SOFT — vão horizontal: linha rala que deixa muitas colunas vazias.
    const gap = 12 - sum;
    const loneFull = row.length === 1 && sum >= 12;
    if (!loneFull && row.length > 0 && row.length <= 2 && gap >= 5)
      soft.push(`linha ${ri + 1} deixa ~${gap} colunas vazias — preencha a linha ou pareie tiles`);
    // SOFT — vão vertical: alturas diferentes lado a lado. Limiar 2 (não 3): o tile
    // ESTICA até a altura da linha, então h2 ao lado de h4 já deixa o menor com metade
    // vazia — era justamente o par highlight+gráfico que passava batido.
    if (row.length >= 2) {
      const hs = row.map((c) => c.h ?? layH(typeOf.get(c.id) || ''));
      if (Math.max(...hs) - Math.min(...hs) >= 2)
        soft.push(`linha ${ri + 1} mistura tiles de alturas muito diferentes (vão vertical) — agrupe alturas parecidas`);
    }
    // SOFT — kpi em linha própria, cheia: o agente se perde com kpis — espreme um kpi
    // ao lado de gráfico/conclusão (alturas nunca casam) ou deixa a fileira de kpis
    // pela metade. Regra: linha com kpi é SÓ de kpis e fecha as 12 colunas.
    const nMetric = row.filter((c) => METRIC.has(typeOf.get(c.id) || '')).length;
    if (nMetric > 0 && nMetric < row.length)
      soft.push(`linha ${ri + 1} mistura kpi com outros tipos — kpis ficam em linha própria, só de kpis`);
    else if (nMetric === row.length && row.length > 0 && sum < 12)
      soft.push(`linha ${ri + 1} é só de kpis mas soma ${sum} — estique-os até fechar 12 (2 kpis → w6, 3 → w4, 4 → w3)`);
  });
  for (const id of ids) if (!seen.has(id)) hard.push(`faltou posicionar o widget "${id}"`);

  // SOFT — adjacência conclusão ↔ evidência: cada gráfico/tabela deve ter uma
  // conclusão na mesma linha ou na linha imediatamente acima/abaixo, e vice-versa.
  const near = (id: string, pred: (t: string) => boolean): boolean => {
    const r = rowOf.get(id);
    if (r == null) return false;
    for (let k = r - 1; k <= r + 1; k++) {
      for (const c of rows[k] || []) {
        if (c.id !== id && pred(typeOf.get(c.id) || '')) return true;
      }
    }
    return false;
  };
  // O 1º widget, quando é a resposta global (highlight/find-note no topo), é
  // isento — ele responde a pergunta toda, não um gráfico específico.
  const answerId = widgets[0] && (widgets[0].type === 'highlight' || widgets[0].type === 'find-note') ? widgets[0].id : null;
  for (const w of widgets) {
    if (DATA.has(w.type) && !near(w.id, (t) => TEXT.has(t)))
      soft.push(`o ${w.type} "${w.id}" está longe de qualquer conclusão — ponha a leitura dele ao lado ou logo acima/abaixo`);
    if (CONCL.has(w.type) && w.id !== answerId && !near(w.id, (t) => DATA.has(t) || METRIC.has(t)))
      soft.push(`a conclusão "${w.id}" está solta, sem o gráfico/tabela/métrica que a sustenta por perto`);
  }
  return { hard, soft };
}

/** Normaliza as rows do agente ANTES de auditar/posicionar.
 *
 *  O prompt PEDE que a resposta fique sozinha no topo em largura cheia, mas o modelo
 *  ignora com frequência e espreme o highlight (h2) ao lado de um gráfico (h4) — como
 *  o tile estica até a altura da linha, sobra meia tela de vazio embaixo do texto.
 *  Regra que dá para impor sem adivinhar intenção: a RESPOSTA (1º widget, quando é
 *  highlight/find-note) fica só, em w12. Deixar isso no prompt e torcer não funciona. */
export function normalizeRows(rows: LayoutCell[][], widgets: LayWidget[]): LayoutCell[][] {
  const first = widgets[0];
  if (!first || (first.type !== 'highlight' && first.type !== 'find-note')) return rows;
  const cell = rows.flat().find((c) => c.id === first.id);
  if (!cell) return rows;                                    // agente esqueceu: o audit acusa
  const rest = rows.map((r) => r.filter((c) => c.id !== first.id)).filter((r) => r.length);
  return [[{ ...cell, w: 12, h: cell.h ?? layH(first.type) }], ...rest];
}

/** rows (do agente) → itens de grade com coordenadas x/y/h. */
export function rowsToItems(rows: LayoutCell[][], typeOf: Map<string, string>): LayoutItem[] {
  const items: LayoutItem[] = [];
  let y = 0;
  for (const row of rows) {
    let x = 0, rowH = 1;
    for (const cell of row) {
      const t = typeOf.get(cell.id) || '';
      const w = clampN(cell.w ?? layW(t), 2, 12);
      const h = clampN(cell.h ?? layH(t), 1, 12);
      if (x + w > 12) break;            // defensivo: nunca estoura a linha
      items.push({ id: cell.id, type: t, x, y, w, h });
      x += w; rowH = Math.max(rowH, h);
    }
    if (row.length) y += rowH;
  }
  return items;
}

/** Packer determinístico de fallback: agrupa RUNS consecutivos do mesmo papel e
 *  distribui cada run em linhas CHEIAS e balanceadas.
 *
 *  A ordem do agente de análise (resposta → métricas → evidência → conclusão) já
 *  conta a história e mantém a adjacência conclusão↔evidência; o que ele não garante
 *  é geometria. Aqui, por construção: toda linha soma 12 (nada de "sobra 8"), papéis
 *  não se misturam na mesma linha (alturas casam — sem vão vertical) e o texto de
 *  largura cheia (resposta/nota) separa os blocos. É o mesmo gabarito das melhores
 *  disposições que o agente de layout produz quando acerta. */
export function packFallback(widgets: LayWidget[]): LayoutItem[] {
  const roleOf = (t: string): 'metric' | 'data' | 'concl' | 'full' =>
    METRIC.has(t) ? 'metric' : DATA.has(t) ? 'data' : CONCL.has(t) ? 'concl' : 'full';
  // Cabem lado a lado sem apertar: 4 métricas (w3), 2 gráficos/tabelas (w6), 3 conclusões (w4).
  const PER_ROW = { metric: 4, data: 2, concl: 3 } as const;

  // runs consecutivos do mesmo papel (texto full nunca agrupa — cada um é um separador)
  const runs: { role: ReturnType<typeof roleOf>; ws: LayWidget[] }[] = [];
  for (const w of widgets) {
    const role = roleOf(w.type);
    const last = runs[runs.length - 1];
    if (last && last.role === role && role !== 'full') last.ws.push(w);
    else runs.push({ role, ws: [w] });
  }

  const items: LayoutItem[] = [];
  let y = 0;
  const placeRow = (row: LayWidget[]): void => {
    const base = Math.floor(12 / row.length);
    let extra = 12 - base * row.length;
    const h = Math.max(...row.map((w) => layH(w.type)));
    let x = 0;
    for (const w of row) {
      const wd = base + (extra-- > 0 ? 1 : 0);
      items.push({ id: w.id, type: w.type, x, y, w: wd, h });
      x += wd;
    }
    y += h;
  };
  for (const run of runs) {
    if (run.role === 'full') {
      const w = run.ws[0];
      items.push({ id: w.id, type: w.type, x: 0, y, w: 12, h: layH(w.type) });
      y += layH(w.type);
      continue;
    }
    // linhas balanceadas: 5 métricas → 3+2 (não 4+1 com um kpi de 12 colunas no fim)
    const nRows = Math.ceil(run.ws.length / PER_ROW[run.role]);
    const per = Math.ceil(run.ws.length / nRows);
    for (let i = 0; i < run.ws.length; i += per) placeRow(run.ws.slice(i, i + per));
  }
  return items;
}
