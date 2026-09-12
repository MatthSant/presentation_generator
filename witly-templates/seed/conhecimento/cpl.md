---
tipo: metrica
dominio: analise
nivel: operacional
escopo: geral
sempre: false
gatilho: [ao_consultar_dados, ao_escrever]
tags: [trafego-pago, metrica, cpl, captacao]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"formula": "CPL = investimento ÷ leads pagos", "unidade": "R$", "melhor": "menor", "armadilhas": ["dividir pelo total de leads (orgânico entra no denominador)", "em debriefing o investimento é só o de captação (invest_cpt)"]}
---
# CPL = investimento ÷ leads pagos

Leads pagos são os que vieram de mídia (utm de tráfego). Para explicar uma variação, decomponha: CPM, CTR e conversão de página.
