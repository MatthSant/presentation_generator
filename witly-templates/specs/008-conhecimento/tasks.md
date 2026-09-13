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
- [x] T11 Browser (pane `#/gerais` sobre o conhecimento; API no browser) → `evidencias.md`; migração 0011 + deploy + seed remoto; PR #68.

## Fase 3 — UI (PR 2)
- [x] T12 `#/conhecimento` (`public/conhecimento.js`): busca no servidor (FTS), famílias como segmentos com contagem, filtros de tipo (por família), domínio, nível, escopo (tipo + slug), status, "sempre", "não verificadas", tag; tudo na URL; 1 linha por entrada com id, nível, domínio, escopo, tags, resultado (caso/teste), versão, propostas abertas e verificação. `#/gerais` redireciona.
- [x] T13 `#/conhecimento/<id>`: corpo (markdown mínimo), campos do tipo, tags, gatilhos, fontes, uso, relações, propostas abertas (com voto/decisão), histórico (ver snapshot, Restaurar = proposta aprovada), propostas decididas; ações: propor edição/substituta, fechar resultado, verificar (com prazo), sempre (evict-to-admit quando a cota enche), superseder.
- [x] T14 Formulário gerado do esquema (`/api/conhecimento/esquema`): tipo agrupado por família, contadores de título/corpo, campos do tipo por kind (texto, lista, enum, objeto JSON, data), eixos, gatilhos, sempre (editor), motivo, urgência com evidência, detector de parecidas no título, "aprovar agora" para editor; recusada/duplicada tratadas.
- [x] T15 `#/pendencias`: Propostas (banner de urgentes; cards com voto, aprovar/recusar), Aprovadas por votos (30 dias, Reverter), Casos e testes pendentes (→ fechar resultado), Triagem do agente (→ atividade); `#/pendencias/<id>` com atual × proposta, votos e decisão. Saúde com o bloco do conhecimento; `#/config` (N de votos, dias, limites); contador de pendências no menu; nav em Plataforma / Trabalho / Admin; aba Regras do template aponta para o conhecimento escopado.
- [x] T16 Browser + Vitest → `evidencias-fase3.md`; deploy; PR.

## Fase 4 — `kind = conversa` (PR 3)
- [x] T17 `templates.kind` aceita `conversa` (sem migração: a coluna é texto). Catálogo, saúde e stats incluem os roteiros; `kit-assemble`, `seed` e `test-kits` tratam kit sem Python (só `.md`).
- [x] T18 Manifesto de roteiro: `entrada`, `etapas[{id, entrega, espera, registra, puxa}]`, `ferramentas`, `saida`, `funil`, `tags`. `obter_template` devolve o roteiro (regra do checkpoint, nível 0, tarefas, tabela de etapas, guia, regras, perguntas, "Ao terminar", índice do conhecimento) — sem zip e sem Python; `listar_templates` marca o tipo.
- [x] T19 UI: catálogo com filtro "roteiros" e pill; "Novo template" escolhe análise ou roteiro; aba **Roteiro** com editor de etapas (mover, excluir, + Etapa) e abas do kit escondidas.
- [x] T20 Seed: `otimizar-trafego` (6 etapas, 8 regras, 2 perguntas, 2 tarefas) e `novo-cliente` (4 etapas, 3 regras, 1 tarefa com as perguntas de contexto).
- [x] T21 Testes `test/conversa.test.ts` (2); Vitest 92; browser → `evidencias-fase4.md`.

## Fase 5 — campanha (PR 4)
- [x] T22 `src/kit/campanha.ts`: evento (contexto · analise · achado · acao · resultado), ação estruturada genérica (area/nivel/alvo/acao/valor/fato/causa/resultado/verificar_em — texto com sugestão, não enum), `proposto` do agente, `acaoFeita`, `pendentesVencidas`, `eventoVelho` (14 dias) e `resumoCampanha` (nível 2 do MCP).
- [x] T23 `registrar({campanha, eventos})` anexa na linha do tempo: `geracao` entra como `analise` sozinha; achado e ação do agente entram propostos; PII e validação com mensagem clara. `conhecimento({campanha})` devolve o resumo + ações a verificar + conhecimento escopado.
- [x] T24 db: `anexarEventos`, `confirmarEvento`, `fecharAcao`, `listarAcoes` (todas as campanhas, só o confirmado) e as ações na saúde.
- [x] T25 API: `/api/campanhas`, `/api/campanhas/:id`, `POST eventos` (pela UI nunca é proposto), `confirmar`, `fechar`, `/api/acoes` com filtros.
- [x] T26 UI: `#/campanhas` (lista com propostos e vencidas), `#/campanhas/:id` (linha do tempo com confirmar/descartar e fechar resultado, contexto e pendências, "+ Registrar"), `#/acoes` (tudo o que foi feito, filtros na URL, "só a verificar", fechar da tabela), bloco Ações na Saúde e contador no menu.
- [x] T27 Testes `test/campanha.test.ts` (3); Vitest 95; browser → `evidencias-fase5.md`.
