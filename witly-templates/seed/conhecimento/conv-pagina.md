---
tipo: metrica
dominio: analise
nivel: operacional
escopo: geral
sempre: false
gatilho: [ao_consultar_dados, ao_diagnosticar]
tags: [trafego-pago, metrica, conversao, pagina, captacao]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"formula": "Conv. de página = leads ÷ pageviews (sem pageviews: leads ÷ cliques)", "unidade": "%", "melhor": "maior", "armadilhas": ["misturar leads ÷ pageviews com leads ÷ cliques na mesma comparação"]}
---
# Conversão de página = leads ÷ pageviews; sem pageviews, leads ÷ cliques

É o fator "oferta/página" na decomposição do CPL. Base sem pageviews: use leads ÷ cliques e diga que o benchmark é o produto Connect × conversão.
