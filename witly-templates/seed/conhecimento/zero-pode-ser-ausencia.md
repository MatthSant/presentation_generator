---
tipo: regra
dominio: dados
nivel: operacional
escopo: geral
sempre: true
gatilho: [sempre, ao_consultar_dados, ao_diagnosticar]
tags: [dados, dados-ausentes, numeros]
confianca: alta
dados: {"forca": "sempre"}
---
# Zero pode ser dado ausente: confira se a coluna existe e está preenchida antes de concluir "não vendeu" ou "não rodou"

Gasto zerado num dia costuma ser anúncio desligado ou integração atrasada, não desempenho. Olhe a coluna e os dias vizinhos antes de afirmar.
