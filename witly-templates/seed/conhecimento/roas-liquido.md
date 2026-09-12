---
tipo: metrica
dominio: analise
nivel: tatico
escopo: geral
sempre: true
gatilho: [sempre, ao_consultar_dados, ao_diagnosticar, ao_escrever]
tags: [metrica, roas, atribuicao]
confianca: alta
dados: {"formula": "ROAS = faturamento ÷ investimento − 1", "unidade": "x", "melhor": "maior", "armadilhas": ["somar 1", "tratar como bruto", "recalcular a coluna pronta"]}
---
# ROAS é líquido (faturamento ÷ investimento − 1): 0 empata, negativo é prejuízo, acima de 0 é lucro por real investido

A coluna ROAS já vem pronta: não recalcule, não some 1, não trate como bruto. ROAS 0,78 = R$ 0,78 de lucro por real (1,78× em bruto). Escalar exige ROAS bem acima de 0.
