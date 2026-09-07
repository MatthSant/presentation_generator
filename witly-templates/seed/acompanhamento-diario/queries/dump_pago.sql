-- Lançamento PAGO — o lead compra o ingresso (há caixa já na captação)
-- Origem: VW_V2_inscricoes_pago_res · uma linha por utm × anúncio × dia
-- SELECT * de propósito: a view traz ~85 colunas e várias (pageviews, views_*, hook_rate)
-- vêm vazias numa base e preenchidas em outra; o motor liga cada bloco conforme o que existir.
-- O filtro usa COALESCE porque a linha vinda só do tráfego tem field_conversion vazio e
-- conversion_traf preenchido — filtrar por uma só descarta metade do dump.
SELECT *
FROM "VW_V2_inscricoes_pago_res" vrtccp
WHERE COALESCE(conversion_traf, vrtccp.field_conversion) = {{field_conversion}};
