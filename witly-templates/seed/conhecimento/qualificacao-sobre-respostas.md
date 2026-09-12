---
tipo: metrica
dominio: analise
nivel: tatico
escopo: geral
sempre: true
gatilho: [sempre, ao_consultar_dados, ao_diagnosticar]
tags: [metrica, mql, lancamento]
confianca: alta
dados: {"formula": "qualificação = MQLs ÷ respostas da pesquisa; taxa de resposta = respostas ÷ leads", "unidade": "%", "melhor": "maior", "armadilhas": ["dividir MQL por leads"]}
---
# Qualificação = MQLs ÷ respostas da pesquisa, não ÷ leads; taxa de resposta = respostas ÷ leads

Quem não respondeu não entra no denominador da qualificação. CPMQL = CPL ÷ qualificação.
