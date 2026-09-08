-- ============================================================
-- Conversão por Perfil — dump de extração (AGREGADO: sem e-mail, sem linha por lead)
-- Parâmetros: dias_lancamento (janela curta), pago_like (termo do utm_source que marca Pago)
-- DIMENSÕES: a lista abaixo (renda_mensal, idade, genero, tempo_acompanhamento) é a base.
--   Espelhe as dimensões escolhidas na tarefa "dimensoes" nos 4 lugares marcados com [DIMS]
--   (SELECT de inscricoes, SELECT e GROUP BY de lead_conversoes, SELECT e GROUP BY final).
--   custom_field_N entram do mesmo jeito; anote o significado de cada um no config (label).
-- ============================================================
WITH params AS (
    SELECT {{dias_lancamento}} AS dias_lancamento
),

-- 1. INSCRIÇÕES — uma linha por (email, field_conversion), menor data
inscricoes AS (
    SELECT DISTINCT ON (i.email, i.field_conversion)
        i.email,
        i.field_conversion,
        i.data AS data_inscricao,
        CASE WHEN lower(i.utm_source) LIKE '%' || lower({{pago_like}}) || '%'
             THEN 'Pago' ELSE 'Orgânico' END AS tipo_trafego,
        i.renda_mensal,                       -- [DIMS]
        i.idade,
        i.genero,
        i.tempo_acompanhamento
    FROM public."MAT_V2_inscricoes_geral_det" i
    WHERE i.email IS NOT NULL AND i.data IS NOT NULL
    ORDER BY i.email, i.field_conversion, i.data ASC
),

-- 2. TRANSAÇÕES APROVADAS — primeira compra por e-mail
transacoes AS (
    SELECT lower(t.field_email) AS field_email,
           MIN(t.field_transaction_date) AS field_transaction_date
    FROM public."VW_wtl_transactions" t
    WHERE t.field_transaction_status = 'approved'
      AND coalesce(t.field_charge_amount, 1) = 1
      AND t.field_email IS NOT NULL
    GROUP BY lower(t.field_email)
),

-- 3. LEAD × CONVERSÃO — flags 0/1 por janela temporal
lead_conversoes AS (
    SELECT
        i.email,
        i.field_conversion,
        i.data_inscricao,
        i.tipo_trafego,
        i.renda_mensal,                       -- [DIMS]
        i.idade,
        i.genero,
        i.tempo_acompanhamento,
        MAX(CASE WHEN t.field_transaction_date >  i.data_inscricao
                  AND t.field_transaction_date <= i.data_inscricao + (p.dias_lancamento || ' days')::interval
                 THEN 1 ELSE 0 END) AS venda_lancamento,
        MAX(CASE WHEN t.field_transaction_date >  i.data_inscricao
                  AND t.field_transaction_date <= i.data_inscricao + INTERVAL '6 months'
                 THEN 1 ELSE 0 END) AS venda_6meses,
        MAX(CASE WHEN t.field_transaction_date >  i.data_inscricao
                  AND t.field_transaction_date <= i.data_inscricao + INTERVAL '12 months'
                 THEN 1 ELSE 0 END) AS venda_12meses
    FROM inscricoes i
    CROSS JOIN params p
    LEFT JOIN transacoes t ON lower(t.field_email) = lower(i.email)
    GROUP BY
        i.email, i.field_conversion, i.data_inscricao, i.tipo_trafego,
        i.renda_mensal, i.idade, i.genero, i.tempo_acompanhamento,   -- [DIMS]
        p.dias_lancamento
)

-- 4. AGREGAÇÃO FINAL — uma linha por dimensão × lançamento × canal (isto é o dump.csv)
SELECT
    lc.field_conversion,
    tipo_trafego,
    renda_mensal,                             -- [DIMS]
    idade,
    genero,
    tempo_acompanhamento,
    COUNT(*)              AS total_leads,
    SUM(venda_lancamento) AS vendas_lancamento,
    SUM(venda_6meses)     AS vendas_6meses,
    SUM(venda_12meses)    AS vendas_12meses
FROM lead_conversoes lc
INNER JOIN wtl_campaign_definition wcd ON lc.field_conversion = wcd.field_conversion
GROUP BY
    lc.field_conversion, tipo_trafego,
    renda_mensal, idade, genero, tempo_acompanhamento   -- [DIMS]
ORDER BY field_conversion, total_leads DESC;
