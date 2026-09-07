# Plano: Fase 1 — MCP de templates

**Branch**: `feat/mcp-templates` · **Data**: 2026-09-07 · **Spec**: [spec.md](spec.md)

## Resumo

Um Worker na Cloudflare que é ao mesmo tempo servidor MCP (Streamable HTTP, login Google
via `workers-oauth-provider`) e UI de edição de templates, com D1 como base. O template
`acompanhamento-diario` nasce de um seed que extrai do app atual o cálculo Python, o SQL
dos montadores e os textos de guia. O `gerar.py` do kit produz um HTML standalone
embutindo o JSON das 4 camadas num **viewer** (o client TS do app empacotado com esbuild)
que renderiza na abertura, sem servidor.

## Contexto técnico

| | |
|---|---|
| Linguagem | TypeScript (Worker + UI) · Python 3.8+ stdlib (templates) |
| Dependências | `agents` (McpAgent), `@cloudflare/workers-oauth-provider`, `hono`, `zod`, `fflate` (zip); dev: `wrangler`, `vitest` + `@cloudflare/vitest-pool-workers`, `esbuild` (viewer) |
| Armazenamento | D1 (tudo textual) · KV (`OAUTH_KV`, estado OAuth) · Workers Assets (UI estática + viewer) |
| Testes | Vitest no pool de Workers (D1/DO reais em miniflare) · `unittest` no Python |
| Plataforma | Cloudflare Workers, `workers.dev` |
| Limites | linha D1 ≤ 1 MB → cada arquivo do kit é uma linha própria; viewer (~1 MB) fica em Assets, não em D1 |
| Escopo | 1 org, 1 template, dezenas de usuários |

## Verificação da constituição

| Princípio | Plano |
|---|---|
| I. Inteligência, não compute | Worker só serve texto/zip; Python roda na máquina da pessoa. |
| II. PII nunca | D1 recebe só o que o editor digita; seed não copia CSV nem `.base/`. Exemplo do seed é um HTML gerado de base **sintética** (fixture), não de cliente. |
| III. Número no calc | `gerar.py` = `calc.py` + `build_report.py` do app; `numeros.json` sai do calc. |
| IV. Contexto por análise + gerais curados | tabelas `context_tasks` (por versão) e `general_contexts`. |
| V. Template autossuficiente | O zip do kit roda sozinho (python/ + viewer/); teste US4.2 prova. |
| VI. Uma plataforma, login Google | Um Worker; OAuth provider p/ MCP; cookie assinado p/ UI com o mesmo Google. |
| VII. Genérico | Nenhum código referencia `acompanhamento-diario` fora do seed. |
| VIII/IX. Spec-driven, testes | Este plano + tasks.md; teste por cenário. |

Sem violações → tabela de complexidade vazia.

## Decisões de desenho

### D1. Onde o MCP e a UI moram no mesmo Worker

```
OAuthProvider({
  apiRoute: '/mcp', apiHandler: TemplatesMcp.serve('/mcp'),
  authorizeEndpoint: '/authorize', tokenEndpoint: '/token', clientRegistrationEndpoint: '/register',
  defaultHandler: app   // Hono: /authorize (Google), /callback, /ui/*, /api/*, /dl/*
})
```
`assets.run_worker_first: ['/mcp*','/authorize','/token','/register','/callback','/api/*','/dl/*','/ui/*']`;
o resto (`/`, `/app.js`, `/style.css`, `/viewer/*`) sai de `public/` como asset.

### D2. Identidade e acesso

- Callback do Google: lê `email`/`name`; regra: domínio em `ALLOWED_DOMAIN` **ou** e-mail
  em `users` com `active=1`. Fora disso → página "peça acesso" (200, sem
  `completeAuthorization`). Dentro → upsert em `users` (papel `leitor` se novo) →
  `completeAuthorization({ props: { email, name } })`.
- Toda tool revalida: `users.active` para `this.props.email` (uma query D1). Removido →
  erro `unauthorized`.
- UI: `/ui/login` → mesmo Google (`hd` do domínio) → `/ui/callback` → cookie
  `__Host-session` assinado (HMAC, `COOKIE_ENCRYPTION_KEY`) com e-mail+papel+exp.
  `/api/*` exige cookie; escrita exige papel `editor`. `EDITOR_SEED` (env) promove o
  primeiro editor no boot.

