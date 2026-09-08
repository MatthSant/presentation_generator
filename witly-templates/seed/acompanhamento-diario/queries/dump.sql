-- Métricas diárias do lançamento (acompanhamento tático) — funil CLÁSSICO
-- Origem: VW_V2_inscricoes_res_METRICAS · uma linha por utm_source × campanha × conteúdo × anúncio × dia
-- Parâmetro: field_conversion (montar_query já coloca as aspas e escapa)
SELECT
  field_conversion, data, utm_source, utm_medium, utm_campaign, utm_content,
  field_adset_name, field_campaign_name, field_ad_name,
  leads, leads_mqls, respostas, leads_novo, leads_antigos, cliente_inscrito,
  vendas, faturamento, invest_total, impressoes, link_clicks, pageviews,
  leads_trafego, leads_mqls_trafego, views_totais, views_50pc,
  one_day_click_attribution, link_criativo
FROM "VW_V2_inscricoes_res_METRICAS"
WHERE field_conversion = {{field_conversion}}
ORDER BY data, utm_source, field_campaign_name, field_ad_name;
