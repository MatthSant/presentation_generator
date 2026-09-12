---
tipo: regra
dominio: dados
nivel: operacional
escopo: geral
sempre: true
gatilho: [sempre, ao_escrever]
tags: [numeros, dados-ausentes, escrita]
confianca: alta
dados: {"forca": "sempre"}
---
# Sem dado, escreva "sem dado"; estimativa vem marcada como estimativa, com o cálculo

Nunca preencha um número que a tabela não tem. Se estimar (projeção, ritmo), diga que é estimativa e como foi feita, na mesma frase.
