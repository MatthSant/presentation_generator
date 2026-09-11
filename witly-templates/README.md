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
(as perguntas vêm no kit como entradas; a relevância ele lê em `numeros.json`), constrói aprofundamentos no design system (`design-system.md` +
`python/aprofundar.py`), registra o que fez (`registrar`, `avaliar`) e pode guardar um padrão
próprio como template pessoal (`salvar_template`).

UI de edição: `https://witly-templates.projetos-145.workers.dev/` (mesmo login). Páginas:
Templates (editor por abas + Versões), Pessoais, Atividade (+ Uso), Contextos gerais,
Design system (galeria interativa dos elementos, regras, contrato e versões — entra em todo kit como design-system.md), Usuários.

O kit baixado é autossuficiente: a pessoa não precisa deste repositório.

## Desenvolver

```bash
npm install
npm run build                 # viewer offline (esbuild sobre app/src/client/standalone.ts) + docs
npm run db:migrate:local
npm run seed:local            # os 5 kits de seed/ + contexto geral + design system no D1 local
npm run dev                   # http://localhost:8788 — com DEV_LOGIN=1 em .dev.vars, /ui/dev-login entra sem Google
npm test                      # Vitest no pool de Workers (D1/DO reais)
npm run test:py               # scripts/test-kits.mjs: unittest (stdlib) + paridade kit == app, para os 5 kits
node scripts/parity.mjs <slug> <motor>   # paridade de um kit só
npm run test:import           # importador do deepen_history (node:sqlite)
npm run import:history -- <comments.db> --remote   # traz o histórico do app como atividade
```

`.dev.vars` (não versionado): `COOKIE_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `EDITOR_SEED`, `DEV_LOGIN=1`.

## Publicar

```bash
npm run deploy                # build + wrangler deploy
npm run db:migrate:remote
npm run seed:remote           # publica os kits de seed/ como versão nova (semver: --bump patch|minor|major, padrão patch)
```

Secrets em produção: `wrangler secret put GOOGLE_CLIENT_ID | GOOGLE_CLIENT_SECRET | COOKIE_ENCRYPTION_KEY`.
Vars em `wrangler.jsonc`: `ALLOWED_DOMAIN`, `EDITOR_SEED`, `ORG_ID`, `PUBLIC_URL`.

## Como um template é feito

`seed/<slug>/` é só a **semente** (carregada uma vez pelo `seed.mjs`); depois disso a
fonte de verdade é o D1, editado na UI e versionado (rascunho → publicado).

```
seed/<slug>/            (acompanhamento-diario · debriefing · criativos · historico · conversao-perfil)
├── manifest.json      params das queries, queries (com `when`), índice das tarefas de contexto, como_gerar
├── tarefas/*.md       uma página por tarefa (o que o agente levanta com o consultor antes de gerar)
├── regras/*.md        uma entrada por regra/recomendação/definição (`Tipo:` no corpo; o título já é a regra)
├── perguntas/*.md     uma entrada por pergunta norteadora (o título é a pergunta; o corpo, como aprofundar)
├── queries/*.sql      SQL do Delfos com {{param}}
├── documento.md       estrutura do relatório e placeholders de numeros.json
├── guia.md            mecânica e como ler cada bloco (regras e definições são entradas, não texto solto)
└── python/            tests/ (fixture sintética + test_kit.py); gerar.py/aprofundar.py vêm de seed/_shared e calc/build_report/render_view/common do app/pysrc, copiados pelo kit-assemble
```
