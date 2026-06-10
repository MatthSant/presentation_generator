---
name: skill-resultado-lcto-perfil-historico
description: >
  Analisa critérios de pesquisa de lançamentos digitais e e-commerce, gerando um arquivo HTML standalone com análise interativa de consistência de conversão. Use esta skill SEMPRE que o usuário enviar dados de leads e vendas segmentados por algum critério (idade, renda, nível de treino, perfil, custom_fields, etc.) e pedir uma análise comparativa, de consistência, heatmap, ranking ou qualquer avaliação de qual grupo converte melhor ou pior. O input padrão é um dump bruto multi-dimensional (CSV ou tabela colada) com colunas field_conversion, total_leads, vendas_lancamento, vendas_12meses e colunas de dimensão — a skill faz a agregação internamente por critério. Também deve ser ativada quando o usuário mencionar "análise de pesquisa", "dados de lançamento", "critério de conversão", "qual público converte melhor", "heatmap de grupos", "ranking de segmentos".
---

# Skill: Análise de Critérios de Pesquisa — Lançamentos Digitais

## Objetivo

Gerar um **arquivo HTML standalone** com análise interativa de critérios de pesquisa, entregue via `present_files`. O arquivo contém:

- **Aba Panorama** — visão consolidada de todos os critérios com mini-charts e tabela resumo
- **Uma aba por critério** — análise completa com cards, heatmaps, gráficos, evolução e uplift
- Toggle **Geral / Pago / Orgânico** no topo — muda todos os dados em tempo real

> O output é sempre um arquivo `.html` para download/abertura no browser — não um widget inline no chat.

---

## Inputs esperados

### Formato padrão — SQL dump multi-dimensional

O usuário envia um dump bruto em CSV ou tabela colada, resultado da query `ai-modelo-conversao-agreg.sql`. O dump contém **múltiplas dimensões na mesma tabela** — a skill agrega internamente por critério.

#### Colunas do dump padrão

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `field_conversion` | dimensão | Identificador do lançamento |
| `tipo_trafego` | dimensão | `Pago` ou `Orgânico` |
| `renda_mensal` | dimensão | Faixa de renda |
| `idade` | dimensão | Faixa etária |
| `tempo_acompanhamento` | dimensão | Tempo que acompanha o produtor |
| `custom_field_2` … `custom_field_N` | dimensão | **Informado pelo usuário a cada análise** — varia por cliente |
| `total_leads` | métrica | Total de leads naquela combinação |
| `vendas_lancamento` | métrica | Vendas na janela de 60 dias (lançamento) |
| `vendas_12meses` | métrica | Vendas na janela de 12 meses (long-term) |

> **custom_fields**: o usuário **sempre informa o significado** de cada custom_field antes da análise. Não há mapeamento fixo.

#### Lógica de agregação interna por critério

Para cada dimensão analisada (ex: `renda_mensal`), agregar **independentemente**, ignorando as outras dimensões:

```
por grupo = GROUP BY (field_conversion, valor_da_dimensao)
  → soma total_leads
  → soma vendas_lancamento
  → soma vendas_12meses

benchmark_pesquisa = GROUP BY field_conversion (apenas onde dimensao IS NOT NULL)
  → soma total_leads dos respondentes
  → soma vendas_lancamento dos respondentes
  → soma vendas_12meses dos respondentes

benchmark_total = GROUP BY field_conversion (todas dimensoes null)
  → soma total_leads do lançamento inteiro
```

#### Três canais de análise

Calcular os dados e benchmarks para **três canais** separadamente:

| Canal | Filtro | Benchmark |
|-------|--------|-----------|
| **Pago** | `tipo_trafego = 'Pago'` | respondentes pagos |
| **Orgânico** | `tipo_trafego = 'Orgânico'` | respondentes orgânicos |
| **Geral** | todos os leads | respondentes de ambos os canais |

O toggle no HTML alterna entre os três sem recarregar.

---

## Benchmark — regra crítica

> **Benchmark correto = taxa de conversão dos respondentes de pesquisa, NÃO o total de leads do lançamento.**

Leads que respondem pesquisa convertem 2–5× acima da média geral (por engajamento). Comparar grupos de respondentes contra o total de leads seria injusto e inflaria artificialmente os resultados positivos — grupos que pareciam +300% ficam em +30–150% com o benchmark correto, e grupos antes "positivos" podem virar negativos.

Derivar campos calculados:

```
conv_lcto   = vendas_lancamento / total_leads (do grupo)  → resultado em % (ex: 1.07 para 1.07%)
conv_12m    = vendas_12meses / total_leads (do grupo)     → resultado em % (ex: 1.15 para 1.15%)
bench_lcto  = sum(vendas_lancamento) / sum(total_leads) dos respondentes do canal  → em %
bench_12m   = sum(vendas_12meses) / sum(total_leads) dos respondentes do canal     → em %
diff_lcto   = (conv_lcto - bench_lcto) / bench_lcto × 100
diff_12m    = (conv_12m - bench_12m) / bench_12m × 100
uplift_12m  = (conv_12m - conv_lcto) / conv_lcto × 100
rep         = total_leads_grupo / total_leads_respondentes × 100
```

