---
tipo: regra
dominio: analise
nivel: operacional
escopo: geral
sempre: false
gatilho: [ao_diagnosticar, ao_escrever]
tags: [trafego-pago, metrica, hook, hold, criativos, video]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"forca": "geralmente"}
---
# Hook e Hold só existem em vídeo: estático vem vazio, não zero; compare vídeo com vídeo

Ranking de Hook com estático no meio é ranking errado. Sem a coluna de views, não cite Hook nem Hold.
