# Conferência dos números antes de gerar

**Saída:** o "ok" do consultor à tabela de conferência. **É a última tarefa: não rode o `gerar.py` antes dela.**

## Por que existe
As outras tarefas produzem o `config.json`; esta confere se o config produziu **números certos**. O motor não
reclama quando a classificação erra: ele divide por zero e devolve zero. Um debriefing com ROAS 0,00×, CPL
R$ 0,00 e metas vazias sai bonito, completo e errado — e quem lê não tem como saber.

Cinco erros já aconteceram em produção e passam calados. Esta tarefa existe para pegar os cinco.

## Como executar
Rode a query de conferência, faça as sete checagens e **mostre a tabela ao consultor**. Só gere depois do "ok".

```sql
-- 1. Investimento por campanha, com a classificação que o seu config vai aplicar
SELECT utm_source, field_campaign_name,
       SUM(invest_total) AS invest, SUM(impressoes) AS impressoes,
       SUM(leads) AS leads, SUM(leads_trafego) AS leads_trafego, SUM(vendas) AS vendas
FROM "VW_V2_inscricoes_res"          -- funil pago: confirme a view com o consultor (ver "Funil pago")
WHERE field_conversion = '<field_conversion>'
GROUP BY 1, 2 ORDER BY 3 DESC;

-- 2. O mesmo lançamento na mídia bruta, para comparar o total
--    Confirme nome de view e colunas no Delfos (Tables_Views_Docs, Search_Columns) antes de rodar.
SELECT SUM(invest_total) AS invest_bruto, SUM(impressoes) AS impressoes_brutas
FROM "VW_V2_invest_traf"
WHERE <filtro do funil> = '<field_conversion>';
```

### As sete checagens

| # | Checagem | Falhou quando | O que fazer |
|---|---|---|---|
| 1 | **Investimento de captação > 0** | nenhuma campanha casou o `cpt_pattern` | volte à tarefa `classificacao`: é a causa de ROAS, CPL, CPMQL, CPM e CPC zerados de uma vez |
| 2 | **Nenhuma campanha com investimento ficou em "outro"** | sobrou campanha com gasto sem tipo | decida com o consultor: é captação ou é venda? Acrescente o trecho ao padrão certo |
| 3 | **Investimento do dump ≈ mídia bruta** | o dump traz bem menos (ex.: metade) | no funil pago, é quase sempre a `dump.sql` usada no lugar da `dump_pago.sql` (ver "Funil pago"). No clássico, a view atribui mídia ao inscrito por UTM e perde o gasto que não casou: diga o tamanho da diferença ao consultor antes de seguir |
| 4 | **Metas carregadas** | `goals.csv` sem linha, ou metas zeradas no relatório | compare a coluna `field_conversion` do `goals.csv` com a do dump: valor diferente, coluna vazia ou ausente descarta tudo em silêncio |
| 5 | **Leads de tráfego > 0** | `leads_trafego` zerado | sem ele o CPL não fecha; confirme se a coluna existe nesta base |
| 6 | **Recorte de público preenchido** | a aba Público do Gargalos vem vazia ou só com "Não trackeado" | `field_adset_name` não veio no dump: confira a lista de colunas da `dump.sql` |
| 7 | **Vendas para não inscritos conferidas** | `nao_inscritos.csv` não foi gerado | rode `nao_inscritos.sql`. Elas somam no total, no faturamento e no retorno; **nunca** na conversão nem no ROAS de captação, porque conversão de captação só conta venda de quem se inscreveu |

### A tabela que vai para o consultor

| Número | Valor | De onde veio | Bate? |
|---|---|---|---|
| Investimento total | R$ … | soma do dump | — |
| Investimento de captação | R$ … (x% do total) | campanhas que casaram `cpt_pattern` | 1 e 2 |
| Investimento na mídia bruta | R$ … | `VW_V2_invest_traf` | 3 |
| Campanhas com gasto em "outro" | n (liste os nomes) | classificação | 2 |
| Metas | n linhas, CPL meta R$ … | `goals.csv` | 4 |
| Leads de tráfego | n | soma do dump | 5 |
| Públicos com investimento | n (liste os 3 maiores) | `field_adset_name` do dump | 6 |
| Vendas para não inscritos | n · R$ … (x% do faturamento) | `nao_inscritos.csv` | 7 |

Feche perguntando com todas as letras: **"esses números batem com o que você vê no painel? Posso gerar?"**

## Funil pago
No lançamento pago a captação é **vender ingresso**: as campanhas de ingresso entram no `cpt_pattern`, e venda do
produto principal, order bump e distribuição de conteúdo ficam fora do CPL. Confirme a lista com o consultor,
campanha por campanha.

E confirme que o dump veio da `dump_pago.sql`, não da `dump.sql`. A query do funil pago filtra por
`COALESCE(conversion_traf, field_conversion)` porque a linha que vem só do tráfego tem `field_conversion` vazio.
Sem isso a checagem 3 falha por construção: medido em `lcto-ideia-workshop-jun-26`, R$ 24.595,03 no dump contra
R$ 52.076,52 na mídia bruta — 53% do investimento fora do relatório, sem nenhum erro na tela.

## Casos ambíguos
- Diferença pequena entre dump e mídia bruta (poucos por cento) costuma ser gasto sem UTM; diga e siga.
- Diferença grande (dezenas por cento) muda toda a leitura de custo: **não gere** sem decidir a fonte com o consultor.
- Metas existem no banco mas não no CSV: refaça a query `goals.sql` com o mesmo `field_conversion` do dump.
