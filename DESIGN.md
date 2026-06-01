---
name: Analytics Report App
description: Relatório de consultoria de dados que virou app — analítico, preciso, discreto.
colors:
  ink: "oklch(13% 0.008 280)"
  paper: "#FFFFFF"
  surface: "oklch(97.5% 0.004 280)"
  border: "oklch(90% 0.007 280)"
  body-gray: "oklch(43% 0.010 280)"
  muted: "oklch(52% 0.008 280)"
  purple: "#7C3AED"
  green: "#059669"
  amber: "#D97706"
  orange: "#EA580C"
  red: "#DC2626"
  tag-green: "#047857"
  tag-amber: "#B45309"
  tag-red: "#B91C1C"
typography:
  display:
    fontFamily: "'Exo 2', system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "'Exo 2', system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.022em"
  body:
    fontFamily: "'Exo 2', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label:
    fontFamily: "'Exo 2', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "1.5px"
  caption:
    fontFamily: "'Exo 2', system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  kpi-tile:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "22px 24px"
  data-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  table-header:
    backgroundColor: "{colors.purple}"
    textColor: "{colors.purple}"
    typography: "{typography.label}"
  filter-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.lg}"
    padding: "10px 18px"
---

# Design System: Analytics Report App

## 1. Overview: O Dossiê do Consultor

**Creative North Star: "O Dossiê do Consultor"**

O sistema é um relatório de consultoria impresso que ganhou interatividade, não um produto de BI. A tela é "papel": branco no claro, grafite quase-preto no escuro. Sobre esse papel, o texto de narrativa (achados, notas, recomendações) repousa plano, sem moldura, como anotação editorial; os dados (gráficos, tabelas, heatmaps, KPIs) vivem dentro de cards levemente elevados, como recortes colados na página. Essa separação entre o que se lê e o que se mede é a coluna vertebral visual do sistema.

A personalidade é analítica, precisa e discreta. A densidade é alta mas respirada: o consultor revisa a análise minutos antes da reunião com o cliente, então cada rótulo precisa ser legível de relance e nada pode gritar. O roxo é a única voz de marca e aparece com parcimônia, em bordas-topo e títulos de coluna, nunca como preenchimento dominante. Os accents (verde, âmbar, laranja, vermelho) carregam significado de dado, jamais decoração.

O sistema rejeita explicitamente: dashboards de BI genéricos, clichês de SaaS, glassmorphism decorativo, e o template hero-metric (número gigante com gradiente). Se a tela parece um produto comprado pronto, fracassou; deve parecer o entregável de uma consultoria sênior.

**Key Characteristics:**
- Papel como superfície, recortes de dado colados por cima (collage)
- Roxo como voz única; accents só com significado de dado
- Tipografia Exo 2 em toda a interface, inclusive nos gráficos
- Tema claro e escuro de primeira classe, ambos com elevação tonal real
- Densidade editorial: legível de relance, nunca ruidosa

## 2. Colors: A Paleta do Papel

A paleta é um neutro de papel tingido levemente de roxo (hue 280), com cinco accents de dado e um roxo de marca usado com rigor.

### Primary
- **Roxo de Marca** (`#7C3AED` claro / `#8B5CF6` escuro): a voz única do sistema. Bordas-topo de KPI e find-block, títulos de coluna de tabela, numeradores de ação. Nunca como fundo de bloco inteiro.

### Secondary (accents de dado)
- **Verde** (`#059669` / `#10B981`): resultado positivo, potencial, série de dado favorável.
- **Âmbar** (`#D97706` / `#F59E0B`): atenção, ressalva, segunda série.
- **Laranja** (`#EA580C` / `#F97316`): terceira série / ênfase secundária.
- **Vermelho** (`#DC2626` / `#EF4444`): risco, queda, alerta.

As variantes `tag-*` (`#047857`, `#B45309`, `#B91C1C` no claro) existem só para texto pequeno colorido sobre papel branco — escurecidas o suficiente para passar WCAG AA (≥4.5:1). Os accents de gráfico continuam usando os valores do design-system; as charts leem a paleta dos tokens CSS em runtime (fonte de verdade única).

