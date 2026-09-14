# Não gere com investimento de captação zerado, campanha com gasto em "outro" ou metas sem linha: confira e confirme com o consultor antes

Tipo: regra

O motor divide por zero em silêncio: classificação errada devolve ROAS 0,00×, CPL, CPMQL, CPM e CPC
zerados, e o relatório sai completo e errado. Metas que não casam o `field_conversion` somem do mesmo
jeito. Rode a tarefa `conferencia`, mostre a tabela (investimento total, de captação, mídia bruta,
campanhas em "outro", metas, leads de tráfego) e pergunte se bate com o painel. Só então `gerar.py`.
