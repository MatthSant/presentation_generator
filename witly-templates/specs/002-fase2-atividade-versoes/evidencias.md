# Evidências — Fase 2

**Data**: 2026-09-07 · **Worker**: `https://witly-templates.projetos-145.workers.dev` (versão 33560e8c) · D1 com migração 0002 · template `acompanhamento-diario` v3 (37 arquivos: + perguntas.md, design-system.md, python/aprofundar.py, python/perguntas/).

## Automatizado
- Worker: 63 testes Vitest (pool de Workers) — visibilidade/pessoais, versões (changelog, restaurar, diff), atividade/avaliações/uso, gate de PII, tools `registrar`/`avaliar`/`salvar_template`/`remover_template`/`perguntas`, API de pessoais/atividade/uso/versões/curadoria.
- Kit: 10 `unittest` — cálculo, HTML, placeholders, **perguntas.json ranqueado** (9 perguntas na fixture, ordenadas por relevância), **aprofundar.py** (seção válida entra nas 4 camadas e regera o HTML; seção inválida lista 5 erros e não grava).
- Importador: 3 testes `node --test` com fixture SQLite (PII e sem prompt pulados, SQL gerado).

## UI (local, `/ui/dev-login`, editor `projetos@witly.digital`)
| Cenário | Resultado |
|---|---|
| US6.4 Pessoais | lista com dono, versão, uso; botões Promover/Remover |
| US1.4 Atividade | lista com filtros, resumo + "ver mais", pills descartado/exemplo/regra |
| US2.1 Virar exemplo | entrada act-1 → guia do rascunho ganhou `### Por que o CPL subiu nos últimos 3 dias?` sob `## Exemplos de aprofundamento` |
| US2.2 Virar regra | entrada act-2 → `- inventou meta por canal` sob `## O que NÃO concluir` |
| US3.2 Uso | por template/versão: 1 geração, 2 aprofundamentos, 50% descartados, nota média 4,0; top perguntas |
| US4.1/4.3 Versões | 3 versões listadas; comparar v1→v2 mostra `contexto/temperatura changed` |

## MCP real
`listar_templates`/`obter_template`/`montar_query`/`guia` já validados na Fase 1. As tools novas (`registrar`, `avaliar`, `salvar_template`, `remover_template`, `perguntas`) e o resource `contrato://widgets` estão em produção, mas o cliente MCP só as lista ao **reconectar** o Grimório — pendente de reconexão pelo dono para registrar a evidência aqui.
