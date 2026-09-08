# Identificar o lançamento

**Saída:** `config.field_conversion`, `config.client`, `config.client_name`, `config.nome_campanha`. **Confirmar com o consultor.**

## Definição
`field_conversion` é o identificador do lançamento na base da Witly (ex.: `lcto-enxoval-set26`). Todas as views do acompanhamento filtram por ele. No lançamento pago a coluna pode vir como `conversion_traf` na linha que nasce da integração de mídia; a query já faz o `COALESCE`.

## Como levantar
1. Peça ao consultor o cliente (slug do Delfos) e o nome do lançamento, se ainda não souber.
2. `Delfos.Credentials(customer_slug)` → `db_name`.
3. Liste candidatos (uma consulta leve, no máximo 10 linhas):
   ```sql
   SELECT field_conversion, field_type, date_start, date_end, is_active
   FROM wtl_campaign_definition
   WHERE field_conversion ILIKE '%<trecho do nome>%' OR is_active
   ORDER BY date_start DESC
   LIMIT 10;
   ```
4. Se exatamente um candidato casa (nome + período), siga e diga a premissa em uma linha. Se houver mais de um, mostre a lista e pergunte.

## Exemplos
- "acompanhamento da Enxoval" → candidatos `lcto-enxoval-set26` (ativo, 01/09–20/09) e `lcto-enxoval-mai26` (encerrado). O ativo é o certo; confirme.
- Cliente com dois lançamentos ativos ao mesmo tempo (ex.: turma A e turma B) → **sempre perguntar**.

## Casos ambíguos
- Nome parecido em vários clientes: o `customer_slug` resolve; nunca cruze bases de clientes.
- `is_active` falso mas o consultor diz que está no ar: confie no consultor, registre a observação no documento.

## Saída (formato exato)
```json
{ "client": "enxoval", "client_name": "Enxoval Inteligente",
  "nome_campanha": "Lançamento Set/26", "field_conversion": "lcto-enxoval-set26",
  "title": "Enxoval Inteligente · Acompanhamento de Campanha" }
```