> ⚠️ **CRÍTICO — unidade dos valores de conversão**: `conv_lcto`, `conv_12m`, `bench_lcto`, `bench_12m` e seus agregados (`avgConvLcto`, `avgConv12m`, `bench_pesq_lcto`, `bench_pesq_12m`) são armazenados no JSON **já em percentual** (ex: `1.07` significa 1,07%). **NUNCA multiplicar por 100 no JavaScript ao exibir** — isso geraria valores absurdos como 107%. Usar diretamente: `pg.avgConvLcto.toFixed(2) + '%'`. O mesmo vale para os valores de tendência absoluta e relativa: calcular a diferença diretamente em pp (`absT = avgLast - avgPrev`) sem multiplicar por 100.

Exibir **ambos os benchmarks** nas tabelas para referência:
- `bench_pesquisa` (roxo médio): referência dos cálculos de diff — benchmark correto
- `bench_total` (cinza/roxo claro): taxa geral do lançamento — contexto adicional

---

## Metodologia de análise

### Duas janelas de conversão (sempre calcular as duas)

| Janela | Campo | Rótulo visual |
|--------|-------|---------------|
| **Lançamento** (60 dias) | `vendas_lancamento` | "Lançamento · 60d" |
| **Long-term** (12 meses) | `vendas_12meses` | "Long-term · 12m" |

### Calcular por grupo

- `avgDiff_lcto` = média de `diff_lcto` ao longo dos lançamentos
- `avgDiff_12m` = média de `diff_12m`
- `avgUplift` = média de `uplift_12m`
- `wins` = quantidade de lançamentos onde `diff_lcto > 0`
- `avgRep` = representatividade média

### Ordenar grupos por `avgDiff_lcto` decrescente

### Classificar por wins (sobre N lançamentos disponíveis)

| wins/N | Classificação | Cor |
|--------|---------------|-----|
| 100% | Consistente | Verde |
| 70–99% | Positivo | Verde claro |
| 40–69% | Variável | Amarelo |
| 10–39% | Negativo | Coral |
| 0% | Crítico | Vermelho |

### Alertas automáticos

- Rep < 3% → badge "⚠ amostra pequena"
- 0 wins + rep > 15% → "sangria da base — alto custo, baixo retorno"
- `uplift_12m` muito diferente entre grupos → destacar efeito de maturação
- Grupo que muda de classificação entre canal pago e orgânico → insight de canal

---

## Estrutura do HTML gerado

### Layout geral

```
<topnav fixed>
  marca | [Panorama] [Critério 1] [Critério 2] … (tabs)
  direita: [Geral] [Pago] [Orgânico] toggle | badge "N lançamentos"

<page-panorama>
  grid 3 colunas de pan-cards (1 por critério)
  cada card: mini-chart de barras (avgDiff por grupo) + botão "Ver análise"
  tabela resumo: linhas = critérios × colunas = grupos
    - linha 1: conversão média 60d
    - linha 2: variação vs benchmark pesquisa
    - linha 3: uplift long-term médio
  nota sobre benchmark corrigido

<page-criterio> (1 por critério analisado)
  alerta ou insight contextual
  1. Cards de ranking
  2. Heatmaps de consistência (tabela variação + tabela conversão, lado a lado)
  3. Gráficos de conversão real (60d e 12m, lado a lado)
  4. Evolução por lançamento (linha por grupo, com filtro de checkboxes)
  5. Ganho long-term — tabela uplift + gráfico uplift (lado a lado)
  nota metodológica
```

### Especificações de layout

- `<meta name="viewport" content="width=1800">`
- Topnav fixo: height 54px
- `.pg-inner { max-width: 1720px; margin: 0 auto; padding: 0 40px; }`
- Pages: `padding: 70px 0 60px`
- Grid 2 colunas: `display: grid; grid-template-columns: 1fr 1fr; gap: 12px`
- Panorama: grid 3 colunas

---

## Seção 1 — Cards de ranking

Grid de 4 colunas (ajustar se > 8 grupos: usar 4–5 colunas). Cada card:

```
[Posição + Classificação]   ex: "1º Consistente"
[Nome completo do grupo]
[avgDiff_lcto grande, colorido]   ex: "+138.4%"
[avgDiff_12m menor]               ex: "Long-term 12m: +131.9%"
─────────────────────────────────
[wins/N lançamentos acima · uplift: +35%]
[Rep. média: 11.6%]
[barra de progresso proporcional]
```

**Paleta de cards:**

| Posição/Classificação | BG | Border | Texto |
|---|---|---|---|
| 1º Consistente | `#EAF3DE` | `#97C459` | `#27500A` |
| 2º Consistente | `#F2F8E9` | `#C0DD97` | `#3B6D11` |
| 3º–4º Consistente | `#EEEDFE` | `#CECBF6` | `#3C3489` |
| 5º Positivo | `#FAEEDA` | `#FAC775` | `#854F0B` |
| Negativo | `#FAECE7` | `#F5C4B3` | `#993C1D` |
| Crítico (0 wins) | `#FCEBEB` | `#F7C1C1` | `#A32D2D` |

