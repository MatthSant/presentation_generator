# Tools Map — Catálogo de Componentes

Este arquivo descreve cada componente disponível em `tools/`, quando usar cada um e quais placeholders aceita.

---

## Regras de design (imprescindíveis — violar qualquer uma é erro)

**Proibido em qualquer componente ou slide:**
- `border-left` com largura > 1px como stripe/acento colorido — alternativa: full-border (`border: 1px solid`) + background tintado (`rgba(color, .06)`)
- `background-clip: text` ou qualquer gradient text
- Número grande + gradiente como hero-metric
- `backdrop-filter` em superfícies não-modais (glassmorphism decorativo)
- Backgrounds opacos — superfícies sempre `rgba(255,255,255,.03)` ou cor tintada equivalente
- `box-shadow` decorativo em qualquer elemento de slide
- Gradientes de cor em backgrounds de elementos de conteúdo

**Proibido — evitar aparência de "gerado por IA":**
- Cards ad-hoc com `border-radius` alto + background tintado para listar achados/ações/aprendizados — usar sempre os componentes do design system (`find-block`, `ni`, `def-step`, `mdef-block`)
- Qualquer `<div class="card ...">` ou construção equivalente inventada fora dos componentes desta biblioteca

**Superfícies permitidas — dark (padrão):**
- `rgba(255,255,255,.03)` — padrão para qualquer painel/bloco
- `rgba(color, .06)` com `border: 1px solid rgba(color, .28)` — variante tintada (ex: `.cl`, `.cl-g`)
- `.ni` do design system — full-border + tint

**Superfícies permitidas — light (`theme: light`):**
- `rgba(0,0,0,.02)` — padrão para qualquer painel/bloco
- `rgba(color, .06)` com `border: 1px solid rgba(color, .28)` — variante tintada (mesma proporção)
- Bordas de divider: `rgba(0,0,0,.07)` em vez de `rgba(255,255,255,.07)`
- Todos os valores hardcoded `#fff` em títulos/texto → `#111827`; corpo cinza → `#374151`

---

## Estrutura de um slide

Todo slide Reveal.js é uma `<section>`. A estrutura geral:

```
<!-- SLIDE N ═══════════════════════════════ -->
<section class="slide [modificador]">
  [conteúdo]
</section>
```

O comentário de numeração é **obrigatório** antes de cada `<section>`. O parser usa `SLIDE N` para indexar.

---

### `slide-apendice.html` — Slide de apêndice
**Quando usar:** para cada entrada no bloco `## Apêndice` do `slides_plan.md`.
**Posição no deck:** sempre após todos os slides principais.
**Conteúdo:** dados detalhados que complementam um slide principal — pode usar chart-wrap, grp-list, tabela, def-bullets.
**Não usar:** find-blocks, exec-points — apêndice é detalhe, não argumentação.
**Link de volta:** o componente já inclui link `← Voltar` para o slide de origem via `goToSlide`.
**Placeholders:** `{{N}}`, `{{id}}`, `{{ref}}`, `{{título}}`, `{{CONTENT}}`, `{{origem-id}}`, `{{origem-num}}`, `{{origem-título}}`

### `block-apendice-link.html` — Link de rodapé para apêndice
**Quando usar:** como último elemento do `.content` de qualquer slide principal que declare `apendice:`.
**Posição:** `margin-top:auto` faz o link flutuar para o rodapé do slide.
**Linkagem circular:** este bloco aponta para o apêndice; o apêndice aponta de volta para este slide.
**Placeholders:** `{{apendice-id}}`, `{{ref}}`

## Slides base

### `slide-exec-summary.html` — Resumo Executivo
**Quando usar:** segundo slide do deck (após a capa). Permite ao executivo entender o argumento completo sem ler o restante.
**Estrutura:** badge "RESUMO EXECUTIVO" + action title + lista de `block-exec-point.html`.
**Quantidade de claims:** 3–4. Mais que isso sobrecarrega o slide.
**Regra crítica:** lendo só os claims (sem os bullets de suporte), o argumento central do deck deve ser compreensível.
**Placeholders:** `{{N}}`, `{{título}}`, `{{EXEC_POINTS}}`

