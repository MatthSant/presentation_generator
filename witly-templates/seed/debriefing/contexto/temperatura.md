# Temperatura das campanhas

**Saída:** `config.temp_rules`. **Confirmar com o consultor** mostrando a tabela campanha → temperatura.

## Definição
Estágio do público que a campanha de tráfego pago atinge: **quente** (conhece a marca: envolvimento, lista, visitantes), **frio** (nunca viu: interesses, aberto), **remarketing** (carrinho/página) e **advantage** (Advantage+, a Meta decide). No debriefing a temperatura aparece nas páginas Tráfego pago e 360° (CPL, CPMQL, qualificação e vendas por temperatura) e nas perguntas norteadoras "qual temperatura escalar".

## Regra padrão (a primeira que casa vence)
| Temperatura | Contém |
|---|---|
| advantage | `advantage`, `[advantage]`, `adv` |
| quente | `quente`, `hot`, `warm`, `envolvimento`, `lista` |
| frio | `frio`, `cold`, `interesse`, `aberto` |
| remarketing | `rmkt`, `remarketing` |

Sem match → `n/c` (não classificado): vale perguntar ao consultor.

## Query de apoio (Delfos)
```sql
SELECT field_campaign_name, SUM(invest_total) AS invest, SUM(leads) AS leads
FROM "VW_V2_inscricoes_res"
WHERE field_conversion = '<field_conversion>' AND invest_total > 0
GROUP BY 1 ORDER BY 2 DESC;
```

## Como executar
1. Rode a query de apoio e aplique a regra a cada nome.
2. Mostre `campanha | invest | temperatura proposta`; corrija **acrescentando palavras-chave** às regras.
3. Só então gere.

## Casos ambíguos
- `COLD-RMKT`: casa `frio` antes de `remarketing` na ordem acima → confirme.
- Convenção própria do cliente (`T1/T2`): crie as regras dele.

## Saída (formato exato do calc.py)
```json
"temp_rules": [
  { "contains": ["advantage", "[advantage]", "adv"], "label": "advantage" },
  { "contains": ["quente", "hot", "warm"], "label": "quente" },
  { "contains": ["frio", "cold"], "label": "frio" },
  { "contains": ["rmkt", "remarketing"], "label": "remarketing" }
]
```
