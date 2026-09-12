---
tipo: metrica
dominio: negocio
nivel: estrategico
escopo: geral
sempre: false
gatilho: [ao_escrever]
tags: [metrica, lucro, retorno]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"formula": "Retorno = faturamento − investimento (líquido de reembolso, impostos e taxas quando existirem)", "unidade": "R$", "melhor": "maior", "armadilhas": ["faturamento bruto com reembolso aberto superestima"]}
---
# Retorno = faturamento − investimento, líquido do que já se sabe (reembolso, imposto, taxa)

No histórico entram sales_tax e broker_fee; no criativo, só faturamento − investimento. Diga qual versão está usando.
