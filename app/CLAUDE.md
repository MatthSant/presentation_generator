# App de Analytics (`app/`)

Servidor Node/Express (porta **3131**) que renderiza **qualquer análise** a partir de um
modelo de dados genérico. Cada **tipo de análise** é um cidadão de primeira classe:
um motor Python determinístico gera as camadas de dados, o client TS as renderiza.

> **Tarefas atuais:** [TAREFAS.md](TAREFAS.md).
> **Como integrar um tipo novo:** skill `/integrar-analise` (`.claude/skills/integrar-analise/`)
> — este doc é o mapa; a skill é o procedimento passo-a-passo.

---

## Modelo de dados — 3 camadas + navegação

Toda análise no `output/<cliente>/<slug>/` é descrita por:

| Arquivo | Papel |
|---|---|
| `dataset.json` | **Números** em formato longo: `nome → { dims:[…], filters:[], rows:[…] }`. Única fonte de verdade numérica. |
| `sXX.json` | **Widgets** de cada seção: `{ id, header, widgets:[…] }`. Widgets nunca carregam número — fazem `bind` a uma tabela do dataset. |
| `layout.json` | **Grid** por seção: `{ sections:{ sXX:[{ i, x, y, w, h }] } }` (12 colunas). |
| `data.json` | **Navegação + meta**: `{ meta:{ client,title,type,theme,controls,nav? }, pages:[{ id,label,sections:[…] }] }`. |
| `comments.csv` | Anotações do consultor (preservadas entre regerações). |

**Princípio:** o LLM escreve **prosa** (headers, insights); **número só via `bind`** a uma
linha do `dataset`. Isso impede o modelo de inventar valores. Ver `src/shared/bind.ts`.

---

## Pipeline de um tipo de análise

```
CSV  →  pysrc/<tipo>/calc.py        (stdlib pura: agrega, calcula indicadores)
     →  pysrc/<tipo>/build_report.py (assemble → {dataset, data, layout, sections} → grava)
     →  output/<cliente>/<slug>/*.json
     →  client TS renderiza no /report/<cliente>/<slug>
```

- **`calc.py`** — sem pandas. Lê CSV (`csv.DictReader`), devolve estruturas Python. O número nasce aqui.
- **`build_report.py`** — contrato:
  ```python
  def assemble(rows, config, content, opts=None):  # puro → {dataset, data, layout, sections}
  def build(csv_path, config, content, out_dir):    # carrega CSV, chama assemble, grava
  ```
  Usa `common/layout.Grid` (packer de **linha única** — sem auto-wrap; layout multi-linha
  precisa de coords manuais `x/y`), `common/fmt` (formatadores pt-BR) e
  `common/preserve.preserve()` (não perde trabalho do consultor numa regeração).
- **`render_view.py`** *(opcional)* — recompute da vista quando há **controles interativos**
  (toggles/filtros). Rota genérica `POST /api/:client/:slug/render`.
- **`query_api.py`** *(opcional)* — cruzamentos sob demanda do **deep deepen**. As
  consultas genéricas (`series`/`correlacao`/`trend`/`ranking`) vivem em
  **`common/query_core.py`** e operam sobre um FRAME uniforme (`{axis, rows:[{key,m}],
  labels, cost}`); cada tipo só fornece um `build_frame(ctx,args)→frame` + suas funções
  específicas e roteia com `qc.run(build_frame, EXTRA, ctx, fn, args)`. **Consulta
  genérica nova = editar só `query_core.py`** + listá-la em `genericFuncoes()` no
  registry — nunca reimplementar por tipo.

**Despacho:** `src/server/pygen.ts` resolve `buildScript = pysrc/<pysrcDir>/build_report.py`
a partir do registry — **nenhum if/else por tipo** no servidor.

---

## Registro de tipos — `src/server/typeRegistry.ts`

Adicionar um tipo = **uma entrada em `TYPES`** + a pasta `pysrc/<tipo>/`. Campos da
`AnalysisTypeDef`: `type`, `label`, `pysrcDir`, `validateConfig`, `supportsInsights`,
`queryScript?`, `renderScript?`, `gerarPage`, `montadorPage`, `controlsKind?`,
`buildDeepenMeta()`. `buildDeepenMeta` retorna `null` → deepen roda no **modo raso** (catálogo).

Tipos hoje: `conversao-perfil`, `historico-lancamentos`, `criativos`.

---

