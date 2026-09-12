---
tipo: regra
dominio: analise
nivel: operacional
escopo: geral
sempre: true
gatilho: [sempre, ao_consultar_dados, ao_escrever]
tags: [numeros, agregacao]
confianca: alta
dados: {"forca": "sempre"}
---
# Taxa, custo e ROAS nunca se somam nem tiram média simples: o geral é ponderado (Σ numerador ÷ Σ denominador)

Somar CPLs ÷ N ou somar taxas de grupos dá número errado (64 % + 49 % = 113 % é absurdo). Só leads, investimento, vendas e faturamento são aditivos. Para o "Geral" use o valor global do motor (tabela de KPIs ou `incluir_geral`), nunca a soma das linhas.
