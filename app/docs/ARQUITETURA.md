# Arquitetura — mapa as-is (revisão de 02/07/2026)

Visão de arquitetura do repositório. O **como trabalhar** (contratos, regras, convenções)
vive em [../CLAUDE.md](../CLAUDE.md); este doc é o **mapa**: o que existe, onde, e as
dívidas conhecidas. Ao mudar rotas/módulos/motores, atualize aqui.

---

## Topologia do repositório

```
presentation_generator/
├── app/          ← o sistema principal (este doc)
├── backup/       ← insumos e artefatos históricos (skills antigas, CSVs de cliente, esboços)
├── output/       ← análises geradas (JSONs de relatório por cliente/slug)
└── temp/         ← drivers e temporários de sessão (det_driver.mjs etc.)
```

**Gitignored (LGPD — dado de cliente nunca versionado):** `backup/`, `output/`, `temp/`,
`input/`, `*.csv`, `*.db`, `app/.env`, `app/data/` (SQLite + logs Claude), `app/.base/`
(dado-base retido por análise), `app/.scratch/` (uploads transitórios). O repositório
versiona **código e docs**; todo dado é local e regenerável.

**Sistemas que convivem no repo:**

| Sistema | Onde | O quê |
|---|---|---|
| **App analytics** | `app/` | Servidor Express TS + client TS + motores Python — o core |
| Pipeline de apresentações | `.claude/skills/{plan-slides,build-slides,make-design}` | Análise → Reveal.js / elementos de design |
| Skills de análise | `.claude/skills/{ltv-analysis,conversao-perfil}` | Análises geradas por skill (a conversao-perfil tem motor próprio — ver Dívidas) |
| Procedimentos | `.claude/skills/{setup,integrar-analise,verificar-motor}` | Subir o app · integrar tipo novo · auditar motor de deepen |

---

## Servidor — `app/src/server/`

Express (porta 3131; `PORT`/`AUTH_DISABLED` p/ dev). `app.ts` é a factory que registra
20 módulos de rota (~60 endpoints). Estado em SQLite (`data/comments.db`): users,
posse de clientes, edições, histórico de deepen/perguntas.

### Rotas por fluxo

| Fluxo | Endpoints |
|---|---|
| **Geração** | `POST /api/:c/:s/generate` · `POST …/update` · `GET …/base-config` · `POST /api/inspect-csv` |
| **Conteúdo do relatório** | `GET …/data` · `GET …/dataset` · `GET …/section/:id` · `GET /report/:c/:s` (shell) |
| **Layout & edição** | `GET/PUT/DELETE …/layout` · `PATCH …/section/:secId` (prosa) · `GET …/edits(.csv)` · `GET /api/edits(.csv)` |
| **Recompute interativo** | `POST …/render` (+ alias legado `POST …/historico/render`) |
| **Deep queries** | `POST …/query` (whitelist de fns via registry/buildDeepenMeta) |
| **Deepen / detalhamento** | `POST …/section/:secId/deepen` · `…/deepen/:historyId/{rate,aprovar,replay}` · `…/det/:sectionId/{revisar,descartar}` · `GET /api/deepen-history` |
| **Perguntas norteadoras** | `GET …/perguntas` (auto-deriva do dataset) · `POST …/perguntas/:pid/{seguir,ignorar}` · `…/perguntas/custom` · `…/perguntas/recalc` · `GET …/perguntas/historico` |
| **Home & multi-tenant** | `GET /api/analyses` · `GET/POST /api/clients` · `GET/POST /api/temp-default` · users CRUD (`/api/users*`) · `POST /auth/{login,logout}` · `GET /auth/me` |
| **Operação** | `GET …/watch` (SSE live-reload) · archive (`/api/archive*`) · benchmarks (`/api/benchmarks`) · log Claude (`/api/claude-log*`) · shells `/guia/:s` `/montador/:s` `/cliente/:s` |

### Módulos principais

| Módulo | LOC | Papel |
|---|---|---|
| `claude.ts` | 857 | Wrapper da Anthropic API: prompts/schemas, retry+backoff, pricing, mock offline, log JSONL — **maior módulo do servidor** (ver Dívidas) |
| `typeRegistry.ts` | 285 | Fonte única dos 5 tipos: pysrcDir, caps (`supportsTemperature/Goals/Dict`, `goalsUi`), `controlsKind`, `buildDeepenMeta` |
| `pygen.ts` | 174 | Spawna os motores Python (build/render/query/perguntas) com semáforo + lock por análise; força UTF-8 |
| `deepenLoop.ts` / `deepenQuality.ts` / `deepenHistory.ts` | ~450 | Gate de qualidade do deepen (máx 3 tentativas) + checks determinísticos + telemetria/few-shot |
| `auth.ts` / `db.ts` | ~340 | Sessão scrypt + SQLite (BetterAuth adiado — [futuro-betterauth.md](futuro-betterauth.md)) |
| `datasetCatalog.ts` · `layoutAudit.ts` · `cardContext.ts` · `detalhamento.ts` · `creditError.ts` | — | Digest p/ o modelo · auditoria de grid · contexto de card · detalhamentos em massa · 402 de crédito |

