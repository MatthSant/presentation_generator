---
tipo: regra
dominio: comunicacao
nivel: operacional
escopo: geral
sempre: true
gatilho: [sempre, ao_escrever]
tags: [numeros, escrita]
confianca: alta
dados: {"forca": "sempre"}
---
# Todo número vem com janela (ontem, 3 dias, 7 dias, lançamento) e a data do dado fechado

Número sem janela não existe: "CPL R$ 12,40 (3 dias até 06/09)". Formato: `R$ 1.234,56`, percentual com vírgula (`12,5 %`).
