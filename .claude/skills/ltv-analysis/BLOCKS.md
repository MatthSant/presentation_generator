# Referência de Typed Blocks — App de Análise

Referência completa do schema JSON aceito pelo renderer.
**Nunca ler `renderer.js` ou `chart-options.js` — toda a informação está aqui.**

---

## Estrutura do arquivo de seção (`sXX.json`)

```json
{
  "id": "s01",
  "page": "visao-geral",
  "pageLabel": "Visão Geral",
  "sectionLabel": "Perfil da Base",
  "header": {
    "badge": "VISÃO GERAL",
    "badgeColor": "p",
    "title": "Texto normal do título ",
    "titleEm": "parte em itálico"
  },
  "blocks": [ /* bloco, bloco, ... */ ],
  "modals": [ /* modal, modal, ... */ ]
}
```

`header.titleEm` é opcional — se omitido, `title` vira texto puro.  
`modals` é opcional.

---

## Block types

### `kpi-row`
Linha de métricas (máx 4 itens).

```json
{
  "type": "kpi-row",
  "items": [
    { "value": "1.234",   "label": "Clientes únicos",  "color": "p" },
    { "value": "34%",     "label": "Taxa de recompra", "color": "g" },
    { "value": "R$ 1.8k", "label": "LTV médio",        "color": "a" }
  ]
}
```

`color`: `p` roxo · `g` verde · `a` âmbar · `r` vermelho · `o` laranja — opcional.

---

### `chart`
Gráfico ApexCharts.

```json
{
  "type": "chart",
  "id": "chart-s01-dist",
  "chartType": "donut",
  "height": 260,
  "chartTitle": "Título opcional acima do gráfico",
  "series": [68.2, 20.1, 7.4, 4.3],
  "labels": ["1 compra", "2 compras", "3 compras", "4+"],
  "colors": ["#7C3AED", "#059669", "#D97706", "#4C1D95"],
  "distributed": false,
  "options": {}
}
```

**`chartType` obrigatório.** Tipos disponíveis:

| `chartType` | Uso | Campos extras |
|---|---|---|
| `bar` | Barras verticais | `categories[]`, `distributed: true` para cor por barra |
| `bar-horizontal` | Barras horizontais (ranking) | `categories[]`, `distributed: true` |
| `line` | Linha temporal | `categories[]` |
| `area` | Área com gradiente | `categories[]` |
| `donut` | Pizza com buraco | `labels[]` |
| `pie` | Pizza sólida | `labels[]` |
| `mixed` | Bar + Line no mesmo eixo | `categories[]`, `series` com `type` por série |
| `stacked` | Barras empilhadas | `categories[]`, `stackType?: '100%'` |
| `radialBar` | Gauge circular | `labels[]` (nome do indicador) |
| `scatter` | Dispersão | `series: [{name, data:[{x,y}]}]` |
| `radar` | Teia | `categories[]` |
| `treemap` | Hierarquia | `series: [{data:[{x:'label',y:value}]}]` |

**`series` para gráficos multi-série:**
```json
"series": [
  { "name": "Novas", "data": [100, 200, 150] },
  { "name": "Recompras", "data": [30, 60, 45] }
]
```

**`series` para mixed (bar + line):**
```json
"series": [
  { "name": "Faturamento", "type": "bar",  "data": [100, 200] },
  { "name": "Ticket Médio", "type": "line", "data": [350, 410] }
]
```

**`options`** — override direto de opções ApexCharts, mergeado por cima. Formatters como strings são reativados automaticamente:
```json
"options": {
  "yaxis": [
    { "title": { "text": "R$" } },
    { "opposite": true, "labels": { "formatter": "function(v){ return 'R$'+v.toFixed(0); }" } }
  ],
  "xaxis": { "labels": { "formatter": "function(v){ return v+'%'; }" } }
}
```

**Cores recomendadas (tema light):**

| Intenção | Hex |
|---|---|
| Roxo principal | `#7C3AED` |
| Verde | `#059669` |
| Âmbar | `#D97706` |
| Laranja | `#EA580C` |
| Vermelho | `#DC2626` |
| Roxo escuro | `#5B21B6` / `#4C1D95` |
| Gradiente roxo (ranking) | `["#7C3AED","#6D28D9","#5B21B6","#4C1D95","#3B0D99"]` |

**IDs de gráfico:** sempre `chart-sXX-descricao` — únicos por seção.

---

### `find-block`
Achado com tag colorida e texto de suporte. Clicável se `modal` presente.

```json
{
  "type": "find-block",
  "tag": "Recompra",
  "tagColor": "p",
  "title": "1 em cada 3 clientes voltou a comprar.",
  "detail": "Taxa de recompra de 34% — texto de suporte com <strong>HTML</strong> inline.",
  "modal": "modal-id-opcional"
}
```

`tagColor`: `p` · `g` · `a` · `r` · `o`.  
Se `modal` presente: cursor pointer + `↗ ver detalhamento` no rodapé.

---

### `find-note`
Frase-síntese abaixo de gráfico.

```json
{
  "type": "find-note",
  "text": "68% da base comprou apenas uma vez — oportunidade de recompra.",
  "color": "p",
  "modal": "modal-id-opcional"
}
```

