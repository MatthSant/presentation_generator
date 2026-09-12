---
tipo: metrica
dominio: analise
nivel: operacional
escopo: geral
sempre: false
gatilho: [ao_consultar_dados, ao_diagnosticar]
tags: [trafego-pago, metrica, hook, criativos, video]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"formula": "Hook = views totais ÷ impressões", "unidade": "%", "melhor": "maior", "armadilhas": ["só criativo em vídeo tem Hook; estático vem vazio, não zero"]}
---
# Hook = views totais ÷ impressões: se o vídeo segura os primeiros segundos

Compare vídeo com vídeo. Hook baixo com CTR alto é raro; Hook alto com CTR baixo é vídeo que prende e não chama para o clique.
