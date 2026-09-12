---
tipo: regra
dominio: dados
nivel: operacional
escopo: geral
sempre: true
gatilho: [sempre, ao_consultar_dados, ao_escrever]
tags: [atribuicao, numeros, canais, dados]
confianca: alta
dados: {"forca": "sempre"}
---
# Soma por canal, público ou criativo pode não fechar com o total (sem atribuição): reconheça, não force

Vendas e leads sem utm ficam fora dos recortes. Diga "X vendas sem canal atribuído" num find-note; nunca ajuste os grupos para bater com o total.
