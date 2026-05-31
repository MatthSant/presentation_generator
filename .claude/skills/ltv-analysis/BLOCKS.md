# Referência de Widgets — App de Análise (modelo 3 camadas)

Schema JSON aceito pelo app. **Nunca ler o código TypeScript do app — toda a
informação está aqui.** A fonte de verdade dos tipos é
`app/src/shared/types.ts`; este documento espelha esse contrato.

---

## O modelo de 3 camadas

Uma análise vive em `output/<cliente>/<analise>/` e é composta por **3 camadas
separadas** mais o mapa de navegação:

| Camada | Arquivo(s) | Quem escreve | Conteúdo |
|---|---|---|---|
| 1 — **dataset** | `dataset.json` | Python | só números: tabelas long-format com `dims`, `filters`, `rows` |
| 2 — **view** | `s01.json`, `s02.json`, … | LLM | lista plana de widgets; widgets numéricos referenciam dados via `bind` |
| 3 — **layout** | `layout.json` | LLM | coordenadas no grid de 12 colunas por widget |
| nav | `data.json` | LLM | `meta` (cliente/título/tema/filtros) + `pages` → `sections` |

**Regra de ouro:** o LLM **nunca** transcreve números na view. Um widget diz
*o que* mostrar (`bind`) e o app resolve isso contra o dataset e os filtros
ativos. Números entram só na Camada 1 (emitida pelo Python).

```
dataset.json ──┐
               ├─ resolveBind(bind, datasets, filtrosAtivos) ─→ { categories, series, rows, totals }
sXX.json bind ─┘
```

---

## Camada 1 — `dataset.json` (números)

Mapa de `nome da tabela` → tabela. Cada tabela é long-format: uma linha por
combinação de dimensões × filtros.

```json
{
  "vendas": {
    "dims": ["mes"],
    "filters": ["canal"],
    "rows": [
      { "mes": "Jan", "canal": "Loja",   "receita": 120000, "pedidos": 800 },
      { "mes": "Jan", "canal": "Online", "receita":  90000, "pedidos": 1100 },
      { "mes": "Fev", "canal": "Loja",   "receita": 135000, "pedidos": 820 }
    ]
  },
  "categorias": {
    "dims": ["categoria"],
    "filters": ["canal"],
    "rows": [
      { "categoria": "Eletrônicos", "canal": "Loja",   "receita": 80000 },
      { "categoria": "Eletrônicos", "canal": "Online", "receita": 60000 }
    ]
  }
}
```

- **`dims`** — colunas de agrupamento (eixos group-by), ex.: `["mes"]`.
- **`filters`** — colunas pelas quais o dashboard pode fatiar, ex.: `["canal"]`.
  Cada coluna listada aqui precisa de um `FilterDef` correspondente em
  `data.json → meta.filters` para virar controle de UI.
- **`rows`** — objetos planos. Valores são escalares (`string | number | boolean | null`).

Uma tabela sem filtros omite `filters`. Múltiplas tabelas no mesmo dataset são
normais — cada widget escolhe a sua via `bind.dataset`.

---

## Binding — `bind`

A ponte entre um widget e uma tabela do dataset. O app aplica os filtros ativos,
agrupa por `x`, separa em séries por `series` e agrega `y`/`metrics`.

```json
"bind": {
  "dataset": "vendas",
  "x": "mes",
  "y": "receita",
  "series": "canal",
  "metrics": ["receita", "pedidos"],
  "agg": "sum",
  "name": "Receita"
}
```

| Campo | Uso |
|---|---|
| `dataset` | **obrigatório** — nome da tabela no `dataset.json` |
| `x` | coluna de dimensão para categorias (eixo group-by) |
| `y` | coluna numérica projetada nos valores das séries |
| `series` | coluna cujos valores distintos viram múltiplas séries |
| `metrics` | colunas numéricas a totalizar (usado por `kpi-row`) |
| `agg` | agregação quando várias linhas colapsam: `sum`·`avg`·`min`·`max`·`count`. Padrão `sum` |
| `name` | nome da série única quando não há `series` (padrão = `y`) |

