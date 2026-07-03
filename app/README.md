# Analytics App

TypeScript server + client that renders analyses as a **modular dashboard**. An
analysis is plain JSON in three layers; the dashboard composes widgets on a CSS
grid. No bundler — `tsc` emits native ES modules.

> Architecture map (routes, modules, Python engines, known debt):
> [docs/ARQUITETURA.md](docs/ARQUITETURA.md). Working contract & rules:
> [CLAUDE.md](CLAUDE.md). Widget catalog: [docs/WIDGETS.md](docs/WIDGETS.md).

## The 3-layer data model

Each analysis lives in `output/<client>/<slug>/`:

| Layer | File(s) | Owner | Holds |
|---|---|---|---|
| 1 — **dataset** | `dataset.json` | Python engine (`pysrc/<type>/`) | numbers only: long-format tables with `dims`, `filters`, `rows` |
| 2 — **view** | `s01.json`, `s02.json`, … | Python engine (deterministic prose) + LLM only for insights/deepen | a flat list of widgets; numeric widgets reference data via `bind` |
| 3 — **layout** | `layout.json` | engine / layout editor | 12-col grid coordinates per widget id |
| nav | `data.json` | engine | `meta` (client/title/controls/nav) + `pages` → `sections` map |

The LLM never transcribes numbers into the view. A widget says *what* to show
(`bind: { dataset, x, y, series, metrics, agg }`) and `resolveBind`
(`src/shared/bind.ts`) turns that into chart series / table rows / kpi totals
against the dataset and the active filters — the same pure function on server
and client.

```
dataset.json ──┐
               ├─ resolveBind(bind, datasets, activeFilters) ─→ { categories, series, rows, totals }
sXX.json bind ─┘
```

## Run it

```bash
npm install
npm run build      # tsc → dist/ (server) + public/js/ (client)
npm start          # http://localhost:3131
```

Analyses are generated locally (`output/` is gitignored — client data never ships
with the repo); create one via the home (`/gerar-*.html`) or a generator script.

Dev mode (watch server + client):

```bash
npm run dev
```

## Scripts

| Script | What |
|---|---|
| `npm run build` | compile server (`tsconfig.server.json`) + client (`tsconfig.client.json`) |
| `npm run typecheck` | `tsc --noEmit` over src + test + scripts |
| `npm test` | node:test + supertest + jsdom (server routes + client render path) |
| `npm run coverage` | same, with c8 text + html report |
| `npm run lint` | ESLint (flat config, type-aware) |
| `npm run validate -- <dir>` | validate one analysis folder, or all under `output/` |

## Architecture

```
src/
├── shared/          compiled to BOTH targets; the contract
│   ├── types.ts     the 3-layer types + widget union
│   ├── bind.ts      resolveBind — pure, dependency-free
│   └── validate.ts  runtime validation (layer/path/message errors)
├── server/          Express, emitted to dist/
│   ├── app.ts       createApp({ out?, db?, auth? }) factory → { app, ctx, close }
│   ├── routes/      20 modules, ~60 endpoints — full table in docs/ARQUITETURA.md
│   ├── typeRegistry.ts  single source for the 5 analysis types (caps, deepen meta)
│   ├── pygen.ts     spawns the Python engines (build/render/query)
│   └── db.ts        better-sqlite3 (users, ownership, edits, deepen history)
└── client/          emitted to public/js/, native ES modules
    ├── main.ts      bootstrap + controlsRegistry (meta.controls.kind → FAB controls)
    ├── store.ts     single mutable state holder
    ├── dashboard.ts CSS-grid tile placement + layout editor (Gridstack on demand)
    ├── renderer.ts  widget → DOM (the only module that knows design-system classes; safeHtml)
    ├── charts.ts    ApexCharts option builder + live-instance manager
    ├── navigation.ts / filters.ts / controls-utils.ts / *-controls.ts   UI modules
    └── api.ts       typed fetch wrappers
```

**Render model.** The read path is a plain 12-col CSS grid built from
`layout.json` — it does not depend on Gridstack to display, and collapses to a
single column under 860px. Gridstack loads when the layout editor opens. A filter
that empties a widget shows a per-widget empty state rather than removing the card.

**Filters.** Declared in `data.json` → `meta.filters`. The FAB (bottom-right)
opens a modal of segmented controls; a pick mutates active filters, re-resolves
binds in place (charts animate via `updateSeries`; kpi/table/heatmap re-render),
and round-trips through the URL querystring so a filtered view is shareable.

**Comments & edits** persist in SQLite (`data/comments.db` by default), exposed
read-only as CSV. Live editing of the source JSON triggers an SSE reload of the
open section.
