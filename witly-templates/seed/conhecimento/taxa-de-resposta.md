---
tipo: metrica
dominio: analise
nivel: operacional
escopo: geral
sempre: false
gatilho: [ao_consultar_dados]
tags: [trafego-pago, metrica, pesquisa, mql, captacao]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"formula": "Taxa de resposta = respostas ÷ leads", "unidade": "%", "melhor": "maior", "armadilhas": ["qualificação usa respostas no denominador, não leads"]}
---
# Taxa de resposta = respostas da pesquisa ÷ leads

Quem não respondeu não entra na qualificação. Taxa de resposta baixa torna o CPMQL uma projeção mais frágil.