O resultado resolvido tem `{ categories, series, rows, totals }` — o widget
consome o que precisar (chart usa `categories`+`series`, table usa `rows`,
kpi-row usa `totals`).

---

## Camada 2 — arquivo de seção (`sXX.json`)

```json
{
  "id": "s01",
  "header": {
    "badge": "VISÃO GERAL",
    "title": "Perfil da base de clientes",
    "sub": "Distribuição por frequência de compra no período."
  },
  "widgets": [ /* widget, widget, ... */ ],
  "modals":  [ /* modal, modal, ... */ ]
}
```

- `header.badge` e `header.sub` são opcionais.
- `widgets` é uma **lista plana** — sem containers (`row`/`g2`/`g3`/`g4`/`content`).
  As colunas e posições são definidas na Camada 3 (`layout.json`).
- Todo widget tem um **`id` único na seção** — é a chave que o `layout.json` usa.
- `modals` é opcional.

### Tokens de cor

`p` roxo · `g` verde · `a` âmbar · `r` vermelho · `n` neutro.
(Apenas estes cinco. Sem hex no view layer.)

---

## Widget types

### `kpi-row`
Linha de métricas (máx 4 itens). Com `bind`, cada item puxa o total de uma
coluna via `key`; sem `bind`, usa `value` inline.

```json
{
  "id": "kpi",
  "type": "kpi-row",
  "bind": { "dataset": "vendas", "metrics": ["receita", "pedidos"] },
  "items": [
    { "key": "receita", "label": "Receita total", "format": "R$",  "color": "p" },
    { "key": "pedidos", "label": "Pedidos",        "format": "0",   "color": "g" },
    { "value": "34%",    "label": "Taxa de recompra", "color": "a" }
  ]
}
```

- `key` — coluna do dataset a totalizar (lê de `totals[key]`). Requer `bind`.
- `value` — valor literal, usado quando não há `key`/`bind`.
- `format` — dica de formatação: `"R$"`, `"%"`, `"0"`, `"0.0"`.
- `color` — token opcional.

---

### `chart`
Gráfico ApexCharts. **Sempre prefira `bind`** — o app resolve séries e
categorias contra o dataset e reage aos filtros automaticamente. Use campos
inline (`series`/`categories`/`labels`) só quando não há tabela de origem.

```json
{
  "id": "rev",
  "type": "chart",
  "chartType": "bar",
  "title": "Receita por mês e canal",
  "height": 300,
  "bind": { "dataset": "vendas", "x": "mes", "y": "receita", "series": "canal" }
}
```

**`chartType` obrigatório.** Tipos disponíveis:

| `chartType` | Uso | Binding |
|---|---|---|
| `bar` | Barras verticais | `x` (categorias), `y`, `series?` |
| `bar-horizontal` | Barras horizontais (ranking) | `x`, `y`, `distributed?` |
| `line` | Linha temporal | `x`, `y`, `series?` |
| `area` | Área com gradiente | `x`, `y`, `series?` |
| `donut` | Pizza com buraco | `x` (rótulos), `y` |
| `pie` | Pizza sólida | `x`, `y` |
| `mixed` | Bar + Line | `x`, `series` (com `type` por série) |
| `stacked` | Barras empilhadas | `x`, `y`, `series`, `stackType?: '100%'` |
| `radialBar` | Gauge circular | `x`, `y` |
| `scatter` | Dispersão | `series` inline `[{name,data:[{x,y}]}]` |
| `radar` | Teia | `x`, `y`, `series?` |
| `treemap` | Hierarquia | `x`, `y` |

Campos opcionais de aparência: `height` (número, sempre via JSON nunca CSS),
`distributed` (cor por barra), `stackType`, `colors` (override de paleta),
`options` (override cru de ApexCharts; formatters como string `"function(){…}"`
são reativados).

