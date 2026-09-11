# Onde há filtro, card e destaque levam bind: número parado no total quando a base muda é erro
Tipo: regra

kpi(bind={dataset, ratio|metric}) e destaque(bind, vars) recalculam nas linhas filtradas; custo e taxa são razão de somas, nunca soma de linhas. Exclua a linha "Geral" com exclude.
