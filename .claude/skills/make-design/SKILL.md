---
name: make-design
description: "Constrói elementos isolados do design system — gráficos, componentes visuais, 1-pagers — como páginas HTML standalone com exportação PNG 3×. Lê dados colados no chat ou de um arquivo CSV em input/. Sugere o tipo de visualização e confirma com o usuário antes de gerar. Use quando o usuário invocar /make-design ou pedir para criar um gráfico, elemento visual ou mini-relatório no design system."
user-invocable: true
---

# make-design

Constrói um elemento visual isolado do design system e salva em `output/elements/[slug].html`.

## Visão geral

| | |
|---|---|
| **Input** | Dados colados no chat **ou** CSV em `input/` |
| **Output** | `output/elements/[slug].html` — abre no browser |
| **Exportação** | Botão "↓ PNG" fixo na tela, gera PNG 3× (≈3000px de largura) |
| **Composição** | Gráfico isolado / gráfico + contexto / 1-pager completo |
| **Tema** | Dark (padrão) · Light se o usuário mencionar |

---

## Processo

### Passo 1 — Capturar dados

Verifique se o usuário colou dados no chat ou se há um arquivo em `input/`.

- **CSV em `input/`** → leia o arquivo, parse colunas e linhas
- **Dados colados** → interprete diretamente do chat

Monte mentalmente uma tabela com dimensões e métricas antes de prosseguir.

Se não houver dados nem descrição clara, pergunte: qual é o dado? Cole aqui ou informe o arquivo em `input/`.

---

### Passo 2 — Analisar padrão e propor

Com base nos dados, identifique:

**Tipo de dado → gráfico sugerido:**

| Padrão | Tipo sugerido |
|---|---|
| Evolução no tempo (datas/períodos em eixo) | `line` ou `area` |
| Comparação entre categorias — ranking | `bar-horizontal` |
| Comparação vertical entre poucos valores | `bar` |
| Proporção / composição (partes de um todo) | `donut` |
| Dois indicadores com escalas diferentes | `mixed` (bar + line) |
| Parte de meta em % | `radialBar` |
| Múltiplas séries comparando atributos | `radar` |
| Hierarquia / peso relativo | `treemap` |
| Correlação entre dois valores numéricos | `scatter` |
| Evolução acumulada com volume | `area` multi-série |

**Escopo do elemento:**

| Composição | Quando usar |
|---|---|
| Só gráfico | Dado único, uso direto em outro contexto |
| KPI row + gráfico | Contexto numérico apoia a visualização |
| Gráfico + insights (`.row`) | Achados derivados do dado merecem destaque |
| 1-pager completo | Relatório autônomo com título, métricas, gráfico e achados |

---

### Passo 3 — Confirmar com o usuário

Use `AskUserQuestion` com **2–3 perguntas simultâneas**:

1. **Tipo de gráfico** — primeira opção é a sugestão, + 2–3 alternativas relevantes
2. **Escopo** — gráfico isolado / gráfico + contexto / 1-pager
3. **Tema** (somente se não mencionado) — Dark / Light

Prossiga somente após confirmação.

---

### Passo 4 — Gerar o HTML

#### 4a — Ler o shell

Leia `.claude/skills/components/tools/shell-element.html`.

#### 4b — Montar `{{CONTENT}}`

Use **somente** as classes do design system. Nunca inventar classes novas, `box-shadow` decorativo, `border-radius` alto em superfícies de conteúdo, ou `background` inline colorido.

---

**Cabeçalho de seção** (somente para escopo gráfico + contexto ou 1-pager):
```html
<div class="slide-hd">
  <span class="badge badge-p">ANÁLISE</span>
  <h1 class="slide-title">Título em frase <em>declarativa</em></h1>
</div>
```

**KPI row** (métricas de contexto):
```html
<div class="mr">
  <div class="mi"><div class="mv c-p">R$ 1.2k</div><div class="ml">Ticket Médio</div></div>
  <div class="mi"><div class="mv c-g">+18%</div><div class="ml">Crescimento YoY</div></div>
  <div class="mi"><div class="mv c-a">3.2×</div><div class="ml">ROAS</div></div>
</div>
```

**Gráfico:**
```html
<div class="chart-wrap" id="chart-[nome]"></div>
```

**Find note** (frase-síntese abaixo do gráfico):
```html
<p class="find-note find-note-p">Contexto derivado da visualização acima.</p>
```

