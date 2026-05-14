---
name: build-slides
description: "Lê temp/slides_plan.md e constrói presentation.html do zero usando a biblioteca de componentes em tools/. Use quando o usuário invocar /build-slides ou pedir para gerar/construir o HTML da apresentação a partir do plano existente."
user-invocable: true
---

# build-slides

Constrói `presentation.html` a partir de `temp/slides_plan.md` usando a biblioteca de componentes em `.claude/skills/build-slides/tools/`.

## Processo obrigatório (executar nesta ordem)

### Passo 1 — Carregar contexto

Leia os seguintes arquivos **antes de gerar qualquer HTML**:

1. `tools-map.md` — catálogo de componentes com regras críticas (obrigatório)
2. `temp/slides_plan.md` — plano de conteúdo gerado pelo `/plan-slides`
3. `tools/shell.html` — wrapper HTML completo

### Passo 1b — Interpretar o plano de conteúdo

O `slides_plan.md` está em linguagem de conteúdo, não de componentes. Antes de gerar qualquer HTML, mapeie cada campo para o componente correto:

| Campo do plano | Componente |
|---|---|
| `tipo: capa` | `slide-cover.html` |
| `tipo: exec-summary` | `slide-exec-summary.html` + `block-exec-point.html` por claim |
| `tipo: agenda` | `slide-standard.html` (badge p, título "Agenda") + `block-agenda.html` como conteúdo único |
| `tipo: break` | `slide-brk.html` |
| `tipo: analítico` | `slide-standard.html` + blocos abaixo |
| `métricas:` (lista de valores) | `block-kpi-row.html` — até 4 itens; cores: positivo→c-g, negativo→c-r, neutro→c-p/c-w |
| `dados para visualização:` | tipo de gráfico pelo dado: temporal→bar ou line, ranking→bar-horizontal, composição→donut, magnitude→area, volume+taxa→mixed |
| `título:` do slide analítico | vira o `h1.slide-title` — action title já escrito como frase declarativa |
| `achados:` (lista) | `block-find-block.html` — 1 por achado; tag por natureza: fato→Achado, risco→Atenção, contradição→Paradoxo, janela temporal→Timing, composição→Composição |
| `hipótese/ação:` | `block-find-block-dual.html` (Potencial + Ação) — obrigatório quando presente |
| find-note | extrair a essência do `título:` do slide em 1 frase curta para o `block-find-note.html` abaixo do gráfico |
| `apendice:` (campo opcional no slide) | injetar `block-apendice-link.html` como último elemento do `.content` do slide principal |
| `tipo: apendice` | `slide-apendice.html` com link de volta ao slide de origem |
| `tipo: metodologia-recorte` | `slide-standard.html` (badge `p`, seção "DEFINIÇÕES") + layout `.row`: `.panel-l` com `block-def-step.html` por etapa (universo + classificação, separados por `def-divider`) + `.panel-r` com `block-grp-list.html` quando há grupos |
| `tipo: metodologia-metricas` | `slide-standard.html` (badge `p`, seção "DEFINIÇÕES") + `.g2` com dois `.col`: cada `block-mdef-block.html` por definição (separados por `mdef-divider`) + `mdef-note` no final da coluna quando há referência externa |
| `tipo: aprendizados` | `slide-standard.html` (badge `g`, seção "APRENDIZADOS") + KPI row com métricas globais + `.g3` com 3 `block-learning-col.html` (O que funcionou / O que não funcionou / Próximas hipóteses) |
| `tipo: plano-acao` | `slide-standard.html` (badge `r`, seção "PLANO DE AÇÃO") + `.g4` com 4 `block-horizon-col.html` — um por horizonte |
| `tipo: contracapa` | `slide-cover.html` — apenas `cover-title` preenchido (ex: "Obrigado."); `cover-sub` e `cover-meta` omitidos ou usados para nome da equipe/empresa |

