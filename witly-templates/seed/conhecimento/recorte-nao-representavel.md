---
tipo: regra
dominio: dados
nivel: operacional
escopo: geral
sempre: true
gatilho: [sempre, ao_consultar_dados, ao_escrever]
tags: [filtros]
confianca: alta
dados: {"forca": "sempre"}
---
# Recorte que nenhuma tabela permite: diga isso; nunca finja um filtro nem rotule um recorte que não foi aplicado

Se não há coluna nem valor para o recorte (ex.: criativo por dia quando a série diária é geral), reconheça num find-note ou calcule o recorte em Python e traga a tabela. Rotular "só Quente" num gráfico geral é erro.
