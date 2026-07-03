# Tarefas — Análise de Criativos (tipo `criativos`)

Backlog vivo da integração do tipo **Criativos** no app. Marcar `[x]` ao concluir.
Contexto de arquitetura: ver [app/CLAUDE.md](CLAUDE.md). Procedimento de onboarding de
tipos: skill `/integrar-analise` (`.claude/skills/integrar-analise/`).

> **Regra do projeto:** toda feature nova entra como **recurso de plataforma**
> reutilizável (via `meta`/widget genérico), nunca hardcoded para o tipo `criativos`.
> **Testar na UI real** (cliques/screenshot), não só curl/mock, antes de cada commit.

---

## Concluído

- [x] Tipo `criativos` registrado em `src/server/typeRegistry.ts` (controlsKind, renderScript).
- [x] Motor `pysrc/criativos/{calc.py, build_report.py, render_view.py}` (engenharia reversa do JS).
- [x] Widgets novos de plataforma: `embed`, `link-card`, `scatter-picker` (types/validate/renderer/css).
- [x] FAB de controles `src/client/criativos-controls.ts` (Modo · Investimento mínimo · Temperatura).
- [x] Toggle de modo **a nível de relatório** (Resultado × Captação) via FAB + recompute `render_view.py`.
- [x] Scatter-picker com 2 dropdowns (X/Y) — usuário escolhe métrica por eixo.
- [x] Sidebar de navegação por entidade (`meta.nav='sidebar'`) com busca/ordenação/pílulas ROAS.
- [x] Fonte correta na sidebar (`'Exo 2'` forçada em button/input/a).
- [x] Evolução diária: métricas mudam por modo (captação=cpmql×invest, fallback cpl; resultado=invest×retorno).
- [x] Embed Instagram na proporção de Reels; corte de dias com investimento zerado nas pontas (`_trim_daily`).
- [x] Fichas: KPIs ao lado do embed (coords manuais, Grid é packer de linha única).
- [x] Scatter-picker dentro do card padrão (`.sp-wrap` na regra "Elevated data cards").

---

## Pendente

### Tarefa nova — KPI cards com casas decimais
- [x] **KPIs/strip com valores decimais.** ✅ Resolvido em `pysrc/common/fmt.py:9-16` —
      `money()` usa 2 casas para custos unitários de baixo valor (`R$ 14,27`) e mantém
      a abreviação M/k para valores grandes. Vale para todos os tipos (formatador único).

### #13 — Reestruturar navegação (3 grupos)
- [ ] Agrupar como **"Ficha de Criativos"**: Panorama + fichas individuais (navegação pela sidebar).
- [ ] Página **"Detalhamentos"** (vazia para iniciar — feature de deepen já existe na plataforma).
- [ ] Página **"Perguntas norteadoras"** com o banco do documento-fonte (Notion / `Perguntas Norteadoras.html`):
      - "O retorno dos anúncios está caindo de vez?"
      - "Tem época que vende melhor?"
      - "Faturar mais dependeu de investir mais?"
      - "Lead mais qualificado converte mais?"
      - [x] `pysrc/perguntas/banks/criativos.py` criado e registrado em `banks/__init__.py` (revisar cobertura/relevância via `/verificar-motor`).
- [ ] Corrigir a página de topo que hoje está quebrada.

### #14 — Completar as fichas individuais
- [ ] Seção **"Por temperatura"** (além de por campanha / por público).
- [ ] Bloco **"Dados do Criativo"** (área de vídeo) quando `is_video`: Views, Hook Rate, Hold Rate, Connect Rate — migrar CTR para lá.
- [ ] Tabelas em ambos os modos com as métricas faltantes: **Conversão de Página** e **Connect Rate**.

### #15 — UI de criação (fluxo `/generate`)
- [ ] Adicionar link `/gerar-criativos.html` em `public/index.html`.
- [ ] Criar `public/gerar-criativos.html` + `public/montador-criativos.html` (clonar os `*-historico`, ajustar campos do config).

---

## Plataforma — melhorias da revisão (jul/2026)

Achados da revisão completa pré-Fase 2:

- [x] **Registry dinâmico de controles no client** — `controlsRegistry` em `main.ts`
      (mount + body do recompute por `kind`); novo tipo = classe + 1 entrada.
- [x] **Helpers compartilhados dos `*-controls.ts`** — extraídos p/ `src/client/controls-utils.ts`
      (el/group/opt/mini/must/mountShell/fabSetPage/setBadge/debounce).
- [x] **Sanitização de `innerHTML` com prosa** — `safeHtml()` no renderer.ts (whitelist
      strong/em/br/code, unwrap do resto) nos sites de find-block/find-note/highlight/ni/
      label-sec/xs/bullets. `request` já usava textContent.
- [x] **Testes + CI** — `bind.test.ts` já existia; `render.test.ts` novo (guards);
      `.github/workflows/ci.yml` (lint+build+test, suíte hermética).
- [ ] **`render_view.py` p/ conversao-perfil/acompanhamento** se um dia ganharem controles
      interativos (assemble já é puro nos dois).
- [ ] **Skill /conversao-perfil divergente do pysrc** — `.claude/skills/conversao-perfil/
      {build_report,conv_calc}.py` (~870 LOC) é o motor de origem, standalone; o canônico
      evoluiu em `pysrc/conversao-perfil` (common/, assemble/build). Decidir: skill delega
      ao pysrc (remove os .py locais) ou congela com aviso no SKILL.md.
