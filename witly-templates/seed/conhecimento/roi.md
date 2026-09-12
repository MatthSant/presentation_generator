---
tipo: metrica
dominio: negocio
nivel: estrategico
escopo: geral
sempre: false
gatilho: [ao_escrever]
tags: [metrica, roi, lucro]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"formula": "ROI = (faturamento − investimento total) ÷ investimento total", "unidade": "x", "melhor": "maior", "armadilhas": ["ROI usa o investimento total (mídia + taxas); ROAS usa só mídia"]}
---
# ROI = (faturamento − investimento total) ÷ investimento total

Diferença para o ROAS: o ROI carrega o investimento total do lançamento (mídia, taxas, produção); o ROAS olha só a mídia. Os dois são líquidos.
