# Tarefas — Spec 005

- [x] T1 `kit-assemble` sem `query_api.py`/`perguntas/` (apaga cópias antigas); `gerar.py` sem `perguntas.json`; testes de kit sem `perguntas.json`.
- [x] T2 Perguntas dos `banks/*.py` → `seed/<kit>/perguntas/<id>.md` (73 entradas, `Tipo: pergunta`); `perguntas.md` do kit gerado das entradas.
- [x] T3 `## Definições` dos guias → `seed/<kit>/regras/def-*.md` (63 entradas `Tipo: definicao`); know-how do `query_api` (decomposição, onde concentra, impacto em receita, variação vs histórico, gap vs benchmark, saturação, compensar CPM, cruzamento) → 12 definições escritas à mão.
- [x] T4 `template_rules.tipo = 'pergunta'` (tipo, ordem, UI na aba Perguntas via o mesmo pane das Regras, `kit n/10`, `obter_template`, tool `perguntas`, resource, zip).
- [x] T5 Migração 0008: `activity.evento` aceita `sugestao` (tabela recriada), `template_versions.content_hash`.
- [x] T6 `sugerir_regra` (MCP) → `activity` `sugestao` → fila de triagem → "Aceitar como entrada" (`virarRegra` usa tipo/título/corpo sugeridos); `salvar_template.regras`; `edicao` fora das tools.
- [x] T7 Seed idempotente por hash (`--force` publica); `seed/<kit>/contexto/` → `tarefas/`; `regras/`, `perguntas/` fora dos arquivos do kit; viewer só `latin`; `ultimo_uso` e "sem uso 30d" contam `usage_log`.
- [x] T8 Docs: manifestos (`como_gerar` sem o passo do CLI), guias/documentos, contextos gerais, contrato do design system, README, arquitetura.
- [x] T9 Testes: `test/agente.test.ts` + `personal.test.ts` ajustado; suíte Vitest (78); `test-kits` (unittest + paridade) verdes.
- [x] T10 Seed local (hash pula o igual) e verificação no browser (aba Perguntas, card de sugestão, aceitar → entrada no rascunho). Produção: migração 0008, seed, deploy, PR — ver `evidencias.md`.
