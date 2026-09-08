# Metas do lançamento (goals.csv) — obrigatório

**Saída:** `goals.csv`, passado ao `gerar.py` com `--goals`. Sem ele o `gerar.py` **recusa**: não existe debriefing sem meta.

## Definição
O debriefing responde "atingiu?". A meta vem da tabela `wtl_launch_goals` (1 linha por `utm_source` × dia). O motor:
- **soma** `meta_leads`, `meta_vendas`, `meta_receita`, `meta_valor_invest`;
- faz a **média das linhas > 0** de `meta_cpl`, `meta_cpmql`, `meta_conversao`, `meta_taxa_qual`, `meta_taxa_resp` (zeros do orgânico não distorcem o alvo pago);
- guarda meta por canal (`utm_source`) para o bloco de canais.

## Como levantar
1. `montar_query('debriefing', {field_conversion})` → a query `goals`. Rode no Delfos e salve como `goals.csv`.
2. Se voltar **vazio**, pare: peça ao consultor que preencha as metas na tabela (ou, na falta, um CSV no mesmo formato com uma linha por canal). Não invente meta.

## Metas por canal ou temperatura (opcional)
Se o consultor tiver meta de **vendas** por canal ou por temperatura fora da tabela, entram no config como `meta_vendas_canal` / `meta_vendas_temperatura` (dicionário `nome → vendas`). Não há meta por criativo.

## Saída
`goals.csv` com as colunas `data, utm_source, field_conversion, meta_leads, meta_taxa_resp, meta_taxa_qual, meta_valor_invest, meta_cpl, meta_cpmql, meta_conversao, meta_receita, meta_vendas`.
