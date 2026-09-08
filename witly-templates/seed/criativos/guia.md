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

## Classificação (a fonte dos erros)
Tipo de campanha por `tipo_rules` sobre `field_campaign_name` (obrigatório); temperatura por `temp_rules`. **Inspecione os nomes antes de gerar** (tarefas tipo-campanha e temperatura). Confirme que `field_ad_name` bate entre mídia e conversões, senão o criativo fica sem leads/vendas e parece ruim.

## Como ler cada bloco
- **KPIs macro**: no modo Resultado, primeiro ROAS e retorno; depois CAC. No modo Captação, CPMQL e CPL; CPM diz leilão, CTR diz criativo.
- **Qualidade de captação**: cada indicador vs benchmark. Hook baixo = abertura; Hold baixo = o meio do vídeo; CTR baixo = chamada; Connect baixo = página lenta/link; Conv. página baixa = oferta/formulário.
- **Dispersão**: investimento × ROAS (ou CPL) mostra quem merece escala (alto volume, bom retorno) e quem é falso positivo (ótimo ROAS com R$ 50).
- **Ficha**: compare a quebra por temperatura/público com a média do lançamento; o mesmo criativo pode funcionar no quente e falhar no frio.
- **Saturação**: `saturacao_diaria` (ROAS/retorno por dia de um criativo) mostra fadiga.

## Regras desta análise
As regras (o que não concluir, os cuidados) são **entradas**, não texto solto: chegam no `obter_template` e no `regras.md` do kit, cada uma com o título dizendo a regra. Na plataforma ficam na aba **Regras**.
