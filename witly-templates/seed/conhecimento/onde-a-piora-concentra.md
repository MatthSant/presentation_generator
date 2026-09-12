---
tipo: metodo
dominio: analise
nivel: tatico
escopo: geral
sempre: false
gatilho: [ao_diagnosticar, ao_recomendar]
tags: [trafego-pago, metrica, diagnostico, escalonamento, criativos, publico, canais]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"origem": "witly", "quando": "um KPI piorou e é preciso dizer onde", "entrada": "início vs recente por item em cada nível", "passos": ["desça temperatura → campanha → público → criativo", "em cada nível, compare início vs recente por item", "item que explica mais da metade da piora com menos de um terço do volume = causa concentrada nele", "todos pioram parecido = causa global (leilão, sazonalidade, estrutura)", "mostre o volume ao lado: item com 1 lead não é conclusão"], "saida": "o nível e o item onde a piora concentra, ou \"geral\""}
---
# Onde a piora concentra: desça temperatura → campanha → público → criativo e diga se um item explica a maior parte

É o método por trás de "antes de culpar um criativo, veja se a piora é geral". Resolve no nível mais baixo e sobe só quando saturou.
