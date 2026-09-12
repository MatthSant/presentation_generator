---
tipo: definicao
dominio: dados
nivel: operacional
escopo: geral
sempre: false
gatilho: [ao_consultar_dados]
tags: [dados, delfos, vendas]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"termos": ["produto principal = vendas_sale quando existe; senão vendas", "o faturamento acompanha a mesma escolha"]}
---
# Produto principal = `vendas_sale` quando existe; senão `vendas`; o faturamento acompanha

Vale para criativos e histórico. Diga no documento qual coluna foi a base quando as duas existem.
