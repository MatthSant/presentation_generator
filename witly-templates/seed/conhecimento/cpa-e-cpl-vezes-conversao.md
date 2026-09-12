---
tipo: metrica
dominio: analise
nivel: tatico
escopo: geral
sempre: true
gatilho: [sempre, ao_diagnosticar, ao_consultar_dados]
tags: [metrica, cpa, cpl]
confianca: alta
dados: {"formula": "CPA = CPL ÷ conversão", "melhor": "menor", "armadilhas": ["explicar a variação do CPA pelo próprio CPA"]}
---
# CPA = CPL ÷ conversão: a variação do CPA se explica por CPL e por conversão, nunca pelo próprio CPA

Ao explicar o custo por venda, atribua a mudança aos dois fatores (mídia × conversão). CPL ← CPM (leilão), CTR (criativo), Connect (página), Conv. de página (oferta): use `decomposicao` do motor.