**Apêndice — regras de geração:**
- Todo slide que declara `apendice:` recebe `block-apendice-link.html` como último elemento do `.content`, com `margin-top:auto` para rodapé
- O `section` do slide principal recebe `id="{{slide-id}}"` derivado do título em kebab-case (ex: `slide-crescimento-ticket`)
- O `section` do slide de apêndice recebe `id="{{id}}"` conforme declarado no plano (ex: `apendice-distribuicao-grupos`)
- O link de volta no apêndice aponta para o `id` do slide principal (`origem-id`)
- Ambos os links usam `onclick="goToSlide('id')"` — nunca `href="#..."` direto
- Slides de apêndice ficam **após** todos os slides principais no HTML
- Slides sem campo `apendice:` ainda recebem `id` no `<section>` (boa prática para consistência)

**Tabelas vs. gráficos:**
- **Preferência sempre por gráfico** — dados numéricos devem ser visualizados, não tabelados
- Tabela (`<table>` com classe `.tw`) só é aceitável quando: (a) há muitas dimensões que não cabem em eixo, (b) o dado é uma referência que o usuário precisa consultar, ou (c) a comparação exata de valores é o ponto central
- Se um dado viria como tabela mas tem até 2 dimensões → usar gráfico de barras horizontal
- Se tem 3 dimensões → considerar gráfico misto ou donut + texto
- Tabelas brutas em slides principais são um sinal de que o dado deveria ir para o apêndice

**Decisões de layout:**
- Slide com gráfico + achados → `.row` com `.col` (flex:1.1) para gráfico e `.col` (flex:.9) para find-blocks
- Slide metodológico (sem gráfico) → coluna única com `def-step` ou `mdef-block`
- Dois gráficos comparativos → `.g2` dentro do painel esquerdo
- Agenda → `block-agenda.html` substituindo o `.content` inteiro
- Metodologia-recorte → `.row` com `.panel-l` (def-step blocks com universo e classificação) e `.panel-r` (grp-list quando há grupos); sem panel-r se não há grupos (usar `.panel-l` em largura total)
- Metodologia-metricas → `.g2` com duas colunas de `mdef-block` separados por `mdef-divider`; `mdef-note` no final da coluna direita quando há referência
- Aprendizados → KPI row com métricas globais da campanha (se disponível) + `.g3` com 3 `block-learning-col.html`
- Plano de ação → `.g4` com 4 `block-horizon-col.html` substituindo o `.content` inteiro; badge do slide = `r` (horizonte mais urgente)
- Quando horizonte tem > 3 ações → slide analítico separado por horizonte, usando `block-ni.html` cards em coluna única (`flex:1;display:flex;flex-direction:column;gap:7px`)

Leia também os componentes que serão usados (identificados no plano) para ter o HTML exato em contexto.

### Passo 2 — Inventariar gráficos

Antes de gerar qualquer slide, extraia do `slides_plan.md` **todos** os blocos `charts:` e monte mentalmente o objeto `chartDefs` completo. Isso garante que o JS final esteja correto e sem IDs duplicados.

Verifique: cada `id` começa com `chart-` e é único no documento.

### Passo 3 — Gerar cada slide

Para cada slide em `slides_plan.md`, na ordem:

1. Identifique o tipo (`cover`, `brk`, `standard`)
2. Leia o template correspondente em `tools/`
3. Preencha os placeholders com os valores do plano
4. Adicione o comentário de numeração: `<!-- SLIDE N ═══════════════════════════════ -->`
5. Monte a `<section>` completa

**Regras críticas de geração:**