---

## Seção 2 — Heatmaps de consistência

Dois painéis lado a lado (`grid 1fr 1fr`):

**Painel esquerdo — Tabela de variação (diff_lcto):**
- Células coloridas pela escala de diff
- Mostrar só o valor de diff (ex: `+138%`, `-57%`)

**Painel direito — Tabela de conversão real (conv_lcto):**
- Linhas de benchmark no topo:
  - `Bench pesquisa` (roxo médio `#3C3489`) — taxa dos respondentes — é o benchmark dos cálculos
  - `Bench total leads` (roxo claro) — taxa geral do lançamento — contexto
- Linhas de grupos: mostrar `conv_lcto` com a cor de fundo da célula baseada em `diff_lcto`

**Escala de cores das células:**

| Faixa diff | Classe | BG | Texto |
|---|---|---|---|
| > +30% | `csp` | `#97C459` | `#173404` |
| +5 a +30% | `cp` | `#EAF3DE` | `#3B6D11` |
| ±5% | `cn0` | `#F1EFE8` | `#5F5E5A` |
| −5 a −30% | `cn` | `#FCEBEB` | `#A32D2D` |
| −30 a −60% | `csn` | `#F0957B` | `#4A1B0C` |
| < −60% | `cxn` | `#E24B4A` | `#fff` |

**Ordem dos lançamentos:** sempre cronológica (mais antigo → mais recente), nunca alfabética.

---

## Seção 3 — Gráficos de conversão real

Dois gráficos lado a lado (Chart.js bar):

- Esquerdo: `conv_lcto` média por grupo
- Direito: `conv_12m` média por grupo
- Linha pontilhada em cada gráfico: `bench_pesquisa` médio (média dos N lançamentos)
- Cor das barras: cor do grupo (gradiente semântico conforme critério)
- Rótulo de dado direto na barra (via plugin `afterDatasetsDraw` — ver seção "Regras críticas de gráficos")
- Eixo Y: `.toFixed(1)+'%'`; eixo X: nome curto do grupo, rotação 30°, padding 5

---

## Seção 4 — Evolução por lançamento (linha por grupo)

Chart.js line chart com **filtro interativo de checkboxes**:

```html
<div class="group-filter">
  <label class="gf-pill" id="pill-{grupo_id}">
    <input type="checkbox" checked class="gf-cb" data-cid="{cid}" data-g="{grupo}">
    <span class="gf-dot" style="background:{cor}"></span>
    {nome_curto}
  </label>
  ...
</div>
<canvas id="ch-{cid}-evol"></canvas>
```

- Ao desmarcar um grupo: a linha some do gráfico, pill fica `opacity: .35`
- Linha pontilhada cinza sempre visível: benchmark de pesquisa do canal
- Tooltip em modo `index` (mostra todos os grupos no hover de uma coluna)
- X-axis: lançamentos em ordem cronológica
- Y-axis: conversão % (`.toFixed(1)+'%'`)
- **NUNCA usar `onchange="toggleGroup(...)"` inline** — usar `data-cid` + `data-g` com event delegation

---

## Seção 5 — Ganho long-term (uplift)

Dois painéis lado a lado:

**Tabela de uplift (esquerda):**
- Linhas = grupos; colunas = lançamentos + coluna "Média"
- Célula: `uplift_12m` com cor da escala de uplift
- Linha de referência: benchmark_pesquisa uplift

**Escala de cores do uplift:**

| Faixa | Classe | BG | Texto |
|---|---|---|---|
| > +50% | `cup` | `#E1F5EE` | `#085041` |
| +20 a +50% | `cup2` | `#EAF3DE` | `#27500A` |
| < +20% | `cn0` | `#F1EFE8` | `#5F5E5A` |

**Gráfico de uplift médio (direita):**
- Bar chart: `avgUplift` por grupo
- Cor das barras: cor do grupo
- Rótulo de dado na barra: `+X.X%`
- Eixo Y começa em 0, callback `v => '+'+v+'%'`

**Interpretação no alert:** alto uplift com diff_lcto negativo = ciclo de decisão longo (compra depois, mas ainda abaixo do benchmark em 12m); alto uplift com diff_lcto positivo = grupo premium que também tem maturação.

---

## Aba Panorama

Sempre incluída como primeira aba. Estrutura completa:

```
[Toggle de modo dos gráficos]
  "Variação vs. benchmark" | "Conversão média"
  Troca todos os mini-charts simultaneamente — listener no event delegation global

[Grid 3 colunas de pan-cards]
  cada card:
    ícone (ti ti-{icon}) + nome do critério + badge com N grupos
    subtítulo: N/N positivos · melhor grupo (diff) · pior grupo (diff)
    mini-chart de barras 200px altura

[Tabela comparativa]
  colunas: Critério | Melhor grupo | Diff 60d | Pior grupo | Diff 60d | Positivos | Uplift méd.

[Glossário de colunas]
  caixa roxa clara com definição de cada coluna das tabelas de detalhe
  grid 4 colunas, fonte 11px

[Tabelas de detalhe — uma por critério]
  cabeçalho: ícone + nome do critério
  caixa bench-ref acima de cada tabela (não dentro das linhas):
    Conv. 60d pesquisa · Conv. 12m pesquisa · Uplift benchmark · Conv. total de leads
    + rótulo do período de tendência
  tabela com colunas: Grupo | Conv. 60d | Diff 60d | Conv. 12m | Diff 12m |
                      Uplift 12m | Tend. absoluta | Tend. relativa | Leitura | Wins/N | Rep. méd.
```

