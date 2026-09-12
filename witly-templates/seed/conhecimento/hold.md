---
tipo: metrica
dominio: analise
nivel: operacional
escopo: geral
sempre: false
gatilho: [ao_consultar_dados, ao_diagnosticar]
tags: [trafego-pago, metrica, hold, criativos, video]
confianca: alta
fontes: [regras dos templates (revisão 2026-09-12)]
dados: {"formula": "Hold = views retidas ÷ views totais (só vídeo)", "unidade": "%", "melhor": "maior", "armadilhas": ["o corte da retenção é do template: acompanhamento usa 50%, criativos usa 100% — não compare Hold entre os dois", "video_p100_views pode não existir na conta: aí fica vazio, não zero"]}
---
# Hold = views retidas ÷ views totais (só vídeo); o corte (50% ou 100%) é do template

Diz se o vídeo sustenta a atenção depois do Hook. Só existe com a coluna de views preenchida. Divergência de corte entre templates registrada na revisão: até unificar, cite o corte junto do número.
