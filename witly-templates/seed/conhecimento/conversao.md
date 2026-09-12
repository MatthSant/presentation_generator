---
tipo: metrica
dominio: analise
nivel: operacional
escopo: geral
sempre: false
gatilho: [ao_consultar_dados, ao_escrever]
tags: [metrica, conversao]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"formula": "Conversão = vendas ÷ leads do segmento", "unidade": "%", "melhor": "maior", "armadilhas": ["comparar segmentos com denominadores diferentes (respondentes × total)", "menos de 30 eventos no denominador é sem evidência"]}
---
# Conversão = vendas ÷ leads do segmento, sempre com o mesmo denominador nos dois lados da comparação

Conversão de respondentes não se compara com a do lançamento inteiro; conversão paga usa leads pagos; conversão MQL usa MQLs.
