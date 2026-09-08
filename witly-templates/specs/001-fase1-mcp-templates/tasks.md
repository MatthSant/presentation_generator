# Tarefas: Fase 1 — MCP de templates

**Entrada**: [spec.md](spec.md) · [plan.md](plan.md). Formato `[ID] [P?] [História] descrição`
(`[P]` = pode rodar em paralelo). Uma tarefa só vira `[x]` com teste verde (constituição IX).

## Fase A — Setup

- [x] T001 Criar `witly-templates/` com `package.json` (deps do plano), `wrangler.jsonc`
      (DO `TemplatesMcp`, D1 `DB`, KV `OAUTH_KV`, assets `public/` com `run_worker_first`),
      `tsconfig.json`, `vitest.config.mts` (pool de Workers), `.gitignore`, scripts npm
      (`dev`, `build`, `test`, `seed:local`, `seed:remote`, `deploy`, `typecheck`).
- [x] T002 [P] `migrations/0001_init.sql` com o modelo D3; `npm run db:migrate:local`.
- [x] T003 [P] Copiar do demo da Cloudflare `oauth-utils.ts` + `utils.ts` (CSRF, state em
      KV, approval dialog) para `src/`; ajustar textos para pt-BR.
- [x] T004 [P] CI: `.github/workflows/witly-templates.yml` (typecheck, vitest, unittest do
      seed Python) disparado por mudanças em `witly-templates/**`.

## Fase B — Fundação (bloqueia as histórias)

- [x] T005 `src/db/*.ts`: acesso tipado a D1 (templates, versões, arquivos, tarefas de
      contexto, contextos gerais, usuários, usage_log). Teste: CRUD básico no pool de Workers.
- [x] T006 `src/auth/access.ts`: regra de acesso (domínio `ALLOWED_DOMAIN` ou usuário
      ativo), upsert de usuário, promoção via `EDITOR_SEED`. Teste: domínio ok, fora do
      domínio bloqueado, removido bloqueado, seed vira editor.
- [x] T007 `src/auth/google.ts`: rotas `/authorize`, `/callback` (adaptadas do demo) com o
      gate de T006 e a página "peça acesso". Teste: callback com e-mail bloqueado não chama
      `completeAuthorization`.
- [x] T008 `src/index.ts`: `OAuthProvider` + `TemplatesMcp` vazio servindo em `/mcp`;
      `wrangler dev` sobe; `/.well-known/oauth-authorization-server` responde.

**Checkpoint**: Worker no ar local com login Google (credenciais de teste) e MCP sem tools.

## Fase C — US1 Consultor obtém o template (P1) 🎯 MVP

- [x] T009 [US1] `src/kit/montar-query.ts`: substituição de `{{param}}`, validação de
      obrigatórios, escape por tipo, erro em `{{` residual. Testes: os 4 casos de borda da spec.
- [x] T010 [P] [US1] `src/kit/sign.ts` + rota `/dl/:slug/:n`: URL assinada HMAC com
      expiração; zip com `fflate` de `template_files` + `viewer/` dos Assets. Teste:
      assinatura válida/expirada/adulterada; zip contém os caminhos esperados.
- [x] T011 [US1] `src/mcp.ts`: tools `listar_templates`, `obter_template` (texto + URL de
      download + contextos gerais), `montar_query`, `guia`; resources `template://…` e
      `contexto://geral/…`; revalidação de acesso por chamada; `usage_log`. Testes:
      cada tool contra D1 semeada; slug inexistente; só rascunho; usuário removido.
- [x] T012 [P] [US1] `app/src/client/standalone.ts` no app + `scripts/build-viewer.mjs`
      (esbuild + css + fontes + ApexCharts → `public/viewer/`). Teste: bundle gera e um
      HTML de fixture abre no browser do preview com charts montados.
- [x] T013 [US1] `seed/acompanhamento-diario/`: `manifest.json` (params + tarefas de
      contexto: field_conversion, tipo_funil, data_corte, temperatura, metas, dicionário),
      `contexto/*.md` (páginas detalhadas; temperatura com regra padrão + exemplos +
      ambíguos), `queries/{dump,dump_pago,goals,dict}.sql` extraídos do montador,
      `guia.md` (guias.json + focus do deepen, revisado), `documento.md` (estrutura do
      relatório e pontos editáveis).
