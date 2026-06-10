# Seção — Página por critério (s02…s09)

Uma página por critério escolhido (renda, idade, patrimônio, custom_field_N…).
Montada por `build_report.py` (loop por critério); este guia documenta a estrutura.

## Tabelas no `dataset.json` (por critério `cid`, todas com `filters:["canal"]`)

| Tabela | dims | Conteúdo |
|---|---|---|
| `crit_{cid}_rank` | `grupo` | pos, diff_lcto, diff_12m, rep, wins, n, classe |
| `crit_{cid}_grp` | `grupo` | diff_lcto, conv_lcto, conv_12m, uplift (médias) |
| `crit_{cid}_diff` | `grupo`,`lancamento` | valor (`+X%`) + `cls` (diff) |
| `crit_{cid}_conv` | `grupo`,`lancamento` | 2 linhas de benchmark + grupos; valor `X.XX%` + `cls` |
| `crit_{cid}_uplift` | `grupo`,`lancamento` | valor + `cls` (uplift) + coluna `Média` |
| `crit_{cid}_evol` | `grupo`,`lancamento` | conv 60d por grupo + linha `Benchmark` |
| `crit_{cid}_rep` | `grupo`,`lancamento` | % de leads do grupo por lançamento |
| `crit_{cid}_repclass` | `classe`,`lancamento` | % de leads por classe (Consistente→Crítico) |
| `crit_{cid}_bench` | — | 1 linha/canal: Conv 60d/12m pesquisa, Uplift bench, Conv total |
| `crit_{cid}_detail` | `Grupo` | tabela rica: conv/diff/uplift + Tend. Abs/Rel + Leitura + Wins/N + Rep |

Todas saem de `conv_calc.agg_criterio` + helpers (`diff_class`, `uplift_class`,
`trend_cells`, `repclass_series`).

## Widgets (ordem) + layout

| # | widget | tipo | bind / conteúdo | w×h |
|---|---|---|---|---|
| 1 | `{cid}-kpi` | kpi-strip | melhor grupo · pior grupo · benchmark 60d | 12×2 |
| 2 | `{cid}-eb1` | eyebrow | "RANKING DOS GRUPOS" (`n:"1"`) | 12×1 |
| 3 | `{cid}-rank` | rank-card | `crit_{cid}_rank` | 12×4 |
| 4 | `{cid}-hmtoggle` | heatmap-toggle | abas Variação/Conv 60d/Uplift | 12×6 |
| 5 | `{cid}-conv60` | chart bar-horizontal | `_grp` y=conv_lcto · `pct` `meanLine` | 6×4 |
| 6 | `{cid}-conv12` | chart bar-horizontal | `_grp` y=conv_12m · `pct` `meanLine` | 6×4 |
| 7 | `{cid}-upliftbar` | chart bar-horizontal | `_grp` y=uplift · `pct` `meanLine` | 12×4 |
| 8 | `{cid}-evol` | chart line | `_evol` series=grupo · `pct` | 12×5 |
| 9 | `{cid}-eb-rep` | eyebrow | "PROPORÇÃO DA BASE" (`n:"%"`) | 12×1 |
| 10 | `{cid}-reptoggle` | chart-toggle | Por grupo (`_rep`) / Por classificação (`_repclass`) | 12×6 |
| 11 | `{cid}-nota` | find-note | metodologia (benchmark, diff, wins) | 12×1 |

Conv/uplift usam `colors:["#7C3AED"]`. Evol usa a paleta de 8 roxos→verdes.
"Por classificação" usa as cores das classes presentes (cons #5C9A33 → crit #DC5048).

## Cuidados
- conv60/conv12/uplift são `bar-horizontal` (não vertical) com `meanLine`.
- A consistência por lançamento é UM `heatmap-toggle`, não 3 heatmaps soltos.
- Apresentar no chat: melhor/pior grupo, quantos grupos 9/9 wins, anomalias de amostra.