**Find blocks** (insights com tag):
```html
<div class="find-block">
  <span class="find-tag find-tag-p">Achado</span>
  <div class="find-title">Frase declarativa que sintetiza o insight.</div>
  <p class="sm">Detalhe ou dado de suporte.</p>
</div>
```

**Layout gráfico + insights (`.row`):**
```html
<div class="row">
  <div class="col" style="flex:1.1">
    <div class="chart-wrap" id="chart-principal"></div>
    <p class="find-note find-note-p">Síntese da visualização.</p>
  </div>
  <div class="col" style="flex:.9">
    <!-- find-blocks aqui -->
  </div>
</div>
```

**Dois gráficos comparativos (`.g2`):**
```html
<div class="g2">
  <div><div class="chart-title">Série A</div><div class="chart-wrap" id="chart-a"></div></div>
  <div><div class="chart-title">Série B</div><div class="chart-wrap" id="chart-b"></div></div>
</div>
```

**Highlight** (para números ou frases de destaque):
```html
<div class="hl"><strong>Dado de destaque:</strong> contexto que explica o número.</div>
```

**NI block** (ação ou item numerado):
```html
<div class="ni">
  <div class="nb nb-p">1</div>
  <div class="nt"><strong>Título da ação.</strong> Descrição ou justificativa curta.</div>
</div>
```

---

**Regras de composição:**
- `.content` como wrapper com `gap:14px` para elementos em coluna única
- Sempre terminar com `find-note` ou `find-block` quando o escopo incluir insights
- Cores de texto via `.c-p`, `.c-g`, `.c-r`, `.c-a`, `.c-o` — nunca hex inline
- Superfícies via `var(--surface)` — nunca `rgba()` hardcoded
- Sem tags filhas em campos texto-puro (títulos de badge, find-tag)

---

#### 4c — Montar `{{CHART_DEFS}}`

```javascript
'chart-[nome]': {
  type: 'bar',
  height: 320,
  series: [{ name: 'Série', data: [10, 20, 30] }],
  categories: ['Jan', 'Fev', 'Mar'],
  colors: ['#8B5CF6'],
},
```

**Altura sugerida por escopo:**
- Gráfico isolado (1-pager): `height: 420`
- Gráfico + insights lado a lado: `height: 340`
- Dois gráficos em `.g2`: `height: 280`

**Cores por tema:**
| | Dark | Light |
|---|---|---|
| purple | `#8B5CF6` | `#7C3AED` |
| green  | `#10B981` | `#059669` |
| amber  | `#F59E0B` | `#D97706` |
| orange | `#F97316` | `#EA580C` |
| red    | `#EF4444` | `#DC2626` |

Barras horizontais (ranking): usar `colors` com array gradado do mais para o menos intenso (ex: `['#8B5CF6','#7C3AED','#6D28D9','#5B21B6','#4C1D95']`).

---

#### 4d — Preencher placeholders do shell

| Placeholder | Valor |
|---|---|
| `{{TITLE}}` | Título descritivo para a aba do browser |
| `{{THEME}}` | `dark` ou `light` |
| `{{CONTENT}}` | HTML montado em 4b |
| `{{CHART_DEFS}}` | Linhas JS com as chaves `'chart-x': {...},` |
| `{{FILENAME}}` | Slug sem extensão para o download PNG (ex: `vendas-por-canal-2024`) |

---

### Passo 5 — Salvar e informar

```powershell
New-Item -ItemType Directory -Force output\elements | Out-Null
```

Salve em `output/elements/[slug].html`.

Informe:
- Caminho do arquivo
- Instruções: abrir no browser (requer rede para carregar fontes e ApexCharts na primeira abertura)
- O botão "↓ PNG" aparece após o carregamento e exporta o elemento em 3× de resolução

---

## Comportamento em ambiguidade

| Situação | Ação |
|---|---|
| Dado ambíguo (não fica claro qual é dimensão vs. métrica) | Perguntar antes de propor |
| Tipo de gráfico não reconhecido | Usar `bar` como fallback, avisar |
| Sem dados e sem arquivo em `input/` | Pedir que o usuário cole os dados |
| Tema não mencionado e escopo é só gráfico | Usar light sem perguntar |
| Múltiplos gráficos na mesma página | IDs únicos obrigatórios: `chart-a`, `chart-b`, etc. |
| Usuário quer tabela mas dados têm ≤ 2 dimensões | Sugerir gráfico, só usar tabela se o usuário confirmar preferência |
