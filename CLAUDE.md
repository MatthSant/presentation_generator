# Presentation Generator

Workspace com dois sistemas: o **app de analytics** (`app/` — servidor TS + client TS +
motores Python que renderizam análises como dashboards) e o **pipeline de apresentações**
(skills que transformam análises em Reveal.js com design system próprio).

> Arquitetura do app: [app/CLAUDE.md](app/CLAUDE.md) (como trabalhar) +
> [app/docs/ARQUITETURA.md](app/docs/ARQUITETURA.md) (mapa: rotas, módulos, motores, dívidas).
> Backlog vivo: [app/TAREFAS.md](app/TAREFAS.md).

---

## Mapa do workspace

`input/`, `temp/`, `output/` e `backup/` são **gitignored** (LGPD — dado de cliente e
artefato gerado nunca versionam); existem só no disco local.

```
presentation_generator/
├── CLAUDE.md                          ← este arquivo
│
├── input/                             ← dados do cliente para análises (CSV p/ /ltv-analysis etc.)
│
├── temp/                              ← intermediários de sessão (não versionado)
│   ├── analise_summary.md             ← gerado por /plan-slides (Fase 2)
│   ├── slides_plan.md                 ← gerado por /plan-slides (Fase 4) — editar antes de /build-slides
│   ├── det_driver.mjs                 ← driver p/ rodar detalhamentos em lote (DET_BASE=<url>)
│   └── [cliente]/[analise]/           ← plano_analise.md + dicionario.md das skills de análise
│
├── app/                               ← APP DE ANALYTICS (Express TS, porta 3131)
│   ├── CLAUDE.md                      ← arquitetura + regras (leia antes de mexer no app)
│   ├── TAREFAS.md                     ← backlog vivo
│   ├── src/server/                    ← rotas (~60 endpoints), typeRegistry, pygen, deepen, auth
│   ├── src/client/                    ← renderer (37 widgets), main, charts, controles (TS → public/js/)
│   ├── src/shared/                    ← contrato: types, validate, bind
│   ├── pysrc/                         ← 5 motores Python + common/ + perguntas/banks/
│   ├── public/                        ← shells (index, report, gerar-*/montador-*, usuarios…) + style.css
│   ├── docs/                          ← ARQUITETURA.md · WIDGETS.md · motor-deepen-review.md · futuro-betterauth.md
│   └── test/                          ← suíte hermética (node:test + supertest)
│
├── output/                            ← GERADO (não versionado)
│   ├── elements/                      ← /make-design — elementos isolados
│   ├── [cliente]/[analise]/           ← análises do app (dataset/data/layout/sXX.json) — /report/[cliente]/[analise]
│   └── presentation.html              ← /build-slides (Reveal.js)
│
├── backup/                            ← insumos e artefatos históricos (skills antigas, CSVs, esboços;
│                                        ex.: backup/temp/inde/ = config/content do caso INDÊ)
│
└── .claude/
    └── skills/
        ├── setup/                     ← deixa o app no ar (Node → install → build → sobe → abre)
        ├── plan-slides/               ← skill conversacional (5 fases: 0–4, com 4a de cobertura)
        ├── build-slides/              ← geração HTML da apresentação
        ├── make-design/               ← elementos isolados do design system
        ├── ltv-analysis/              ← análise LTV por skill
        ├── conversao-perfil/          ← análise de conversão (tem motor .py próprio — o canônico é app/pysrc)
        ├── integrar-analise/          ← procedimento: integrar um TIPO novo de análise no app
        ├── verificar-motor/           ← procedimento: auditar o motor de deepen de um tipo
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
2. /plan-slides               → pipeline conversacional de 5 fases
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
1. Colocar CSV transacional em input/[cliente]/
2. /ltv-analysis              → 5 fases: confirma CSV → contexto → perguntas → setup → execução
3. Acompanhar a análise no chat (achados por seção)
4. Abrir http://localhost:3131/report/[cliente]/[analise] no browser
```

---

## Skills

### `/setup`
Deixa o **app de visualização** (`app/`) no ar do zero, com o mínimo de fricção — pensada para o consultor não-técnico.

**Faz:** detecta SO → checa Node 18+ (orienta instalar se faltar) → `npm install` → `npm run build` → libera a porta 3131 → sobe o servidor em segundo plano → abre `http://localhost:3131` → checa Python.

**Pré-requisitos:** **Node 18+** para o app (obrigatório); **Python 3.8+** só para *gerar* análises (`/ltv-analysis`, `/conversao-perfil`) — **sem `pip`**, os scripts usam só a biblioteca padrão (no Windows o Python é chamado por `py -3`). Tem "modo só subir" quando já foi instalado antes. O servidor é **local** (sem autenticação) — entrega ao cliente é outro fluxo.

