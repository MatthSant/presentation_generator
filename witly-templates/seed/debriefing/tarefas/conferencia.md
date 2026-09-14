# Conferência dos números antes de gerar

**Saída:** o "ok" do consultor à tabela de conferência. **É a última tarefa: não rode o `gerar.py` antes dela.**

## Por que existe
As outras tarefas produzem o `config.json`; esta confere se o config produziu **números certos**. O motor não
reclama quando a classificação erra: ele divide por zero e devolve zero. Um debriefing com ROAS 0,00×, CPL
R$ 0,00 e metas vazias sai bonito, completo e errado — e quem lê não tem como saber.

Três erros já aconteceram em produção e passam calados. Esta tarefa existe para pegar os três.

## Como executar
Rode a query de conferência, faça as cinco checagens e **mostre a tabela ao consultor**. Só gere depois do "ok".

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

### As cinco checagens

| # | Checagem | Falhou quando | O que fazer |
|---|---|---|---|
| 1 | **Investimento de captação > 0** | nenhuma campanha casou o `cpt_pattern` | volte à tarefa `classificacao`: é a causa de ROAS, CPL, CPMQL, CPM e CPC zerados de uma vez |
| 2 | **Nenhuma campanha com investimento ficou em "outro"** | sobrou campanha com gasto sem tipo | decida com o consultor: é captação ou é venda? Acrescente o trecho ao padrão certo |
| 3 | **Investimento do dump ≈ mídia bruta** | o dump traz bem menos (ex.: metade) | a view de inscrições atribui mídia ao inscrito por UTM e perde o gasto que não casou. Diga o tamanho da diferença ao consultor antes de seguir |
| 4 | **Metas carregadas** | `goals.csv` sem linha, ou metas zeradas no relatório | compare a coluna `field_conversion` do `goals.csv` com a do dump: valor diferente, coluna vazia ou ausente descarta tudo em silêncio |
| 5 | **Leads de tráfego > 0** | `leads_trafego` zerado | sem ele o CPL não fecha; confirme se a coluna existe nesta base |

### A tabela que vai para o consultor

| Número | Valor | De onde veio | Bate? |
|---|---|---|---|
| Investimento total | R$ … | soma do dump | — |
| Investimento de captação | R$ … (x% do total) | campanhas que casaram `cpt_pattern` | 1 e 2 |
| Investimento na mídia bruta | R$ … | `VW_V2_invest_traf` | 3 |
| Campanhas com gasto em "outro" | n (liste os nomes) | classificação | 2 |
| Metas | n linhas, CPL meta R$ … | `goals.csv` | 4 |
| Leads de tráfego | n | soma do dump | 5 |

Feche perguntando com todas as letras: **"esses números batem com o que você vê no painel? Posso gerar?"**

## Funil pago
Neste lançamento a captação é **vender ingresso**: as campanhas de ingresso entram no `cpt_pattern`, e venda do
produto principal, order bump e distribuição de conteúdo ficam fora do CPL. Confirme a lista com o consultor,
campanha por campanha, e confirme também qual view traz o investimento completo.

## Casos ambíguos
- Diferença pequena entre dump e mídia bruta (poucos por cento) costuma ser gasto sem UTM; diga e siga.
- Diferença grande (dezenas por cento) muda toda a leitura de custo: **não gere** sem decidir a fonte com o consultor.
- Metas existem no banco mas não no CSV: refaça a query `goals.sql` com o mesmo `field_conversion` do dump.
