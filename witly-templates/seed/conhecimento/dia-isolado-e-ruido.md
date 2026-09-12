---
tipo: regra
dominio: analise
nivel: tatico
escopo: geral
sempre: true
gatilho: [sempre, ao_diagnosticar]
tags: [tendencia, sazonalidade]
confianca: alta
dados: {"forca": "geralmente"}
---
# Dia isolado, fim de semana e feriado são ruído: leia a tendência (últimos 3 dias vs início) e não recomende escala ou corte por eles

Volume baixo infla ou zera taxas. Sinalize o período fraco e decida pela janela de 3 ou 7 dias.