### `block-exec-point.html` — Ponto do Resumo Executivo
**Quando usar:** dentro de `slide-exec-summary.html`, um por claim.
**Formato bold-bullet:** claim em negrito (a afirmação) + def-bullets (2–3 dados de suporte).
**Não usar tags de find-block** — o exec-point tem estilo próprio mais compacto.
**Placeholders:** `{{claim}}`, `{{suporte-1}}`, `{{suporte-2}}`

### `slide-cover.html` — Capa
**Quando usar:** primeiro slide da apresentação.
**Campos texto-puro** (sem tags filhas): `cover-title`, `cover-sub`, `cover-meta`.
**Placeholders:** `{{N}}`, `{{title}}`, `{{subtitle}}`, `{{meta}}`

### `slide-brk.html` — Break / Divisor de seção
**Quando usar:** separar seções temáticas. Layout centralizado, impactante.
**Campos texto-puro:** `brk-pre`.
**HTML permitido em:** `brk-title` (pode conter `<em>` para palavra em roxo).
**Placeholders:** `{{N}}`, `{{pre}}`, `{{title}}`

### `slide-standard.html` — Slide analítico (shell)
**Quando usar:** qualquer slide com dados, gráficos ou find-blocks.
**Estrutura interna:**
```
.slide-hd → badge + h1.slide-title
.content  → [blocos de conteúdo montados separadamente]
```
**Placeholders:** `{{N}}`, `{{badge-color}}`, `{{badge-label}}`, `{{title}}`
**Nota:** o conteúdo dentro de `.content` é montado combinando os blocos abaixo.

---

## Blocos de conteúdo

### `block-kpi-row.html` — Linha de KPIs
**Quando usar:** métricas no topo de slides analíticos. Máximo 4 KPIs por linha.
**Classes de cor** para `.mv`: `c-p` (roxo), `c-g` (verde), `c-a` (âmbar), `c-o` (laranja), `c-r` (vermelho), `c-w` (branco).
**Rótulo** (`.ml`): pode usar `<br>` para quebra de linha. Sem outras tags.
**Placeholders:** array de `{value, color, label}` repetido como `<div class="mi">`.

### `block-find-block.html` — Find block (tag única)
**Quando usar:** achado, atenção, paradoxo, timing, composição, por grupo, retenção, oportunidade.
**Tags disponíveis:** `Achado` `Atenção` `Paradoxo` `Timing` `Teto de CAC` `Resultado por gênero` `Composição` `Por grupo` `Valor da ativação` `Retenção` `Janela de influência` `Oportunidade`
**Cor da tag:** `find-tag-p` (roxo), `find-tag-g` (verde), `find-tag-a` (âmbar), `find-tag-r` (vermelho).
**Regras de conteúdo:** máx 2 bullets; número principal no `find-title` via `<span class="c-X">`.
**Placeholders:** `{{tag}}`, `{{tag-color}}`, `{{title}}`, `{{BULLETS}}`, `{{footnote}}` (omitir `<li>` de footnote se não houver).

### `block-find-block-dual.html` — Find block duplo (Potencial + Ação)
**Quando usar:** fechamento de slides analíticos com hipótese identificada. **Obrigatório** quando há hipótese.
**Estrutura:** duas tags lado a lado (`Potencial` verde + `Ação` roxo).
**Bullets obrigatórios:** 1º bullet = ação concreta, 2º bullet = cálculo, footnote = fonte/pressupostos.
**Placeholders:** `{{tag1}}`, `{{color1}}`, `{{tag2}}`, `{{color2}}`, `{{title}}`, `{{BULLETS}}`, `{{footnote}}`

### `block-find-note.html` — Find note
**Quando usar:** abaixo dos gráficos no painel esquerdo. Resume o achado principal em 1 frase.
**Classes:** `find-note find-note-{cor}` — o `border-left` vem do CSS automaticamente.
**Placeholders:** `{{color}}`, `{{text}}` (pode conter `<strong>` para palavra-chave).

