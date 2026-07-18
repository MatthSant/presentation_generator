# Catálogo de widgets do app

Widgets oficiais do modelo de 3 camadas (`dataset.json` → `sXX.json` → `layout.json`).
**Fonte da verdade dos shapes:** `src/shared/types.ts` (interfaces `*Widget`);
renderização em `src/client/renderer.ts`. Este doc diz **quando usar cada um** —
não duplica os campos (consulte a interface citada).

> Não confundir com o design system Reveal.js de apresentações
> (`.claude/skills/components/tools-map.md`) — aquele é outro mundo.

## Métricas (KPIs)

| Widget | Interface | Quando usar |
|---|---|---|
| `kpi` | `KpiWidget` | Um número isolado num tile do grid; com `bind` soma a coluna. |
| `kpi-strip` | `KpiStripWidget` | **Régua flat** de várias métricas numa linha (com `sub`/`spark` opcionais). Visual tabular, denso. Padrão do conversao-perfil. |
| `kpi-card` | `KpiCardWidget` | **Card elevado** — 1 métrica por tile. Tier `feature` (ícone + pill de variação + sparkline na linha do valor) ou `volume` (barra de proporção). Padrão do histórico. |

**Coexistência deliberada**: `kpi-strip` e `kpi-card` são ambos oficiais. Escolha
por densidade: strip quando há muitas métricas de leitura rápida; card quando 4–8
métricas merecem destaque individual com tendência.

## Gráficos e tabelas

| Widget | Interface | Quando usar |
|---|---|---|
| `chart` | `ChartWidget` | Gráfico ApexCharts (`chartType`: bar, line, area, donut, mixed, …). Sempre via `bind` quando o dado vem do dataset. `valueFormat`: `pct\|money\|x\|int` (pt-BR). `dashLast` para linha "Média" tracejada. `outliers` para vir com Tukey/IQR aplicado. `goalLines` para réguas horizontais (meta/bench/equilíbrio). **Duas séries num card**: `bind.y` em array + `seriesNames` (a série herdaria o nome cru da coluna) + `seriesTypes` (`['bar','line']` — sem isso o `mixed` vindo de bind cai tudo em barra) + `secondaryAxis` quando as unidades diferem. |
| `table` | `TableWidget` | Tabela bind/inline. Células ricas (`TableCell` objeto) suportam `delta`/`rel`/`tone` → pill de variação + % relativo. |
| `chart-table` | `ChartTableWidget` | **Bloco combinado**: gráfico em cima + tabela comparativa embaixo num card único com header padronizado (ponto + título + régua). `table` opcional (só gráfico com header). Usado nas quebras do histórico; serve a qualquer série × recorte. |
| `heatmap` | `HeatmapWidget` | Grid de calor pivotado. |
| `heatmap-toggle` | `HeatmapToggleWidget` | Heatmap com abas (`.seg--soft`) trocando a métrica plotada. |
| `chart-toggle` | `ChartToggleWidget` | N gráficos no mesmo card, trocados por abas. Use quando as séries **não podem dividir eixo** (R$ × múltiplo; 28% × 1,6%): sobrepor achata a menor contra o eixo, que é perder o dado. Quando as unidades convivem, prefira um `chart` único com `bind.y` em array. |
| `funnel` | `FunnelWidget` | Etapas em sequência com taxa de passagem, perda e MAIOR FURO por transição. `compact` para caber ao lado de outro bloco. **`branches`** = bifurcação: caminhos que saem da ÚLTIMA etapa em **paralelo**, dividindo o mesmo denominador — as taxas não somam 100% (ex.: o ingresso vira MQL *e* compra order bump). Use quando a jornada deixa de ser linear; para etapas encadeadas, `steps`. |

## Controles

| Widget | Interface | Quando usar |
|---|---|---|
| `metric-toggle` | `MetricToggleWidget` | Seletor segmentado inline de indicador. Dispara o evento DOM `historico-metric` (a generalizar p/ `metric-change`); o setup do tipo (via `meta.controls.kind`) escuta e recalcula. |

### Modelos de filtro (decisão de arquitetura)
- **Client-side** (`src/client/filters.ts`): colunas listadas em `dataset[t].filters`;
  estado na URL; re-resolve binds localmente. Use quando o corte **só muda binds**.
- **Server-recompute** (`src/client/historico-controls.ts` + `routes/historico.ts`):
  quando KPIs/tabelas pré-computados precisam mudar, o recompute roda no servidor
  (`render_view.py` do tipo, via registry). Use quando o corte **muda agregados**.

Ambos usam o mesmo chrome FAB + modal (`#filter-*`).

## Narrativa e estrutura

| Widget | Interface | Quando usar |
|---|---|---|
| `eyebrow` | `EyebrowWidget` | Separador de zona numerado (badge + título + caption). |
| `find-block` | `FindBlockWidget` | Achado com tag; `card: true` para formato elevado; vira âncora de detalhamento. |
| `find-note` | `FindNoteWidget` | Nota de rodapé/prosa curta. |
| `highlight` | `HighlightWidget` | Callout colorido. |
| `ni` / `ni-vertical` | `NiWidget` | Ação numerada (Por quê? / Acionável). |
| `rank-card` | `RankCardWidget` | Ranking de consistência (modelo do perfil). |
| `def-step` / `mdef-block` / `grp-list` | — | Metodologia: etapas, definição de métrica, lista de grupos. |
| `label-sec` / `request` / `xs` | — | Texto utilitário. |

## Componentes CSS base (style.css)

- `.card` — superfície elevada (radius 14, shadow, dark-aware). `kc`, `ctbl`,
  `hm-card`, `an-card`, `guia-card`, `clic-card` compõem com ela.
- `.btn` + `--primary` / `--ghost` / `--sm` / `--danger` — botões.
- `.seg` + `.seg-opt(.active)` — toggle segmentado; variante `.seg--soft`
  (pill branca, texto roxo) para abas dentro de cards. (`.flt-seg` do modal de
  filtros é **chips multi-select**, intencionalmente distinto.)
- `.pill` + `--ok` / `--err` / `--neutral` / `--accent` — badges de estado/variação
  (tokens `--ok-*` / `--err-*`).
- `.home-bar` + `js/page-chrome.js` — chrome das páginas utilitárias
  (`data-sub`/`data-back` no header).