### Neutral
- **Tinta** (`oklch(13% 0.008 280)` / claro · `oklch(96% 0.003 280)` / escuro): texto principal. Nunca `#000`/`#fff` puros.
- **Cinza de Corpo** (`oklch(43% 0.010 280)`): texto secundário denso (parágrafos, bullets).
- **Cinza Mudo** (`oklch(52% 0.008 280)`): rótulos uppercase, títulos de gráfico, eixos. Escurecido de 64%→52% para atingir AA.
- **Papel** (`#FFFFFF` / `oklch(14.5% 0.006 280)`): superfície dos cards de dado.
- **Página** (`#FFFFFF` / `oklch(10.5% 0.007 280)`): o fundo atrás dos cards (no escuro, mais escuro que o card, criando elevação tonal).
- **Superfície** (`oklch(97.5% 0.004 280)`): chips, find-note discretos, controles em repouso.
- **Borda** (`oklch(90% 0.007 280)` / `oklch(24% 0.009 280)`): contorno dos cards de dado.

### Named Rules
**A Regra da Voz Única.** O roxo aparece em ≤10% de qualquer tela: bordas-topo, títulos de coluna, numeradores. Preencher um bloco inteiro de roxo é proibido. A raridade é o ponto.

**A Regra do Accent com Significado.** Verde/âmbar/laranja/vermelho só aparecem quando representam um dado (série, estado, delta). Cor nunca é decoração, e nunca é o único portador de significado (sempre acompanhada de rótulo ou ícone).

## 3. Typography: Exo 2, do título ao eixo

**Display Font:** Exo 2 (com `system-ui, sans-serif` de fallback)
**Body Font:** Exo 2
**Label/Mono Font:** Exo 2 em tudo; monospaço apenas em contexto de código — mensagem técnica de erro (`.widget-error-msg`) e tokens de código/caminho inline (`<code>`)

**Character:** Uma única família geométrica humanista (Exo 2, self-hosted, pesos 400–900) carrega toda a interface, inclusive os rótulos e eixos dos gráficos ApexCharts. A unidade tipográfica é deliberada: nada na tela parece de um sistema diferente.

### Hierarchy
- **Display** (700, 32px, lh 1, `-0.03em`, `tabular-nums`): valores de KPI e estatísticas-âncora de metodologia. Números, não prosa.
- **Headline** (800, 22px, lh 1.15, `-0.022em`): títulos de find-block e de seção.
- **Body** (400, 13px, lh 1.65): parágrafos, bullets, notas. Limite de 65–75ch.
- **Label** (700, 11px, uppercase, `+1.5px` tracking): títulos de gráfico, cabeçalhos de tabela, eyebrows. Piso de 11px — nada menor.
- **Caption** (400, 11.5px): notas auxiliares, legendas (`.xs`, `.find-note`).

### Named Rules
**A Regra do Piso de 11px.** Nenhum texto legível desce abaixo de 11px. Rótulos uppercase tracked param em 11px/700; abaixo disso a legibilidade pré-reunião quebra.

**A Regra da Família Única.** Exo 2 em toda a UI e em todos os gráficos. Introduzir uma segunda família de texto é proibido (exceto o monospaço reservado a contexto de código: mensagem de erro técnica e `<code>` inline).

## 4. Elevation: Papel e Recortes

O sistema usa elevação seletiva, não global. A narrativa fica plana no papel (sem sombra, sem borda, sem radius). Apenas os widgets de dado são erguidos: borda de 0.8px, radius de 8px e uma sombra de card sutil que os destaca como recortes colados. No tema escuro a elevação é dupla — o card (`oklch 14.5%`) é mais claro que a página (`oklch 10.5%`), então a profundidade vem tanto do tom quanto da sombra.

### Shadow Vocabulary
- **shadow-sm** (`0 1px 2px oklch(13% 0.008 280 / 0.06), 0 0 0 1px oklch(13% 0.008 280 / 0.04)`): KPIs e controles em repouso.
- **shadow-card** (`0 2px 8px oklch(13% 0.008 280 / 0.08), 0 0 0 1px oklch(13% 0.008 280 / 0.05)`): cards de gráfico, tabela e heatmap. A elevação padrão dos dados.
- **shadow-md** (`0 4px 14px oklch(13% 0.008 280 / 0.09), 0 0 0 1px oklch(13% 0.008 280 / 0.05)`): diálogos, menus de contexto, modais de detalhamento.

