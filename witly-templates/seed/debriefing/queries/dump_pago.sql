-- Consolidado do lançamento PAGO (debriefing) — o lead compra o ingresso na captação
-- Origem: VW_V2_inscricoes_pago_res · uma linha por utm_source × campanha × anúncio × dia
--
-- Use esta query NO LUGAR da dump.sql quando o funil é pago, e salve com o mesmo nome
-- (dump.csv): as colunas são as mesmas, o motor não muda.
--
-- O filtro usa COALESCE: a linha que vem só do tráfego tem field_conversion vazio e
-- conversion_traf preenchido. Filtrar só por field_conversion descarta essas linhas e,
-- com elas, metade da mídia — medido em lcto-ideia-workshop-jun-26: R$ 24.595,03 contra
-- R$ 52.076,52 reais. Com o COALESCE o total bate ao centavo com VW_V2_invest_traf.
--
-- Parâmetro: field_conversion (montar_query já coloca as aspas e escapa)
SELECT
  v.field_conversion, v.data, v.utm_source, v.utm_medium, v.utm_campaign, v.utm_content,
  v.field_campaign_name, v.field_adset_name, v.field_ad_name,
  v.leads, v.leads_mqls, v.respostas, v.leads_novo, v.leads_antigos, v.cliente_inscrito,
  v.vendas, v.faturamento,
  v.invest_total, v.impressoes, v.link_clicks, v.pageviews, v.leads_trafego, v.leads_mqls_trafego,
  v.vendas_sale, v.faturamento_sale, v.refunds, v.refunded_value
FROM "VW_V2_inscricoes_pago_res" v
WHERE COALESCE(v.conversion_traf, v.field_conversion) = {{field_conversion}}
ORDER BY v.data, v.utm_source, v.field_campaign_name;