**Fluxos:** `generate` → valida config (registry) → `pygen` roda `build_report.py` → retém
base em `.base/` → deriva `perguntas.json`; `render`/`query` rodam sobre a base retida;
`deepen` monta contexto (catalog+card) → Claude com tool `consultar` → gate → persiste seção.

---

## Client — `app/src/client/` (compilado por `tsc` p/ `public/js/`, ES modules, sem bundler)

| Módulo | LOC | Papel |
|---|---|---|
| `renderer.ts` | 1991 | `renderWidget` switch — único lugar com classes CSS; **37 widgets** (lista canônica em [WIDGETS.md](WIDGETS.md) + `src/shared/types.ts`); `safeHtml()` sanitiza prosa inline |
| `main.ts` | 1290 | Bootstrap, roteamento, `controlsRegistry` (kind → mount + body do recompute), SSE, modais, edição |
| `charts.ts` | 630 | buildOptions ApexCharts (dual-axis, formatos pt-BR) |
| `dashboard.ts` | 429 | Grid CSS 12-col + editor de layout (Gridstack sob demanda) |
| `navigation.ts` | 307 | Top-nav ou sidebar (`meta.nav`) |
| `filters.ts` + `controls-utils.ts` + 3 `*-controls.ts` | ~470 | Filtro genérico client-side · primitivas de FAB · controles type-specific (historico/criativos/debriefing) |
| `api.ts` · `store.ts` · `perguntas.ts` · `format.ts` · `trend.ts` | ~430 | HTTP tipado · estado · board de perguntas · formatadores · regressões p/ scatter |

`src/shared/` (compilado p/ os DOIS alvos): `types.ts` (37 widgets), `validate.ts`
(validação das 3 camadas), `bind.ts` (`resolveBind` puro — número só via bind).

---

## Motores Python — `app/pysrc/`

| Tipo | calc | build_report | render_view | query_api | banco de perguntas |
|---|---|---|---|---|---|
| conversao-perfil | (conv_calc 466) | 429 | — ¹ | 185 | 472 |
| historico-lancamentos | 235 | 436 | 35 | 127 | 550 |
| criativos | 288 | 362 | 39 | 133 | 338 |
| acompanhamento-lancamento | 635 | 528 | — ¹ | 275 | 300 |
| debriefing-lancamento | 876 | **1721** | 64 | 432 | 408 |

¹ sem controles interativos → sem `render_view.py` (deliberado; assemble já é puro se um dia ganharem).

**`common/`** (compartilhado): `layout.py` (Grid packer) · `fmt.py` (formatadores pt-BR) ·
`preserve.py` (edições sobrevivem à regeração) · `report.py` (builders eb/fb/table/km/ks +
motor goalCmp) · `temp.py` (regras de temperatura) · `query_core.py` (consultas genéricas
sobre FRAME uniforme). Convenções (assemble puro, preserve no build, UTF-8 no stdout,
`build_frame(ctx, a)`, tabela de `opts` por tipo, decisões de KPI card): [../CLAUDE.md](../CLAUDE.md).

`perguntas/`: `perguntas_calc.py` (relevância determinística) + `banks/<tipo>.py`
(TYPE/detect/evaluate_all por tipo).

---

## Dívidas conhecidas (registradas, não resolvidas — backlog em [../TAREFAS.md](../TAREFAS.md))

1. **Skill /conversao-perfil divergente** — `.claude/skills/conversao-perfil/{build_report,conv_calc}.py`
   (~870 LOC) é o motor de origem, standalone; o canônico é `pysrc/conversao-perfil` (evoluiu
   com `common/`). Decidir: skill delega ao pysrc ou é congelada com aviso.
2. **Módulos gordos** — `renderer.ts` (1991, switch de 37 widgets), `debriefing build_report.py`
   (1721), `main.ts` (1290), `claude.ts` (857). Funcionais e testados; refactor é projeto próprio.
3. **Alias legado** `POST /api/:c/:s/historico/render` — o client usa `/render`; manter até
   confirmar que nada externo chama, depois remover.
4. **Motores Python sem testes golden** — a suíte (149 testes) cobre TS; regressão de motor é
   pega por regeração + deep-compare manual (critério das Fases 1–2).
5. **Bancos de perguntas hardcoded** — 5 arquivos de 300–550 LOC; ok hoje, avaliar data-driven
   se o volume crescer.
