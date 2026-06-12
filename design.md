# Witly Design System — App de Analytics

Referência de design do app (`app/`). Consolida os tokens do handoff (`Witly Design System-handoff.zip`),
os mockups das telas (`ui_kits/app/*.html` no zip) e os HTMLs fonte das análises
(`backup/Ajsute de design/`). **Fonte de verdade quando houver dúvida:** mockups para o chrome
do app; HTMLs fonte para a composição visual dos relatórios.

> Decisões fixadas: fonte **Poppins** (não Exo 2 dos mockups), **light-only** (dark removido),
> drawer lateral para detalhamentos, botão voltar **à esquerda** em todas as telas exceto a home,
> **logo e marca "Witly Grimório"** (ícone grimório `assets/witly-logo.png` ~26px + nome) — não
> o wordmark plum dos mockups.

---

## 1. Tokens

### Cores

```css
/* marca */
--purple:      #7C3AED;   /* primária — ações, série 1 de gráfico, links */
--purple-600:  #6D28D9;   /* hover */
--purple-700:  #5B21B6;
--plum:        #2E084B;   /* tinta da marca — avatar, superfícies inversas */
--purple-bg:   rgba(124,58,237,.08);
--purple-soft: #F3EEFE;

/* semânticas */
--green: #059669;  --green-bg: rgba(5,150,105,.10);   --tag-g: #047857;  --green-soft: #ecfdf5;
--amber: #D97706;  --amber-bg: rgba(217,119,6,.11);   --tag-a: #B45309;  --amber-soft: #fffbeb;
--red:   #DC2626;  --red-bg:   rgba(220,38,38,.10);   --tag-r: #B91C1C;  --red-soft:   #fef2f2;
--orange:#EA580C;  --orange-bg:rgba(234,88,12,.10);

/* neutros (família 280° — cinzas levemente roxos) */
--fg:     #161519;   /* títulos / texto forte */
--gray:   #54515d;   /* corpo */
--gray2:  #75727e;   /* muted / labels */
--faint:  #9b98a3;   /* eixos, hints */
--border: #e7e5ec;   /* hairline padrão */
--border-strong: #dcd9e3;
--divider:#efedf3;

/* superfícies */
--bg:      #ffffff;  /* cards, barras */
--bg-page: #fbfbfd;  /* canvas */
--surface: #f6f5f9;  /* sunken — inputs, chips, highlights */

/* data-viz: sequência 5 cores */
purple → green → amber → orange → --data-5 #C3A4F7
```

### Tipografia

- **Sans:** `'Poppins', ui-sans-serif, system-ui` — tudo, inclusive números de KPI (peso 700–800,
  `font-variant-numeric: tabular-nums`).
- **Mono:** `'IBM Plex Mono'` — apenas leituras de dado pontuais (eixos, código).
- Escala de referência: page-title 30–32px/800/-0.03em · find-title 22px/800/-0.022em ·
  card-title 18px/800 · corpo 13.5–14.5px · labels 11px/700 uppercase ·
  eyebrow 11.5px/800 uppercase tracking .16em · micro-label de KPI 9.5px uppercase tracking 1px.

### Raios, sombras, motion

```css
--r-sm: 9px;  --r-md: 13px;  --r-lg: 18px;  --r-pill: 999px;
--shadow-sm:   0 1px 2px rgba(24,22,30,.05), 0 0 0 1px rgba(24,22,30,.035);
--shadow-card: 0 2px 10px rgba(24,22,30,.06), 0 0 0 1px rgba(24,22,30,.04);
--shadow-lift: 0 14px 36px -16px rgba(46,8,75,.30), 0 2px 8px rgba(24,22,30,.05);
--ease: cubic-bezier(.22,1,.36,1);   /* 120–200ms; sem bounce, sem loop infinito */
```

**Regras duras:** borda faz o trabalho, não a sombra · superfícies brancas em canvas quase-branco ·
sem gradiente decorativo (exceções catalogadas: rampa de barra de gráfico, ícones de zona) ·
sem glassmorphism · sem emoji · eyebrows sempre UPPERCASE com tracking largo · copy pt-BR,
declarativa ("o dado diz"), números com `cerca de` quando arredondar.

---

## 2. Chrome do app

### Appbar (todas as telas) — 60px

```
[← Voltar] [logo grimório ~26px → /] [sep] [Witly Grimório / SUB] [tabs] ... [ações] [avatar 34px plum]
```

- Sticky, fundo `--bg`, border-bottom hairline, padding 0 28px, altura 60px.
- **Logo/marca:** ícone grimório (`assets/witly-logo.png`) + "Witly Grimório" com o `data-sub`
  da página em `<small>` uppercase. (O wordmark plum dos mockups **não** é usado.)
- **Voltar:** pill quieta (borda hairline, chevron + rótulo), sempre **à esquerda**, presente em
  toda tela exceto a home. Nunca `margin-left:auto`.
- **Tabs:** pill `padding 8px 14px; radius --r-sm`; ativa = texto roxo sobre `--purple-bg`;
  hover = `--surface`.
- **Avatar:** círculo 34px `--plum`, inicial branca; abre menu (Admin, Guias, Sair).

### Page header

```html
<div class="page-eyebrow">Panorama geral</div>   <!-- 11.5px/800 uppercase roxo, dot ::before -->
<h1 class="page-title">Visão do semestre</h1>     <!-- 30–32px/800/-0.03em -->
<p class="page-sub">contexto · meta · escopo</p>  <!-- 14.5px gray2, separadores "·" -->
```

