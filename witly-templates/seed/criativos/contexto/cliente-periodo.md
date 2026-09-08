# Cliente, período e tabelas da conta

**Saída:** `config.client`, `config.client_name`, `config.title`, `config.campaign_label` e os parâmetros `ads_table`, `conv_table`, `data_inicio`, `data_fim` da query. **Confirmar com o consultor.**

## Definição
A análise de criativos não é por lançamento: é por **período** (um lançamento inteiro, um mês, uma fase de captação). A mídia vem de uma tabela ao nível anúncio × dia (Meta Ads); as conversões, de uma tabela de inscrições/vendas atribuídas por `field_ad_name`. Os nomes dessas tabelas **variam por conta**.

## Como levantar
1. Pergunte o cliente (slug do Delfos) e o período (início e fim, inclusive). Se for "o lançamento X", pegue `date_start`/`date_end` em `wtl_campaign_definition`.
2. `Delfos.Credentials(customer_slug)` → `db_name`; `Delfos.Tables_Views_Docs` para localizar as tabelas de mídia e de conversões. Padrão Witly: `MAT_meta_ads_insights` (mídia) e `MAT_V2_inscricoes_geral_consolidado` (conversões).
3. Confirme que as duas tabelas têm `field_ad_name` e que os nomes batem (senão a atribuição lead→anúncio falha):
   ```sql
   SELECT COUNT(DISTINCT m.field_ad_name) AS ads_midia,
          COUNT(DISTINCT c.field_ad_name) AS ads_conv,
          COUNT(DISTINCT m.field_ad_name) FILTER (WHERE c.field_ad_name IS NOT NULL) AS casam
   FROM "<ads_table>" m
   LEFT JOIN "<conv_table>" c ON c.field_ad_name = m.field_ad_name;
   ```
   Se `casam` for muito menor que `ads_midia`, pare e mostre exemplos de nomes das duas fontes.

## Casos ambíguos
- Conta sem tabela de conversões por anúncio: a análise sai só com métricas de mídia (modo Captação faz sentido; Resultado não). Diga isso.
- Período com dois lançamentos: os criativos se misturam; sugira um período por lançamento.

## Saída (formato exato)
```json
{ "client": "enxoval", "client_name": "Enxoval Inteligente", "campaign_label": "LX ago/26",
  "title": "Enxoval Inteligente · Análise de Criativos" }
```
Parâmetros de `montar_query('criativos', {...})`: `ads_table`, `conv_table`, `data_inicio`, `data_fim`.