---

### Mini-charts — dois modos alternáveis

**Modo "Variação vs. benchmark"** (padrão):
- Barras: `avgDiff_lcto` por grupo (positivo/negativo)
- Eixo Y: `(v>=0?'+':'')+v+'%'`
- Rótulo de dado em cima/baixo de cada barra via `afterDatasetsDraw`

**Modo "Conversão média"**:
- Barras: `avgConvLcto` por grupo — **usar o valor diretamente, sem × 100**
- Linha pontilhada: `bench_pesquisa` médio dos N lançamentos — **usar diretamente, sem × 100**
- Rótulo de dado acima de cada barra com `.toFixed(2)+'%'`

> ⚠️ O toggle de modo (`data-mode`) deve estar no **event delegation global** (`document.addEventListener('click')`), nunca registrado dentro de `renderPanorama()`. Registrar dentro de `renderPanorama()` causa listeners acumulados a cada troca de canal.

Toggle CSS:
```css
.mode-toggle { display:flex; background:#EDEAF8; border-radius:8px; padding:2px; }
.mt { font-size:12px; font-weight:500; padding:5px 13px; border-radius:6px; border:none;
      background:transparent; color:#534AB7; cursor:pointer; }
.mt.on { background:#534AB7; color:#fff; }
```

---

### Caixa bench-ref (acima de cada tabela de detalhe)

Benchmark removido das linhas da tabela — exibido uma vez como referência fixa:

```html
<div class="bench-ref">
  <span class="bench-ref-t">Benchmark (média N lançamentos):</span>
  <span class="bench-pill">Conv. 60d pesquisa <span>{avgBL}%</span></span>
  <span class="bench-pill">Conv. 12m pesquisa <span>{avgB12}%</span></span>
  <span class="bench-pill">Uplift benchmark <span>+{benchUp}%</span></span>
  <span class="bench-pill" style="opacity:.7">Conv. total de leads <span>{avgBTotal}%</span></span>
  <span class="trend-period">Tendência: {prev2[0]}+{prev2[1]} → {last2[0]}+{last2[1]}</span>
</div>
```

```css
.bench-ref { display:flex; gap:8px; flex-wrap:wrap; padding:9px 14px;
             background:#EEEDFE; border-radius:8px; border:.5px solid #CECBF6; align-items:center; }
.bench-pill { font-size:11px; background:#fff; border:.5px solid #CECBF6;
              padding:3px 10px; border-radius:6px; font-weight:500; }
.bench-pill span { color:#534AB7; font-weight:600; }
.trend-period { font-size:10.5px; color:#8884C4; margin-left:auto; font-style:italic; }
```

---

### Colunas de tendência

**Janelas de cálculo:**
- `LAST2 = [LCTOS[n-2], LCTOS[n-1]]` — dois lançamentos mais recentes
- `PREV2 = [LCTOS[n-4], LCTOS[n-3]]` — dois lançamentos anteriores

**Fórmulas — valores em % (não multiplicar por 100):**
```javascript
var absT = avg(conv_lcto, LAST2) - avg(conv_lcto, PREV2)           // em pp direto
var benchChange = avg(bench_pesq, LAST2) - avg(bench_pesq, PREV2)  // em pp direto
var relT = absT - benchChange                                        // em pp
```

> ⚠️ Como `conv_lcto` e `bench_pesq_lcto` já estão em % (ex: 1.07), a diferença entre dois valores já é diretamente em pp. **NUNCA multiplicar `(avgLast - avgPrev) × 100`** — isso geraria deltas na ordem de 100× o valor real.

**Coluna "Tend. absoluta"** — badge colorido com valor em pp:
- Verde `dp2`: abs > +0.05pp
- Vermelho `dn2`: abs < −0.05pp
- Cinza `d0`: entre −0.05 e +0.05 ("≈0 pp")

**Coluna "Tend. relativa"** — mesma lógica aplicada ao `relT`

**Coluna "Leitura"** — ícone Tabler + badge colorido combinando os dois sinais:

| Abs | Rel | Ícone | Classe CSS | Rótulo |
|-----|-----|-------|-----------|--------|
| ↑ ou ≈ | ↑ ou ≈ | `ti-trending-up` | `tr-gg` (verde) | Acelerando |
| ↓ | ↑ ou ≈ | `ti-trending-up` | `tr-rg` (âmbar) | Ganhando terreno |
| ↑ ou ≈ | ↓ | `ti-trending-down` | `tr-gr` (laranja) | Perdendo espaço |
| ↓ | ↓ | `ti-trending-down` | `tr-rr` (vermelho) | Deteriorando |

