---
tipo: regra
dominio: design
nivel: operacional
escopo: geral
sempre: false
gatilho: [ao_escrever]
tags: [dashboard, entrega, design, numeros]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"forca": "sempre"}
---
# Bloco sem uma tabela que o sustente não entra no documento: widget bindado a coluna inexistente é recusado

Ou a tabela nasce no script e o número entra pelo bind, ou o bloco sai do esqueleto. O validador recusa; não tente contornar digitando o número.
