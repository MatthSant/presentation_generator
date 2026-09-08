# Guia de leitura: Análise de criativos

## Como funciona a mecânica
Cada anúncio (`field_ad_name`) é uma unidade: quanto investiu, quantas impressões, cliques, pageviews, leads, MQLs, vendas e faturamento **atribuídos a ele**. A análise cobre um **período** (não um lançamento) e **um tipo de campanha** (Lead ou Venda, escolhido antes de gerar). Dois modos de leitura, alternáveis no app e escolhidos por `--opts` no offline:
- **Resultado Final**: ROAS líquido, retorno, CAC, conversão (★ ROAS).
- **Captação**: CPL, CPMQL projetado, qualidade, CPM, CTR (★ CPMQL).

## O que o relatório entrega
| Página | O que mostra |
|---|---|
| Panorama | KPIs macro do modo, qualidade de captação vs benchmark (Hook/Hold/CTR/Connect/Conv. página), evolução diária, dispersão com eixos selecionáveis e a grade de criativos por desempenho |
| Fichas (uma por criativo) | preview do anúncio (com dicionário), resultado macro, quebra por campanha / público / temperatura, evolução diária |

## Definições
- **Produto principal** = `vendas_sale` se houver; senão `vendas` (faturamento acompanha).
- **ROAS líquido** = faturamento ÷ investimento − 1 (0 = empate; negativo = prejuízo) · **Retorno** = faturamento − investimento · **CAC** = investimento ÷ vendas.
- **CPL** = investimento ÷ leads · **Qualidade** = MQLs ÷ **respostas** · **CPMQL** = CPL ÷ qualidade · **CPM** = investimento × 1000 ÷ impressões · **CTR** = cliques ÷ impressões.
- **Hook** = views totais ÷ impressões · **Hold** = views 100 % ÷ views totais (só vídeo) · **Connect** = pageviews ÷ cliques · **Conv. página** = leads ÷ pageviews.
- **Média do lançamento** (referência das fichas): razões e custos usam a razão **agregada** (ponderada); métricas aditivas, total ÷ nº de criativos válidos. Nunca média de médias.
- **Criativo válido** = tem tráfego (impressões ou investimento) e investimento ≥ `min_invest`. Os demais aparecem em cinza e ficam fora de totais e médias.

## Classificação (a fonte dos erros)
Tipo de campanha por `tipo_rules` sobre `field_campaign_name` (obrigatório); temperatura por `temp_rules`. **Inspecione os nomes antes de gerar** (tarefas tipo-campanha e temperatura). Confirme que `field_ad_name` bate entre mídia e conversões, senão o criativo fica sem leads/vendas e parece ruim.

## Como ler cada bloco
- **KPIs macro**: no modo Resultado, primeiro ROAS e retorno; depois CAC. No modo Captação, CPMQL e CPL; CPM diz leilão, CTR diz criativo.
- **Qualidade de captação**: cada indicador vs benchmark. Hook baixo = abertura; Hold baixo = o meio do vídeo; CTR baixo = chamada; Connect baixo = página lenta/link; Conv. página baixa = oferta/formulário. `benchmark_gap` no `query_api` ordena os gargalos.
- **Dispersão**: investimento × ROAS (ou CPL) mostra quem merece escala (alto volume, bom retorno) e quem é falso positivo (ótimo ROAS com R$ 50).
- **Ficha**: compare a quebra por temperatura/público com a média do lançamento; o mesmo criativo pode funcionar no quente e falhar no frio.
- **Saturação**: `saturacao_diaria` (ROAS/retorno por dia de um criativo) mostra fadiga.

## Regras desta análise
As regras (o que não concluir, os cuidados) são **entradas**, não texto solto: chegam no `obter_template` e no `regras.md` do kit, cada uma com o título dizendo a regra. Na plataforma ficam na aba **Regras**.
