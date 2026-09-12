---
tipo: regra
dominio: comunicacao
nivel: operacional
escopo: geral
sempre: true
gatilho: [sempre, ao_escrever]
tags: [numeros, escrita, comunicacao]
confianca: alta
fontes: [mediocrebrain/.claude/rules/comunicacao.md]
dados: {"forca": "sempre"}
---
# Dinheiro é R$ 1.234,56 e percentual tem vírgula (12,5%): formato brasileiro em todo texto e tabela

Nunca 1,234.56 nem 12.5%. Milhar com ponto, decimal com vírgula, R$ com espaço. Vale para prosa, tabela, KPI e gráfico. Número sem janela não existe: ver a regra da janela.
