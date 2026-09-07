-- Metas do lançamento (launch goals) — 1 linha por utm_source × dia
-- Origem: wtl_launch_goals · usado como metas no acompanhamento (em vez das metas manuais)
SELECT
  data, utm_source, field_conversion,
  meta_leads, meta_taxa_resp, meta_taxa_qual, meta_valor_invest,
  meta_cpl, meta_cpmql, meta_cpl_aceitavel, meta_cpmql_aceitavel,
  meta_conversao, meta_receita, meta_vendas
FROM "wtl_launch_goals"
WHERE field_conversion = {{field_conversion}}
ORDER BY data, utm_source;