**IDs de gráfico:** `id` único por seção (ex.: `rev`, `ord`, `cat-mix`).

---

### `table`
Tabela estruturada. Com `bind`, as linhas vêm de `rows` resolvidos; `cols`
define quais colunas exibir (na ordem). Sem `bind`, passe `rows` inline.

```json
{
  "id": "tbl",
  "type": "table",
  "cols": ["mes", "canal", "receita", "pedidos"],
  "bind": { "dataset": "vendas" },
  "caption": "Legenda opcional."
}
```

Inline (sem bind), cada célula é string/número ou
`{ "value": …, "cls": "c-g", "title": "tooltip" }`:

```json
{
  "id": "tbl2",
  "type": "table",
  "cols": ["Produto", "Clientes", "LTV"],
  "rows": [
    ["Curso", "423", "R$ 2.100"],
    ["Mentoria", "89", { "value": "R$ 4.200", "cls": "c-g" }]
  ]
}
```

---

### `heatmap`
Tabela de calor com escala de cores. Sempre inline (números já calculados).

```json
{
  "id": "hm",
  "type": "heatmap",
  "cols": ["Jan", "Fev", "Mar", "Abr"],
  "rows": [
    {
      "label": "Grupo A",
      "cells": [
        { "value": "34%", "cls": "hm-hi", "title": "Tooltip opcional" },
        { "value": "12%", "cls": "hm-lo" },
        { "value": "—",   "cls": "hm-n" }
      ]
    }
  ],
  "caption": "Legenda opcional."
}
```

Classes de célula: `hm-hi` (verde, alto) · `hm-lo` (vermelho, baixo) · `hm-n` (neutro).

---

### `find-block`
Achado com tag colorida e texto de suporte. Clicável se `modal` presente.

```json
{
  "id": "fb1",
  "type": "find-block",
  "tag": "Recompra",
  "tagColor": "p",
  "title": "1 em cada 3 clientes voltou a comprar.",
  "detail": "Taxa de recompra de 34% — suporte com <strong>HTML</strong> inline.",
  "modal": "m1"
}
```

`tagColor`: `p`·`g`·`a`·`r`·`n`. Se `modal` presente, o card vira clicável e
abre o modal de id correspondente.

---

### `find-note`
Frase-síntese abaixo de um gráfico.

```json
{ "id": "note", "type": "find-note", "text": "68% da base comprou só uma vez." }
```

---

### `highlight`
Box de destaque com texto HTML.

```json
{
  "id": "hl1",
  "type": "highlight",
  "text": "<strong>LTV médio:</strong> R$ 1.847 — 3× maior em recompradores.",
  "label": "Destaque",
  "color": "p"
}
```

`color` e `label` opcionais.

---

### `ni` / `ni-vertical`
Ação numerada.

```json
{
  "id": "ni1",
  "type": "ni",
  "n": "1",
  "title": "Ativar campanha de recompra.",
  "why": "68% comprou uma vez só — maior alavanca de LTV.",
  "action": "Disparar fluxo D+30 para compradores únicos."
}
```

`ni-vertical` usa os mesmos campos com layout em coluna. `why`/`action` opcionais.

---

### `label-sec`
Separador de subseção.

```json
{ "id": "ls1", "type": "label-sec", "text": "DISTRIBUIÇÃO POR SAFRA", "sub": "Coortes 2021–2024." }
```

`sub` opcional.

---

### `request`
Item de pendência/solicitação de dado.

```json
{ "id": "rq1", "type": "request", "text": "Dados de custo por canal.", "status": "pending" }
```

`status`: `pending` · `done` · string livre.

---

### `xs`
Texto pequeno (nota metodológica).

```json
{ "id": "xs1", "type": "xs", "text": "† n < 100. Interpretar com cautela." }
```

---

## Modais

