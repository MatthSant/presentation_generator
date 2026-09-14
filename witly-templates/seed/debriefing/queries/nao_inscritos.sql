-- Vendas do funil para quem NÃO se inscreveu (debriefing)
-- Origem: VW_wtl_transactions_campaigns × MAT_V2_inscricoes_det (join por `chave` DENTRO do banco)
-- Só agregado sai: nenhum e-mail, telefone ou linha de pessoa.
--
-- Por que existe: a view de inscrições atribui a venda ao INSCRITO. Quem comprou o produto do
-- funil sem ter se inscrito não aparece em lugar nenhum do debriefing — e isso pode ser metade
-- do faturamento. Estas vendas somam no total, no faturamento e no retorno; NUNCA na conversão
-- (conversão de captação só conta venda de quem se inscreveu) nem no ROAS de captação.
--
-- Parâmetro: field_conversion (montar_query já coloca as aspas e escapa)
WITH inscritos AS (
  SELECT DISTINCT chave
  FROM "MAT_V2_inscricoes_det"
  WHERE field_conversion = {{field_conversion}}
),
vendas AS (
  SELECT
    (t.data_transacao AT TIME ZONE 'America/Sao_Paulo')::date AS data,
    t.valor_venda, t.sale_sale, t.product_name,
    (i.chave IS NOT NULL) AS inscrito
  FROM "VW_wtl_transactions_campaigns" t
  LEFT JOIN inscritos i ON i.chave = t.email_cliente
  WHERE t.conversion_venda = {{field_conversion}}
    AND t.transaction_status = 'approved'
    AND COALESCE(t.charge_amount, 1) = 1
)
SELECT
  data,
  COUNT(*)                                   AS vendas,
  ROUND(SUM(valor_venda), 2)                 AS faturamento,
  COUNT(*) FILTER (WHERE sale_sale)          AS vendas_sale,
  ROUND(SUM(valor_venda) FILTER (WHERE sale_sale), 2) AS faturamento_sale
FROM vendas
WHERE NOT inscrito
GROUP BY data
ORDER BY data;
