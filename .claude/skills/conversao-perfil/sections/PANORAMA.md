# Seção — Panorama (s01)

Visão consolidada de todos os critérios. Primeira página. Montada por `build_report.py`.

## Tabela
- `panorama_comp` (`dims:["Critério"]`, `filters:["canal"]`): por critério, melhor
  grupo + diff, pior grupo + diff, positivos `n/N`, uplift médio. Diffs e uplift
  como `{value, cls}`.

## Widgets (ordem) + layout

| # | widget | tipo | conteúdo | w×h |
|---|---|---|---|---|
| 1 | `pan-kpi` | kpi-strip | nº lançamentos · nº critérios · janelas (60d/12m) | 12×2 |
| 2 | `pan-eb1` | eyebrow | "PERFIL DA BASE" | 12×1 |
| 3 | `pan-{cid}` | chart bar-horizontal diverging | um por critério, `_grp` y=diff_lcto, `axisMin/axisMax:-120/120` | 3×4 (4 por linha) |
| 4 | `pan-eb2` | eyebrow | "COMPARATIVO POR CRITÉRIO" | 12×1 |
| 5 | `pan-comp` | table | `panorama_comp` + `colorScale` (diff/uplift) | 12×4 |
| 6 | `pan-eb3` | eyebrow | "DETALHE POR GRUPO" (caption menciona o ⓘ) | 12×1 |
| 7 | `pan-{cid}-bench` | table | `crit_{cid}_bench` | 12×1 |
| 8 | `pan-{cid}-detail` | table | `crit_{cid}_detail` + `defs` (ⓘ) + `colorScale` | 12×4 |

(7–8 repetem por critério.)

## Cuidados
- Os mini-charts do "PERFIL DA BASE" são **horizontais, diverging, escala
  compartilhada** (±120) — comparáveis entre si.
- Sem glossário separado: as definições vão em `defs` dos `pan-{cid}-detail` (ⓘ).
- `pan-comp` e os `detail` reagem ao filtro de canal (têm `filters:["canal"]`).
