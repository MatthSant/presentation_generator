# Canal: Pago × Orgânico

**Saída:** parâmetro `pago_like` de `montar_query` (ou o CASE editado na query). **Confirmar com o consultor.**

## Definição
Cada lead recebe `tipo_trafego` na query: `utm_source` contém o termo `pago_like` (padrão `ads`) → **Pago**; senão **Orgânico**. O canal **Geral** é a soma. O relatório tem um toggle Geral / Pago / Orgânico que refiltra tudo, e as três agregações são calculadas separadamente (um grupo pode ser consistente no orgânico e crítico no pago).

## Query de apoio (Delfos)
```sql
SELECT utm_source, COUNT(*) AS leads
FROM "MAT_V2_inscricoes_geral_det"
GROUP BY 1 ORDER BY 2 DESC LIMIT 30;
```

## Como executar
1. Rode a query; marque `pago?` para cada `utm_source` pela regra.
2. Mostre ao consultor. `fb`, `ig`, `instagram` com mídia paga não contêm `ads`: se forem pagos, edite o CASE da query acrescentando `OR lower(i.utm_source) LIKE '%fb%'` (a query é uma base).
3. Coluna diferente de `utm_source` (ex.: `origem`): troque no CASE.

## Casos ambíguos
- `utm_source` vazio: Orgânico (não trackeado). Se for a maioria, avise: o split perde sentido.

## Saída
`montar_query('conversao-perfil', { "pago_like": "ads", "dias_lancamento": 60 })`
