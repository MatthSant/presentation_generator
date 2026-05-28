# Presentation Generator

Pipeline de duas skills que transforma qualquer análise em uma apresentação Reveal.js com design system próprio.

---

## Mapa do workspace

```
presentation_generator/
├── CLAUDE.md                          ← este arquivo
│
├── input/                             ← colocar aqui a análise antes de /plan-slides
│                                         (MD, HTML ou URL fornecida no chat)
├── temp/
│   ├── analise_summary.md             ← gerado por /plan-slides (Fase 2)
│   └── slides_plan.md                 ← gerado por /plan-slides (Fase 4) — editar antes de /build-slides
│
├── output/                            ← gerado por /build-slides e /make (pasta autocontida)
│   ├── presentation.html              ← abrir este arquivo no browser
│   ├── backgrounds/                   ← cópia dos backgrounds usados na apresentação
│   └── elements/                      ← gerado por /make — elementos isolados do design system
│
├── requirements/
│   └── STACK.md                       ← stack técnica completa (CDN, ferramentas, outputs)
│
├── _source/                           ← arquivos de referência (não editar)
│   ├── design-system/index.html       ← design system visual completo (dark)
│   ├── design-system/light-mode.html  ← design system visual completo (light)
│   ├── template_presentation.html     ← apresentação de referência (padrão de componentes)
│   ├── REQUIREMENTS.md                ← requisitos originais do sistema
│   └── slides.md                      ← exemplo de slides em markdown
│
└── .claude/
    └── skills/
        ├── plan-slides/
        │   └── SKILL.md               ← skill conversacional (4 fases)
        ├── build-slides/
        │   └── SKILL.md               ← skill de geração HTML da apresentação
        ├── make-design/
        │   └── SKILL.md               ← skill de elementos isolados do design system
        └── components/                ← biblioteca compartilhada (build-slides + make-design)
            ├── tools-map.md           ← catálogo completo de componentes + regras de design
            ├── backgrounds/           ← backgrounds SVG (copiados para output/ pelo build-slides)
            │   ├── cover.svg          ← capa e contracapa (glow roxo forte + linha central)
            │   ├── break.svg          ← slides de seção (faixa diagonal + borda esquerda)
            │   ├── glow-purple.svg    ← destaque / resumo executivo (glow central)
            │   ├── glow-split.svg     ← slides de dois painéis (roxo + verde nos cantos)
            │   ├── grid-dots.svg      ← padrão analítico (dot grid neutro)
            │   ├── grid-lines.svg     ← metodologia (grade técnica sutil)
            │   ├── wave-flow.svg      ← dois fluxos cruzados (estilo flow field)
            │   ├── wave-vortex.svg    ← linhas irradiando de ponto focal lateral
            │   ├── wave-arc.svg       ← arcos concêntricos do canto inferior esq
            │   └── light/             ← variantes light dos mesmos 9 backgrounds
            └── tools/
                ├── — Shells —
                ├── shell.html          ← wrapper Reveal.js dark (CSS + ApexCharts + buildOptions)
                ├── shell-light.html    ← wrapper Reveal.js light (tokens invertidos)
                ├── shell-element.html  ← wrapper página web para /make-design (fluid, html-to-image)
                │
                ├── — Slides base —
                ├── slide-cover.html        ← capa e contracapa
                ├── slide-brk.html          ← divisor de seção
                ├── slide-standard.html     ← slide analítico (shell)
                ├── slide-exec-summary.html
                ├── slide-apendice.html
                │
                ├── — Blocos de conteúdo —
                ├── block-exec-point.html      ← claim do resumo executivo
                ├── block-kpi-row.html         ← linha de métricas (máx 4)
                ├── block-find-block.html      ← achado com tag única
                ├── block-find-block-dual.html ← Potencial + Ação
                ├── block-find-note.html       ← nota abaixo do gráfico
                ├── block-agenda.html          ← lista de agenda
                ├── block-apendice-link.html   ← link rodapé → apêndice
                ├── block-def-step.html        ← etapa de metodologia
                ├── block-mdef-block.html      ← definição de termo/métrica
                ├── block-grp-list.html        ← lista de grupos/segmentos
                ├── block-hyp-card.html        ← card de hipótese (prioridade)
                ├── block-ni.html              ← ação numerada detalhada (Por que? / Acionável)
                ├── block-horizon-col.html     ← coluna de horizonte (plano de ação)
                ├── block-learning-col.html    ← coluna de aprendizados (debrief)
                ├── block-heatmap.html         ← tabela heatmap (escala verde→neutro→vermelho por valor %)
                │
                └── — Gráficos (chartDefs snippets) —
                    ├── chart-bar.html
                    ├── chart-bar-horizontal.html
                    ├── chart-donut.html
                    ├── chart-line.html
                    ├── chart-area.html
                    ├── chart-mixed.html
                    ├── chart-stacked.html
                    ├── chart-radial.html
                    ├── chart-scatter.html
                    ├── chart-radar.html
                    └── chart-treemap.html
```

---

## Como usar

**Pipeline de apresentação:**
```
1. Colocar análise em input/  (ou ter URL em mãos)
2. /plan-slides               → pipeline conversacional de 4 fases
3. Revisar temp/slides_plan.md se quiser ajustar manualmente
4. /build-slides              → gera output/presentation.html + copia backgrounds/
5. Abrir output/presentation.html no browser
```