> A cor prioriza a tendência **relativa** (mais acionável para decisão de segmentação). Threshold de neutralidade: ±0.05pp.

```css
.trend-cell { display:flex; flex-direction:column; align-items:center; gap:2px; }
.trend-icon { font-size:15px; line-height:1; }
.trend-abs  { font-size:11px; font-weight:600; }
.trend-rel  { font-size:10px; font-weight:500; opacity:.8; }
.trend-lbl  { font-size:10px; font-weight:500; padding:2px 6px; border-radius:4px; white-space:nowrap; }
.tr-gg { color:#27500A; } .tr-gg .trend-lbl { background:#EAF3DE; color:#27500A; }
.tr-rg { color:#85621A; } .tr-rg .trend-lbl { background:#FEF3E2; color:#85621A; }
.tr-gr { color:#854F0B; } .tr-gr .trend-lbl { background:#FAEEDA; color:#854F0B; }
.tr-rr { color:#A32D2D; } .tr-rr .trend-lbl { background:#FCEBEB; color:#A32D2D; }
```

---

### Ícones dos critérios — regra obrigatória

Sempre usar `class="ti ti-{icon}"` — **nunca** `class="ti-{icon}"` (falta o prefixo `ti`).

```html
<!-- CORRETO -->
<i class="ti ti-currency-dollar" aria-hidden="true"></i>

<!-- ERRADO — ícone não renderiza -->
<i class="ti-currency-dollar" aria-hidden="true"></i>
```

Isso se aplica tanto ao HTML estático quanto ao HTML gerado via JavaScript (`es(meta.icon)` contém apenas `ti-currency-dollar`, então sempre concatenar `'ti ' +`):

```javascript
'<i class="ti ' + es(meta.icon) + '" aria-hidden="true"></i>'
```

---

## Aba Insights

Sempre incluída como **última aba**, depois de todos os critérios. É **estática** (HTML hardcoded no template, não gerada por JS). Contém análise interpretativa dos dados em 3 seções obrigatórias:

### Seção 1 — Conclusões claras
Cards com border-left colorida. Para cada achado categórico (suportado por dados de pelo menos 7/9 lançamentos):

```
[tag Oportunidade/Problema + ícone]
[Título direto — 1 linha]
[Corpo — 2-3 frases: o que os dados mostram + por que importa + recomendação]
[Métricas em badges coloridos]
```

### Seção 2 — Aprofundamento recomendado
Mesma estrutura com tag "Aprofundar" (âmbar). Para achados onde os dados mostram um sintoma mas não permitem conclusão categórica. Sempre terminar com **"Recomendado: [ação específica]"** em negrito.

### Seção 3 — Pontos de atenção
Tag "Interessante" (roxo). Para observações que agregam contexto estratégico mas não são acionáveis diretamente.

### CSS dos cards de insight

```css
.ins-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
.ins-card { background: #fff; border: .5px solid #EDEAF8; border-radius: 14px; padding: 18px 20px; }
.ins-card.opp  { border-left: 3px solid #97C459; }
.ins-card.prob { border-left: 3px solid #E24B4A; }
.ins-card.warn { border-left: 3px solid #EF9F27; }
.ins-card.info { border-left: 3px solid #534AB7; }
.opp-tag  { background: #EAF3DE; color: #27500A; }
.prob-tag { background: #FCEBEB; color: #A32D2D; }
.warn-tag { background: #FAEEDA; color: #854F0B; }
.info-tag { background: #EEEDFE; color: #3C3489; }
.ins-m.pos { background: #EAF3DE; color: #27500A; }
.ins-m.neg { background: #FCEBEB; color: #A32D2D; }
.ins-m.neu { background: #EEEDFE; color: #3C3489; }
.ins-m.wrn { background: #FAEEDA; color: #854F0B; }
```

> A aba Insights é gerada **uma única vez por análise**, com os dados de todos os critérios disponíveis. Não é afetada pelo toggle Geral/Pago/Orgânico.

---

## Design system do HTML

### Fontes e cores

```css
body { font-family: 'Inter', system-ui, sans-serif; font-size: 14px; }

/* Textos */
--color-title:    #1A1647  /* títulos principais */
--color-dark:     #26215C  /* subtítulos seção, th */
--color-accent:   #3C3489  /* gt (chart title), links */
--color-mid:      #534AB7  /* gs (subtítulos), axis labels, badges */
--color-light:    #8884C4  /* texto secundário, bench labels — NÃO usar em ticks de gráfico */

/* Tamanhos mínimos */
body:            14px
.gt (titles):    11px uppercase 600
.gs (subtitles): 12px color #534AB7
table headers:   11px uppercase 600
table cells:     12–12.5px
card names:      12.5px
card values:     28px
heatmap cells:   11px mínimo
axis labels:     12px mínimo (font:{size:12})
```

> **Nunca usar #AFA9EC para texto sobre fundo branco** — contraste insuficiente. Usar `#534AB7` ou mais escuro.
> **Nunca usar #8884C4 para ticks de eixo de gráficos** — baixo contraste. Usar `#534AB7`.

