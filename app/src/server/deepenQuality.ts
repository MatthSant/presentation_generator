/* deepenQuality.ts — verificações DETERMINÍSTICAS de qualidade de um detalhamento,
 * além da validação de schema (validateSection) e do cheiro de metodologia.
 *
 * Resolve o bind de cada widget contra o dataset e pega os defeitos que tornam um
 * detalhamento confuso: tabela vazia (só cabeçalho), gráfico de valor único (1
 * categoria), gráfico com séries/categorias demais (ilegível) e mais de um gráfico.
 * Tudo sem chamar a API — o juízo semântico fica no critic (claude.critiqueModal). */

import type { Bind, DataMap, Widget } from '../shared/types.js';
import { resolveBind } from '../shared/bind.js';

const MAX_SERIES = 6;
const MAX_CHART_CATS = 16;

interface ChartLike { type?: string; title?: string; bind?: Bind; rows?: unknown[]; cols?: unknown[] }

/** Lista de problemas de qualidade (vazio = ok). Espelha o formato de
 *  methodologySmell para encaixar no mesmo gate de reparo. */
export function qualityIssues(widgets: Widget[], dataset: DataMap): string[] {
  const issues: string[] = [];
  let charts = 0;

  for (const raw of widgets) {
    const w = raw as ChartLike;
    if (w.type === 'chart') {
      charts++;
      if (!w.bind) continue; // séries inline são raras no detalhamento — não checa
      const title = w.title || 'gráfico';
      let r;
      try { r = resolveBind(w.bind, dataset); } catch { continue; }
      if (r.categories.length <= 1) {
        issues.push(`"${title}": gráfico com ${r.categories.length} categoria — um gráfico precisa de ≥2 pontos para comparar. Para um número único use um kpi; para comparar, escolha um eixo x com mais categorias.`);
      } else if (r.series.length > MAX_SERIES) {
        issues.push(`"${title}": ${r.series.length} séries (>${MAX_SERIES}) — fica ilegível. Agregue, foque nas maiores variações, ou troque por um heatmap.`);
      } else if (r.categories.length > MAX_CHART_CATS) {
        issues.push(`"${title}": ${r.categories.length} categorias no eixo x — demais para ler. Agregue ou recorte as principais.`);
      }
    } else if (w.type === 'table') {
      const title = w.title || 'tabela';
      if (w.bind) {
        let r;
        try { r = resolveBind(w.bind, dataset); } catch { continue; }
        if (r.rows.length === 0) {
          issues.push(`"${title}": tabela vazia (0 linhas) — nunca mostre uma tabela só com cabeçalho; remova-a ou substitua por prosa/kpi.`);
        }
      } else if (Array.isArray(w.rows) && w.rows.length === 0) {
        issues.push(`"${title}": tabela vazia (0 linhas) — remova-a ou substitua por prosa/kpi.`);
      }
    }
  }

  if (charts > 1) {
    issues.push(`${charts} gráficos no detalhamento — use no máximo 1 (o mais informativo); o resto vira tabela, kpi ou prosa.`);
  }
  return issues;
}
