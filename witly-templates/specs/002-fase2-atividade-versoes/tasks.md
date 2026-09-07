# Tarefas: Fase 2

**Entrada**: [spec.md](spec.md) · [plan.md](plan.md). `[x]` só com teste verde e checagem na UI/MCP real.

## Fase A — Fundação
- [ ] T101 `migrations/0002_fase2.sql` (D1) + `db/index.ts`: activity, ratings, owner/promoted/notas, changelog; `listTemplates(org, viewer)`, `canSee`. Testes de CRUD e visibilidade.
- [ ] T102 [P] `src/kit/pii.ts` + `pii.test.ts` (e-mail, telefone BR, CPF com DV; negativos: CNPJ-like, valores monetários, datas).

## Fase B — US6 Templates pessoais (P1)
- [ ] T103 [US6] `kit/personal.ts`: `salvarTemplate`, `removerTemplate`, `promover`; tools no MCP; filtro de visibilidade em listar/obter/montar/guia. Testes: dono vê, outro não, slug colidindo, PII recusa, promover mantém histórico.
- [ ] T104 [US6] API `/api/pessoais` (lista com dono e uso), `POST /api/templates/:slug/promover`, `DELETE /api/templates/:slug`; UI "Pessoais" (editor: todos; leitor: os seus) com Promover/Remover. Teste manual.

## Fase C — US1/US3 Registrar, avaliar, Atividade, Uso (P1/P2)
- [ ] T105 [US1] `kit/activity.ts` + tools `registrar` (zod por evento, PII, 200 KB, pergunta_id) e `avaliar`; `obter_template` instrui a chamar. Testes por cenário.
- [ ] T106 [US1] API `/api/atividade` (filtros; leitor só as suas), `/api/atividade/:id` (detalhe, reavaliar, comentar), `/api/uso` (agregados por template/versão + top perguntas). Testes.
- [ ] T107 [US1/US3] UI Atividade (lista resumo + ver mais, filtros) e Uso. Teste manual.

## Fase D — US2 Atividade → guia (P2)
- [ ] T108 [US2] `virarExemplo`/`virarRegra` (idempotentes) + rotas + botões na Atividade + "Ajustar template". Testes: guia do rascunho ganha seção; publicada intacta; segunda vez não duplica.

## Fase E — US4 Versões (P2)
- [ ] T109 [US4] `kit/versions.ts`: listar, diff, restaurar; `publish` com changelog. Testes: restaurar v2 → rascunho v4 igual; diff acusa added/removed/changed.
- [ ] T110 [US4] API + UI "Versões" (lista, comparar, restaurar, changelog no publicar). Teste manual.

## Fase F — US7 Perguntas norteadoras (P2)
- [ ] T111 [US7] `kit-assemble` copia `perguntas/`; `gerar.py` grava `perguntas.json`; seed gera `perguntas.md`; `test_kit.py` cobre. Manifest `perguntas_bank`.
- [ ] T112 [US7] Tool `perguntas(slug)`; `obter_template` inclui `perguntas.md`; aba "Perguntas" na UI; `registrar` com `pergunta_id` contado em Uso. Testes.

## Fase F2 — US8 Aprofundamento no design system (P2)
- [ ] T115 [US8] `design-system.md` gerado do app (`docs/WIDGETS.md` + regras de design + resumo de `types.ts`) pelo seed; resource `contrato://widgets`; `obter_template` cita.
- [ ] T116 [US8] `python/aprofundar.py`: validação local da seção (port mínimo de `validate.ts` para os widgets usados, ou validação estrutural + bind existente), grava det-*.json/dataset/data.json, regera HTML. Testes no kit com uma seção válida e uma inválida.

## Fase G — US5 Importador (P3)
- [ ] T113 [US5] `scripts/import-deepen-history.mjs` + teste com fixture SQLite; rodar com o export do dono (`--remote`).

## Fase H — Fechamento
- [ ] T114 Deploy, seed remoto (v3 com perguntas), evidências no MCP real (registrar/avaliar/salvar_template/perguntas pelo Grimório), `arquitetura.html`, spec ancorada, PR.

## Dependências
```
T101 → T102 → T103 → T104
T101/T102 → T105 → T106 → T107 → T108
T101 → T109 → T110
T111 → T112 (independente do resto; precisa de T105 p/ pergunta_id no Uso)
T105 → T113
tudo → T114
```