## Client TS — `src/client/`

| Arquivo | Papel |
|---|---|
| `main.ts` | Bootstrap, store, roteamento de páginas, despacho de controles por `meta.controls.kind`. |
| `renderer.ts` | `renderWidget` switch — **único lugar com classes CSS** dos widgets. |
| `navigation.ts` | Top-nav (default) e **sidebar** quando `meta.nav==='sidebar'` (`buildSide`). |
| `charts.ts` | `buildOptions` ApexCharts (isDark dinâmico, dual-axis via `secondaryAxis`). |
| `*-controls.ts` | Controles type-specific montados no FAB (ex.: `criativos-controls.ts`, `historico-controls.ts`). |
| `api.ts` | Cliente HTTP (`renderView`, etc.). |

**Widgets** (`src/shared/`): registrar em `types.ts` (`WIDGET_TYPES` + união `Widget`),
validar em `validate.ts` (`validateWidget` switch), renderizar em `renderer.ts`, estilizar
em `public/style.css`. Widgets de plataforma incluem: kpi-row, chart, heatmap, find-block,
embed, link-card, scatter-picker.

---

## Features de plataforma (generalizadas, opt-in via `meta`)

Regra dura: **toda feature nova entra como recurso reutilizável**, nunca `if tipo==='x'`.

- **Nav lateral:** `data.json.meta.nav: 'topnav' | 'sidebar'` (default `topnav`).
- **Controles interativos:** `meta.controls.{kind, …}` → FAB no client + `render_view.py` no motor.
- **Deepen / Detalhamentos:** fluxo de aprofundamento com gate de validação (máx 3 tentativas),
  telemetria em `deepen_history`. Ver `src/server/{deepenLoop,deepenQuality,deepenHistory}.ts`.
  O **motor de deep mode** por tipo (`pysrc/<tipo>/query_api.py` + `common/query_core.py`):
  para auditar/melhorar (cobertura, funções, relevância, simulação sem crédito) use a skill
  **`/verificar-motor`**; o acumulado vive em [docs/motor-deepen-review.md](docs/motor-deepen-review.md).
- **Perguntas norteadoras:** banco por tipo em `pysrc/perguntas/banks/<tipo>.py`
  (`TYPE`/`detect`/`evaluate_all`) registrado em `banks/__init__.py`.

---

## Formatação numérica — `pysrc/common/fmt.py`

`money` (abrevia: M/k/inteiro), `pctf` (`12,3%`), `xf` (`1,42×`), `intf`, `fmtval(fmt,x)`.
⚠️ `money()` hoje arredonda valores baixos para inteiro (`R$ 14`) — métricas como **CPM/CPL
precisam de 2 casas** (ver tarefa #16 em [TAREFAS.md](TAREFAS.md)).

---

## Multi-tenant & validação

- **Posse:** a home lista só análises de clientes que o consultor **possui** (`user_clients`).
  O fluxo `/generate` (UI) faz `assignClient` automático; gerar por script deixa o cliente
  **órfão** (renderiza em `/report/...` mas não aparece na home) → atribuir manualmente.
- **Usuários & papéis:** `users.role` (`admin` | `consultor`). Admin gerencia usuários em
  `/usuarios.html` (`routes/users.ts`, guard de admin; CRUD + reset de senha + atribuir
  clientes). O consultor-semente (`SEED_EMAIL`) vira admin no bootstrap. BetterAuth está
  adiado — ver [docs/futuro-betterauth.md](docs/futuro-betterauth.md).
- **Validar:** `cd app && npx tsx scripts/validate.ts <cliente>/<slug>` → 3 camadas válidas;
  `npm run build` (TS limpo); `npm test`.
- **Testar na UI real** (cliques/screenshot) antes de commitar — não só curl/mock.

---

## Estrutura de pastas

```
app/
├── server.js / src/server/   ← Express, rotas, registry, pygen, deepen, auth, db
├── src/client/               ← renderer, navigation, charts, controls, api
├── src/shared/               ← types, validate, bind (contrato de widgets)
├── pysrc/
│   ├── common/               ← layout (Grid), fmt, preserve  (compartilhado)
│   ├── <tipo>/               ← calc.py + build_report.py (+ render_view/query_api)
│   └── perguntas/banks/      ← bancos de perguntas norteadoras por tipo
└── public/                   ← index.html, report.html (shell), style.css, gerar-*/montador-*
```
