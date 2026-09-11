# Evidências — Spec 007 (2026-09-11)

## Viewer (exemplo `livre3.html`, análise livre)
- **Seletor inline muda o KPI vivo**: CPL "R$ 7,97" (Todos) → "R$ 8,88" ao clicar Facebook no
  `filter-seg` → volta a "R$ 7,97" em Todos. O rodapé de meta é refeito junto (razão de somas,
  não soma de linhas; linha Geral excluída pelo `exclude`).
- **Tabela**: cabeçalho com os rótulos de `colunas=`, escala de 5 degraus contra a meta em CPL
  (menor = melhor) e conversão, ordenada por `ordem='desc'`, borda reta e sem spacing.
- **Gráfico**: rótulo formatado dentro da barra ("R$ 8,88", não "8.88"); eixo em `brl`; curva
  reta; `comparar=True` desenha barra + linha em eixos separados sem rótulo na linha.
- **Chrome**: sem ⌘K, sem chevron de trocar análise, sem busca (`chrome={'atalho':False,
  'trocar':False}`); logo embutido; HTML standalone sem gridstack.
- **Funil em razão**: notas "0,16 msgs por R$" e "R$ 497,00 R$ por comprador" nas transições.
- **Validação**: `R.filtro('canal', opcoes=[...])` divergente de uma tabela falha com
  `ValueError` listando `faltam` / `sobram` por tabela.

## Grimório (`#/design`)
- Galeria publicada v1.0.1 (`/design/preview?state=published`) mostra os 6 elementos novos
  (kpi-vivo, kpi-exato, seletor, tabela-escala, funil-razao, grafico-comparar); o kpi-vivo
  recalcula pelo FAB de filtro do viewer. 20 regras (8 novas do feedback).
- Rascunho local nº 2 é artefato de teste da spec 006 (não afeta a versão publicada).

## Grimório (triagem e saúde)
- `registrar({evento:'feedback', nota:3, ...})` cai na fila (card "Feedback · nota 3/5 ·
  50 rodadas"); a revisão mostra medida (apresentação 30 / filtro 10 / análise 10), o que
  segurou e a tabela do que custou com prioridade e rodadas.
- **"Virar sugestão"** em um item cria uma sugestão na mesma fila com o pedido como título;
  aceitar vira entrada no rascunho (fluxo da spec 005). "Marcar revisado" fecha o feedback.
- Saúde: coluna Feedback com quantidade × nota média.

## Testes
- Kit: `test_relatorio.py` (6) + `test_feedback_v104.py` (6); `test-kits` verde nos 6 kits
  (o de design é pulado).
- App: 177 testes (`node --test`), typecheck e build do cliente compartilhado.
- Vitest: 18 arquivos, **85** testes (`feedback.test.ts` 2 novos). Uma rodada completa
  estourou o timeout de `fase2-api` (6,2 s > 5 s) sob carga; sozinho, 4/4.
- CI do PR #67: `worker` e `python-kit` verdes.

## Produção
- Migração 0010 aplicada (`--remote`), deploy `ae007402`, seed remoto: 7 templates
  publicados — `analise-livre` v1.0.5, `design-system` v1.0.1 (30 elementos), 28 contextos
  gerais (regra "Ao fechar o trabalho…" presente).