### `block-agenda.html` — Lista de agenda
**Quando usar:** terceiro slide do deck (após exec-summary). Usar dentro de `slide-standard.html` com badge `p` e título "Agenda" — o `block-agenda.html` substitui todo o `.content`.
**Campos texto-puro:** `agenda-title`, `agenda-sub`.
**`agenda-num`** usa `<span>`, aceita classe de cor opcional (`c-p`, `c-g`, etc.) ou nenhuma.
**Placeholders:** array de `{num, num-color, title, sub}`.

### `block-def-step.html` — Etapa de metodologia / universo analisado
**Quando usar:** slide `tipo: metodologia-recorte`, painel esquerdo (`.panel-l`). Cada etapa é um bloco numerado com label, título, stats opcionais e bullets.
**Uso padrão:** etapa 01 = Universo analisado (com `def-step-stats` para volume/receita/período) + etapa 02 = Classificação (apenas bullets).
**Stats:** `def-step-stats` > `def-step-stat-n` (aceita `c-p`, `c-g`, `c-a` etc.) + `def-step-stat-l` para o rótulo do número.
**Separador entre etapas:** `<div class="def-divider"></div>`.
**Placeholders:** `{{num}}`, `{{label}}`, `{{title}}`, `{{STATS}}`, `{{BULLETS}}`

### `block-mdef-block.html` — Bloco de definição de termo/métrica
**Quando usar:** slide `tipo: metodologia-metricas`, layout `.g2`. Cada bloco define um termo com categoria, título e bullets explicativos.
**`mdef-tag`:** categoria do termo (ex: "Comportamento no dia 1", "Valor do cliente").
**Sub-rótulo opcional:** `mdef-sub-label` + `def-bullets` adicionais para sub-classificações dentro do mesmo termo.
**Separadores entre blocos:** `<div class="mdef-divider"></div>`.
**`mdef-note`** (inline, não um componente separado): caixa de referência ao final da coluna com link para documento externo — usar `class="mdef-note"` + link com `class="mdef-link"`.
**Placeholders:** `{{tag}}`, `{{title}}`, `{{BULLETS}}`, `{{sub-label}}` (opcional), `{{SUB_BULLETS}}` (opcional)

### `block-grp-list.html` — Lista de grupos/segmentos
**Quando usar:** slide `tipo: metodologia-recorte`, painel direito (`.panel-r`), quando a análise segmenta por grupos com nome e exemplo. Omitir (sem panel-r) quando não há grupos definidos.
**`grp-n` usa `<span>`**, não `<div>`.
**`grp-item` sem style extra** na abertura da tag.
**Placeholders:** `{{label}}`, array de `{num, name, example}`.

### Layout de metodologia (combinação de componentes)
**`tipo: metodologia-recorte`** — layout com `panel-l` + `panel-r` (quando há grupos):
```html
<div class="row">
  <div class="panel-l" style="gap:0;justify-content:center">
    [block-def-step × N, separados por def-divider]
  </div>
  <div class="panel-r">
    [block-grp-list]
  </div>
</div>
```
Sem grupos → usar apenas `panel-l` com `style="flex:1"`.

**`tipo: metodologia-metricas`** — layout `.g2` com colunas de definições:
```html
<div class="g2" style="flex:1;gap:32px">
  <div class="col" style="gap:0">
    [block-mdef-block × N, separados por mdef-divider]
  </div>
  <div class="col" style="gap:0">
    [block-mdef-block × N, separados por mdef-divider]
    [mdef-note + mdef-link se há referência externa]
  </div>
</div>
```

### `block-hyp-card.html` — Card de hipótese
**Quando usar:** listar hipóteses com prioridade, descrição e impacto estimado.
**Grid obrigatório:** `display:grid;grid-template-columns:28px 1fr auto`.
**Variantes de cor:** `hyp-card-r` (vermelho/alto), `hyp-card-a` (âmbar/médio), `hyp-card-p` (roxo/baixo).
**`hyp-body` sem `<div>` aninhados** — apenas `<span>`, `<br>`, texto.
**Placeholders:** `{{card-color}}`, `{{id}}`, `{{id-color}}`, `{{body}}`, `{{value}}`, `{{value-color}}`

