# O documento: Histórico de lançamentos

Duas páginas: **Panorama ao longo do tempo** e **Investimentos e custos de mídia**. Todo número vem de `numeros.json` (`calc.build_series`: um bloco `ov` + `media` por lançamento, em ordem cronológica); as tabelas `lc_*` do `dataset` alimentam gráficos e o banco de perguntas. Lançamentos selecionados e indicador do bloco de evolução viram `--opts` no offline: um HTML = um recorte.

## 1. Panorama ao longo do tempo (`s01`)
- **Indicadores principais** (4 kpi-cards com sparkline e Δ vs lançamento anterior): Taxa de conversão, ROAS, ROI, Retorno bruto.
- **Volume e qualificação** (8 kpi-cards): Investimento total, Leads totais, Vendas (produto principal), Reembolsos, Leads recapturados, Taxa de qualidade (MQL), Conversão MQL, Split pago × orgânico.
- **Evolução de indicadores** (`metric-toggle` + 5 `chart-table`): o indicador escolhido (`--opts metric`, padrão conversão) quebrado em geral, pago × orgânico, por plataforma, por temperatura e MQL × não-MQL; cada bloco tem gráfico de linhas por lançamento, tabela comparativa e linha de média.
- **Resultado financeiro** (3 charts): ROAS, ROI e Retorno por lançamento, com a nota de definição.

## 2. Investimentos e custos de mídia (`s02`)
Só tráfego pago.
- **Indicadores de mídia** (8 kpi-cards): Investimento pago, CPM, CTR, CPC, CPL, Conv. paga, CPA, ROAS pago, cada um com Δ vs anterior.
- **Investimento por lançamento** (chart).
- **Um bloco por métrica** (CPM, CTR, CPC, CPL, Conversão paga, CPA): gráfico geral por lançamento, gráfico por temperatura (Hot/Warm/Cold/Advantage) e tabela "por temperatura · comparação entre lançamentos". Outliers (cercas de Tukey) saem das séries onde existem, com botão para mostrar.
- **Nota de método**: métricas somam os brutos e calculam sobre o total; orgânico fica fora.

## O que o agente escreve no chat (não no HTML)
- As 3–5 perguntas norteadoras mais relevantes (leia `numeros.json`; as perguntas vêm no kit em `perguntas.md`).
- As premissas: eventos incluídos/excluídos e por quê, regras de plataforma e temperatura usadas, quebras de série (mudança de mecânica), lançamentos com venda ainda aberta.

## Aprofundamentos
Perguntas aceitas viram seções `det-<id>` via `aprofundar.py`, dentro do `design-system.md`, com números calculados em Python a partir do `calc.py` (mesmas definições do relatório).
