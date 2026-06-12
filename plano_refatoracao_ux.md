# Refatoração UX/Design — App + Análises (Witly Design System)

## Contexto

O app de analytics (`app/`) já passou por uma primeira leva de redesign (style.css light-only, roxo #7C3AED, Poppins), mas ainda diverge do design system oficial Witly entregue no zip `Witly Design System-handoff.zip` (tokens + mockups das telas do app em `ui_kits/app/*.html`). Problemas de UX conhecidos: botão "Voltar" injetado à direita da navbar (`margin-left:auto`) e ausente em 4 telas; FAB de filtros em pílula fora do padrão; topnav do report fora do padrão appbar. As análises (widgets do renderer) devem seguir as regras do DS, mas ficar visualmente em linha com os HTMLs fonte em `backup/Ajsute de design/` (find-blocks com border-top 3px + fundo suave, KPI rows, heatmap divergente).

**Decisões do usuário:**
1. Fonte: **Poppins** (manter; ignorar Exo 2 dos mockups).
2. **Adotar drawer lateral** "Ver detalhamento" para detalhamentos/aprofundamentos.
3. Escopo completo: app (chrome) + análises (widgets).
4. Voltar: **esquerda, antes do título**, presente em todas as telas exceto a home.
5. Light-only (dark continua removido).

**Documentos no workspace:** este plano está salvo em `plano_refatoracao_ux.md`; a referência consolidada de design (tokens, componentes, regras, IA) está em `design.md` — ambos na raiz do repo. Manter os dois atualizados durante a implementação.

**Referências:**
- Tokens/regras: zip → `project/tokens/*.css` + `project/readme.md`.
- Telas do app: zip → `project/ui_kits/app/{index,insights,perguntas,debriefing}.html` (tokens: `--fg:#161519 --gray:#54515d --gray2:#75727e --faint:#9b98a3 --border:#e7e5ec --border-2:#dcd9e3 --divider:#efedf3 --canvas:#fbfbfd --surface:#f6f5f9`, appbar 60px, tabs pill, FAB circular 56px, drawer 460px, scrim `rgba(28,16,46,.42)`+blur).
- Análises: `backup/Ajsute de design/relatorio-secao-1.html` (versão polida), `relatorio-secao-10-insights.html`, `relatorio-aba-por-categoria.html`.

---

## Fase 0 — Assets

- Extrair do zip `project/assets/logo-wordmark-plum.png` → `app/public/assets/logo-wordmark-plum.png` (manter `witly-logo.png` para exports antigos).
- Fallback textual via `img.onerror` → `.home-brand`.

## Fase 1 — Tokens (fundação compartilhada)

`app/public/style.css` `:root` (linhas 9–73) — atualizar **valores, nunca nomes**:

| Token | Atual → Alvo |
|---|---|
| `--fg` | #18181b → **#161519** |
| `--gray` | #52525b → **#54515d** |
| `--gray2` | #71717a → **#75727e** |
| `--faint` | #a1a1aa → **#9b98a3** |
| `--border` | #e7e7ea → **#e7e5ec** |
| `--border-strong` | #d4d4d8 → **#dcd9e3** |
| `--divider` | #f1f1f3 → **#efedf3** |
| `--bg-page` | #fbfbfc → **#fbfbfd** |
| `--surface` | #f7f7f8 → **#f6f5f9** |
| `--purple-soft` | #f5f0fe → **#F3EEFE** |

Roxos, semânticas `-bg`, raios, sombras, `--ease` já são idênticos ao alvo. Adicionar tokens soft: `--green-soft:#ecfdf5 --amber-soft:#fffbeb --red-soft:#fef2f2` (p/ takeaways).

**Armadilha:** NÃO criar token global `--card` — `var(--card, #f3f2fb)` é usado como fallback local em `.qa-stat` e `.funnel-pill--bench`; corrigir esses fallbacks para `var(--surface)`.

`app/src/client/charts.ts` `getBase()` (~l.85): `labelColor '#71717a'→'#75727e'`, `gridColor '#e7e7ea'→'#e7e5ec'` (ou ler de CSS vars como `readPalette` já faz). Tooltip ApexCharts: regra `.apexcharts-tooltip{font-family:var(--font-sans)}` no style.css. `npm test` pode assertar hexes antigos — ajustar.

## Fase 2 — Voltar à esquerda + appbar das páginas utilitárias

- `app/public/js/page-chrome.js`: mover o bloco do back (l.57–63) para o **início** do fragment — ordem `[← voltar][logo→/][sep][brand/sub] ... [ações da página]`; trocar `logo.src` para o wordmark plum; default `data-back="/"` quando ausente fora da home; atualizar comentário do header (l.14–15).
- `style.css`: `.home-bar` (l.90) 52→60px, padding 0 28px; `.bar-back` (l.95) **remover `margin-left:auto`**, estilizar como pill quieta com chevron (borda hairline, hover `--surface`).
- Corrigir as 4 páginas sem voltar: `gerar-acompanhamento.html` e `montador-acompanhamento.html` → `data-back="/guia/acompanhamento-lancamento"`; `gerar-debriefing.html` e `montador-debriefing.html` → `data-back="/guia/debriefing-lancamento"`.

## Fase 3 — Topnav do report → appbar Witly (60px)

- `app/public/report.html` (l.21–46): `.tn-home` vira botão circular de voltar/home à **esquerda**; logo wordmark plum; remover `.tn-badge`/`.tn-sep`; manter `#tn-client`.
- `style.css`: `#topnav` (l.148) height 48→60; `.tnp-btn` (l.222) → `font-size:14px; padding:8px 14px` pill (ativa = roxo sobre `--purple-bg`, já é o padrão).
- **Offsets encadeados (crítico):** `#section-bar` top 48→60 (l.393); `#main` margin-top 88→100 (l.452); sidenav top 48→60 (l.464, l.492); l.496 88→100. Remover regra morta `[data-theme="dark"] .tn-logo` (l.178).
- `navigation.ts`: **zero mudanças** (classes/ids preservados; `.cmp-toggle` injetado em `.tn-right` segue intacto).

## Fase 4 — FAB circular + menu popup

`Filters`, `CriativosControls` e `HistoricoFilters` já compartilham o shell `#filter-fab/#filter-modal/#filter-body/#filter-count` (`wireFilterShell`, filters.ts:14) → **nenhuma mudança de TS**, só CSS + 1 ajuste de markup:
- `report.html` (l.63–67): remover o texto "Filtros" do FAB (vira ícone puro).
- CSS: `#filter-fab` (l.1155) → círculo 56px roxo, bottom/right 28px, sombra roxa `0 14px 30px -10px rgba(124,58,237,.7)`; `#filter-count` → badge absoluto no canto do círculo (lógica `flt-has` preservada); `#filter-modal` (l.1175) → camada click-away **transparente** cobrindo a viewport (preserva handler `e.target === modal`); `.flt-dialog` → popup ancorado acima do FAB (`bottom:94px; right:28px`) com `--shadow-lift` + animação scale/translate; `#edit-bar` (l.1216) → `bottom:96px` para não colidir.

## Fase 5 — Home + telas gerar/montador

- Criar classes compartilhadas `.page-eyebrow/.page-title/.page-sub` no style.css (eyebrow 11.5px/800/uppercase/tracking .16em roxo com dot `::before`; título 30–32px/800/-0.03em).
- `index.html`: aplicar nas seções (`.home-title`, `.guia-eyebrow`); `.home-new` → pill `--r-pill` com sombra roxa (padrão `.btn-new` do mockup); `.home-new-menu` → `--r-md` + `--shadow-lift`, `.hnm-ic` circular.
- Telas gerar-*/montador-* (10 arquivos): consolidar `<style>` duplicados no style.css — `.g-tag→.page-eyebrow`, `.g-title→.page-title`, `.g-sub→.page-sub`; `.g-go` alinha ao `.btn--primary` pill. Piloto em 1 página, depois replicar.

## Fase 5B — Reestruturação de IA/UX (arquitetura de informação)

Mudanças de UX além do visual, para o app parecer um web-app de verdade:

1. **Página Admin** (`/admin`, novo `admin.html`): agrega **Clientes** (CRUD atual de clientes.html), **Uso** (painel de custos/tokens de uso.html) e **Arquivadas** (análises arquivadas). `clientes.html`/`uso.html` viram redirects (ou abas dentro do admin) para não quebrar links salvos. Os links saem da navegação principal.
2. **Menu do avatar na appbar**: o mockup já traz avatar 34px à direita — vira menu dropdown com `Admin`, `Guias` e `Sair` (quando auth ativo). É o ponto de entrada do admin em todas as telas.
3. **Classificação por tier**: novo campo `tier: 'estrategico' | 'tatico' | 'operacional'` na `AnalysisTypeDef` (`typeRegistry.ts`) + exposto em `GET /api/analyses` e no guia. Mapeamento proposto (confirmar no início da implementação):
   - **Estratégico** — `conversao-perfil` (perfil/segmentação cross-lançamentos), `historico-lancamentos` (visão de longo prazo);
   - **Tático** — `debriefing-lancamento` (aprendizados pós-campanha), `criativos` (otimização de criativos);
   - **Operacional** — `acompanhamento-lancamento` (monitoramento diário de campanha no ar).
4. **Home reorganizada** (`index.html`): sai a lista plana de "análises mais recentes"; entra organização por **cliente** (cards de cliente com suas análises, badge de tier em cada análise) com busca global no topo. O menu **"Nova análise"** agrupa os 5 tipos pelos 3 tiers (cabeçalhos de grupo no dropdown, com descrição curta de cada tipo). "Recentes" pode sobreviver como atalho discreto (linha de chips), não como seção dominante.
5. **Guias por tier** (`guia.html`): índice agrupado em Estratégico / Tático / Operacional com eyebrow + descrição do que cada tier responde ("onde estamos errando a estratégia" / "como melhorar o próximo lançamento" / "como está a campanha agora").

Arquivos: `typeRegistry.ts` (+tier), `routes/analyses.ts` (expor tier), novo `admin.html` + rota, `index.html` (home), `guia.html`, `page-chrome.js`/appbar (avatar menu), `server/app.ts` (rota /admin e redirects).

## Fase 6A — Auditoria comparativa com os HTMLs fonte (obrigatória, antes dos widgets)

Objetivo: o report do app deve ficar **o mais parecido possível com o original** (HTMLs fonte), seguindo o novo DS. Problemas conhecidos do app hoje: espaçamento ruim, pouca clareza da informação, mau uso do espaço e informações que precisam estar juntas não cabem numa tela.

**Método (lado a lado, por seção):**
1. Abrir cada HTML fonte (`backup/Ajsute de design/relatorio-secao-1.html`, `relatorio-secao-2.html`, `relatorio-aba-por-categoria.html`, `relatorio-secao-10-insights.html`) no browser e capturar screenshot a 1440×900 e 1920×1080.
2. Renderizar a seção equivalente num relatório real do app (`/report/<cliente>/<slug>?static`) e capturar nas mesmas resoluções.
3. Produzir uma **spec de diff por seção** num arquivo de trabalho (`temp/redesign/diff-spec.md`), cobrindo:
   - **Composição da tela**: o que o fonte agrupa numa tela só (ex.: cabeçalho + KPI row + gráfico + find-block formam uma unidade visível sem scroll) vs. como o app espalha; quais widgets devem compartilhar linha no grid.
   - **Escala de espaçamento**: extrair do `<style>` do fonte os valores reais (padding de main/slide, gaps entre widgets ~14–20px, padding interno de cards, margens de títulos) e comparar com o app (`.dash-grid` gap, `grid-auto-rows`, `#main` padding, paddings de widgets).
   - **Hierarquia/clareza**: tamanhos e pesos de título de seção (slide-hd/slide-title do fonte), eyebrows, headline de gráfico, find-title — onde o app está menor/maior ou com contraste insuficiente.
   - **Densidade vertical**: alturas reais dos blocos no fonte (KPI row, gráfico, find-block) → alvo de altura por widget no grid.
4. A spec aprovada vira o **critério de aceite** das fases 6B–7: cada widget/seção refatorado é comparado de novo lado a lado.

**Consequência esperada (além do CSS):** os defaults de layout gerados pelo Python provavelmente precisam mudar para a densidade do fonte — `pysrc/common/layout.Grid` e os `build_report.py` definem `h` (células de 80px) e a composição por linha. Ajustar:
- `.dash-grid`: `grid-auto-rows` / `gap` / padding do `#main` conforme a escala extraída;
- alturas default por tipo de widget (kpi-row, chart, find-block) nos builders, para que uma seção típica caiba em ~1 tela (1080p) como no fonte;
- relatórios existentes têm `layout.json` salvo — só novos/regenerados pegam os defaults; documentar isso e oferecer regeração dos relatórios de referência.

## Fase 6B — Widgets das análises (alinhar aos HTMLs fonte)

Todos os seletores mantêm o **mesmo nome de classe** — JSONs salvos em `output/` e `layout.json` não mudam. Referência: `backup/Ajsute de design/relatorio-secao-1.html`.

1. **find-block** (prioridade máxima): no read-path (`.dash-grid .find-block`, l.1089–1101, hoje achatado/transparente) → fundo suave colorido + **border-top 3px** colorido + borda 1px translúcida + radius `--r-md`, variantes via `:has(.find-tag-g/a/r)`; `.find-tag` 11px/900/tracking 2px sem pill. Neutralizar o `::before` stripe da base (l.733–737) no read-path.
2. **find-block--card** (usado nos Insights) → **icard do mockup**: card branco + `::before` left-stripe 5px na cor + `ic-tag` texto colorido tracking .14em + hover lift; `.fb-impl` → **takeaway** (fundo soft da cor + label pill cor cheia).
3. **kpi (.mr/.mi/.mv/.ml)**: já é a fonte; herda só token refresh.
4. **kpi-strip**: `kpi-n` sai do mono → Poppins 27px/800 (idem `.kc-val`); deltas: em `renderKpiStrip` (renderer.ts:~192), quando `subTone` é `pos|neg`, prefixar glyph `▲`/`▼` em `<span class="kpi-arw">` (campo já existe; JSONs antigos válidos).
5. **highlight (.hl)**: voltar ao padrão fonte — surface + borda hairline; variantes coloridas = borda na cor + fundo `-bg` (ajustar só `.dash-grid .hl`, l.1116–1130).
6. **heatmap**: `csp…cxn` (l.811–817) → hexes da fonte (`#97C459/#EAF3DE/#F1EFE8/#FCEBEB/#F0957B/#E24B4A` + fgs); escala legada `hm-hi…hm-lo` (l.800–806) re-tingida na mesma família — **nunca renomear classes** (valores `cls` vivem em datasets salvos). `heatClass()` no renderer não muda.
7. **qa-card**: fallbacks órfãos `var(--card,#f3f2fb)`→`var(--surface)`, hexes hardcoded→tokens; radius `--r-lg` + `--shadow-card`.
8. **funnel**: `FUNNEL_GRAD` (renderer.ts:~805) troca o ramo roxo off-brand (#534AB7…) pela rampa `#7C3AED→#C3A4F7`; pills `#fef3c7/#92400e`→`var(--amber-bg)/var(--tag-a)`.

## Fase 7 — Insights (zonas) + Perguntas norteadoras

- **Insights**: o JSON já mapeia 1:1 para o mockup (`eyebrow{color,title,caption}` = zone-hd; `find-block card:true` = icard; split "Implicação:" = takeaway). **Nenhuma mudança em build_report.py ou sXX.json.** CSS fino: `ge-i` 30px/radius 9px, `ge-t` 13px, grid já vem do layout.json. Opcional: glyph por cor (✓/↗/!) em `renderEyebrow` (prop opcional).
- **Perguntas** (`perguntas.ts` + CSS `pg-*` l.1552–1602) → padrão qcard do mockup `perguntas.html`: pill "Relevante" com check; `pg-kpis` (grid 3-col) → chips `"Label <b>valor</b>"` (surface + hairline + valor roxo/pos/neg); código P1…Pn por posição; `pg-btn` → `.btn-add` (verde pill flex:1) / `.btn-rem` (borda, vermelho hover); estados added (ring verde) / removed (grayscale); `pg-add` → `.btn-new` roxo pill.

## Fase 8 — Drawer de detalhamento

O deepen **já abre como drawer** (`.ic-overlay/.ic-dialog`, style.css:944–952) — é restyle + extensão:

1. **Restyle (CSS)**: scrim `rgba(28,16,46,.42)` + `backdrop-filter:blur(2px)`; header → `drawer-hd` com tag `◆ DETALHAMENTO` + título 19px/800 + fechar circular 32px; sombra `-20px 0 60px -20px rgba(46,8,75,.4)`; largura `min(640px, 94vw)` (mockup usa 460px, mas detalhamentos têm charts/tabelas — adaptação consciente).
2. **Botão "Ver detalhamento"**: em `renderFindBlock` (renderer.ts:~745–761) trocar o link `a.fn-link "↗ ver detalhamento"` pelo `ver-btn` do mockup (pill + chip circular roxo com seta SVG); manter `dataset.modal` (wiring `wireModals` intacto) e manter `.fn-link` como alias CSS p/ HTMLs exportados antigos. Idem `markDeepen` (main.ts:~535–559).
3. **Det-sections das perguntas no drawer (TS, main.ts)**: extrair de `renderModal` (main.ts:~617) um `openDetailDrawer({title, widgets, historyId, footer})` (mesmo pipeline de charts lazy + rating). `abrir(p)`/pós-`seguir` (main.ts:~449–483): em vez de `go('detalhamentos', det.section)`, fazer `api.getSection(id)` e renderizar no drawer com rodapé rating + Revisar/Descartar. **Manter a página Detalhamentos** (deep-link/export HTML dependem dela); o drawer vira o caminho primário.

Sem rota/API nova — `GET section`, `POST deepen/perguntas/seguir` já cobrem tudo.

---

## Riscos

- 6 pontos com `48px`/`88px` hardcoded encadeados ao topnav (fase 3) — todos listados acima.
- `#filter-modal` precisa continuar cobrindo a viewport (click-away handler compara `e.target === modal`).
- Classes de heatmap (`cls`) salvas em `dataset.json` — só re-tingir, nunca renomear.
- `.card` global (l.699, padding 36px 40px) é compartilhado com widgets — não tocar.
- `layout.json` salvo (gridstack): find-block com padding/borda novo pode mudar altura — testar editor de layout.
- HTMLs exportados antigos têm CSS inline congelado — não afetados; checar se o export inlina o logo novo.
- Regras do CLAUDE.md raiz (proibições de stripe/gradiente) valem para o pipeline de slides (`components/`), não para o app — o DS Witly do app usa left-stripe 5px nos icards por design.

## Ordem de execução

F0 → F1 → F2 → F3 → F4 → F5 → **F5B (IA/UX: admin, home, tiers)** → **F6A (auditoria comparativa)** → F6B → F7 → F8 (análises). Cada fase é deployável isoladamente. As fases 6B–8 só fecham quando o lado a lado com o fonte da F6A for satisfatório (espaçamento, clareza, densidade — uma seção típica cabendo numa tela). O mapeamento de tiers da F5B é confirmado com o usuário antes de aplicar.

## Verificação (por fase e final)

1. `cd app && npm run build && npm test` + `npx tsx scripts/validate.ts <cliente>/<slug>` num relatório existente.
2. **UI real com cliques/screenshot antes de commitar** (regra do projeto): subir servidor (AUTH_DISABLED) e capturar:
   - Home, uma tela gerar e uma montador (voltar à esquerda, presente nas 4 corrigidas).
   - `/report/<cliente>/<slug>?static` — topnav 60px, section-bar, sidebar (criativos), FAB aberto nas 3 variantes (filtros / criativos / historico).
   - Find-blocks/KPIs/heatmap comparados lado a lado com `backup/Ajsute de design/relatorio-secao-1.html` e `relatorio-aba-por-categoria.html` abertos em `file://`.
   - Insights vs `relatorio-secao-10-insights.html` + mockup `insights.html`; Perguntas vs mockup `perguntas.html`.
   - Fluxo drawer completo: seguir pergunta → drawer abre → rating/Revisar/Descartar → página Detalhamentos íntegra.
   - Modo Layout (editar/salvar), print preview, export HTML.
3. Regressão final: regenerar 1 análise por tipo registrado no `typeRegistry` e screenshot de cada.

## Arquivos críticos

- `app/public/style.css` (~70% do trabalho: tokens + chrome + widgets)
- `app/public/js/page-chrome.js` (voltar à esquerda)
- `app/public/report.html`, `app/public/index.html`, `gerar-*.html`/`montador-*.html`
- `app/src/client/renderer.ts` (ver-btn, kpi-strip ▲▼, FUNNEL_GRAD, eyebrow glyph)
- `app/src/client/main.ts` (openDetailDrawer, markDeepen, fluxo perguntas)
- `app/src/client/perguntas.ts` (qcards)
- `app/src/client/charts.ts` (getBase, tooltip)
- `app/src/client/filters.ts` (sem mudança de lógica; referência do shell)
