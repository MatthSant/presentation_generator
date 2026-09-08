# Lançamento anterior (histórico) — opcional

**Saída:** `hist.csv` (`--hist`) e `config.field_conversion_anterior`, ou nada. **Confirmar com o consultor.**

## Definição
Com o consolidado do lançamento anterior, os KPIs ganham **Δ vs histórico** (além do Δ vs meta) e a consulta `variacao_hist` compara canais/temperaturas que recorrem. Sem ele, a coluna de histórico fica vazia; nunca é inventada.

## Como levantar
1. Pergunte: "compara com qual lançamento?" Sugira o imediatamente anterior do mesmo cliente (`wtl_campaign_definition` ordenado por `date_end`).
2. `montar_query('debriefing', {field_conversion, field_conversion_anterior})` → a query `hist`. Salve como `hist.csv`.
3. Passe `--hist hist.csv`.

## Casos ambíguos
- Mecânica diferente (o anterior era pago, este é clássico): compare mesmo assim, mas registre a diferença no documento.
- Primeiro lançamento do cliente: sem histórico; diga isso no relatório.

## Saída
`hist.csv` no mesmo formato do `dump.csv`, com o `field_conversion` do lançamento anterior.
