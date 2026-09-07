-- Consolidado por anúncio × dia × campanha × público (análise de criativos)
-- Fontes: {{ads_table}} (mídia, nível anúncio/dia)  ⨝  {{conv_table}} (leads/vendas)  ·  PostgreSQL
-- A temperatura e o tipo de campanha são classificados no kit pelas regras do cliente (field_campaign_name).
-- Confirme os nomes de tabela/coluna da conta: esta é uma base, não a query final.
-- Métricas de vídeo (video_*) só existem para criativos em vídeo; ficam 0 nos demais.
WITH midia AS (
  SELECT
    field_ad_name,
    field_campaign_name,
    field_adset_name,
    date_start::DATE                        AS data,
    COALESCE(spend::NUMERIC, 0)             AS invest_total,
    COALESCE(impressions::NUMERIC, 0)       AS impressoes,
    COALESCE(inline_link_clicks::NUMERIC, 0) AS link_clicks,
    COALESCE(landing_page_views::NUMERIC, 0) AS pageviews,
    COALESCE(video_3s_views::NUMERIC, 0)    AS views_2s,
    COALESCE(video_p50_views::NUMERIC, 0)   AS views_50pc,
    COALESCE(video_p100_views::NUMERIC, 0)  AS views_100pc,
    COALESCE(video_plays::NUMERIC, 0)       AS views_totais
  FROM "{{ads_table}}"
  WHERE date_start::DATE BETWEEN {{data_inicio}} AND {{data_fim}}
),
conv AS (
  SELECT
    field_ad_name,
    field_conversion::DATE                      AS data,
    SUM(COALESCE(leads::NUMERIC, 0))            AS leads,
    SUM(COALESCE(leads_mqls::NUMERIC, 0))       AS leads_mqls,
    SUM(COALESCE(respostas::NUMERIC, 0))        AS respostas,
    SUM(COALESCE(vendas::NUMERIC, 0))           AS vendas,
    SUM(COALESCE(vendas_sale::NUMERIC, 0))      AS vendas_sale,
    SUM(COALESCE(faturamento::NUMERIC, 0))      AS faturamento,
    SUM(COALESCE(faturamento_sale::NUMERIC, 0)) AS faturamento_sale
  FROM "{{conv_table}}"
  WHERE field_conversion::DATE BETWEEN {{data_inicio}} AND {{data_fim}}
  GROUP BY field_ad_name, field_conversion::DATE
)
SELECT
  m.field_ad_name,
  m.field_campaign_name,
  m.field_adset_name,
  m.data,
  SUM(m.invest_total)   AS invest_total,
  SUM(m.impressoes)     AS impressoes,
  SUM(m.link_clicks)    AS link_clicks,
  SUM(m.pageviews)      AS pageviews,
  SUM(m.views_2s)       AS views_2s,
  SUM(m.views_50pc)     AS views_50pc,
  SUM(m.views_100pc)    AS views_100pc,
  SUM(m.views_totais)   AS views_totais,
  SUM(COALESCE(c.leads, 0))            AS leads,
  SUM(COALESCE(c.leads_mqls, 0))       AS leads_mqls,
  SUM(COALESCE(c.respostas, 0))        AS respostas,
  SUM(COALESCE(c.vendas, 0))           AS vendas,
  SUM(COALESCE(c.vendas_sale, 0))      AS vendas_sale,
  SUM(COALESCE(c.faturamento, 0))      AS faturamento,
  SUM(COALESCE(c.faturamento_sale, 0)) AS faturamento_sale
FROM midia m
LEFT JOIN conv c
  ON c.field_ad_name = m.field_ad_name AND c.data = m.data
GROUP BY m.field_ad_name, m.field_campaign_name, m.field_adset_name, m.data
ORDER BY m.field_ad_name, m.data;
