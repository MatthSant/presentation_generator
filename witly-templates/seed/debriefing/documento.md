# O documento: Debriefing de lançamento

Seis páginas com navegação lateral; a última é o One Pager. Todo número vem de `numeros.json` (o `calc.build`); as tabelas do `dataset` (`deb_kpis`, `deb_temp`, `deb_weekly`, `deb_canais`…) alimentam os widgets. O filtro do app (tipo/canal/temperatura/campanha/público/criativo) vira `--opts` no offline: um HTML = um recorte.

## 1. Panorama Geral (`s01`)
- **Indicadores globais** (8 kpi-cards): Atingimento · Leads e · Vendas (realizado ÷ meta), Faturamento bruto, Reembolsos, Conversão geral, Retorno bruto, ROI global, ROAS captação. Cada card traz Δ vs meta e, se houver `hist.csv`, Δ vs histórico.
- **Indicadores de volume** (8 kpi-cards): Investimento total, Leads totais, CPL, Leads recapturados (antigos + clientes), Taxa de resposta, Qualificação, CPMQL, Vendas.
- **Comparativo realizado vs meta** (`meta-bars`): leads, vendas, faturamento, investimento, CPL, CPMQL, conversão, qualificação, o mesmo alvo global do `goals.csv`.
- **Métricas no tempo** (`evolution-picker`): série semanal (`deb_weekly`) de leads, vendas, CPL, conversão etc., por data de inscrição.

## 2. Canal e Conversão (`s02`)
- **Resumo executivo** (`escopo-cards`): pago × orgânico × geral (leads, vendas, conversão, faturamento).
- **Pipeline de conversão** (3 funis): geral, orgânico, pago: leads → respostas → MQLs → vendas.
- **Mapa de canais** (`quadrant-scatter`): volume × conversão por `utm_source`.
- **Canais vs meta** (`bullet-groups`): leads e vendas de cada canal contra a meta por `utm_source` do `goals.csv`.
- **Resultado por canal** (2 `channel-table`): pago e orgânico. Leads, share, respostas, qualificação, vendas, conversão, faturamento, CPL/CPMQL (pago).

## 3. Tráfego Pago (`s03`)
Só captação paga (`invest_cpt`).
- **Indicadores de resultado** (10 kpi-cards): atingimento leads/vendas, investimento, ticket médio, faturamento pago, CPL, conversão paga, retorno pago, CPMQL, ROAS captação.
- **Indicadores de captura**: funil impressões → cliques → pageviews → leads → respostas → MQLs, mais os cards CPM, CTR, CPC, taxa de página, CPL, taxa de resposta, qualificação, CPMQL.
- **Análise de mídia**: `evolution-picker` semanal, `scatter-picker` (correlação investimento × leads etc.) e find-block com R².
- **Gargalos no funil** (`heatmap-toggle`): por temperatura / campanha / público / criativo, taxas etapa a etapa.
- **Comparativo por segmento** (`bullet-groups`): temperatura e campanha contra o CPL/CPMQL alvo.

## 4. Orgânico (`s04`)
- **Indicadores de resultado** (10 kpi-cards): atingimento, vendas e faturamento orgânicos, % das vendas, % dos leads, conversão, taxa de resposta, qualificação, ticket médio.
- **Canais orgânicos vs meta** (`bullet-groups`) · **Métricas no tempo** · **Resultado por canal orgânico** (`heatmap-toggle`, inclui "Não trackeado").

## 5. Análise 360° (`s06`)
Até treze `qa-card` (Q1–Q13; as que dependem de público/adset só aparecem com o dado), cada um com veredito, stats e gráfico: resultado global; receita, vendas e retorno; captação por canal; qualidade dos leads; conversão geral/pago/orgânico; orgânico vs pago; captação orgânica por canal; mídia paga; temperatura (ROAS por público); dinâmica de vendas temporal (Q10); momento de inscrição, valor por semana (Q11); perfil, conversão por canal (Q12). Fecha com um find-block de síntese.

## 6. One Pager (`s07`)
Uma tela: KPIs de resultado e de volume (os mesmos do Panorama), alavancas e gargalos gerados automaticamente (o que puxou e o que segurou) e as recomendações. É o que vai para o cliente que não abre as outras páginas.

## O que o agente escreve no chat (não no HTML)
- As 3–5 perguntas norteadoras mais relevantes (`perguntas.json` × `numeros.json`).
- As premissas: classificação (pago/captação/vendas), temperatura, histórico usado ou não, recorte.

## Aprofundamentos
Perguntas aceitas viram seções `det-<id>` via `aprofundar.py`, dentro do `design-system.md`, com números do `query_api.py` (atingimento, decomposição, onde_concentra, impacto_receita, variacao_hist, cruzar_dia…).
