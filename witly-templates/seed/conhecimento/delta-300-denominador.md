---
tipo: regra
dominio: dados
nivel: operacional
escopo: geral
sempre: false
gatilho: [ao_diagnosticar, ao_escrever]
tags: [numeros, dados, canais, diagnostico]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"forca": "geralmente"}
---
# Δ% acima de ±300% quase sempre é denominador errado: utm novo ou campanha reclassificada, não resultado

Um canal que "cresceu 900%" costuma ser um utm_source novo ou uma campanha que mudou de classe. Investigue a classificação antes de entregar o número.
