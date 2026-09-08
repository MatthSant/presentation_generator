# Tipo de campanha (Lead × Venda) — obrigatório

**Saída:** `config.tipo_rules` e `config.tipo_campanha`. **Confirmar com o consultor.**

## Definição
A análise nasce **recortada num tipo de campanha**: criativos de captação (Lead) e criativos de venda (Venda) têm objetivos, métricas e públicos diferentes, e misturá-los distorce CPL, ROAS e ranking. As regras derivam `tipo_campanha` do `field_campaign_name` por substring (primeira que casa vence); linhas sem match viram `N/C` e ficam fora.

## Regra padrão
| Tipo | Contém |
|---|---|
| Lead | `_lead` |
| Venda | `_venda` |

Muitas contas usam outros padrões (`cadastro-`, `captacao`, `carrinho`, `-vnd]`): acrescente.

## Query de apoio (Delfos)
```sql
SELECT field_campaign_name, SUM(spend::NUMERIC) AS invest, COUNT(DISTINCT field_ad_name) AS ads
FROM "<ads_table>"
WHERE date_start::DATE BETWEEN '<data_inicio>' AND '<data_fim>'
GROUP BY 1 ORDER BY 2 DESC;
```

## Como executar
1. Rode a query de apoio; aplique as regras a cada campanha.
2. Mostre `campanha | invest | ads | tipo proposto`. Toda campanha com investimento e `N/C` merece pergunta.
3. Pergunte: "esta análise é dos criativos de **Lead** ou de **Venda**?" (uma por vez; para os dois, gere duas vezes).

## Casos ambíguos
- Campanha `LX_lead_rmkt_venda`: casa `_lead` primeiro. Confirme a intenção.
- Advantage+ shopping sem sufixo: pergunte.

## Saída (formato exato)
```json
"tipo_rules": [
  { "contains": ["_lead", "cadastro"], "label": "Lead" },
  { "contains": ["_venda", "carrinho"], "label": "Venda" }
],
"tipo_campanha": "Lead"
```
