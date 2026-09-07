# Witly Grimório (`witly-templates`)

Plataforma na Cloudflare que entrega **templates de análise** ao agente que a pessoa já
usa (Claude Code, Codex, Claude.ai, Cursor). Um Worker, dois lados: o **MCP** (o agente
pede o kit-pai e gera o documento na máquina do consultor) e a **UI** (editores cadastram
e versionam templates, contextos gerais e usuários). Login Google para os dois.

- Visão: [PLANO.md](PLANO.md) · Princípios: [constitution.md](constitution.md)
- Spec da Fase 1: [specs/001-fase1-mcp-templates/](specs/001-fase1-mcp-templates/)
- Desenho de como funciona: [docs/arquitetura.html](docs/arquitetura.html) (também em `/docs/arquitetura.html` no app)

## Usar (consultor)

```bash
claude mcp add --transport http grimorio https://witly-templates.projetos-145.workers.dev/mcp
```

No Claude Code, `/mcp` → Authenticate → login Google com a conta `@witly.digital`.
Claude.ai (Conectores) e Codex/Cursor: a mesma URL. Depois, no chat: "liste os templates
da Witly" → `obter_template` → o agente segue as tarefas de contexto, monta o SQL com
`montar_query`, roda no Delfos, baixa o kit (`curl`) e gera com `python gerar.py`.

Depois de gerar, o agente propõe no chat as perguntas norteadoras mais relevantes
(`saida/perguntas.json`), constrói aprofundamentos no design system (`design-system.md` +
`python/aprofundar.py`), registra o que fez (`registrar`, `avaliar`) e pode guardar um padrão
próprio como template pessoal (`salvar_template`).

UI de edição: `https://witly-templates.projetos-145.workers.dev/` (mesmo login). Páginas:
Templates (editor por abas + Versões), Pessoais, Atividade (+ Uso), Contextos gerais, Usuários.

## Desenvolver

```bash
npm install
npm run build                 # viewer offline (esbuild sobre app/src/client/standalone.ts) + docs
npm run db:migrate:local
npm run seed:local            # kit acompanhamento-diario + contexto geral no D1 local
npm run dev                   # http://localhost:8788 — com DEV_LOGIN=1 em .dev.vars, /ui/dev-login entra sem Google
npm test                      # Vitest no pool de Workers (D1/DO reais)
npm run test:py               # unittest do kit (stdlib)
node scripts/parity.mjs       # dataset do kit == do app para a fixture
npm run test:import           # importador do deepen_history (node:sqlite)
npm run import:history -- <comments.db> --remote   # traz o histórico do app como atividade
```

`.dev.vars` (não versionado): `COOKIE_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `EDITOR_SEED`, `DEV_LOGIN=1`.

## Publicar

```bash
npm run deploy                # build + wrangler deploy
npm run db:migrate:remote
npm run seed:remote           # publica os kits de seed/ como versão nova (+1)
```

Secrets em produção: `wrangler secret put GOOGLE_CLIENT_ID | GOOGLE_CLIENT_SECRET | COOKIE_ENCRYPTION_KEY`.
Vars em `wrangler.jsonc`: `ALLOWED_DOMAIN`, `EDITOR_SEED`, `ORG_ID`, `PUBLIC_URL`.

## Como um template é feito

`seed/<slug>/` é só a **semente** (carregada uma vez pelo `seed.mjs`); depois disso a
fonte de verdade é o D1, editado na UI e versionado (rascunho → publicado).

```
seed/acompanhamento-diario/
├── manifest.json      params das queries, queries (com `when`), índice das tarefas de contexto, como_gerar
├── contexto/*.md      uma página por tarefa de contexto (definição, regra padrão, query de apoio, exemplos, ambíguos, saída)
├── queries/*.sql      SQL do Delfos com {{param}}
├── documento.md       estrutura do relatório e placeholders de numeros.json
├── guia.md            mecânica, definições, benchmarks, o que NÃO concluir
└── python/            gerar.py + tests/ (fixture sintética); calc/build_report/query_api/common são copiados do app/pysrc pelo kit-assemble
```
