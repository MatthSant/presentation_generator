# Temperatura (Hot / Warm / Cold / Advantage) na query

**Saída:** o CASE `temperatura_lead` da query ajustado às regras do cliente. **Confirmar com o consultor** com a tabela campanha → temperatura.

## Definição
**A temperatura é lida do NOME DA CAMPANHA (`field_campaign_name`), nunca do público/adset.** O público (conjunto de anúncios) é outra dimensão do relatório; não use o nome dele para classificar.
No histórico a temperatura vem **pronta no CSV** (coluna `temperatura_lead`), classificada na query pelo nome da campanha. O kit só reconhece os rótulos **Hot, Warm, Cold, Advantage** (mais `N/C`, `Orgânico` e `UTM Quebrado`). Qualquer outro rótulo some das quebras por temperatura.

## Regra padrão da query (a primeira que casa vence)
| Rótulo | `field_campaign_name` contém |
|---|---|
| Advantage | `advantage`, `[adv]` |
| Hot | `quente`, `hot` |
| Warm | `morno`, `warm` |
| Cold | `frio`, `cold` |
| N/C | o resto do pago |

`UTM Quebrado` = utm_source com `%26`/`{` ou campanha só com dígitos (tracking quebrado). Volume alto aqui é problema de dado, não de mídia.

## Query de apoio (Delfos)
```sql
SELECT field_campaign_name, SUM(invest_total::NUMERIC) AS invest, COUNT(DISTINCT field_conversion) AS eventos
FROM "MAT_V2_inscricoes_geral_consolidado"
WHERE utm_source LIKE '%ads%'
GROUP BY 1 ORDER BY 2 DESC NULLS LAST LIMIT 60;
```

## Como executar
1. Rode a query de apoio; aplique a regra a cada nome.
2. Mostre `campanha | invest | temperatura proposta`. Acrescente termos ao CASE (ex.: `envolvimento` → Hot, `interesses` → Cold) **mantendo os quatro rótulos**.
3. Só então rode a query do dump.

## Casos ambíguos
- Cliente sem Warm: normal; a linha fica vazia.
- Campanha sem indicação de temperatura no nome: fica `N/C`. Peça ao consultor o trecho do nome da campanha que identifica cada temperatura e acrescente ao CASE; não classifique pelo público/adset.