- [x] **Cópia de CSVs auxiliares p/ a base retida** — logada; aux de `requiredFiles`
      (ex.: goals do debriefing) agora falha alto no /generate.

## Próximos passos (priorizar quando abrir espaço)

- [ ] **CSV de apoio no aprofundamento** — o usuário anexa um CSV auxiliar ao pedir um
      detalhamento (ex.: dados que a base não tem) e a IA usa esse dado para enriquecer a
      resposta. Toca: upload na UI de perguntas/deepen → reter junto à base (`.base/`, como
      goals/hist/dict) → expor ao motor/`consultar` (catálogo do CSV no contexto) → citar a
      fonte na seção gerada. Cuidado: validar/limitar o CSV (LGPD, tamanho, schema livre).
- [x] **Revisar o exportador de HTML de ponta a ponta** — `exportHtml` em `main.ts`
      (botão `#export-html-btn`). Revisão + REESCRITA (jul/2026); resultado abaixo.
  - **Objetivo & como (v2, interativo):** gera um `.html` standalone (abre offline, sem
    servidor) que se comporta como o app — **uma seção por vez** com **sidebar de navegação**
    (reusa as classes vivas `#sidenav`/`.sn-*`/`#export-root`, então o style.css inlinado
    estiliza de graça), toggle de canal no topnav, largura **mín 1180 / máx 1920** e
    **gráficos ApexCharts REAIS** (hover/tooltip). Cada seção × canal é renderizada pela via
    real; capturamos o **ChartDef** de cada gráfico (estrutura de dados com os valores JÁ
    resolvidos — sem dataset/bind/regra de negócio) via `chartCaptureStart/End` +
    `captureChart` (charts.ts) e embutimos um `buildOptions` empacotado (charts.js só depende
    de trend.js) + o ApexCharts real + `window.__EXP_CHARTS`; um runtime remonta cada chart
    com `data-xc`. Perguntas, deepen, seletores dos pickers e toggles mortos (outlier,
    chart/heatmap-toggle) são removidos — a pane/seleção ativa fica **congelada** mas o
    gráfico é interativo.
  - **BUG corrigido (fonte):** o `fonts.css` (@import Poppins) NÃO era inlinado → fonte de
    fallback. Agora entra no topo do `<style>`.
  - **Cuidado (pickers × aba em 2º plano):** scatter/evolution-picker montam via
    `requestAnimationFrame`, estrangulado em aba de fundo durante o export → o `captureChart`
    não disparava (0 charts no criativos). Fix: `chartExportMode()` → build **síncrono** no
    export (renderer.ts). Charts do ChartManager já montam síncronos.
  - **Ganho de tamanho:** conversao-perfil caiu de ~8,3 MB → ~2,8 MB; criativos ~2,7 MB
    (defs são JSON minúsculo; o ApexCharts entra uma vez, não SVG re-renderizado por canal).
  - **Limitações remanescentes (por design):**
    - Só o filtro de CANAL é alternável; demais controles (compare, modo, lançamentos)
      ficam congelados no estado atual (o gráfico ainda é interativo).
    - Modais de deepen a NÍVEL DE BLOCO (varinha) entram com os gráficos e o runtime
      abre/fecha + monta o chart no open; aprofundamentos da página são seções normais.
    - Embeds do criativos (iframe Instagram) e o @import de fonte precisam de internet.
      Avaliar embutir os woff2 p/ fidelidade offline real.
    - Chart-toggle: só a pane ativa entra (as ocultas nunca desenham na captura).
- [ ] **Camada de IA que reescreve a pergunta antes do detalhamento** — o usuário escreve
      solto ("captação ou conversão teve mais impacto?") e, antes de submeter, uma chamada
      barata reescreve com o contexto do TIPO de análise ("Foi acréscimo/decréscimo no
      volume de leads ou na conversão desses leads que teve maior impacto no faturamento e
      retorno?") — pergunta melhor escopada = detalhamento melhor. Toca: rota
      `perguntas/custom` (passo de rewrite ANTES do fluxo atual), prompt com o dicionário
      de métricas/dimensões do tipo (registry/buildDeepenMeta), e UI mostrando a pergunta
      reescrita p/ o usuário confirmar/editar antes de gastar o deepen completo.

## /goal detalhamentos — retomada (aguarda crédito de API)

A análise `inde/conversao-perfil` foi recriada do backup (motor + base retida manual).
Os detalhamentos (17/20 na época; os 2 do conversao se perderam com o output) rodam com:

1. Subir o app (`node dist/server/index.js` ou dev-authoff).
2. `set DET_BASE=http://localhost:3131` (ou a porta em uso) e
   `node temp/det_driver.mjs inde conversao-perfil cp-drag,cp-demo,cp-channel,cp-consist,cp-combos`.
3. Conferir `temp/det_summary_inde_conversao-perfil.json` + o render real de cada seção
   em `/report/inde/conversao-perfil` (regra: checar o render, não só ok=true).

---

## Notas

- **Caso real atual:** `output/[cliente]/[criativos-slug]/` — gerado por script, posse atribuída
  via `assignClient` (fora do fluxo `/generate`, senão fica órfão na home).
- **render_view.py** escreve em `sys.stdout.buffer` (UTF-8) por causa do `★` (cp1252 quebra no Windows).
- **JSON no shell:** usar `'{"mode":"captacao"}'` — escapar aspas (`\"`) invalida o JSON e cai no default.
- **Screenshots** de iframe/ApexCharts travam o `preview_screenshot`; verificar via `preview_eval` (medição DOM).