### Estrutura de caixas

```css
/* Chart box */
.gb { background: #fff; border: .5px solid #EDEAF8; border-radius: 14px;
      padding: 17px 20px; box-shadow: 0 1px 3px rgba(60,52,137,.04); }
.gt { font-size: 11px; font-weight: 600; color: #26215C;
      text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
.gs { font-size: 12px; color: #534AB7; margin-bottom: 12px; }

/* Section header */
.shdr { display: flex; align-items: center; gap: 8px; margin: 24px 0 13px; }
.shdr-t { font-size: 11px; font-weight: 600; color: #26215C; text-transform: uppercase; }
.shdr-b { font-size: 11px; color: #534AB7; background: #EEEDFE; padding: 2px 10px; border-radius: 20px; }
.shdr::after { content: ''; flex: 1; height: .5px; background: #EDEAF8; }
```

### Alertas contextuais

```css
.alert-b  { background: #FAEEDA; border: .5px solid #FAC775; border-radius: 12px;
             padding: .85rem 1.1rem; font-size: 12.5px; color: #633806; line-height: 1.65; }
.insight-b { background: #EAF3DE; border: .5px solid #97C459; border-radius: 12px;
             padding: .85rem 1.1rem; font-size: 12.5px; color: #27500A; line-height: 1.65; }
```

### Dependências externas

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>
```

---

## ⚠️ Regras críticas de gráficos — Chart.js

### Regra 1 — NUNCA `responsive: true` (loop infinito de redimensionamento)

`responsive: true` no Chart.js 4.x ativa um ResizeObserver no container. Quando combinado com `afterDatasetsDraw` (que desenha labels no canvas), pode causar reflow → ResizeObserver dispara → re-render → loop infinito que trava o browser.

**Padrão obrigatório para TODOS os charts:**

```javascript
// 1. Definir função helper global (uma vez, antes de var DATA)
function initCanvas(canvas, h) {
  var cw = (canvas.parentElement && canvas.parentElement.clientWidth > 0)
           ? canvas.parentElement.clientWidth : 800;
  canvas.width  = cw;
  canvas.height = h;
}

// 2. Antes de CADA new Chart(), chamar initCanvas:
initCanvas(canvas, 260);
charts[canvasId] = new Chart(canvas, {
  ...
  options: {
    responsive: false,       // SEMPRE false
    maintainAspectRatio: false,
    animation: false,        // SEMPRE false
    ...
  }
});
```

> `initCanvas()` define a resolução interna do canvas igual ao tamanho real do container no momento da criação — eliminando a pixelação que `responsive: false` causaria sem esse ajuste.

**Alturas padrão por tipo de gráfico:**

| Chart | `initCanvas` height | Canvas HTML attr |
|-------|-------------------|-----------------|
| Pan mini-charts | 200 | `height="200"` |
| Conversão 60d / 12m | 260 | `height="260"` |
| Evolução (line) | 300 | `height="300"` |
| Uplift | 260 | `height="260"` |

### Regra 2 — NUNCA `animation.onComplete` para labels

`animation.onComplete` no Chart.js 4.x dispara após cada frame de animação e pode causar loop de re-render mesmo com `responsive: false`.

**Padrão obrigatório:** usar plugin inline `afterDatasetsDraw`:

```javascript
charts[canvasId] = new Chart(canvas, {
  type: 'bar',
  data: { ... },
  options: {
    responsive: false,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { ... } },
    scales: { ... }
  },
  plugins: [{
    id: 'barLabels',
    afterDatasetsDraw: function(chart) {
      var meta = chart.getDatasetMeta(0);
      var c2 = chart.ctx;
      c2.save();
      c2.font = '600 11px Inter';
      c2.fillStyle = '#26215C';
      c2.textAlign = 'center';
      meta.data.forEach(function(bar, i) {
        var v = chart.data.datasets[0].data[i];
        if (v === null || v === undefined) return;
        c2.fillText(v.toFixed(2) + '%', bar.x, bar.y - 5);
      });
      c2.restore();
    }
  }]
});
```

### Regra 3 — Configuração padrão de eixos (legibilidade Witly)

```javascript
// Padrão para todos os eixos Y e X
scales: {
  y: {
    ticks: { font: {size: 12}, color: '#534AB7', callback: function(v) { return v + '%'; } },
    grid:  { color: '#E8E6FA', lineWidth: .5 }
  },
  x: {
    ticks: { font: {size: 12}, color: '#534AB7', maxRotation: 30, padding: 5 }
  }
}

// Legenda (quando exibida — ex: evolChart)
legend: { display: true, position: 'bottom',
          labels: { font: {size: 12}, boxWidth: 12, color: '#534AB7', padding: 10 } }

