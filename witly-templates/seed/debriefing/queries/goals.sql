-- Metas do lançamento (launch goals) — OBRIGATÓRIO no debriefing
-- Origem: wtl_launch_goals · 1 linha por utm_source × dia
-- O motor soma volume/receita e faz a média das linhas > 0 para CPL/CPMQL/conversão.
SELECT
  data, utm_source, field_conversion,
  meta_leads, meta_taxa_resp, meta_taxa_qual, meta_valor_invest,
  meta_cpl, meta_cpmql, meta_cpl_aceitavel, meta_cpmql_aceitavel,
  meta_conversao, meta_receita, meta_vendas
FROM "wtl_launch_goals"
WHERE field_conversion = {{field_conversion}}
ORDER BY data, utm_source;