### `block-learning-col.html` — Coluna de aprendizados para debrief de campanha
**Quando usar:** dentro de `.g3` no slide `tipo: aprendizados` — uma coluna por categoria (O que funcionou / O que não funcionou / Próximas hipóteses).
**Estrutura:** badge de categoria + itens em lista separada por linhas finas — sem cards, sem border-left > 1px.
**Diferenciação visual:** cor do `dado` por categoria (green/red/amber) e cor do badge no cabeçalho.
**Máximo por coluna:** 3 itens. Layout container: `block-kpi-row` com métricas globais (opcional) + `.g3` com 3 colunas.
**Placeholders:** `{{cor}}`, `{{categoria}}`, `{{título}}`, `{{dado}}`, `{{dado-color}}`, `{{implicação}}`

### `block-horizon-col.html` — Coluna de horizonte para plano de ação
**Quando usar:** dentro de `.g4` no slide `tipo: plano-acao` — uma coluna por horizonte temporal.
**Estrutura:** cabeçalho (badge de cor + prazo) + cards compactos de ação (id, título, impacto, esforço, racional).
**Máximo por coluna:** 3 ações — se houver mais, usar slide de detalhe separado com `block-ni.html`.
**Cores por horizonte:** `r` (Imediato < 30d) | `a` (Curto Prazo 1–3m) | `p` (Médio Prazo 3–6m) | `g` (Longo Prazo 6–12m).
**Placeholders:** `{{cor}}`, `{{horizonte}}`, `{{prazo}}`, `{{id}}`, `{{id-color}}`, `{{título}}`, `{{impacto}}`, `{{esforço}}`, `{{racional}}`

### `block-ni.html` — Card de hipótese/ação numerada (ni)
**Quando usar:** listar hipóteses com seções estruturadas (Por que? / Acionável / Impacto). Mais detalhado que `hyp-card`; ideal para slides de plano de ação.
**Diferença de hyp-card:** layout vertical com seções rotuladas; suporta badge de impacto no título.
**Cores:** `border-rgb` e `num-rgb` como tripletas RGB (ex: `239,68,68`). Vermelho=alta prioridade, âmbar=média, roxo=baixa.
**Seções disponíveis:** `ni-sl c-a` (Por que? — âmbar), `ni-sl c-g` (Acionável — verde), `ni-sl c-p` (Impacto — roxo).
**Placeholders:** `{{border-rgb}}`, `{{num-rgb}}`, `{{id}}`, `{{title}}`, `{{badge-color}}`, `{{badge-value}}`, `{{rationale}}`, `{{action}}`

---

## Componentes de gráfico (chartDefs snippets)

Estes arquivos contêm a **configuração JS** do gráfico (chave do `chartDefs`), não o HTML do container.
O container HTML é sempre: `<div class="chart-wrap" id="{{chart-id}}"></div>`

### `chart-bar.html` — Barras verticais
**Quando usar:** comparação de valores ao longo do tempo ou entre categorias.

### `chart-bar-horizontal.html` — Barras horizontais
**Quando usar:** ranking, comparação entre itens com nomes longos.
**Atenção:** `yaxis` = categorias (sem formatter, sem min), `xaxis` = valores (com formatter).

### `chart-donut.html` — Donut / Pie
**Quando usar:** composição percentual (máx 5–6 fatias).
**`series`:** array plano de números. **`labels`** no lugar de `categories`.

### `chart-line.html` — Linha
**Quando usar:** tendência ao longo do tempo, múltiplas séries contínuas.

### `chart-area.html` — Área
**Quando usar:** volume/tendência com ênfase visual na magnitude.

### `chart-mixed.html` — Misto (barra + linha)
**Quando usar:** combinar volume (barra) com taxa/média (linha) no mesmo gráfico.
**`type`** por série: `bar` ou `line` dentro de cada objeto da series.

### `chart-stacked.html` — Barras empilhadas
**Quando usar:** mostrar como partes formam um todo ao longo do tempo (composição temporal).
**`stacked: true`** — obrigatório. **`stackType: '100%'`** para normalizar em proporção.
**Preferir em vez de:** barras side-by-side quando o total acumulado é o insight.

### `chart-radial.html` — Barra radial
**Quando usar:** 1–4 métricas como porcentagem de preenchimento de arco (taxas, metas, scores).
**`series`:** array de números 0–100 (porcentagens). **`labels`:** rótulos por arco.
**Não usar para:** valores absolutos — radial só funciona bem com percentuais.

