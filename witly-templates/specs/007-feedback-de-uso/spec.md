# Spec 007 — O kit aprende com o uso: os 13 pedidos do feedback v1.0.4 e o feedback como evento

**Estado**: feito em 2026-09-11 a partir do relatório de uso do kit `analise-livre` v1.0.4
(acompanhamento de disparo, 3 páginas, ~50 rodadas com o consultor; nota 3/5, "bom de dado,
caro de aparência": ~30 rodadas de apresentação, ~10 de filtro, ~10 de análise).

## Parte A — o que o kit passa a garantir (por prioridade do feedback)
| # | Pedido | Onde |
|---|---|---|
| 1 | card e destaque com `bind`, redesenhados no filtro | `kpi-card`/`highlight` ganham `bind` + `metric`/`ratio`/`vars` no viewer (razão de somas, `exclude` da linha Geral, rodapé de meta refeito); `kpi(bind=)`, `destaque(bind=, vars=)` |
| 2 | filtro validado contra as tabelas | `R.filtro(id, label, opcoes, todos)`; `gravar()` cruza opções × valores de cada tabela que declara `filters=[id]` e falha na divergência |
| 3 | seletor inline | widget `filter-seg` (`s.seletor(id)`) aciona o mesmo filtro do FAB; "todos" volta ao início |
| 4 | dinheiro exato | `fmt='brl'` / `kpi(formato='exato')` (R$ 2.350,00); `brl` também no eixo do gráfico |
| 5 | tabela | `colunas=` (rótulo do cabeçalho), `escala=` (5 degraus vs alvo, `menor`), `ordem='desc'`, célula em objeto documentada; borda reta e sem spacing como padrão |
| 6 | curva | `curva='reta'\|'suave'`; padrão reta a partir de 50 pontos |
| 7 | defaults | rótulo branco dentro da barra (`showLabels` formatado), `eixo_x`/`eixo_y`, `comparar=True` (barra + linha), `ordem` na tabela |
| 8 | chrome | `Relatorio(chrome={marca, cliente, trocar, busca, atalho, sidebar})`; o logo já era embutido e o gridstack só carrega em edição (o HTML é standalone) |
| 9 | extensão | `R.css_extra()` / `R.js_extra()` injetados no HTML e guardados em `data.json` (sobrevivem ao `aprofundar.py`) |
| 10 | prosa humana | `autoria='consultor'` em achado/nota/ação/destaque: números declarados, sem exigir tabela |
| 11 | página × seção | documentado no `documento.md` (blocos vão dentro da seção) |
| 12 | funil em razão | `funil(transicao={0: 'msgs por R$', -1: 'R$ por comprador'})` |
| 13 | emph | `.kc--emph .kc-sub` legível |

Mais: o viewer offline deixa de pôr o `allValue` ("Todos") no filtro ativo (zerava os binds).
Exemplo da análise livre e galeria do design system usam o novo (seletor, KPI vivo, escala,
funil em razão, curva, comparar, dinheiro exato); 8 regras novas do design system.

## Parte B — o feedback como evento do MCP
`registrar({evento: 'feedback', slug, versao, cliente, resumo, segurou: [...], custou: [{item,
prioridade, pedido, rodadas}], medida: {apresentacao, filtro, analise}, nota})`, obrigatório ao
fechar o trabalho (regra geral + bloco "Ao terminar" do `obter_template`). Migração 0010
(`activity.evento` aceita `feedback`). Entra na fila de triagem (sem veredito); a revisão mostra
medida, o que segurou e a tabela do que custou; **"Virar sugestão"** por item põe o pedido na
fila como sugestão (aceitar = entrada no rascunho); "Marcar revisado" fecha. A Saúde mostra
feedbacks × nota. É o histórico de como o agente usou o kit — para programar melhorias.

## Testes
- Kit: `test_feedback_v104.py` (6) — filtros validados, bind, seletor, exato, tabela, curva,
  comparar, funil em razão, autoria, extras. `test-kits` verde nos 6 kits.
- App (cliente compartilhado): 177 testes, typecheck e build do cliente.
- Vitest: `test/feedback.test.ts` (2) — validação, fila, saúde, virar sugestão, instrução no
  `obter_template`; `design.test.ts` com filtros nos elementos.
- Browser: seletor inline muda o CPL vivo (R$ 7,97 → R$ 8,88 no Facebook → volta), tabela
  rotulada com escala e borda reta, rótulo formatado dentro da barra, sem ⌘K/chevron.