Renderizados fora do grid, abertos por `find-block` com `modal` apontando ao `id`.
Um modal contém sua própria lista plana de widgets (que também podem ter `bind`).

```json
{
  "id": "m1",
  "title": "Detalhamento — receita por categoria",
  "widgets": [
    {
      "id": "m1tbl",
      "type": "table",
      "cols": ["categoria", "canal", "receita"],
      "bind": { "dataset": "categorias" }
    }
  ]
}
```

---

## Camada 3 — `layout.json` (grid)

Coordenadas no grid de 12 colunas por widget, por seção. A chave de cada item é
o `id` do widget. O app posiciona via CSS grid (colapsa para 1 coluna em telas
< 860px).

```json
{
  "sections": {
    "s01": [
      { "id": "kpi", "x": 0, "y": 0, "w": 12, "h": 1 },
      { "id": "rev", "x": 0, "y": 1, "w": 6,  "h": 3 },
      { "id": "ord", "x": 6, "y": 1, "w": 6,  "h": 3 },
      { "id": "tbl", "x": 0, "y": 2, "w": 12, "h": 3 }
    ],
    "s02": [
      { "id": "donut",  "x": 0, "y": 0, "w": 5, "h": 3 },
      { "id": "catbar", "x": 5, "y": 0, "w": 7, "h": 3 },
      { "id": "fb1",    "x": 0, "y": 1, "w": 6, "h": 2 },
      { "id": "note",   "x": 6, "y": 1, "w": 6, "h": 1 }
    ]
  }
}
```

- `x` — coluna inicial (0–11). `w` — largura em colunas (1–12). `x + w ≤ 12`.
- `y` — linha (ordem vertical). `h` — altura em unidades de linha (informativa).
- Todo widget de uma seção precisa de uma entrada no layout daquela seção.

---

## `data.json` (mapa de navegação)

```json
{
  "meta": {
    "client": "Demo Varejo",
    "title": "Vendas 2026",
    "type": "ltv",
    "theme": "light",
    "created_at": "2026-05-31",
    "filters": [
      {
        "id": "canal",
        "label": "Canal",
        "options": ["Loja", "Online"],
        "default": "Geral",
        "allValue": "Geral"
      }
    ]
  },
  "pages": [
    { "id": "p1", "label": "Visão Geral", "sections": [{ "id": "s01", "label": "Perfil da base" }] },
    { "id": "p2", "label": "Detalhe",     "sections": [{ "id": "s02", "label": "Por categoria" }] }
  ]
}
```

- **`meta.filters`** — um `FilterDef` por coluna de filtro do dataset.
  - `id` casa com a coluna em `dims`/`filters` da tabela.
  - `options` são os valores selecionáveis.
  - `allValue` é o rótulo "sem filtro" (ex.: `"Geral"`) — quando selecionado, a
    coluna não estreita os dados e some dos filtros ativos.
  - `default` é o valor inicial (normalmente igual a `allValue`).
- `pages` → `sections` define a navegação topo + sidebar.

---

## Composições mais usadas

A composição agora é **layout, não estrutura**. Você escreve widgets planos e
posiciona no `layout.json`.

### Gráfico + insights lado a lado
View — três widgets planos:
```json
{ "id": "chart1", "type": "chart", "chartType": "bar", "bind": { … } }
{ "id": "fb1", "type": "find-block", … }
{ "id": "fb2", "type": "find-block", … }
```
Layout — chart ocupa 7 colunas à esquerda, os dois find-blocks empilham nas 5 da direita:
```json
{ "id": "chart1", "x": 0, "y": 0, "w": 7, "h": 4 }
{ "id": "fb1",    "x": 7, "y": 0, "w": 5, "h": 2 }
{ "id": "fb2",    "x": 7, "y": 2, "w": 5, "h": 2 }
```

### Dois gráficos comparativos
Dois widgets `chart` (`w: 6` cada, mesma linha `y`).

### Três achados em linha
Três `find-block` com `w: 4` na mesma linha `y`.