- [x] T014 [US1] `python/gerar.py` + cópia de `calc.py`/`build_report.py`/`query_api.py`/
      `common/` + `tests/fixture.csv` sintética + `tests/test_calc.py` (KPIs esperados,
      placeholders cobertos, HTML com `__REPORT`). `python -m unittest` verde.
- [x] T015 [US1] `scripts/seed.mjs`: monta o template a partir de `seed/` + `app/pysrc`,
      gera `exemplo.html` rodando `gerar.py` na fixture, aplica em D1 local/remoto;
      `seed/general-contexts/numeros-pequenos.md`. Teste: seed em base vazia → kit com 7
      partes + 1 contexto geral (cenário US4.1).
- [x] T016 [US1] `scripts/parity.mjs`: `dataset.json` do kit == do app para a fixture
      (cenário US4.2).
- [x] T017 [US1] **Manual** (Claude Code ✓ em produção — ver evidencias.md; Claude.ai e Codex dispensados por decisão do dono em 2026-09-07): deploy em `workers.dev`, Google OAuth client criado pelo dono
      (T-manual), instalar em Claude Code → login → `listar_templates` → `obter_template`
      → `curl` do zip → `python gerar.py` com um CSV do Delfos → HTML abre. Repetir a
      instalação em Claude.ai e Codex. Registrar evidências no PR.

**Checkpoint**: SC-001, SC-002 atendidos.

## Fase D — US3 Acesso (P2)

- [x] T018 [US3] Página "peça acesso" na UI e no fluxo OAuth com o e-mail usado; teste
      manual com conta Google externa (cenários US3.1–3).
- [x] T018b [US3] Corte de acesso: `accessTokenTTL` ≤ 1h no provider; API `/api/users`
      (listar, papel, desativar/reativar, **encerrar sessões** = revogar grants via
      `OAUTH_PROVIDER.listUserGrants/revokeGrant`); tela de usuários na UI. Teste: usuário
      desativado → tool e API falham; grants revogados somem do KV (cenário US3.4).
- [x] T-ARQ **Desenho da arquitetura** em `docs/arquitetura.html` (fluxo ponta a ponta,
      o que usa, requisitos para funcionar, como instalar). Atualizar ao fechar cada fase.

## Fase E — US2 UI de edição (P2)

- [x] T019 [US2] `src/auth/session.ts`: `/ui/login`, `/ui/callback`, cookie assinado,
      middleware de papel. Teste: leitor lê, não escreve; sem cookie → 401.
- [x] T020 [US2] `src/app.ts` `/api`: listar templates; obter versão (publicada/rascunho);
      criar rascunho; salvar parte (manifesto, tarefa de contexto, arquivo, guia,
      documento, exemplo); publicar; contextos gerais CRUD; aviso de `{{param}}` fora do
      manifesto. Testes por rota, incluindo "MCP continua servindo a publicada".
- [x] T021 [US2] `public/{index.html,app.js,style.css}`: catálogo, editor por abas
      (Manifesto · Contexto (uma subpágina por tarefa) · Queries · Python · Documento ·
      Guia · Exemplo), botões Salvar rascunho / Publicar, área Contextos gerais. Design
      system light do app. Teste manual no browser (cenários US2.1–5) + `guia` no agente
      devolvendo o texto novo (SC-003).

## Fase F — Fechamento

- [x] T022 Atualizar `PLANO.md`/`spec.md` com o que mudou na implementação (spec ancorada);
      `README.md` de instalação (URL, `claude mcp add`, Claude.ai, Codex).
- [ ] T023 PR para `master` com evidências dos testes manuais; deploy final.

## Dependências

```
T001 → T002/T003/T004 → T005 → T006 → T007 → T008
T008 → T009/T010/T012 (paralelas) → T011 → T013 → T014 → T015 → T016 → T017
T008 → T018
T011 → T019 → T020 → T021
T017 + T021 → T022 → T023
```
