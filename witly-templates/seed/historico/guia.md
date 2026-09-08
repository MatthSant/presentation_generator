# Guia de leitura: Histórico de lançamentos

## Como funciona a mecânica
Cada lançamento encerrado é um ponto de uma série cronológica. O relatório compara os pontos em quatro dimensões: **conversão**, **qualidade de lead**, **eficiência de mídia paga** e **reembolso**, e quebra cada uma por **canal** (pago × orgânico), **plataforma** (Meta × Google), **temperatura** (Hot/Warm/Cold/Advantage) e **perfil MQL**. A pergunta é sempre "está melhorando ou piorando, e por causa de quê?".

## O que o relatório entrega
| Página | O que mostra |
|---|---|
| Panorama | KPIs principais (Conversão, ROAS, ROI, Retorno) com sparkline e Δ vs anterior; cards de volume (investimento, leads, vendas, reembolsos, recapturados, qualificação, conv. MQL, split pago/orgânico); bloco "Evolução" com o indicador escolhido quebrado em geral, pago × orgânico, plataforma, temperatura e perfil MQL (gráfico + tabela + linha de média) |
| Investimentos | mídia paga: CPM, CTR, CPC, CPL, conversão paga, CPA e ROAS pago por lançamento e por temperatura, com variação vs anterior; outliers (Tukey/IQR) removidos das séries onde existem |

## Classificação (a fonte dos erros)
Tudo vem pronto no CSV pela query: tipo de evento (prefixo do `field_conversion`), pago × orgânico (`ads` no `utm_source`), plataforma (prefixos `meta_like` / `google_like`) e temperatura (CASE por nome de campanha, rótulos fixos Hot/Warm/Cold/Advantage). **Inspecione `utm_source` e os nomes de campanha antes de rodar** (tarefas classificação e temperatura). Volume alto de `N/C` ou `UTM Quebrado` é problema de dado.

## Como ler cada bloco
- **KPIs**: leia a direção (sparkline) antes do nível; um lançamento fora da curva pede o `--opts launches` sem ele para ver a tendência de fundo.
- **Evolução**: troque o indicador (`metric`) para ver se a piora de conversão vem do canal (pago × orgânico), da plataforma ou da temperatura. Se todos caem juntos, a causa é global (oferta, época).
- **Perfil MQL**: conv. MQL alta e conv. não-MQL baixa → a qualificação prevê a venda; se as duas se igualam, o critério de MQL não discrimina.
- **Investimentos**: CPA subiu → `decomposicao` diz se foi CPL ou conversão paga; CPL subiu → CPM (leilão) ou CTR (criativo).
- **Temperatura no pago**: compare CPL e conv. paga por temperatura entre lançamentos; o mix (quanto foi para Cold) explica boa parte da variação do CPA.

## Regras desta análise
As regras (o que não concluir, os cuidados) são **entradas**, não texto solto: chegam no `obter_template` e no `regras.md` do kit, cada uma com o título dizendo a regra. Na plataforma ficam na aba **Regras**.