`color`: `p` · `g` · `a` · `r` · `o`.

---

### `highlight` (alias `hl`)
Box de destaque com texto HTML.

```json
{
  "type": "highlight",
  "text": "<strong>LTV médio:</strong> R$ 1.847 — 3× maior em recompradores.",
  "color": "p"
}
```

`color` opcional — produz `hl hl-{color}`. Sem `color`: estilo neutro.  
`type: "hl"` é alias idêntico.

---

### `ni`
Ação numerada. Dois variantes:

**Horizontal (padrão):**
```json
{
  "type": "ni",
  "number": "1",
  "text": "<strong>Título da ação.</strong> Justificativa ou detalhe.",
  "color": "p"
}
```

**Vertical (seções internas):**
```json
{
  "type": "ni",
  "variant": "vertical",
  "number": "1",
  "title": "Título do item",
  "sections": [
    { "label": "Por quê?",    "text": "Contexto da recomendação.", "color": "p" },
    { "label": "Acionável:", "text": "Passo concreto a executar.",  "color": "g" }
  ]
}
```

---

### `label-sec`
Separador de subseção com linha decorativa.

```json
{
  "type": "label-sec",
  "text": "DISTRIBUIÇÃO POR SAFRA",
  "sub": "Cohorte de entrada 2021–2024. Texto com <em>HTML</em> inline.",
  "divider": true
}
```

`divider` padrão `true` — linha roxa abaixo do label. Passe `false` para omitir.  
`sub` opcional — `<p class="sm">` abaixo da linha.

---

### `row`
Duas colunas flexíveis (gráfico + insights side-by-side).

```json
{
  "type": "row",
  "cols": [
    { "flex": 1.1, "blocks": [ /* chart, find-note, ... */ ] },
    { "flex": 0.9, "blocks": [ /* find-block, find-block, ... */ ] }
  ]
}
```

`flex` controla proporção. Padrão `1` por coluna. `1.1 / 0.9` é o mais comum.

---

### `g2` / `g3` / `g4`
Grid de 2, 3 ou 4 colunas iguais.

```json
{
  "type": "g3",
  "items": [
    { "title": "Título opcional", "blocks": [ /* find-block, chart, ... */ ] },
    { "blocks": [ /* ... */ ] },
    { "blocks": [ /* ... */ ] }
  ]
}
```

`title` opcional — renderizado como `chart-title` acima dos blocos do item.

---

### `table`
Tabela estruturada com header roxo.

```json
{
  "type": "table",
  "headers": ["Produto", "Clientes", "LTV Médio", "Recompra"],
  "rows": [
    ["Curso Online", "423", "R$ 2.100", "41%"],
    ["Workshop",     { "value": "R$ 890", "color": "r" }, "120", "12%"],
    ["Mentoria",     "89",  { "html": "<strong>R$ 4.200</strong>", "color": "g" }, "68%"]
  ]
}
```

Cada célula pode ser string ou `{ value, html, color }`.  
`color` aplica `c-{color}` na célula. `html` renderiza HTML direto.

---

### `heatmap`
Tabela de calor com escala de cores.

```json
{
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
  "caption": "Legenda opcional abaixo da tabela."
}
```

Classes de célula: `hm-hi` (verde, valor alto) · `hm-lo` (vermelho, valor baixo) · `hm-n` (neutro/cinza).  
`caption` opcional — texto pequeno abaixo da grade.

---

### `content`
Wrapper com `gap` customizado (uso raro — só quando o gap padrão não serve).

```json
{
  "type": "content",
  "gap": 20,
  "blocks": [ /* qualquer bloco */ ]
}
```

---

### `xs`
Texto pequeno (11px, cinza). Útil para notas metodológicas.

```json
{ "type": "xs", "text": "† n < 100. Interpretar com cautela." }
```

---

## Modais

Modais aparecem fora da seção principal e são abertos por `data-modal` em find-block ou find-note.

```json
{
  "id": "modal-ltv-detalhe",
  "title": "Detalhamento — LTV por Produto",
  "blocks": [ /* qualquer bloco, incluindo charts e tabelas */ ]
}
```

O `id` do modal deve coincidir com o campo `modal` no bloco que o abre.

---

## Padrões de composição mais usados

### Gráfico + insights (layout padrão de seção analítica)
```json
{ "type": "row", "cols": [
    { "flex": 1.1, "blocks": [
        { "type": "chart", ... },
        { "type": "find-note", ... }
    ]},
    { "flex": 0.9, "blocks": [
        { "type": "find-block", ... },
        { "type": "find-block", ... }
    ]}
]}
```

### Dois gráficos comparativos
```json
{ "type": "g2", "items": [
    { "title": "Série A", "blocks": [{ "type": "chart", ... }] },
    { "title": "Série B", "blocks": [{ "type": "chart", ... }] }
]}
```

### Três achados em linha
```json
{ "type": "g3", "items": [
    { "blocks": [{ "type": "find-block", "tagColor": "r", ... }] },
    { "blocks": [{ "type": "find-block", "tagColor": "g", ... }] },
    { "blocks": [{ "type": "find-block", "tagColor": "p", ... }] }
]}
```
