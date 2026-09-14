# Classificação: fonte paga, campanha de captação, campanha de vendas

**Saída:** `config.paid_sources`, `config.cpt_pattern`, `config.vnd_pattern`. **Confirmar com o consultor** — é o erro mais comum do debriefing.

## Definição
O motor precisa separar três coisas para os números fazerem sentido:
- **Pago × orgânico**: linha é paga quando `utm_source` contém um dos `paid_sources` (ex.: `facebook`, `meta`, `google`, `fb`). Sem `utm_source` → "Não trackeado", contado como orgânico.
- **Campanha de captação × de vendas × outro**: pelo nome da campanha (`field_campaign_name`). `cpt_pattern` marca captação (ex.: `cadastro-`, `google-search-`, `-cpt]`); `vnd_pattern` marca vendas (ex.: `venda-`, `vendas-`, `-vnd]`). O resto é "outro".
- Por que importa: **CPL, CPMQL, CPM, CTR e ROAS usam só o investimento de captação** (`invest_cpt`). Se uma campanha de vendas cair como captação, o CPL infla; se uma de captação cair como "outro", o investimento some do custo por lead.

## Regra padrão
| Chave | Padrão | Regra |
|---|---|---|
| `paid_sources` | `facebook, meta, google, fb, tiktok` | substring de `utm_source`, sem distinguir maiúsculas |
| `cpt_pattern` | `-cpt], cadastro-, google-search-, captacao` | substring de `field_campaign_name` |
| `vnd_pattern` | `-vnd], venda-, vendas-` | idem; captação tem prioridade sobre vendas |

## Query de apoio (Delfos)
```sql
SELECT utm_source, field_campaign_name, SUM(invest_total) AS invest, SUM(leads) AS leads, SUM(vendas) AS vendas
FROM "VW_V2_inscricoes_res"
WHERE field_conversion = '<field_conversion>'
GROUP BY 1, 2 ORDER BY 3 DESC;
```

## Como executar
1. Rode a query de apoio. Aplique a regra padrão a cada `utm_source` e a cada campanha.
2. Mostre ao consultor a tabela `utm_source | campanha | invest | leads | vendas | pago? | tipo (captação/vendas/outro)`.
3. Corrija **acrescentando padrões** às listas (nunca reclassificando linha a linha). Toda campanha com investimento e "outro" merece pergunta.

## Casos ambíguos
- **Separador diferente do padrão**: os padrões de fábrica usam hífen (`venda-`, `cadastro-`). Base que nomeia
  com underscore (`hot_venda_ingresso`, `hot_venda_ideia-pro`) **não casa nada** e cai tudo em "outro" — zerando
  o investimento de captação e, com ele, CPL, CPMQL, CPM, CPC e ROAS. Olhe o separador antes de aceitar o padrão.
- **Lançamento pago**: vender ingresso **é** a captação. As campanhas de ingresso entram no `cpt_pattern`; venda
  do produto principal, order bump e distribuição de conteúdo entram no `vnd_pattern` e ficam fora do CPL.
- Campanha de captação sem prefixo (ex.: `LX Interesses`): adicione o trecho ao `cpt_pattern`.
- `utm_source` = `ig` ou `instagram` com investimento: é pago? Confirme; se sim, acrescente a `paid_sources`.
- Google Search de captação: `google-search-` já está no padrão.

## Saída (formato exato)
```json
"paid_sources": ["facebook", "meta", "google", "fb"],
"cpt_pattern": ["cadastro-", "google-search-", "-cpt]"],
"vnd_pattern": ["venda-", "vendas-", "-vnd]"]
```