**Elemento isolado do design system:**
```
1. Ter os dados em mãos (colar no chat ou colocar CSV em input/)
2. /make-design               → sugere gráfico + layout, confirma, gera HTML
3. Abrir output/elements/[slug].html no browser
4. Clicar "↓ PNG" para exportar em alta resolução (3×)
```

**Análise de LTV:**
```
1. Colocar CSV transacional em input/
2. /ltv-analysis              → 5 fases: confirma CSV → contexto → perguntas → setup → execução
3. Acompanhar a análise no chat (achados por seção)
4. Abrir output/[slug]/relatorio-ltv.html no browser
```

---

## Skills

### `/plan-slides`
Pipeline conversacional que transforma uma análise em `temp/slides_plan.md`.

**4 fases:**
- **Fase 0** — detecta arquivo em `input/` ou pede input
- **Fase 1** — audiência (C-Level / Gestão / Técnico / Misto) + decisão esperada
- **Fase 2** — mensagem inescapável → gera `temp/analise_summary.md`
- **Fase 3** — propõe estrutura SCR + horizontal flow test → itera até aprovação
- **Fase 4** — valida MECE → gera `temp/slides_plan.md`

**Estrutura padrão do deck:**
1. Capa
2. Resumo Executivo (3–4 claims bold-bullet)
3. Agenda
4. Metodologia-Recorte + Metodologia-Métricas (dois slides)
5. Slides analíticos por seção (com breaks)
6. Plano de Ação (diagnóstico) ou Aprendizados (debrief de campanha)
7. Contracapa

---

### `/build-slides`
Lê `temp/slides_plan.md` e constrói `presentation.html` usando os componentes em `components/`.

**Processo:** lê `components/tools-map.md` → detecta `theme:` (dark/light) → mapeia cada `tipo:` para componentes → monta slides → gera `chartDefs` → injeta no `shell.html` ou `shell-light.html`.

**Temas suportados:**
- `theme: dark` (padrão, pode ser omitido) — fundo `#0C0C0C`, backgrounds em `backgrounds/`
- `theme: light` — fundo `#F9FAFB`, tokens invertidos, backgrounds em `backgrounds/light/`

**Tipos de slide reconhecidos:**

| tipo | componente principal |
|---|---|
| `capa` | slide-cover.html |
| `exec-summary` | slide-exec-summary.html |
| `agenda` | slide-standard + block-agenda |
| `break` | slide-brk.html |
| `metodologia-recorte` | slide-standard + def-step + grp-list |
| `metodologia-metricas` | slide-standard + g2 + mdef-block |
| `analítico` | slide-standard + blocos variados |
| `plano-acao` | slide-standard + g4 + block-horizon-col |
| `aprendizados` | slide-standard + g3 + block-learning-col |
| `apendice` | slide-apendice.html |
| `contracapa` | slide-cover.html (só cover-title) |

---

### `/ltv-analysis`
Análise completa de LTV a partir de um CSV transacional — por produto, por coorte e por perfil.

**5 fases:**
- **Fase 0** — localiza CSV em `input/` e confirma com o usuário
- **Fase 1** — nome do cliente e contexto do negócio
- **Fase 2** — perguntas norteadoras do usuário
- **Fase 3** — cria `temp/[slug]/` e `output/[slug]/`, explora CSV (colunas, cobertura, produtos)
- **Fase 4** — preenche dicionário de `custom_fields`, propõe taxonomia de grupos, gera `temp/[slug]/plano_analise.md`
- **Fase 5** — executa seção a seção com scripts Python + HTML por seção → monta relatório final

**Artefatos gerados:**
- `temp/[slug]/dicionario.md` — mapeamento dos `custom_fields`
- `temp/[slug]/plano_analise.md` — seções planejadas e progresso
- `temp/[slug]/_el-sXX.html` — seções HTML individuais
- `output/[slug]/relatorio-ltv.html` — relatório completo montado

---

### `/make-design`
Constrói um elemento isolado do design system como página HTML standalone.

**Fluxo:**
- **Passo 1** — captura dados (colados no chat ou CSV em `input/`)
- **Passo 2** — analisa padrão, propõe tipo de gráfico + layout
- **Passo 3** — confirma com o usuário via `AskUserQuestion`
- **Passo 4** — gera HTML a partir de `components/tools/shell-element.html`
- **Passo 5** — salva em `output/elements/[slug].html`

**Composições possíveis:**
- Gráfico isolado (single viz)
- KPI row + gráfico
- Gráfico + insights (`.row` com find-blocks)
- 1-pager completo (cabeçalho + métricas + gráfico + achados)

**Exportação:** botão "↓ PNG" fixo, `pixelRatio: 3` (~3000px de largura), fora do `#export-root` (não aparece no PNG).

---

## Regras críticas de design

- **Proibido:** `border-left > 1px` como stripe colorido — usar full-border + tint
- **Proibido:** gradient text (`background-clip: text`)
- **Proibido:** hero-metric (número grande + gradiente)
- **Proibido:** glassmorphism decorativo (`backdrop-filter`)
- **Proibido:** cards ad-hoc — usar sempre componentes do design system
- Superfícies sempre semi-transparentes — dark: `rgba(255,255,255,.03)`, light: `rgba(0,0,0,.02)` — nunca opacas
- `height` de gráfico sempre via JS (`height: 290` no chartDef), nunca CSS
- Sem comentários óbvios no código
