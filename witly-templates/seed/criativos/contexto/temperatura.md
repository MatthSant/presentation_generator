# Temperatura das campanhas

**Saída:** `config.temp_rules`, `config.temp_overwrite`. **Confirmar com o consultor** mostrando a tabela campanha → temperatura.

## Definição
Estágio do público que a campanha atinge: **Quente** (conhece a marca), **Frio** (nunca viu), **Remarketing**, **Advantage** (a Meta decide). O kit deriva `temperatura_lead` do `field_campaign_name` (substring, primeira regra que casa). Com `temp_overwrite: false`, uma coluna `temperatura_lead` já vinda no CSV é preservada; com `true`, as regras sobrescrevem. Sem match → `N/C`.

Na análise de criativos a temperatura aparece no filtro do recorte (`--opts temp`), na quebra da ficha (`by_temp`) e nas perguntas "qual temperatura escalar por criativo".

## Regra padrão (a primeira que casa vence)
| Temperatura | Contém |
|---|---|
| Advantage | `advantage`, `adv` |
| Quente | `quente`, `hot`, `warm`, `envolvimento`, `lista` |
| Frio | `frio`, `cold`, `interesse`, `aberto` |
| Remarketing | `rmkt`, `remarketing` |

## Query de apoio (Delfos)
```sql
SELECT field_campaign_name, field_adset_name, SUM(spend::NUMERIC) AS invest
FROM "<ads_table>"
WHERE date_start::DATE BETWEEN '<data_inicio>' AND '<data_fim>'
GROUP BY 1, 2 ORDER BY 3 DESC;
```

## Como executar
1. Rode a query; aplique as regras a cada nome de campanha (o público/adset ajuda a decidir casos sem match).
2. Mostre `campanha | invest | temperatura proposta`; corrija acrescentando palavras-chave.

## Casos ambíguos
- `COLD-RMKT`: casa Frio antes de Remarketing. Confirme.
- Temperatura só no nome do **adset**: crie as regras sobre o padrão do adset e avise que o kit lê o nome da campanha (ajuste o CSV ou peça ao consultor).

## Saída (formato exato)
```json
"temp_rules": [
  { "contains": ["advantage", "adv"], "label": "Advantage" },
  { "contains": ["quente", "hot", "envolvimento"], "label": "Quente" },
  { "contains": ["frio", "cold", "interesse", "aberto"], "label": "Frio" },
  { "contains": ["rmkt", "remarketing"], "label": "Remarketing" }
],
"temp_overwrite": false
```
