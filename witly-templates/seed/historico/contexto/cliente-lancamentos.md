# Cliente e série de lançamentos

**Saída:** `config.client`, `config.client_name`, `config.title`, `config.campaign_label`. **Confirmar com o consultor** a lista de eventos que entram.

## Definição
O histórico compara **eventos** (`field_conversion`) de um mesmo cliente em ordem cronológica (`date_start` de `wtl_campaign_definition`). Cada evento vira um ponto da série, rotulado pelo mês/ano (`jul/25`). Faz sentido com **3 ou mais** lançamentos encerrados; com menos, tendência e sazonalidade viram hipótese.

## Como levantar
1. Pergunte o cliente (slug do Delfos). `Delfos.Credentials(customer_slug)` → `db_name`.
2. Liste os eventos:
   ```sql
   SELECT wcd.field_conversion, wcd.date_start, wcd.date_end,
          SUM(COALESCE(c.leads::NUMERIC, 0)) AS leads, SUM(COALESCE(c.vendas::NUMERIC, 0)) AS vendas
   FROM wtl_campaign_definition wcd
   LEFT JOIN "MAT_V2_inscricoes_geral_consolidado" c ON c.field_conversion = wcd.field_conversion
   GROUP BY 1, 2, 3 ORDER BY 2;
   ```
3. Mostre a lista e pergunte o que sai: eventos de teste, turmas paralelas, lançamento ainda ativo (sai: o histórico é de encerrados), eventos com leads mas sem vendas (venda ainda não fechou).
4. Dois eventos no mesmo mês recebem o mesmo rótulo (`jul/25`): avise; se preciso, deixe um fora via `--opts launches` ou pelo recorte de tipo.

## Casos ambíguos
- Cliente que mudou de mecânica no meio (clássico → pago): compare, mas registre a quebra de série no documento.
- `date_start` nulo em `wtl_campaign_definition`: o evento cai no fim da ordem; peça ao consultor a data.

## Saída (formato exato)
```json
{ "client": "inde", "client_name": "INDÊ", "campaign_label": "2024–2026",
  "title": "INDÊ · Histórico de Lançamentos" }
```