Container `.page`: max-width 1120px, padding 30px 28px 80px.

### Botões

- **Primário (`.btn-new` / `.btn--primary`):** pill roxa, sombra roxa
  `0 8px 18px -8px rgba(124,58,237,.6)`, hover escurece + lift 1px.
- **Secundário:** branco, borda hairline, hover preenche `--surface`.
- **`ver-btn` (Ver detalhamento):** pill branca com **chip circular roxo 28px** contendo seta ↗;
  hover: borda roxa + `--shadow-lift` + chip translada (2px,-2px).
- **Icon-btn:** círculo 30px `--purple-bg`, ícone roxo.

### FAB de filtros — círculo 56px

Bottom/right 28px, roxo, sombra `0 14px 30px -10px rgba(124,58,237,.7)`; badge de contagem no
canto. Menu popup ancorado acima (`bottom: 94px`), card com `--shadow-lift`, header uppercase,
opções com check roxo; selecionada = `--purple-bg`. Controles type-specific (criativos,
histórico) entram no mesmo shell.

### Drawer de detalhamento

Painel direito `min(640px, 94vw)` (mockup: 460px; alargado por causa de charts/tabelas), fundo
card, sombra `-20px 0 60px -20px rgba(46,8,75,.4)`. Scrim `rgba(28,16,46,.42)` +
`backdrop-filter: blur(2px)`. Header: tag `◆ DETALHAMENTO` + título 19px/800 + fechar circular
32px. Fecha com ESC, scrim-click e botão.

---

## 3. Widgets dos relatórios (em linha com os HTMLs fonte)

### KPI row (`.mr/.mi/.mv/.ml`)

Card com **border-top 3px roxo**, células divididas por hairline; valor 32px/700 tabular-nums;
label 9.5px uppercase gray2 tracking 1px.

### KPI strip (`.kpi-strip`)

Card grid com divisórias; label 11px uppercase; número 27px/800 **Poppins** (não mono);
delta `▲/▼` 12.5px/700 verde (`--tag-g`) ou vermelho (`--tag-r`).

### Find-block (achado nas seções)

Fundo suave da cor (`--purple-bg`/`--green-bg`/...) + **border-top 3px** na cor + borda 1px
translúcida, radius `--r-md`, padding 22px 24px. Tag 11px/900 uppercase tracking 2px na cor;
título 22px/800. Botão `ver-btn` quando há detalhamento.

### Insight card (`find-block--card` — página Insights)

Card **branco** com **left-stripe 5px** (`::before`) na cor da zona; tag colorida 11px/800
tracking .14em; título 16.5–18px/800; corpo 13.5px; hover lift. **Takeaway** no rodapé:
faixa com fundo soft da cor + label pill de cor cheia (Implicação/Atenção/Recomendado).

### Zonas da página Insights

`zone-hd`: ícone 30px com gradiente da cor (verde = Conclusões claras, âmbar = Aprofundamento
recomendado, vermelho/roxo = Pontos de atenção) + título 13px/800 uppercase + caption + régua
em fade. Grid 2 col (cards grandes) ou 3 col.

### Highlight (`.hl`)

`--surface` + borda hairline, radius 4–9px, 12.5–13.5px; variantes coloridas = borda na cor +
fundo `-bg`; `strong` na cor.

### Heatmap

Headers uppercase roxos; escala divergente fixa:
`#97C459 → #EAF3DE → #F1EFE8 (neutro) → #FCEBEB → #F0957B → #E24B4A`.
Classes `csp/cp/cn0/cn/csn/cxn` (e legado `hm-*`) nunca são renomeadas — valores salvos em datasets.

### Pergunta norteadora (qcard)

Card branco hairline; pill "✓ Relevante" verde-soft; código `P1` roxo + título 17.5px/800;
corpo 14px; **chips de métricas** (`--surface` + hairline, valor em bold roxo/verde/vermelho);
rodapé com `Adicionar` (verde, pill, flex:1) e `Ignorar` (borda, vermelho no hover);
estados: added = ring verde 2px; removed = grayscale .55 + pill "Ignorada".

### Gráficos (ApexCharts)

Cores via CSS vars (sequência data-viz); grid `--border`; labels `--gray2`/`--faint`;
fonte Poppins inclusive tooltip; sem toolbar, sem 3D, cantos arredondados; altura sempre via
layout (células de 80px), nunca CSS.

---

## 4. Composição e densidade (critério dos HTMLs fonte)

- Uma **seção típica = uma tela** (~1080p): cabeçalho + KPI row + gráfico + find-block visíveis
  juntos, sem scroll. Informações que se explicam mutuamente nunca se separam de tela.
- Gaps entre widgets 14–20px; padding generoso **dentro** do card, espaço contido **entre** cards.
- Hierarquia em 3 alturas por tela: título da seção → bloco de evidência (KPI/chart) → leitura
  (find-block/highlight).
- Specs finas por seção: ver auditoria comparativa em `temp/redesign/diff-spec.md`
  (gerada na Fase 6A do plano — `plano_refatoracao_ux.md`).

## 5. Arquitetura de informação

- **Home:** organizada por cliente (busca global no topo); badge de tier por análise; menu
  "Nova análise" agrupado por tier.
- **Tiers:** Estratégico (conversao-perfil, historico-lancamentos) · Tático
  (debriefing-lancamento, criativos) · Operacional (acompanhamento-lancamento).
- **Admin** (`/admin`): Clientes + Uso + Arquivadas — acessado pelo menu do avatar.
- **Guias:** agrupados por tier.
