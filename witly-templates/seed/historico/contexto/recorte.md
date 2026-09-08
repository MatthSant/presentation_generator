# Recorte do relatório (série inteira, tipo de evento, lançamentos, indicador)

**Saída:** parâmetro `tipo_lancamento` da query; `--opts '{"launches": [...], "metric": "..."}'` ou nenhum. **Perguntar ao consultor antes de gerar.**

## Definição
No app o histórico tem pílulas de lançamento (quais entram) e um seletor de indicador do bloco "Evolução" do Panorama, recalculados no servidor. O HTML offline traz o seletor de indicador e a opção "sem <lançamento>" (tira um ponto da série) **pré-calculados, um por vez**; para tirar mais de um lançamento ou combinar com o indicador, gere com `--opts`.
- **`tipo_lancamento`** (na query): `Todos`, `Lançamento` (lcto-/lco-) ou `Perpétuo` (ppt-/ppto-). Misturar os dois tipos costuma quebrar a comparação (mecânicas diferentes).
- **`launches`**: lista de rótulos (`jul/25`, `nov/25`…) que entram; vazio = todos. Serve para tirar um evento atípico.
- **`metric`**: indicador dos 4 gráficos de quebra: `conv` (padrão), `leads`, `investimento`, `vendas`, `faturamento`, `qual`, `taxa_qualidade`, `conv_mql`, `reembolso`, `roas`.

## Como executar
1. Pergunte: "compara só lançamentos, só perpétuo, ou tudo?" → `tipo_lancamento`.
2. Pergunte se algum evento sai (teste, turma paralela, mês repetido) → `launches` com os rótulos que **ficam** (veja `numeros.json → all_labels`).
3. Pergunte qual indicador guia a leitura (padrão: conversão) → `metric`.
4. Vários recortes → gere várias vezes em pastas diferentes.

## Casos ambíguos
- Menos de 3 eventos após o recorte: avise que tendência vira hipótese.
- Rótulo repetido (dois eventos no mesmo mês): `launches` seleciona os dois; para separar, use o `tipo_lancamento` ou gere sem um deles filtrando o CSV.
