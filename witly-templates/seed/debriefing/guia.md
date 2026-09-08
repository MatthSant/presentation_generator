# Guia de leitura: Debriefing de lançamento

## Como funciona a mecânica
Um lançamento tem **captação** (o lead entra na lista pelas campanhas de captação), **aquecimento** e **venda** (abertura de carrinho, campanhas de vendas). O debriefing olha o lançamento **inteiro, depois de encerrado**, e compara cada resultado contra a **meta** (obrigatória) e, se houver, contra o **lançamento anterior**. Diferente do acompanhamento (diário, em curso) e do histórico (vários lançamentos).

O que decide a leitura: **atingimento** (leads, vendas, faturamento vs meta), **eficiência de mídia** (CPL, CPMQL, CPM, CTR, ROAS, só sobre o investimento de captação), **qualidade da base** (taxa de resposta e qualificação), **composição** (pago × orgânico, canais, temperaturas) e **ritmo** (semana a semana por data de inscrição).

## As 6 páginas (a última é o One Pager)
| Página | O que mostra |
|---|---|
| Panorama | atingimento de leads e vendas vs meta; resultado macro (faturamento, retorno, ROI, ROAS); Δ vs meta e vs histórico |
| Canal | performance por `utm_source` e por escopo (pago × orgânico): leads, vendas, conversão, CPL |
| Tráfego pago | só captação: investimento, CPL, CPMQL, CPM, CTR, conv. de página, por temperatura e por campanha |
| Orgânico | canais orgânicos e "Não trackeado" |
| Análise 360° | até 13 perguntas estratégicas (Q1–Q13) com veredito e gráficos; Q10/Q11 são a leitura temporal (semana a semana por **data de inscrição**) |
| One Pager | resumo executivo de uma tela, alavancas e gargalos automáticos |

## Classificação (a fonte dos erros)
Pago = `utm_source` contém um `paid_sources`; captação/vendas = `field_campaign_name` contém `cpt_pattern`/`vnd_pattern`; temperatura pelas `temp_rules`. **Inspecione `utm_source` e `field_campaign_name` antes de gerar** (tarefa de contexto "classificação").

## Como ler cada bloco
- **Atingimento**: primeiro leads e vendas vs meta; depois, qual segmento explica a diferença (canal ou temperatura), sem inventar meta por segmento.
- **Mídia**: CPL fora da meta → decomponha (CPM = leilão, CTR = criativo, conv. de página = oferta/página); CPMQL fora → CPL ou qualificação.
- **Canais**: a soma de vendas por canal pode não fechar com o total (vendas sem atribuição); reconheça, não force.
- **Métricas no tempo** (pickers em Panorama/Tráfego/Orgânico) e Q10/Q11: procure a semana de inflexão; a cauda pós-lançamento (sem mídia) distorce séries de custo — corte os dias sem investimento antes de ler custo.
- **360°**: cada Q tem veredito; use como pauta da reunião, não como lista de tarefas.

## Regras desta análise
As regras (o que não concluir, os cuidados) são **entradas**, não texto solto: chegam no `obter_template` e no `regras.md` do kit, cada uma com o título dizendo a regra. Na plataforma ficam na aba **Regras**.
