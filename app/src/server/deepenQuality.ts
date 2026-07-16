/* deepenQuality.ts — verificações DETERMINÍSTICAS de qualidade de um detalhamento,
 * além da validação de schema (validateSection) e do cheiro de metodologia.
 *
 * Resolve o bind de cada widget contra o dataset e pega os DEFEITOS (erros) que
 * tornam um detalhamento quebrado: tabela vazia (só cabeçalho), gráfico de valor
 * único (1 categoria), coluna inexistente, gráfico com séries/categorias demais
 * (ilegível). Só ERRO bloqueia. Preferências de forma (ex.: nº de gráficos) ficam em
 * qualitySuggestions (não reprovam). Tudo sem chamar a API — o juízo semântico fica
 * no critic (claude.critiqueModal). */

import type { Bind, DataMap, Widget } from '../shared/types.js';
import { resolveBind } from '../shared/bind.js';

const MAX_SERIES = 6;
const MAX_CHART_CATS = 16;     // teto p/ gráficos categóricos (bar/stacked)
const MAX_TIME_POINTS = 90;    // teto p/ série temporal (line/area) — só barra exagero real

interface ChartLike { type?: string; title?: string; bind?: Bind; rows?: unknown[]; cols?: unknown[] }

/** Lista de problemas de qualidade (vazio = ok). Espelha o formato de
 *  methodologySmell para encaixar no mesmo gate de reparo. */
export function qualityIssues(widgets: Widget[], dataset: DataMap): string[] {
  const issues: string[] = [];

  for (const raw of widgets) {
    const w = raw as ChartLike;
    if (w.type === 'chart') {
      if (!w.bind) continue; // séries inline são raras no detalhamento — não checa
      const title = w.title || 'gráfico';
      let r;
      try { r = resolveBind(w.bind, dataset); } catch { continue; }
      if (r.categories.length <= 1) {
        issues.push(`"${title}": gráfico com ${r.categories.length} categoria — um gráfico precisa de ≥2 pontos para comparar. Para um número único use um kpi; para comparar, escolha um eixo x com mais categorias.`);
      } else if (r.series.length > MAX_SERIES) {
        issues.push(`"${title}": ${r.series.length} séries (>${MAX_SERIES}) — fica ilegível. Se a intenção era comparar DUAS métricas ao longo do tempo (ex.: investimento × faturamento), isso NÃO é uma série por período: ponha as duas métricas como colunas de uma table. Caso contrário, agregue, foque nas maiores variações, ou troque por um heatmap.`);
      } else if (r.categories.length > MAX_CHART_CATS) {
        // Série temporal (line/area) é FEITA para muitos pontos no tempo — uma linha
        // sobre 30–60 dias é legível. O teto de categorias vale só para gráficos
        // categóricos (bar/stacked); para temporais só barra um exagero real.
        const ct = (w as { chartType?: string }).chartType || '';
        const timeSeries = ct === 'line' || ct === 'area';
        if (!timeSeries) {
          issues.push(`"${title}": ${r.categories.length} categorias no eixo x — demais para ler. Agregue ou recorte as principais.`);
        } else if (r.categories.length > MAX_TIME_POINTS) {
          issues.push(`"${title}": ${r.categories.length} pontos no eixo x — demais até para uma série temporal. Agregue por semana ou mês.`);
        }
      }
    } else if (w.type === 'table') {
      const title = w.title || 'tabela';
      if (w.bind) {
        let r;
        try { r = resolveBind(w.bind, dataset); } catch { continue; }
        if (r.rows.length === 0) {
          issues.push(`"${title}": tabela vazia (0 linhas) — nunca mostre uma tabela só com cabeçalho; remova-a ou substitua por prosa/kpi.`);
        } else {
          // Colunas que NÃO existem na tabela (nem por caixa) renderizam células vazias —
          // o gerador às vezes usa um RÓTULO onde a coluna é a chave. Faz a IA refazer com
          // os nomes EXATOS do catálogo.
          const cols = (w as { cols?: string[] }).cols ?? [];
          // UNIÃO das chaves de TODAS as linhas — não só a 1ª: tabelas de schema
          // irregular (ex.: por_temperatura, onde a faixa orgânica N/C não tem ROAS/CPM
          // por não ter mídia, mas Quente/Morno têm) davam falso-positivo quando a 1ª
          // linha era a reduzida. Uma coluna que existe em QUALQUER linha é válida.
          const keySet = new Set<string>();
          for (const row of r.rows) for (const k of Object.keys(row as Record<string, unknown>)) keySet.add(k);
          const keys = [...keySet];
          const lower = new Set(keys.map((k) => k.toLowerCase()));
          const missing = cols.filter((c) => !keys.includes(c) && !lower.has(c.toLowerCase()));
          if (missing.length) {
            issues.push(`"${title}": as colunas ${JSON.stringify(missing)} não existem na tabela "${w.bind.dataset}" (colunas reais: ${keys.join(', ')}) — usariam células vazias. Use os nomes EXATOS das colunas do catálogo.`);
          }
        }
      } else if (Array.isArray(w.rows) && w.rows.length === 0) {
        issues.push(`"${title}": tabela vazia (0 linhas) — remova-a ou substitua por prosa/kpi.`);
      }
    }
  }

  return issues;
}

/** Checagem modal-level (não por-widget): um detalhamento é ANÁLISE, não dado cru —
 *  precisa de ao menos um widget de RESPOSTA em prosa (highlight/find-block/ação). Só
 *  gráfico+tabela não responde à pergunta. O critic (LLM) já exige isso, mas um modelo
 *  fraco (fallback) deixa passar — esta checagem é DETERMINÍSTICA, independe do modelo. */
const ANSWER_TYPES = new Set(['highlight', 'find-block', 'ni', 'ni-vertical', 'find-note']);
export function missingAnswerWidget(widgets: Widget[]): string | null {
  if (widgets.length && !widgets.some((w) => ANSWER_TYPES.has((w as { type: string }).type))) {
    return 'O detalhamento não tem NENHUM widget de resposta em prosa (highlight/find-block/ação) — só dados crus (gráfico/tabela) não respondem à pergunta. Adicione um highlight no topo com a RESPOSTA direta (o número decisivo) e, se couber, um achado ou ação.';
  }
  return null;
}

/** Sugestões de FORMA (não bloqueiam a entrega — o reparo tenta acatar, mas passar
 *  destas NUNCA reprova; só erro reprova). Ex.: excesso de gráficos. */
export function qualitySuggestions(widgets: Widget[]): string[] {
  const out: string[] = [];
  const charts = widgets.filter((w) => (w as ChartLike).type === 'chart').length;
  if (charts > 2) {
    out.push(`${charts} gráficos no detalhamento — prefira o mais informativo; use 2 só se ambos trazem informação relevante; o excedente vira tabela, kpi ou prosa.`);
  }
  return out;
}
