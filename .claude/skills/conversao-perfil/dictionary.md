# Dicionário do dump — conversao-perfil

Schema dos **campos fixos** do dump de pesquisa de lançamentos. Os critérios de
perfil (dimensões) variam por cliente — são mapeados a cada análise (Fase 4) em
`temp/[cliente]/[slug]/dicionario.md`, **não** aqui.

Formato: **uma linha por combinação de dimensões × lançamento × canal**. A skill
agrega internamente por critério (ignorando as demais dimensões).

---

## Colunas fixas

| Coluna | Tipo | Descrição |
|---|---|---|
| `field_conversion` | dimensão | Identificador do lançamento (ex.: `lcto-independencia-abr24`). A data é extraída do nome para ordenação cronológica. |
| `tipo_trafego` | dimensão | Canal: `Pago` ou `Orgânico`. O canal **Geral** é a soma dos dois. |
| `total_leads` | métrica | Total de leads naquela combinação. |
| `vendas_lancamento` | métrica | Vendas na janela de lançamento (60 dias). |
| `vendas_6meses` | métrica | Vendas em 6 meses (janela opcional). |
| `vendas_12meses` | métrica | Vendas em 12 meses (long-term). |

`conv_calc.WINDOWS` mapeia `lcto`→`vendas_lancamento`, `6m`→`vendas_6meses`,
`12m`→`vendas_12meses`. Janelas padrão: `lcto` (60d) e `12m`.

---

## Colunas de dimensão (critérios)

Toda coluna que **não** é fixa é tratada como dimensão/critério
(`conv_calc.dim_columns`). Exemplos comuns: `renda_mensal`, `idade`, `genero`,
`tempo_acompanhamento` e `custom_field_N`.

- **custom_field_N**: variam por cliente e ao longo do tempo. O usuário sempre
  informa o significado e o rótulo curto na Fase 4. Nunca presuma o mapeamento.
- **Linhas de benchmark total**: quando **todas** as dimensões estão vazias, a
  linha representa o lançamento/canal inteiro (benchmark total de leads).
- **Linhas de respondentes**: quando ao menos a dimensão do critério está
  preenchida — são a base do benchmark de pesquisa **daquele critério**.

---

## Linhas calculadas por grupo (saída de `conv_calc.agg_criterio`)

Para cada grupo de um critério, por canal, ao longo dos lançamentos:

| Campo | Fórmula |
|---|---|
| `conv_lcto` / `conv_12m` | `vendas_janela / total_leads × 100` (já em %) |
| `bench_pesq_lcto` / `bench_pesq_12m` | conversão dos respondentes do critério (denominador correto) |
| `bench_total_lcto` / `bench_total_12m` | conversão das linhas de dimensão vazia (contexto) |
| `diff_lcto` / `diff_12m` | `(conv − bench_pesq) / bench_pesq × 100` |
| `uplift_12m` | `(conv_12m − conv_lcto) / conv_lcto × 100` |
| `rep` | `leads_grupo / leads_respondentes_do_critério × 100` |
| `avg*` | médias dos vetores acima ao longo dos lançamentos |
| `wins` / `n` | nº de lançamentos com `diff_lcto > 0` / nº com dado |

---

## Exemplo de mapeamento de custom_fields (caso INDÊ)

Preenchido na Fase 4 e gravado por análise — incluído aqui só como exemplo:

| Coluna | Critério | Grupos (canônicos) |
|---|---|---|
| `renda_mensal` | Renda Mensal | faixas de renda |
| `idade` | Faixa Etária | faixas etárias |
| `genero` | Gênero | Masculino / Feminino / Outro |
| `tempo_acompanhamento` | Tempo de Acompanhamento | < 3m … > 3 anos |
| `custom_field_2` | Investe em RV? | Não / Sim c/ ações / Sim c/ fundos |
| `custom_field_3` | Patrimônio Investido | faixas de patrimônio (normalizar variantes) |
| `custom_field_4` | Perfil de Decisão | independente / gerente-assessor / youtubers |
| `custom_field_5` | Tem Assessor? | Sim / Não |
