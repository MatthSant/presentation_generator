---
tipo: regra
dominio: analise
nivel: tatico
escopo: geral
sempre: true
gatilho: [sempre, ao_diagnosticar]
tags: [benchmark, numeros, entrega]
confianca: alta
dados: {"forca": "sempre"}
---
# Só afirme "acima/abaixo da média" trazendo o número de referência do dado

A referência vem da meta, do histórico ou da tabela (ranking, `incluir_geral`). Sem o número, não há comparação; diga que a referência não está disponível.
