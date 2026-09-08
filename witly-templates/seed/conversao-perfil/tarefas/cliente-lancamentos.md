# Cliente e lançamentos da série

**Saída:** `config.client`, `config.client_name`, `config.title`, `config.campaign_label`. **Confirmar com o consultor** a lista de lançamentos.

## Definição
A análise compara grupos de perfil **ao longo de vários lançamentos** (`field_conversion`), em ordem cronológica extraída do nome (`lcto-cliente-abr24` → abr/24). Precisa de **3 ou mais** lançamentos com pesquisa respondida; com menos, "consistência" não existe. Todos os lançamentos com início/fim em `wtl_campaign_definition` entram na query; o que sai, sai por filtro no CSV ou no `WHERE`.

## Como levantar
1. Pergunte o cliente (slug do Delfos). `Delfos.Credentials(customer_slug)` → `db_name`.
2. Liste lançamentos e cobertura da pesquisa:
   ```sql
   SELECT i.field_conversion, MIN(i.data) AS inicio, COUNT(DISTINCT i.email) AS leads,
          COUNT(DISTINCT i.email) FILTER (WHERE i.renda_mensal IS NOT NULL) AS respondentes
   FROM "MAT_V2_inscricoes_geral_det" i
   JOIN wtl_campaign_definition wcd ON wcd.field_conversion = i.field_conversion
   GROUP BY 1 ORDER BY 2;
   ```
   (troque `renda_mensal` por uma dimensão que o cliente use.)
3. Mostre `lançamento | início | leads | respondentes | % resposta`. Lançamentos com poucos respondentes (< 100) distorcem: pergunte se ficam.
4. Nomes sem mês/ano reconhecível (`lcto-turma-a`) caem no fim da ordem: peça ao consultor a data e, se preciso, renomeie no CSV.

## Casos ambíguos
- Lançamento em curso (venda ainda aberta): sai; a janela de 60 dias não fechou.
- Perpétuo misturado com lançamento: mecânicas diferentes; confirme se compara.

## Saída (formato exato)
```json
{ "client": "inde", "client_name": "INDÊ", "campaign_label": "2023–2026",
  "title": "INDÊ · Conversão por Perfil" }
```
