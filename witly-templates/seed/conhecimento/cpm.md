---
tipo: metrica
dominio: analise
nivel: operacional
escopo: geral
sempre: false
gatilho: [ao_consultar_dados, ao_diagnosticar]
tags: [trafego-pago, metrica, cpm, leilao]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"formula": "CPM = investimento × 1000 ÷ impressões", "unidade": "R$", "melhor": "menor", "armadilhas": ["CPM subindo com tudo o mais igual é leilão/mídia, não criativo"]}
---
# CPM = investimento × 1000 ÷ impressões: o preço do leilão

É o fator de mídia na decomposição do CPL. Sobe em sazonalidade forte, público saturado e concorrência.