### D3. Modelo de dados (D1)

```sql
orgs(id, name)
users(email PK, name, org_id, role 'editor'|'leitor', active, created_at)
templates(slug PK, org_id, name, objective, when_to_use, published_version_id NULL, draft_version_id NULL)
template_versions(id, slug, number, state 'draft'|'published', author_email, created_at, published_at, manifest_json)
template_files(version_id, path, content TEXT, PK(version_id,path))   -- queries/*.sql, python/**/*.py, documento.md, guia.md, exemplo.html
context_tasks(version_id, task_id, title, body_md, sort, PK(version_id,task_id))   -- a página detalhável
general_contexts(slug PK, title, body_md, author_email, updated_at)
usage_log(id, email, tool, slug, version_number, at)
```
Rascunho = cópia integral da versão publicada (`number+1`, `state='draft'`); salvar
edita o rascunho in-place; publicar troca `published_version_id` e limpa
`draft_version_id`. Sem merge (spec: último salva vence, com aviso via `updated_at`).

### D4. Formato do kit e o problema do tamanho

`obter_template` devolve **texto** para o que o modelo precisa ler (manifesto, tarefas
de contexto, queries, guia, documento, contextos gerais; ~30–50 KB) e uma **URL de
download assinada** (`/dl/<slug>/<n>?t=<hmac,exp 15min>`) de um zip com o kit inteiro:
os textos + `python/` + `exemplo.html` + `viewer/`. O agente faz `curl -o kit.zip`. Python
e viewer nunca passam pelo contexto do modelo. O zip é montado no Worker com `fflate`
a partir de D1 + `viewer/` dos Assets.

`montar_query(slug, params)`: lê `manifest.params` (nome, tipo, obrigatório, tarefa que o
produz), valida, escapa (`'` → `''`; números só `[0-9.]`; identificadores só
`[A-Za-z0-9_-]`) e substitui `{{param}}`. Sobrou `{{` → erro.

### D5. O viewer (HTML standalone a partir de Python)

O exportador do app captura DOM já renderizado, o que exige navegador. Em vez disso:

- Novo entry no app: `app/src/client/standalone.ts` (~150 linhas). Lê `window.__REPORT =
  {data, dataset, sections, layout}` e monta a página com os módulos existentes
  (`dashboard`/`renderer`/`charts`/`navigation`/`bind`), sem `api.ts`: sidenav pelas
  páginas, uma seção visível por vez, charts via `ChartManager`. Nada de deepen,
  perguntas, edição.
- `witly-templates/scripts/build-viewer.mjs`: `esbuild --bundle --format=iife` do
  standalone + concatena `style.css` + fontes Exo 2 como data URI + `apexcharts.min.js` →
  `public/viewer/viewer.js` e `viewer.css`. Roda no `npm run build`.
- `gerar.py` (no kit): roda `build_report.build()` → 4 camadas em `out/` → lê `viewer/`
  → escreve `out/relatorio.html` = shell + `<style>` + `<script>window.__REPORT=…</script>`
  + `<script>viewer.js</script>`. Um arquivo, abre offline.

### D6. Python do kit

```
python/
  gerar.py            ← CLI: gerar.py config.json dump.csv --out DIR [--dict d.csv --goals g.csv]
  calc.py             ← cópia de pysrc/acompanhamento-lancamento/calc.py
  build_report.py     ← idem
  query_api.py        ← idem (consultas locais: o agente pode aprofundar sem o app)
  common/{__init__,layout,fmt,preserve,report,temp,query_core}.py
  tests/test_calc.py + tests/fixture.csv  (sintético, ~40 linhas × 5 dias × 2 origens)
```
`gerar.py` também grava `numeros.json` (o dict de `calc.build()` sem `rows_corte`) para o
agente ler números sem abrir o HTML.

### D7. Seed (US4)

`scripts/seed.mjs` lê do monorepo: `app/pysrc/{acompanhamento-lancamento,common}`, o SQL
dos `montador-acompanhamento.html` (extraído para `seed/acompanhamento-diario/queries/*.sql`
uma vez, versionado aqui), `guias.json` + o `focus` do deepen (`claude.ts`) → `guia.md`
(revisado à mão), `manifest.json` e `contexto/*.md` escritos à mão em
`seed/acompanhamento-diario/`. Gera SQL de INSERT e aplica com `wrangler d1 execute`
(`--local` e `--remote`). O exemplo é gerado rodando `gerar.py` sobre a fixture.

