# Janelas de conversão

**Saída:** parâmetro `dias_lancamento`; `config.window` (`lcto`) e `config.long_window` (`6m` ou `12m`). **Confirmar com o consultor.**

## Definição
Uma compra conta como **conversão do lançamento** se acontece até `dias_lancamento` dias depois da 1ª captação do lead naquele lançamento (padrão **60**). A query também marca `vendas_6meses` e `vendas_12meses` (janela longa) para o **uplift**: quem compra mais no longo prazo do que no lançamento precisa de nutrição diferente.

- `window = lcto` → coluna `vendas_lancamento` (a janela curta).
- `long_window = 12m` (padrão) ou `6m` → coluna longa usada em conv. 12m/6m e uplift.

## Como executar
1. Pergunte quantos dias dura o ciclo captação → carrinho → fechamento do cliente. Lançamento clássico: 60. Perpétuo curto: 30. Ciclo longo (alto ticket): 90.
2. Pergunte se o cliente olha 6 ou 12 meses para recompra tardia. Lançamentos muito recentes não completaram a janela longa: o uplift deles fica subestimado; diga isso.

## Casos ambíguos
- Janela maior que o intervalo entre lançamentos: a compra do lançamento seguinte é contada no anterior. Prefira uma janela menor que o intervalo.

## Saída (formato exato)
```json
"window": "lcto", "long_window": "12m"
```
`montar_query(..., { "dias_lancamento": 60 })`