// Labels nas barras via afterDatasetsDraw:
c2.font = '600 11px Inter';
c2.fillStyle = '#26215C';
```

> **#8884C4 não deve ser usado em ticks de eixo** — contraste insuficiente. Reservado para elementos secundários (linha de benchmark pontilhada, texto de apoio em CSS, badge `.d0` de tendência neutra).

---

## ⚠️ Regra crítica de geração — template vs f-string

**NUNCA usar f-strings Python para gerar o bloco `<script>` do HTML.**

JavaScript usa `{}`, `${}`, template literals e aspas simples — todos conflitam com a interpolação Python, causando `SyntaxError` no browser (ex: "Unexpected identifier 'panorama'").

**Método correto obrigatório:**

1. Escrever o template HTML completo em um **arquivo físico** (`/tmp/tmpl_pesquisa.html`) usando `f.write("""...""")` — sem f-string, com o JS exatamente como deve ficar no output
2. Usar **placeholders textuais simples** no template: `DATA_JSON`, `CIDS_JSON`, `TABS_HERE`
3. Ler o arquivo e fazer substituições com `.replace()`:

```python
with open('/tmp/tmpl_pesquisa.html') as f:
    out = f.read()
out = out.replace('TABS_HERE', nav_tabs_html)
out = out.replace('DATA_JSON', json_str)
out = out.replace('CIDS_JSON', cids_json)
```

4. Jamais usar `%s`, `.format()` ou `f"""..."""` no bloco de JavaScript.

---

## Navegação — data attributes obrigatório

**NUNCA usar `onclick="navTo('criterio')"` inline no HTML.**

Aspas simples dentro de atributos HTML gerados por strings Python causam quebra de parsing. **Padrão obrigatório:**

```html
<!-- Tabs: data-page -->
<button class="nt" data-page="renda">Renda</button>

<!-- Botões de canal: data-canal -->
<button class="ct" data-canal="pago">Pago</button>

<!-- Botões de navegação em cards: data-nav -->
<button class="pan-btn" data-nav="renda">Ver análise →</button>

<!-- Checkboxes de grupo: data-cid + data-g -->
<input type="checkbox" class="gf-cb" data-cid="renda" data-g="Mais de R$15.000">

<!-- Toggle de modo do panorama: data-mode -->
<button class="mt" data-mode="var">Variação vs. benchmark</button>
```

**Um único event listener no `document` captura tudo — incluindo o toggle de modo:**

```javascript
document.addEventListener('click', function(e) {
  var pg = e.target.closest('[data-page]');
  if (pg) { navTo(pg.getAttribute('data-page')); return; }
  var ct = e.target.closest('[data-canal]');
  if (ct) { setCanal(ct.getAttribute('data-canal')); return; }
  var pn = e.target.closest('[data-nav]');
  if (pn) { navTo(pn.getAttribute('data-nav')); return; }
  var mo = e.target.closest('[data-mode]');
  if (mo) {
    currentMode = mo.getAttribute('data-mode');
    document.querySelectorAll('.mt').forEach(function(b) { b.classList.remove('on'); });
    mo.classList.add('on');
    destroyChartsPrefix('pan-ch-');
    CIDS.forEach(function(cid) { renderPanChart(cid); });
    return;
  }
});
```

> ⚠️ O handler `data-mode` deve estar **apenas aqui**, no event delegation global. Nunca registrar dentro de `renderPanorama()` — cada chamada adicionaria um listener duplicado.

As tabs são **hardcoded no HTML** (não geradas por JS), com os IDs fixos dos critérios. Isso elimina qualquer risco de escaping.

---

## Insights automáticos (nota metodológica no rodapé)

Sempre incluir uma `.nota` ao final da aba do critério explicando:

1. Como o benchmark de pesquisa é calculado e por que é diferente do total de leads
2. Fórmula de diff, uplift e representatividade
3. Qual canal está sendo exibido

E após o arquivo gerado, escrever **análise em prosa no chat** com:

1. **Padrão estrutural** — qual grupo domina, qual afunda, padrão consistente ou variável?
2. **Dado mais surpreendente** — algo que contraria intuição ou confirma hipótese
3. **Efeito de maturação** — grupos com uplift alto mas diff negativo: compram depois, mas ainda abaixo do benchmark
4. **Impacto de canal** — ranking muda entre pago/orgânico/geral? O que isso revela?
5. **Implicação prática** — o que o cliente deveria fazer diferente na captação/segmentação?

---

## Regras de qualidade

1. **Benchmark sempre = respondentes de pesquisa** — nunca total de leads. É a regra mais importante desta skill.
2. **Três canais sempre calculados** — Geral, Pago, Orgânico. Toggle muda em tempo real sem reload.
3. **Lançamentos em ordem cronológica** — nunca alfabética. Extrair data do nome do lançamento.
4. **Separar tabela de variação e tabela de conversão** — lado a lado, nunca misturadas na mesma célula.
5. **Rótulos de dados nas barras** — sempre via plugin inline `afterDatasetsDraw`. **NUNCA `animation.onComplete`**.
6. **Filtro de grupos no gráfico de evolução** — checkboxes com `data-cid` e `data-g`, pill com `opacity:.35` quando desmarcado.
7. **Ambos benchmarks visíveis** — `bench_pesquisa` (roxo médio) e `bench_total` (cinza claro) nas tabelas de conversão.
8. **Nunca texto em #AFA9EC ou #8884C4 sobre fundo branco** — usar `#534AB7` mínimo para ticks de eixo e subtítulos.
9. **custom_fields sempre rotulados** com o significado informado pelo usuário.
10. **Output = arquivo HTML** entregue via `present_files` — não widget inline.
11. **NUNCA f-string Python no bloco JS** — escrever template como arquivo físico + substituição `.replace()`. Ver seção "Regra crítica de geração".
12. **NUNCA onclick inline com strings** — toda navegação via `data-*` attributes + event delegation. Ver seção "Navegação".
13. **Normalizar nomes de grupos duplicados** antes de agregar — ex: Patrimônio tem variantes com espaço e sem espaço; Idade tem "Menos de 18" e "Menos de 18 anos". Sempre unificar antes de GROUP BY.
14. **Aba Insights sempre incluída** como última aba, com as 3 seções obrigatórias (conclusões claras / aprofundamento / pontos de atenção). É estática, não afetada pelo toggle de canal.
15. **NUNCA `responsive: true` nos charts** — usar sempre `responsive: false` + `initCanvas(canvas, h)`. Ver seção "Regras críticas de gráficos".
16. **Valores de conversão já em %** — `conv_lcto`, `bench_pesq_lcto` etc. saem do Python em % (ex: 1.07). Nunca multiplicar por 100 no JS. Tendência em pp = diferença direta, sem × 100.