### D8. Testes

- Worker (`test/*.test.ts`, pool de Workers): `montar_query` (escape, faltantes,
  `{{` residual), tools contra D1 semeada em `beforeAll`, gate de acesso (domínio, ativo,
  removido), publicado × rascunho, contextos gerais no kit, `usage_log`, assinatura de
  `/dl`, API da UI (papéis).
- Python (`python -m unittest` dentro do kit): KPIs macro da fixture com valores
  esperados fixos; `numeros.json` cobre os placeholders de `documento.md`; `gerar.py`
  produz HTML com `__REPORT` válido.
- Paridade com o app (US4.2): script `scripts/parity.mjs` roda `gerar.py` e o
  `build_report.py` do app sobre a fixture e compara `dataset.json` deep-equal.
- Manual obrigatório (constituição IX): instalar em Claude Code, Claude.ai e Codex;
  editar/publicar na UI.

## Estrutura

```
witly-templates/
├── PLANO.md · constitution.md · specs/001-fase1-mcp-templates/{spec,plan,tasks}.md
├── package.json · wrangler.jsonc · tsconfig.json · vitest.config.mts
├── migrations/0001_init.sql
├── src/
│   ├── index.ts            OAuthProvider + export do McpAgent
│   ├── mcp.ts              TemplatesMcp (tools + resources)
│   ├── app.ts              Hono: google auth, ui session, /api, /dl
│   ├── auth/{google.ts, session.ts, access.ts}
│   ├── db/{schema.ts, templates.ts, users.ts, usage.ts}
│   ├── kit/{montar-query.ts, zip.ts, sign.ts}
│   └── oauth-utils.ts      (do demo da Cloudflare)
├── public/{index.html, app.js, style.css, viewer/}
├── scripts/{build-viewer.mjs, seed.mjs, parity.mjs}
├── seed/acompanhamento-diario/{manifest.json, contexto/, queries/, documento.md, guia.md}
├── seed/general-contexts/numeros-pequenos.md
└── test/*.test.ts
app/src/client/standalone.ts   (novo, no app)
```

## Mudanças na implementação (spec ancorada)

- **Exemplo como JSON, HTML sintetizado.** `exemplo.html` teria ~1 MB (99% viewer) e
  estouraria a linha do D1. O kit guarda `exemplo/{data,dataset,layout,sXX,numeros}.json`
  e o Worker sintetiza `exemplo/relatorio.html` ao montar o zip (`kit/zip.ts`), com o
  mesmo shell que o `gerar.py` usa. Zero duplicação do viewer.
- **Motor copiado por script, não versionado duas vezes.** `scripts/kit-assemble.mjs`
  copia `app/pysrc/<engine>` + `common/` para `seed/<slug>/python/` (gitignored). Fonte
  única = o app; `scripts/parity.mjs` prova igualdade.
- **Tools puras em `kit/tools.ts`**, o `McpAgent` só registra. Testes cobrem as tools
  sem transporte MCP; o transporte real é validado no teste manual T017.
- **`PUBLIC_URL`** (var) é a base das URLs assinadas: o McpAgent não vê a request.
- **Pool de Workers não isola D1 entre testes do mesmo arquivo** nesta versão: testes
  usam slugs únicos.
- **Dependências verificadas** (publisher/repositório/licença/downloads semanais):
  Cloudflare oficial (`agents`, `workers-oauth-provider`, `vitest-pool-workers`,
  `workers-types`, `wrangler`), `hono` (honojs, 45M/sem), `zod` (247M/sem), `fflate`
  (53M/sem), `esbuild` (242M/sem), `@modelcontextprotocol/sdk` (org oficial, 48M/sem),
  `vitest`, `typescript`. Todas MIT/Apache-2, versões pinadas.

## Riscos

- `workers-oauth-provider` + `McpAgent` versões: seguir as do demo (`agents ^0.17`,
  provider `^0.8`); pinar.
- Google OAuth exige app no Google Cloud com callback do `workers.dev`: tarefa manual
  do dono (T-manual).
- Tamanho do viewer (~1 MB) dentro do HTML gerado: aceitável (o export do app já é 2–3 MB).
- esbuild sobre o client do app: o app compila com `tsc` sem bundler; o bundle é só para
  o viewer, não muda o app.
