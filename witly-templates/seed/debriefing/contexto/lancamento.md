# Identificar o lançamento encerrado

**Saída:** `config.field_conversion`, `config.client`, `config.client_name`, `config.nome_campanha`, `config.campaign_label`. **Confirmar com o consultor.**

## Definição
O debriefing é de **um** lançamento já encerrado (captação e venda concluídas). `field_conversion` é o identificador dele na base; `campaign_label` é o rótulo curto que aparece nos cabeçalhos (ex.: `LX ago/26`).

## Como levantar
1. Pergunte o cliente (slug do Delfos) e qual lançamento fechou.
2. `Delfos.Credentials(customer_slug)` → `db_name`.
3. Liste candidatos encerrados:
   ```sql
   SELECT field_conversion, field_type, date_start, date_end, is_active
   FROM wtl_campaign_definition
   WHERE date_end IS NOT NULL
   ORDER BY date_end DESC
   LIMIT 10;
   ```
4. Um candidato claro → siga e diga a premissa. Mais de um → mostre e pergunte.

## Casos ambíguos
- Lançamento ainda ativo: o debriefing sai incompleto; sugira o acompanhamento diário e confirme se o consultor quer mesmo fechar.
- Turmas paralelas (A/B) com `field_conversion` distintos: são dois debriefings.

## Saída (formato exato)
```json
{ "client": "enxoval", "client_name": "Enxoval Inteligente", "nome_campanha": "Lançamento Ago/26",
  "campaign_label": "LX ago/26", "field_conversion": "lcto-enxoval-ago26",
  "title": "Enxoval Inteligente · Debriefing de Lançamento" }
```
