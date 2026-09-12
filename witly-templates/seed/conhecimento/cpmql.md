---
tipo: metrica
dominio: analise
nivel: tatico
escopo: geral
sempre: false
gatilho: [ao_consultar_dados, ao_diagnosticar, ao_escrever]
tags: [trafego-pago, metrica, cpmql, mql, lancamento, captacao]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12), mediocrebrain/.claude/rules/trafego.md]
dados: {"formula": "CPMQL = CPL ÷ qualificação, com qualificação = MQLs ÷ respostas", "unidade": "R$", "melhor": "menor", "armadilhas": ["nunca invest ÷ MQL (só se o consultor pedir explicitamente)", "qualificação ÷ leads no lugar de ÷ respostas"]}
---
# CPMQL = CPL ÷ qualificação (MQLs ÷ respostas): o custo por lead qualificado, um só jeito de calcular

É a métrica de decisão da captação de lançamento. Vale em todo cliente, report, query e nota: CPL ÷ taxa de qualificação projetada no total de leads (= invest × respostas ÷ (leads × MQL)).
