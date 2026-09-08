# Estrutura: páginas, seções e o que cada bloco responde

**Saída:** `relatorio/paginas.json` e o esqueleto das seções (títulos e blocos) combinados **antes** de calcular. **Confirmar com o consultor.**

## Definição
O documento segue o padrão dos templates: resposta primeiro, comparação, implicação, ação. Uma seção por sub-pergunta; uma página quando cabe numa tela, várias quando há sub-perguntas independentes. O esqueleto define quais tabelas o `calc_livre.py` precisa gerar.

## Como executar
1. Liste as sub-perguntas (2 a 5). Cada uma vira uma seção `sNN` com título em forma de pergunta ou de afirmação.
2. Para cada seção, decida os blocos: highlight (resposta) → KPIs (2 a 4) → um gráfico ou uma tabela → implicação → ações (só se pedido).
3. Derive as tabelas: cada gráfico/tabela/KPI aponta uma tabela do `dataset.json` (nome, dimensões, colunas). Essa lista é o contrato do `calc_livre.py`.
4. Mostre o esqueleto ao consultor (títulos + blocos + tabelas) e ajuste antes de calcular.

## Casos ambíguos
- Mais de 5 seções: a pergunta é grande demais; corte ou divida em dois documentos.
- Bloco sem tabela que o sustente: ou entra uma tabela, ou o bloco sai.

## Saída (formato exato)
```json
[{ "id": "panorama", "label": "Panorama", "sections": [{ "id": "s01", "label": "Resposta" }, { "id": "s02", "label": "Por canal" }] }]
```
