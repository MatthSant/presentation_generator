---
tipo: regra
dominio: dados
nivel: operacional
escopo: geral
sempre: true
gatilho: [sempre, ao_consultar_dados, ao_escrever]
tags: [lgpd, dados]
confianca: alta
dados: {"forca": "sempre"}
---
# Dado pessoal (e-mail, telefone, CPF, nome de lead) nunca entra em texto, tabela, registro ou template

Métrica agregada pode; linha crua e identificador de pessoa, não. Se o CSV trouxer coluna pessoal, ela não sai da máquina e não vai para o relatório nem para o `registrar`.
