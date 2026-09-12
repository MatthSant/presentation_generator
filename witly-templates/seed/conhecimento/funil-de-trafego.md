---
tipo: definicao
dominio: analise
nivel: tatico
escopo: geral
sempre: false
gatilho: [ao_abrir, ao_diagnosticar]
tags: [trafego-pago, metrica, funil, captacao]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"termos": ["Impressões → Cliques (CTR)", "Cliques → Pageviews (Connect)", "Pageviews → Leads (conversão de página)", "Leads → Respostas (taxa de resposta)", "Respostas → MQLs (qualificação)"]}
---
# Funil de tráfego: impressões → cliques (CTR) → pageviews (Connect) → leads (conv. de página) → respostas → MQLs

Cada etapa tem uma métrica e um dono: leilão (CPM), criativo (CTR), página (Connect e conversão), pesquisa (resposta e qualificação). Base sem pageviews: não cite Hook, Hold nem Connect; a conversão passa a ser leads ÷ cliques.