- `cover-title`, `cover-sub`, `cover-meta`, `brk-pre`, `agenda-title`, `agenda-sub` → **texto puro**, zero tags filhas
- `slide-title`, `brk-title`, `find-title`, bullets → podem conter HTML interno (`<em>`, `<span>`, `<strong>`)
- `<em>` na palavra-chave do `slide-title` (não `<i>`)
- Badge: classe exata `badge badge-{letra}` — o parser usa este padrão
- KPIs: cada item é `<div class="mi"><div class="mv {color-class}">valor</div><div class="ml">rótulo</div></div>`
- `color-class` nos KPIs é `c-p`, `c-g`, `c-a`, `c-o`, `c-r`, `c-w` (não hex inline)
- Chart containers: `<div class="chart-wrap" id="chart-nome"></div>` — id deve coincidir com a chave em `chartDefs`
- Superfícies: sempre `rgba(255,255,255,.03)` — nunca cor opaca como background
- Find-note: usar classe `find-note find-note-{cor}` — o `border-left` vem do CSS, não do estilo inline
- Footnote de estimativa: `<li style="color:var(--gray2);font-size:10.5px">texto</li>`

**Proibido (causar erro visual ou de parser):**
- `background-clip: text` (gradient text)
- `border-left` com largura > 1px como stripe colorido — se precisar de acento de cor: usar full-border + `background` tintado, como `.ni` do design system
- `height` de gráfico via CSS — usar somente JS (`height: 290` no chartDef)
- Glassmorphism decorativo (`backdrop-filter` em superfícies não-modais)
- Tags filhas dentro de campos texto-puro
- Número grande + gradiente de cor como métrica principal (hero-metric)
- Backgrounds opacos em superfícies — sempre `rgba()` semi-transparente

**Proibido — estilo "feito por IA":**
- Cards com `border-radius` alto + sombra + background tintado agrupando itens que poderiam ser listas simples
- Nunca usar `<div class="card ...">` ou construções ad-hoc equivalentes para listar achados, ações ou aprendizados — usar os componentes do design system (`find-block`, `ni`, `def-step`, `mdef-block`)
- Evitar `box-shadow` decorativo em qualquer superfície do slide
- Evitar gradientes de cor em backgrounds de qualquer elemento de conteúdo

### Passo 4 — Montar chartDefs

Construa o objeto JS `chartDefs` com todas as configurações de gráfico:

```javascript
const chartDefs = {
  'chart-id': {
    type: 'bar',
    height: 290,
    series: [{ name: 'Série A', data: [10, 20, 30] }],
    categories: ['2022', '2023', '2024'],
    colors: ['#8B5CF6'],
  },
};
```

**Regras de charts:**
- `height` sempre via JS, nunca CSS
- Eixos de valor: sempre incluir `min: 0`
- Barras horizontais: `yaxis` é o eixo de categorias — **nunca** aplicar `formatter` nem `min: 0` nele
- Formatter de valor em barras horizontais vai em `xaxis.labels.formatter`
- Cores do design system: purple `#8B5CF6`, green `#10B981`, amber `#F59E0B`, orange `#F97316`, red `#EF4444`
- Labels de eixo: `style: { colors: '#9CA3AF', fontSize: '11px' }`
- Grid: `borderColor: 'rgba(255,255,255,.06)'`
- Tooltip: `theme: 'dark'`
- Distributed bars (ranking): `plotOptions.bar.distributed: true` + array de cores com gradação

### Passo 5 — Montar e salvar presentation.html

1. Pegue `shell.html` como base
2. Substitua `{{SLIDES}}` pelo HTML de todas as `<section>` concatenadas
3. Substitua `{{CHART_DEFS}}` pelo objeto `chartDefs` completo
4. Salve como `presentation.html` na raiz do projeto

Após salvar, informe o usuário que `presentation.html` foi criado e pode ser aberto no browser.

---

## Comportamento em caso de ambiguidade

- **Campo ausente no plano:** use valor padrão sensato (badge `p`, sem KPIs se não especificado, find-note omitido se ausente)
- **Tipo de chart não reconhecido:** use `bar` como fallback e avise o usuário
- **ID de chart duplicado:** sufixe com `-2`, `-3` etc. e avise
- **Slide sem bloco Potencial+Ação mas com hipótese:** gere mesmo assim e avise que o plano não incluiu o bloco obrigatório
