# O documento: Conversão por perfil

Páginas: **Panorama**, **Insights**, **Codependência** e **uma por critério** (renda, idade, gênero…). O toggle **Geral / Pago / Orgânico** é do próprio HTML (as tabelas do `dataset` carregam `filters: ["canal"]`), então um único HTML cobre os três canais. Todo número vem de `numeros.json` (`conv_calc.agg_criterio` por critério × canal, `relevancia`, `codependencia`); o LLM nunca transcreve número no `sXX.json`, só referencia via `bind`.

## Panorama Geral (`s01`)
- **kpi-strip**: melhor e pior grupo geral e o benchmark.
- **Perfil da base** (um `chart` por critério): variação vs benchmark por grupo, `bar-horizontal` divergente com **escala compartilhada** entre critérios.
- **Comparativo por critério** (`table`): melhor grupo, pior grupo, positivos/N, uplift médio.
- **Detalhe por grupo** (2 `table` por critério): conversão 60d/12m, diff, representatividade e tendência (Acelerando / Ganhando terreno / Perdendo espaço / Deteriorando).

## Insights (`s10`)
Três zonas (✓ conclusões, ↗ aprofundar, ! atenção) em `find-block` tipo card. No kit sai o **esqueleto** (header e nota de método); a prosa autoral é do consultor, escrita no chat e colada via `aprofundar.py` ou editada no JSON.

## Relevância × Codependência (`s12`)
- **heatmap** `cod_assoc`: associação (Cramér's V) entre pares de critérios.
- **table** Relevância × Independência: por critério, amplitude (relevância ponderada), survival mínimo, explicado por, papel (**qualificador** / **qualificante**) e veredito (priorizar / proxy / baixo impacto).
- Nota: associação ≠ causalidade.

## Página por critério (`s02`, `s03`, …)
- **kpi-strip**: melhor grupo, pior grupo, benchmark 60d.
- **Ranking dos grupos** (`rank-card`): classe por wins/N (Consistente → Crítico), diff 60d/12m, representatividade.
- **Consistência por lançamento** (`heatmap-toggle`): abas Variação / Conv. 60d / Uplift, grupos na ordem do `order`.
- **Conversão média** 60d e 12m (`chart` com linha da média) e **Uplift médio por grupo**.
- **Evolução da conversão 60d por grupo** ao longo dos lançamentos.
- **Proporção da base** (`chart-toggle`): por grupo / por classificação, 100 % empilhado.
- Nota: benchmark = respondentes da pesquisa daquele critério.

## O que o agente escreve no chat (não no HTML)
- As 3–5 perguntas norteadoras mais relevantes (`perguntas.json` × `numeros.json`).
- As premissas: lançamentos incluídos, regra de canal, janelas, critérios e mapeamento de grupos (com as anomalias de normalização), custom fields e seus significados.

## Aprofundamentos
Perguntas aceitas viram seções `det-<id>` via `aprofundar.py`, dentro do `design-system.md`, com números do `query_api.py` (`cut_by_criterion`, `trend`, `crosstab`, `association`, `meta`).
