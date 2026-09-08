-- Consolidado por evento × tráfego × plataforma × temperatura (histórico de lançamentos)
-- Origem: MAT_V2_inscricoes_geral_consolidado ⨝ wtl_campaign_definition (date_start)  ·  PostgreSQL
-- Parâmetros: meta_like / google_like (prefixo do utm_source), tipo_lancamento (Todos | Lançamento | Perpétuo)
-- AJUSTE o CASE de temperatura_lead pelas regras do cliente (tarefa de contexto "temperatura"):
-- os rótulos precisam ser exatamente Hot / Warm / Cold / Advantage (o kit só conhece esses + N/C).
WITH classificado AS (
  SELECT
    field_conversion,
    CASE
      WHEN field_conversion LIKE 'lcto-%' THEN 'Lançamento'
      WHEN field_conversion LIKE 'lco-%'  THEN 'Lançamento'
      WHEN field_conversion LIKE 'ppt-%'  THEN 'Perpétuo'
      WHEN field_conversion LIKE 'ppto-%' THEN 'Perpétuo'
      ELSE 'Outros'
    END AS tipo_lancamento,
    CASE WHEN utm_source LIKE '%ads%' THEN 'Pago' ELSE 'Orgânico' END AS tipo_trafego,
    CASE
      WHEN utm_source LIKE {{meta_like}} || '%'   THEN 'Meta Ads'
      WHEN utm_source LIKE {{google_like}} || '%' THEN 'Google Ads'
      WHEN utm_source LIKE '%ads%'                THEN 'Ads (outros)'
      ELSE NULL
    END AS plataforma,
    CASE
      WHEN utm_source NOT LIKE '%ads%' THEN 'Orgânico'
      WHEN utm_source LIKE 'meta-ads%26%' OR utm_source LIKE '%{%'
        OR field_campaign_name ~ '^[0-9]+$' THEN 'UTM Quebrado'
      WHEN LOWER(field_campaign_name) LIKE '%advantage%' OR LOWER(field_campaign_name) LIKE '%[adv]%' THEN 'Advantage'
      WHEN LOWER(field_campaign_name) LIKE '%quente%' OR LOWER(field_campaign_name) LIKE '%hot%'  THEN 'Hot'
      WHEN LOWER(field_campaign_name) LIKE '%morno%'  OR LOWER(field_campaign_name) LIKE '%warm%' THEN 'Warm'
      WHEN LOWER(field_campaign_name) LIKE '%frio%'   OR LOWER(field_campaign_name) LIKE '%cold%' THEN 'Cold'
      ELSE 'N/C'
    END AS temperatura_lead,
    COALESCE(invest_total::NUMERIC, 0)   AS invest_total,
    COALESCE(paidmedia_tax::NUMERIC, 0)  AS paidmedia_tax,
    COALESCE(impressoes::NUMERIC, 0)     AS impressoes,
    COALESCE(link_clicks::NUMERIC, 0)    AS link_clicks,
    COALESCE(leads::NUMERIC, 0)          AS leads,
    COALESCE(leads_mqls::NUMERIC, 0)     AS leads_mqls,
    COALESCE(leads_antigos::NUMERIC, 0)  AS leads_antigos,
    COALESCE(respostas::NUMERIC, 0)      AS respostas,
    COALESCE(vendas::NUMERIC, 0)         AS vendas,
    COALESCE(faturamento::NUMERIC, 0)    AS faturamento,
    COALESCE(vendas_sale::NUMERIC, 0)    AS vendas_sale,
    COALESCE(vendas_mql::NUMERIC, 0)     AS vendas_mql,
    COALESCE(vendas_nao_mql::NUMERIC, 0) AS vendas_nao_mql,
    COALESCE(sales_tax::NUMERIC, 0)      AS sales_tax,
    COALESCE(broker_fee::NUMERIC, 0)     AS broker_fee,
    COALESCE(refunds::NUMERIC, 0)        AS refunds,
    COALESCE(refunded_value::NUMERIC, 0) AS refunded_value
  FROM "MAT_V2_inscricoes_geral_consolidado"
)
SELECT
  classificado.field_conversion,
  wcd.date_start,
  tipo_lancamento, tipo_trafego, plataforma, temperatura_lead,
  SUM(invest_total)   AS invest_total,
  SUM(paidmedia_tax)  AS paidmedia_tax,
  SUM(impressoes)     AS impressoes,
  SUM(link_clicks)    AS link_clicks,
  SUM(leads)          AS leads,
  SUM(leads_mqls)     AS leads_mqls,
  SUM(leads_antigos)  AS leads_antigos,
  SUM(respostas)      AS respostas_pesquisa,
  SUM(vendas)         AS vendas,
  SUM(faturamento)    AS faturamento,
  SUM(vendas_sale)    AS vendas_sale,
  SUM(vendas_mql)     AS vendas_mql,
  SUM(vendas_nao_mql) AS vendas_nao_mql,
  SUM(sales_tax)      AS sales_tax,
  SUM(broker_fee)     AS broker_fee,
  SUM(refunds)        AS refunds,
  SUM(refunded_value) AS refunded_value
FROM classificado
INNER JOIN wtl_campaign_definition wcd
  ON classificado.field_conversion = wcd.field_conversion
WHERE ({{tipo_lancamento}} = 'Todos' OR tipo_lancamento = {{tipo_lancamento}})
GROUP BY classificado.field_conversion, wcd.date_start,
  tipo_lancamento, tipo_trafego, plataforma, temperatura_lead
ORDER BY date_start, field_conversion, tipo_trafego DESC, temperatura_lead;
