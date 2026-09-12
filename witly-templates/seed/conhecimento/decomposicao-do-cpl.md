---
tipo: diagnostico
dominio: analise
nivel: tatico
escopo: geral
sempre: false
gatilho: [ao_diagnosticar, ao_recomendar]
tags: [trafego-pago, metrica, cpl, diagnostico, cpm, ctr, pagina]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"sintoma": "CPL subiu ou caiu entre o início e os últimos 3 dias", "causas": ["CPM mudou → leilão/mídia (nível campanha/público)", "CTR mudou → criativo (nível criativo)", "conversão de página mudou → oferta ou página (nível funil)"], "checar": ["comparar início da campanha com os últimos 3 dias", "citar os três fatores e nomear o que mais mudou", "base sem pageviews: usar leads ÷ cliques no lugar da conversão de página"], "funil": "lancamento"}
---
# CPL mudou: decomponha em CPM ÷ 1000 ÷ CTR ÷ conv. de página e nomeie o fator que mais mudou

A variação do CPL nunca se explica pelo próprio CPL. Cada fator tem um dono: leilão, criativo, página. Diga os três e o maior.