---

## Checklist antes de entregar

**Geração (Python)**
- [ ] Template HTML escrito como arquivo físico (`/tmp/tmpl_*.html`), sem f-string no bloco JS
- [ ] Substituição via `.replace('DATA_JSON', json_str)` — não interpolação Python
- [ ] Grupos normalizados antes de agregar (duplicatas de nome unificadas)
- [ ] Três canais calculados (Geral, Pago, Orgânico) — cada um com bench_pesquisa e bench_total
- [ ] Lançamentos em ordem cronológica
- [ ] `initCanvas()` definida uma vez antes de `var DATA` no bloco `<script>`

**Chart.js — anti-loop obrigatório**
- [ ] `responsive: false` em TODOS os charts (pan + conv + evol + uplift)
- [ ] `animation: false` em TODOS os charts
- [ ] `initCanvas(canvas, h)` chamado antes de cada `new Chart()`
- [ ] Zero `animation.onComplete` — labels via `afterDatasetsDraw` inline plugin
- [ ] Alturas: pan=200, conv/uplift=260, evol=300

**Chart.js — legibilidade Witly**
- [ ] Ticks: `font:{size:12}`, `color:'#534AB7'` em todos os eixos
- [ ] Labels nas barras: `'600 11px Inter'`, fillStyle `'#26215C'`
- [ ] Legenda (evolChart): `font:{size:12}`, `color:'#534AB7'`

**Navegação (JS)**
- [ ] Zero `onclick` inline no HTML — toda navegação via `data-page`, `data-canal`, `data-nav`, `data-mode`
- [ ] Tabs hardcoded no HTML com `data-page` (não geradas por JS)
- [ ] Event delegation único no `document` — inclui `data-mode`
- [ ] Toggle de modo NÃO registrado dentro de `renderPanorama()`
- [ ] Checkboxes de grupo com `data-cid` + `data-g`

**Dados — conversão**
- [ ] Valores de conv/bench exibidos diretamente (sem × 100) em JS
- [ ] Modo "Conversão média" do panorama: `avgConvLcto` e `benchAvg` sem × 100
- [ ] Tendência absoluta/relativa: diferença direta em pp, sem × 100

**Panorama**
- [ ] Grid 3 colunas, mini-charts 200px de altura
- [ ] Toggle de modo (variação / conversão) acima dos cards — listener no event delegation global
- [ ] Ícones com `class="ti ti-{icon}"` — nunca sem o prefixo `ti`
- [ ] Tabela comparativa: Critério | Melhor | Diff | Pior | Diff | Positivos | Uplift
- [ ] Glossário de colunas antes das tabelas de detalhe (grid 4 colunas)
- [ ] Caixa bench-ref acima de cada tabela de detalhe (não dentro das linhas)
- [ ] Colunas de tendência: Tend. absoluta | Tend. relativa | Leitura (ícone + badge)
- [ ] Tendência calculada com LAST2 (2 mais recentes) vs PREV2 (2 anteriores)
- [ ] Leitura combina abs+rel: Acelerando / Ganhando terreno / Perdendo espaço / Deteriorando
- [ ] Período de tendência exibido no bench-ref de cada critério
- [ ] Seções na ordem correta: cards → heatmaps → conv charts → evolução → uplift
- [ ] Tabela variação e conversão separadas (lado a lado)
- [ ] Linhas bench_pesquisa + bench_total nas tabelas de conversão
- [ ] Filtro de checkboxes funcional no gráfico de evolução
- [ ] **Aba Insights** ao final: conclusões claras / aprofundamento / pontos de atenção
- [ ] Fontes mínimas: 12px eixos, 11px heatmap, 28px card main
- [ ] Arquivo gerado e apresentado via `present_files`
