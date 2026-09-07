# Evidências — Fase 1 (T017, teste manual em produção)

**Data**: 2026-09-07 · **Worker**: `https://witly-templates.projetos-145.workers.dev` · **Conta**: `projetos@witly.digital`

## Instalação (Claude Code)
- `claude mcp add --transport http grimorio https://witly-templates.projetos-145.workers.dev/mcp`
- `/mcp` → Authenticate → navegador abriu o diálogo de aprovação → login Google → conectado.
  Nenhum token digitado (SC-001 para Claude Code). Claude.ai e Codex: pendentes (mesma URL).

## Tools chamadas pela sessão conectada
| Tool | Resultado |
|---|---|
| `quem_sou` | `Equipe Witly <projetos@witly.digital>` |
| `listar_templates` | catálogo com `acompanhamento-diario` v1, 6 tarefas de contexto, 2 parâmetros |
| `montar_query` `{field_conversion:'lcto-teste', tipo_funil:'lancamento-padrao'}` | 3 SQLs (dump clássico, goals, dict) com `'lcto-teste'` escapado; `dump_pago` excluído pelo `when` |
| `montar_query` `{tipo_funil:'lancamento-pago'}` | erro esperado: `faltam: field_conversion (tarefa de contexto "lancamento")` |
| `obter_template` | manifesto + 6 tarefas + 4 queries + documento + guia + contexto geral + URL assinada |

## Kit em produção
- `curl` da URL assinada → 200, 908 KB, 39 arquivos (python/, common/, viewer/ com shell+css+js, exemplo/relatorio.html sintetizado).
- De dentro do zip: `python gerar.py --config tests/config.json --csv fixture.csv --out saida` → 4 camadas + `numeros.json` + `relatorio.html`.
- `python -m unittest` dentro do kit: 7 testes OK.

## Log de uso (D1 remoto)
```
2026-09-07T19:15:24 obter_template   acompanhamento-diario projetos@witly.digital
2026-09-07T19:15:06 montar_query     acompanhamento-diario projetos@witly.digital
2026-09-07T19:15:04 montar_query     acompanhamento-diario projetos@witly.digital
2026-09-07T19:15:01 listar_templates —                     projetos@witly.digital
```

## Ajustes feitos durante o teste
- `/authorize` malformado devolvia 500 → 400 (AuthorizationError tratado).
- Assets com `html_handling: none` (o binding devolvia 307 para `shell.html`).
- Comentário do `dump.sql` continha o placeholder e era substituído → texto fixo; republicado como v2.
- `EDITOR_SEED = projetos@witly.digital`; a conta foi promovida a editor no D1.
