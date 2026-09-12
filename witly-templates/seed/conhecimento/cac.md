---
tipo: metrica
dominio: analise
nivel: tatico
escopo: geral
sempre: false
gatilho: [ao_consultar_dados, ao_escrever]
tags: [trafego-pago, metrica, cac, atribuicao]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"formula": "CAC = investimento ÷ vendas atribuídas", "unidade": "R$", "melhor": "menor", "armadilhas": ["em lançamento: só investimento de captação (invest_cpt) e vendas do pago", "janela recente é piso: a atribuição ainda matura", "depende do modelo de atribuição (STA/LTA, last click, coorte)"]}
---
# CAC = investimento ÷ vendas atribuídas; em janela recente é piso

CAC ótimo, alvo e limite vêm do plano do cliente (LTV ÷ relação alvo), não do dado. Em captação a venda ainda não fechou: não julgue.
