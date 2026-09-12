---
tipo: metrica
dominio: analise
nivel: operacional
escopo: geral
sempre: false
gatilho: [ao_consultar_dados, ao_diagnosticar]
tags: [trafego-pago, metrica, connect, pagina]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"formula": "Connect = pageviews ÷ cliques", "unidade": "%", "melhor": "maior", "armadilhas": ["base sem pageviews não tem Connect: é dado ausente, não zero"]}
---
# Connect = pageviews ÷ cliques: quanto do clique chega à página

Connect baixo é página lenta, redirecionamento ou tracking quebrado. Só existe com a coluna de pageviews.
