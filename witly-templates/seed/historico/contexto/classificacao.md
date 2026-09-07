# Classificação: pago × orgânico, Meta × Google

**Saída:** parâmetros `meta_like` e `google_like` de `montar_query`. **Confirmar com o consultor.**

## Definição
A query classifica cada linha antes de agregar:
- **tipo_trafego**: `utm_source` contém `ads` → Pago; senão Orgânico.
- **plataforma** (só no pago): `utm_source` começa com `meta_like` → Meta Ads; com `google_like` → Google Ads; outro `ads` → Ads (outros).
- **Perfil MQL** vem pronto nas colunas `vendas_mql` / `vendas_nao_mql`: se vierem zeradas, o bloco de perfil fica em 0 (avise).

Erro típico: `utm_source = fb` ou `instagram` com investimento (não contém `ads`) cai em Orgânico e o CPL do pago fica baixo demais.

## Query de apoio (Delfos)
```sql
SELECT utm_source, SUM(invest_total::NUMERIC) AS invest, SUM(leads::NUMERIC) AS leads
FROM "MAT_V2_inscricoes_geral_consolidado"
GROUP BY 1 ORDER BY 2 DESC NULLS LAST LIMIT 30;
```

## Como executar
1. Rode a query de apoio. Marque `pago?` e `plataforma` para cada `utm_source` pela regra.
2. Mostre ao consultor; todo `utm_source` com investimento e "Orgânico" merece pergunta.
3. Se a conta usa `facebook-ads`, passe `meta_like = facebook-ads`. Se houver dois prefixos de Meta, edite o CASE da query (ela é uma base).

## Saída
`montar_query('historico', { "meta_like": "meta-ads", "google_like": "google-ads", "tipo_lancamento": "Todos" })`
