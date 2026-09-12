---
tipo: regra
dominio: analise
nivel: tatico
escopo: geral
sempre: true
gatilho: [sempre, ao_diagnosticar, ao_escrever]
tags: [estatistica, numeros, tendencia, lancamento, sazonalidade]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"forca": "sempre"}
---
# Com menos de 3 pontos (dias, períodos, lançamentos) não há tendência, consistência nem sazonalidade: é hipótese

Dois pontos formam uma reta, não um padrão. Relate os valores e diga que não dá para ler direção. Vale para classe de consistência, série de custo e comparação entre lançamentos.
