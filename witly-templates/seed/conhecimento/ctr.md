---
tipo: metrica
dominio: analise
nivel: operacional
escopo: geral
sempre: false
gatilho: [ao_consultar_dados, ao_diagnosticar]
tags: [trafego-pago, metrica, ctr, criativos]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"formula": "CTR = cliques ÷ impressões", "unidade": "%", "melhor": "maior", "armadilhas": ["comparar CTR entre formatos e posicionamentos diferentes"]}
---
# CTR = cliques ÷ impressões: se o criativo prende

Cai quando o criativo cansou ou o público mudou. É o fator "criativo" na decomposição do CPL.
