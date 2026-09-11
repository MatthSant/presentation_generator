# Tarefas — Spec 007

## Parte A — os 13 pedidos do feedback v1.0.4
- [x] T1 (pedido 1) `kpi-card` e `highlight` com `bind` no viewer: `metric` | `ratio` (razão de somas), `mult`, `exclude` da linha Geral, rodapé de meta refeito, `vars` com `{chave}`; entram no BOUND do dashboard. Builder: `kpi(bind=)`, `destaque(bind=, vars=)`.
- [x] T2 (pedido 2) `R.filtro(id, label, opcoes, todos)` + tabelas com `filters=[id]`; `gravar()` cruza opções × valores reais e falha na divergência (`_valida_filtros`).
- [x] T3 (pedido 3) widget `filter-seg` (`s.seletor(id)`) aciona o mesmo filtro do FAB e do app (`Filters.select`); "todos" volta ao início. Viewer offline deixa de guardar o `allValue` no filtro ativo.
- [x] T4 (pedido 4) `fmt='brl'` / `kpi(formato='exato')`; `brl` no eixo e no rótulo da barra (`valueFmt`).
- [x] T5 (pedidos 5 e 7) tabela: `colunas=`, `escala=` (5 degraus vs alvo, `menor`), `ordem=`, célula em objeto documentada; borda reta e sem spacing como padrão. Gráfico: rótulo formatado dentro da barra, `eixo_x`/`eixo_y`, `comparar=True` (barra + linha, eixos separados).
- [x] T6 (pedido 6) `curva='reta'|'suave'` (`ChartDef.curve`); padrão reta a partir de 50 pontos.
- [x] T7 (pedido 8) `meta.chrome {marca, cliente, trocar, busca, atalho, sidebar}` no `navigation.ts`; `Relatorio(chrome=)`.
- [x] T8 (pedido 9) `R.css_extra()` / `R.js_extra()` injetados no HTML (`gerar.py`) e guardados em `data.json meta.extra`.
- [x] T9 (pedido 10) `autoria='consultor'` em achado/nota/ação/destaque: números declarados, `validar()` não exige tabela.
- [x] T10 (pedidos 11, 12, 13) página × seção no `documento.md`; `funil(transicao={i: rótulo})` em razão; `.kc--emph .kc-sub` legível.
- [x] T11 Exemplo da análise livre (3 páginas) e galeria do design system (30 elementos, 6 novos) usam o novo; 8 regras novas do design system; `documento.md` com a tabela "Filtro, valores vivos e acabamento".

## Parte B — o feedback como evento do MCP
- [x] T12 Migração 0010 (`activity.evento` aceita `feedback`; tabela recriada por causa do CHECK).
- [x] T13 `registrar({evento:'feedback', nota, segurou, custou:[{item, prioridade, pedido, rodadas}], medida:{apresentacao, filtro, analise}, resumo})` com validação (nota 1–5 obrigatória, prioridade normalizada, sem dado pessoal); `avaliacao = nota`.
- [x] T14 Regra geral "Ao fechar o trabalho…" (`seed/general-contexts/feedback-de-uso-ao-terminar.md`) e bloco "Ao terminar" do `obter_template` mandando registrar.
- [x] T15 Fila de triagem inclui `feedback`; revisão mostra medida, o que segurou e a tabela do que custou; **"Virar sugestão"** por item (`POST /api/atividade/:id/sugerir`); Saúde com `feedbacks` × `nota_feedback`.
- [x] T16 Testes: `test_feedback_v104.py` (6), `test/feedback.test.ts` (2), `design.test.ts` com filtros; app 177 + typecheck + build; Vitest 85.
- [x] T17 Browser (ver `evidencias.md`); migração 0010 + deploy + seed remoto; PR #67.
