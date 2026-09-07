-- Lançamento ANTERIOR (histórico) — o mesmo consolidado, para o Δ vs histórico
-- Origem: VW_V2_inscricoes_res · parâmetro: field_conversion_anterior
SELECT
  field_conversion, data, utm_source, utm_medium, field_campaign_name, field_ad_name,
  leads, leads_mqls, respostas, leads_novo, leads_antigos, cliente_inscrito, vendas, faturamento,
  invest_total, impressoes, link_clicks, pageviews, leads_trafego, leads_mqls_trafego,
  vendas_sale, faturamento_sale, refunds, refunded_value
FROM "VW_V2_inscricoes_res"
WHERE field_conversion = {{field_conversion_anterior}}
ORDER BY data, utm_source, field_campaign_name;
