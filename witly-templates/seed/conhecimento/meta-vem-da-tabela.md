---
tipo: regra
dominio: dados
nivel: operacional
escopo: geral
sempre: true
gatilho: [sempre, ao_consultar_dados, ao_escrever]
tags: [metas]
confianca: alta
dados: {"forca": "sempre"}
---
# Meta só existe onde a tabela de metas define: por canal (utm_source) sim; por temperatura, campanha, público ou criativo, não invente

Os launch goals trazem uma linha por `utm_source` × dia, então meta por canal é dado real e pode ser comparada. Fora disso, só existe meta se o consultor entregar. Sem meta para o recorte, escreva "sem meta definida" em vez de estimar uma.