### Named Rules
**A Regra da Colagem.** Texto de narrativa repousa plano no papel; dados são recortes elevados em cards. A distinção entre ler e medir deve ser instantânea. Aplicar card a um find-block na grade do dashboard é proibido (ele só é card no modal de detalhe).

**A Regra da Superfície Translúcida.** Superfícies decorativas são semi-transparentes — claro `rgba(0,0,0,.02)`, escuro `rgba(255,255,255,.03)` — nunca opacas chapadas.

## 5. Components

### KPI Tile (`.mr`)
- **Forma:** radius 8px, borda 1px, **borda-topo 3px roxa** (acento de topo, não stripe lateral).
- **Conteúdo:** valor em Display (32px/700, tabular-nums) + rótulo em Label (9.5–11px uppercase, cinza mudo).
- **Elevação:** shadow-sm. Vários lado a lado pela grade de 12 colunas.

### Data Card (gráfico / tabela / heatmap)
- **Forma:** radius 8px, borda 0.8px (`--border`), padding 16px.
- **Fundo:** Papel (`--bg`), nunca superfície opaca.
- **Elevação:** shadow-card.
- **Título:** Label uppercase (11px, cinza mudo), acima do canvas.
- **Altura do gráfico:** sempre via JS (`height` no chartDef), nunca CSS.

### Table (`.tw`)
- **Cabeçalho:** fundo `--purple-bg` (8% roxo), texto roxo em Label uppercase (11px).
- **Forma:** radius 8px, shadow-card.
- **Células:** numéricas alinhadas à direita, tabular-nums.

### Find-Block (narrativa) — Signature Component
- **Na grade do dashboard:** **plano** — transparente, sem borda, sem sombra, sem radius, padding `4px 0`. Tag colorida em Label (11px/900) + título em Headline (22px/800).
- **No modal de detalhe / slides:** vira card — `--purple-bg`, borda-topo 3px (cor da tag), radius 6px, padding 22px 24px. O mesmo componente em dois contextos.

### Find-Note (`.find-note`)
- Texto auxiliar (11.5px, cinza mudo) com borda-esquerda **fina (0.8px)** colorida por variante. Nunca acima de 1px.

### Filters & Buttons
- **Chip de filtro:** superfície, radius 8px, padding 6px 12px, Label 11px/600; estado ativo muda borda e cor.
- **Botão ghost:** transparente/superfície, borda 1px, radius 8px, texto cinza mudo uppercase; hover muda borda e cor (sem fill).

### Estados vazios e de erro
- **Vazio:** card com mensagem centrada ("Sem dados para este filtro"). O dashboard nunca fica em branco.
- **Erro:** card pontilhado com tag "Widget inválido" + detalhe. O renderer nunca lança para a tela.

## 6. Do's and Don'ts

### Do:
- **Do** manter a narrativa plana no papel e os dados em cards elevados (A Regra da Colagem).
- **Do** usar roxo só em bordas-topo, títulos de coluna e numeradores, em ≤10% da tela.
- **Do** usar Exo 2 em toda a UI e em todos os gráficos; ler a paleta dos gráficos dos tokens CSS em runtime.
- **Do** manter contraste de texto ≥4.5:1 (WCAG AA), inclusive em rótulos de eixo e tags; nunca usar cor como único portador de estado.
- **Do** definir altura de gráfico via JS (`height` no chartDef), nunca via CSS.
- **Do** tingir todo neutro levemente de roxo (hue 280); manter superfícies semi-transparentes.

### Don't:
- **Don't** usar `border-left`/`border-right` maior que 1px como stripe colorido (find-note para em 0.8px).
- **Don't** usar gradient text (`background-clip: text`).
- **Don't** usar o template hero-metric (número gigante com gradiente).
- **Don't** usar glassmorphism decorativo (`backdrop-filter`).
- **Don't** criar cards ad-hoc — usar sempre os componentes do design-system; nunca aninhar cards.
- **Don't** usar `#000` ou `#fff` puros, nem superfícies opacas chapadas.
- **Don't** parecer um dashboard de BI genérico ou um produto de SaaS comprado pronto.
