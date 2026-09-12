# Tarefas — Spec 008

## Fase 1 — banco (PR 1)
- [x] T1 Migração 0011: `conhecimento` (4 eixos: tipo/família, domínio, escopo, nível), `conhecimento_hist` por trigger (nada se apaga), `conhecimento_fts` (FTS5 sem acento), `conhecimento_rel` (supersede/contradiz/corrige/sustenta), `conhecimento_uso`, `proposta`, `voto`, `orgs.config_json`; os 28 contextos gerais migram como `sempre`.
- [x] T2 `src/kit/conhecimento.ts`: esquema dos 17 tipos em 6 famílias (campos, obrigatórios, gatilhos padrão), eixos, limites, `validarEntrada`, `linhaIndice`/`linhaSempre`/`textoCompleto`, `chaveTitulo`, `termosBusca`.
- [x] T3 `src/db/conhecimento.ts`: listar (filtros + FTS), obter, gravar (versão só quando muda), verificar, histórico, parecidas, relações, orçamento `sempre`, uso, config da org, propostas (criar com idêntica → ocorrência e recusada lembrada), votos (N da org aprova, urgente nunca), decidir (aplica nova/edição/substituta/fechar_resultado/superseder; urgente aprovada vira `sempre`), reverter (volta ao snapshot), saúde.
- [x] T4 Seed: `seed/conhecimento/<id>.md` com frontmatter (tipo, domínio, nível, escopo, sempre, gatilho, tags, confiança, dados); os 28 reclassificados (18 regras, 3 métricas, 3 estilos, 2 definições, 1 método witly, 1 padrão); upsert só do que é do seed e só quando muda.

## Fase 2 — MCP (PR 1)
- [x] T5 Tool `conhecimento(filtro)` (`indice` | `completo`; família, tipo, domínio, nível, escopo, cliente/funil/campanha, gatilho, tags, ids, q, situação, resultado, origem); completo registra uso.
- [x] T6 `obter_template`: nível 0 no topo (urgentes pendentes do escopo com a instrução "pergunte ao consultor" + `sempre` em 1 linha) e índice de nível 1 no fim (escopo template/funil + tags do manifesto, ≤ 40 linhas, com gatilhos); `guia` com nível 0; "Ao terminar" pede `sugerir` e `usadas`.
- [x] T7 Tools `sugerir` (proposta tipada, urgência com evidência, PII, parecidas, idêntica → ocorrência, recusada → motivo) e `confirmar` (voto; editor não aprova pelo chat); `registrar` com `usadas`.
- [x] T8 Resource `conhecimento://{id}` (+ alias `contexto://geral/{slug}`).
- [x] T9 API: `/api/conhecimento` (lista, saúde, parecidas, detalhe com histórico/uso/relações/propostas, verificar, sempre com evict-to-admit), `/api/propostas` (lista, criar, detalhe, votar, decidir, reverter), `/api/config`; `/api/general-contexts` compatível (o pane `#/gerais` segue funcionando sobre o conhecimento).
- [x] T10 Testes: `test/conhecimento.test.ts` (5) + ajustes em tools/api; Vitest 90; typecheck.
- [ ] T11 Browser (pane `#/gerais` sobre o conhecimento; API no browser) → `evidencias.md`; migração 0011 + deploy + seed remoto; PR.

## Fase 3 — UI (PR 2)
- [ ] T12 `#/conhecimento`: lista por família/tipo/domínio/nível/escopo/tag/confiança/status, busca, 1 linha por entrada.
- [ ] T13 Entrada: formulário gerado do esquema, campos por tipo, fontes, histórico com diff/restaurar, aba Propostas (concorrentes lado a lado, votos).
- [ ] T14 Propor (nova/edição/substituta/fechar resultado) com detector de parecida; votar; aprovar/recusar (editor); Aprovadas por votos (30 dias) com Reverter.
- [ ] T15 Pendências: urgentes (banner) · propostas · casos/testes pendentes · triagem do agente; Saúde do conhecimento; Configurações (N, limites).

## Fase 4 — `kind = conversa` (PR 3)
- [ ] T16 Manifesto de roteiro (etapas com entrega/espera/registra/puxa), `obter_template` para conversa, editor na UI.
- [ ] T17 Roteiros `otimizar-trafego` e `novo-cliente` (seed).

## Fase 5 — campanha (PR 4)
- [ ] T18 Linha do tempo via `registrar({campanha})`, evento `acao` estruturado, telas Campanhas/Clientes/Ações, "o que funcionou".
