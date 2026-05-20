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
├── output/                            ← gerado por /build-slides (pasta autocontida)
│   ├── presentation.html              ← abrir este arquivo no browser
│   └── backgrounds/                   ← cópia dos backgrounds usados na apresentação
│
├── _source/                           ← arquivos de referência (não editar)
│   ├── design-system/index.html       ← design system visual completo
│   ├── template_presentation.html     ← apresentação de referência (padrão de componentes)
│   ├── REQUIREMENTS.md                ← requisitos originais do sistema
│   └── slides.md                      ← exemplo de slides em markdown
│
└── .claude/
    └── skills/
        ├── plan-slides/
        │   └── SKILL.md               ← skill conversacional (4 fases)
        └── build-slides/
            ├── SKILL.md               ← skill de geração HTML
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
            │   └── wave-arc.svg       ← arcos concêntricos do canto inferior esq
            └── tools/
                ├── shell.html         ← wrapper HTML (CSS + Reveal.js + ApexCharts + buildOptions)
                │
                ├── — Slides base —
                ├── slide-cover.html   ← capa e contracapa
                ├── slide-brk.html     ← divisor de seção
                ├── slide-standard.html← slide analítico (shell)
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

```
1. Colocar análise em input/  (ou ter URL em mãos)
2. /plan-slides               → pipeline conversacional de 4 fases
3. Revisar temp/slides_plan.md se quiser ajustar manualmente
4. /build-slides              → gera output/presentation.html + copia backgrounds/
5. Abrir output/presentation.html no browser
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
Lê `temp/slides_plan.md` e constrói `presentation.html` usando os componentes em `tools/`.

**Processo:** lê `tools-map.md` → mapeia cada `tipo:` para componentes → monta slides → gera `chartDefs` → injeta no `shell.html`.

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

## Regras críticas de design

- **Proibido:** `border-left > 1px` como stripe colorido — usar full-border + tint
- **Proibido:** gradient text (`background-clip: text`)
- **Proibido:** hero-metric (número grande + gradiente)
- **Proibido:** glassmorphism decorativo (`backdrop-filter`)
- **Proibido:** cards ad-hoc — usar sempre componentes do design system
- Superfícies sempre semi-transparentes (`rgba(255,255,255,.03)`), nunca opacas
- `height` de gráfico sempre via JS (`height: 290` no chartDef), nunca CSS
- Sem comentários óbvios no código
