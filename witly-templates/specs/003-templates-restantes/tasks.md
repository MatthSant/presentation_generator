# Tarefas: Fase 3 — os outros quatro templates

**Entrada**: [spec.md](spec.md) · [plan.md](plan.md). `[x]` só com teste + paridade verdes.

## Fase A — `gerar.py` genérico (US5)
- [x] T201 `seed/_shared/gerar.py` (engine-agnóstico, `--opts`, auxiliares, `required_files`, `numeros.json`, `perguntas.json`, `--rerender`) + `seed/_shared/aprofundar.py`; `kit-assemble` copia os dois; acompanhamento passa a usá-lo; testes do acompanhamento continuam verdes; paridade.

## Fase B — US1 Debriefing (P1)
- [x] T202 `seed/debriefing/`: manifest (engine `debriefing-lancamento`, bank `debriefing_lancamento`, `required_files: ["goals"]`, params, queries dump+goals+hist, tarefas lancamento/classificacao/temperatura/metas/historico/recorte), `contexto/*.md`, `queries/*.sql`, `guia.md` (7 páginas + 360° + indicadores + cuidados), `documento.md`.
- [x] T203 Fixture sintética (dump + goals + hist) + `test_kit.py` (7 seções, KPIs conhecidos, sem goals → erro, perguntas.json, aprofundar) + paridade.
- [x] T204 Seed local/remoto (substitui o rascunho `debriefing` de produção); conferir no MCP (`obter_template('debriefing')`, `montar_query` com dump+goals).

## Fase C — US2 Criativos (P2)
- [x] T205 `seed/criativos/` (engine `criativos`, bank `criativos`, queries mídia+dict, tarefas lancamento/temperatura/tipo_campanha/dicionario/modo(recorte)), guia, documento.
- [x] T206 Fixture (4 anúncios) + `dict.csv` + testes (modo via `--opts`, fichas com link) + paridade; seed.

## Fase D — US3 Histórico (P2)
- [x] T207 `seed/historico/` (engine `historico-lancamentos`, bank `historico_lancamentos`, query consolidada, tarefas cliente/lancamentos/recorte), guia, documento.
- [x] T208 Fixture (3 eventos) + testes (`--opts` launches/metric; 1 lançamento só avisa) + paridade; seed.

## Fase E — US4 Conversão por perfil (P3)
- [x] T209 `seed/conversao-perfil/` (engine `conversao-perfil`, bank `conversao_perfil`, query do dump, tarefas cliente/criterios/canais/janelas/prosa), guia, documento (inclui o contrato do `content.json`).
- [x] T210 Fixture (2 lançamentos × 2 critérios + benchmark) + `content.json` de exemplo + testes (com/sem content; número solto recusado) + paridade; seed.

## Fase F — Fechamento
- [x] T211 `npm run parity` para os 5; CI roda `test:py` para todos os kits; deploy + seed remoto; evidências (MCP real: `listar_templates` com 5); `arquitetura.html`; spec ancorada; PR.

## Dependências
```
T201 → T202 → T203 → T204 → T205 → T206 → T207 → T208 → T209 → T210 → T211
```

## Ajustes em relação ao plano (registrados ao executar)
- Debriefing: o motor não tem mais a página Temporal (6 páginas; a leitura semanal vive nos pickers "Métricas no tempo" e em Q10/Q11 do 360°).
- Histórico: slug `historico` (não `historico-lancamentos`); a query devolve `leads_antigos` (o calc lê essa coluna; o montador do app emitia `recap_antigos`, que somava 0).
- Conversão por perfil: sem `content.json` de exemplo no kit (Insights sai como esqueleto; a prosa é do consultor); o toggle Geral/Pago/Orgânico é do próprio HTML, o que exigiu o seletor de filtro de dataset no viewer offline (`app/src/client/standalone.ts`).
- `numeros.json` por motor: `calc.build(rows, config)` (acompanhamento, debriefing), `build(rows, dic, opts)` (criativos: agregados + métricas por criativo), `build_series` (histórico: um bloco por lançamento), `agg_criterio`+`codependencia` (conversão).
- D1 limita statements a 100 KB: o seed grava arquivos grandes em pedaços (`INSERT` + `UPDATE content = content || …`).
