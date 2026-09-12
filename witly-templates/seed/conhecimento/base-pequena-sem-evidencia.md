---
tipo: regra
dominio: analise
nivel: tatico
escopo: geral
sempre: true
gatilho: [sempre, ao_diagnosticar]
tags: [estatistica, amostra, numeros, trafego-pago]
confianca: alta
dados: {"forca": "sempre"}
---
# Taxa sobre menos de ~30 eventos no denominador é "sem evidência", não resultado

2 vendas em 7 leads é 28,6 %, mas não diz nada. Diga "base pequena, sem evidência" em vez de comparar com a meta. Vale para leads, respostas, cliques e vendas.