### `chart-scatter.html` — Dispersão
**Quando usar:** mostrar correlação entre duas variáveis por ponto (ex: ticket vs. retenção por grupo).
**`data`:** array de pares `[x, y]`. **`xaxis.title` / `yaxis.title`** via campo `options`.
**Preferir quando:** há mais de 10 observações; para menos pontos, usar bar-horizontal com dados lado a lado.

### `chart-radar.html` — Radar / Spider
**Quando usar:** comparar 1–3 grupos em 4–7 dimensões simultâneas (perfil multidimensional).
**`categories`:** dimensões do radar. **`series`:** score de cada grupo por dimensão.
**Evitar:** mais de 3 séries (dificulta leitura); e mais de 7 eixos.

### `chart-treemap.html` — Treemap
**Quando usar:** participação relativa de 7+ categorias onde área proporcional é o insight.
**`data`:** array de `{x: 'nome', y: valor}` dentro de `series[0].data`.
**Preferir donut** se ≤ 6 categorias. Treemap para rankings com muitos itens.

---

## Layout interno do slide analítico padrão

```html
<div class="content">
  [block-kpi-row]           ← topo, flex-shrink:0

  <div class="row">
    <div class="col" style="flex:1.1">
      [chart-wrap ou g2 com 2 charts]
      [block-find-note]
    </div>
    <div class="col" style="flex:.9">
      [find-block × 3 com find-dividers entre eles]
    </div>
  </div>
</div>
```

Variações aceitas:
- Slide sem gráfico: coluna esquerda pode ter `def-step`, `grp-list`, `mdef-block`, `hyp-card`
- Coluna única: omitir `.row` e usar `.content` diretamente
- Dois gráficos lado a lado: `<div class="g2">` com dois `chart-wrap`

---

## Separadores

- Entre find-blocks: `<div class="find-divider"></div>` (linha horizontal sutil)
- Entre def-steps: `<div class="def-divider"></div>`
- Entre mdef-blocks: `<div class="mdef-divider"></div>`
- **Nunca** usar `<hr>` ou `border-top` inline como separador

---

## Elementos interativos (shell-element.html)

> Estes componentes só existem no shell de elementos isolados (`shell-element.html`). **Não usar em slides Reveal.js.**

### `.ic` — Insight Card (clicável)
**Quando usar:** afirmação ou achado que merece detalhe — o card exibe a síntese; o clique abre o modal com análise completa.
**Posicionamento:** substitui ou complementa um `find-block` quando o conteúdo de suporte é denso (gráfico + tabela + texto).
**Regra:** `data-modal` deve conter o `id` exato do `.ic-overlay` correspondente.

```html
<div class="ic" data-modal="id-do-modal">
  <span class="ic-label">Achado</span>
  <span class="ic-text">Frase declarativa do insight — síntese que aparece no card.</span>
  <span class="ic-caret">ver análise ↗</span>
</div>
```

### `.ic-overlay` — Modal de detalhe
**Quando usar:** par obrigatório de cada `.ic`. Posicionar fora do card pai (diretamente no fluxo do documento), **nunca** aninhado dentro do `<div class="card">` que contém o `.ic`.
**Fechar:** clique no `×` (`data-ic-close`), clique fora do dialog (no overlay escuro), ou tecla Escape.
**Gráficos dentro do modal:** usar `opacity:0; pointer-events:none` no overlay (já é o padrão) — os gráficos renderizam no load com dimensões reais, sem precisar de resize ao abrir.

```html
<div class="ic-overlay" id="id-do-modal">
  <div class="ic-dialog">
    <div class="ic-dialog-hd">
      <div class="ic-dialog-title">Título descritivo do modal</div>
      <button class="ic-close" data-ic-close>&#215;</button>
    </div>
    <!-- conteúdo: hl, row, find-blocks, chart-wrap, tw > table -->
  </div>
</div>
```

**CSS e JS:** nativos no `shell-element.html` — não é necessário adicionar nada ao `_el-header.html` ou `_el-scripts.html`.
**Largura do dialog:** `min(820px, 100%)` — responsivo por padrão.
