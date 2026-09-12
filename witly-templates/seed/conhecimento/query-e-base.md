---
tipo: regra
dominio: dados
nivel: operacional
escopo: geral
sempre: false
gatilho: [ao_consultar_dados]
tags: [dados, sql, delfos, temperatura]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"forca": "geralmente"}
---
# A query do kit é uma base: confirme nomes de tabela e coluna e os rótulos (temperatura Hot/Warm/Cold/Advantage) antes de rodar

Rótulo diferente some da quebra em silêncio. Ajuste o CASE de temperatura ao que a conta usa e diga o que mapeou.