---

### `/plan-slides`
Pipeline conversacional que transforma uma análise em `temp/slides_plan.md`.

**5 fases:**
- **Fase 0** — detecta arquivo em `input/` ou pede input
- **Fase 1** — audiência (C-Level / Gestão / Técnico / Misto) + decisão esperada
- **Fase 2** — mensagem inescapável → gera `temp/analise_summary.md`
- **Fase 3** — propõe estrutura SCR + horizontal flow test → itera até aprovação
- **Fase 4a** — mapeamento de cobertura (cada achado da análise → slide)
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

**Estrutura de pastas** (cliente = slug do cliente, analise = slug da análise, ex: `ltv-mai-2026`):
- Input: `input/[cliente]/arquivo.csv`
- Temp:  `temp/[cliente]/[analise]/`
- Output: `output/[cliente]/[analise]/` → acessível em `/report/[cliente]/[analise]`

**5 fases:**
- **Fase 0** — localiza CSV em `input/[cliente]/` e confirma com o usuário
- **Fase 1** — nome do cliente e contexto do negócio → define `[cliente]` e `[analise]`
- **Fase 2** — perguntas norteadoras do usuário
- **Fase 3** — cria `temp/[cliente]/[analise]/` e `output/[cliente]/[analise]/`, explora CSV
- **Fase 4** — preenche dicionário de `custom_fields`, propõe taxonomia de grupos, gera plano
- **Fase 5** — executa seção a seção com scripts Python → gera `sXX.json` + `data.json`

**Artefatos gerados:**
- `temp/[cliente]/[analise]/dicionario.md` — mapeamento dos `custom_fields`
- `temp/[cliente]/[analise]/plano_analise.md` — seções planejadas e progresso
- `output/[cliente]/[analise]/data.json` — mapa de navegação
- `output/[cliente]/[analise]/sXX.json` — seções em typed blocks JSON

---

### `/conversao-perfil`
Análise de conversão por perfil ao longo de vários lançamentos, a partir de um **dump multidimensional de pesquisa** (uma linha por combinação de dimensões × lançamento × canal). Gera, no app, Panorama + uma página por critério + Insights + Detalhamentos (com **análise de codependência** entre fatores: qualificador vs qualificante).

**Estrutura de pastas:** igual ao `/ltv-analysis` (`input/`/`temp/`/`output/[cliente]/[slug]`).

**5 fases:** localizar dump → contexto → perguntas → setup + exploração → dicionário/plano (aprovação) → execução. Os cálculos são feitos por `conversao-perfil/conv_calc.py` (benchmark = respondentes da pesquisa; conversões já em %; lançamentos cronológicos; normalização de grupos duplicados). O LLM escreve a prosa de Insights/Detalhamentos; números só via `bind`.

**Auxiliares da skill** (`.claude/skills/conversao-perfil/`): `conv_calc.py` (motor de cálculo), `build_report.py` (gerador genérico das 4 camadas — `build(csv, config, content, out_dir)`), `calc-rules.md`, `BLOCKS.md`, `dictionary.md`, `template.json`, `sections/{PANORAMA,CRITERIO,INSIGHTS,DETALHAMENTOS}.md`. Insumos do caso INDÊ (config/content/gen_inde.py): `backup/temp/inde/`; CSV em `backup/input/`.

> ⚠️ O motor `.py` desta skill é a **origem** do tipo no app e **divergiu**: o canônico é
> `app/pysrc/conversao-perfil/` (evoluiu com `common/`). Para gerar no app, use o pysrc.
> Dívida registrada em [app/TAREFAS.md](app/TAREFAS.md).

---

### `/integrar-analise`
Procedimento para colocar **um TIPO novo de análise dentro do app** como cidadão de primeira classe (não roda a análise — integra). Cobre: motor `pysrc/<tipo>/` (calc + build_report nas 3 camadas), entrada no `typeRegistry.ts`, páginas gerar/montador, banco de perguntas norteadoras e o princípio de que **feature nova é recurso de plataforma** (nunca `if tipo==='x'`). Mapa de referência: [app/CLAUDE.md](app/CLAUDE.md).

---

### `/verificar-motor`
Audita e melhora o **motor de deep mode** de um tipo (não roda a análise — audita): cobertura de dimensões/métricas do `query_api.py`, alinhamento com `buildDeepenMeta` do registry, regras de relevância do banco de perguntas, verificação **sem crédito de API** rodando o motor contra a base real. Sempre prefere ajustar o motor Python a mexer em prompt. Acumulado em [app/docs/motor-deepen-review.md](app/docs/motor-deepen-review.md).

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
