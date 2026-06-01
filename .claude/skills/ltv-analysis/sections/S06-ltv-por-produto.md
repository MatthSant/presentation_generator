# S06 — LTV e Faturamento por Produto de Entrada

**Página:** Análise por Produto  
**Tipo:** Por Produto — Ranking  
**Posição:** Segunda da página de produtos — detalhamento do ranking

---

## Objetivo

Ranquear todos os produtos pela capacidade de gerar LTV e faturamento. Revela se há correlação entre ticket alto e LTV alto (ou se é o multiplicador que diferencia os produtos), quais são os produtos âncora de receita, e quais têm alta recompra mas baixo volume. Permite priorizar investimento de portfólio e estratégia de upsell.

---

## Colunas do CSV utilizadas

| Coluna | Uso |
|---|---|
| `user_id` | agrupamento por usuário |
| `valor_venda` | LTV e ticket |
| `primeiro_produto` | produto de entrada do usuário (usar `norm_produto()`) |

---

## Métricas derivadas necessárias

Para cada produto de entrada com n_clientes >= threshold:

| Métrica | Fórmula |
|---|---|
| `n_clientes[produto]` | usuários com T1 neste produto |
| `ltv_medio[produto]` | `mean(ltv)` |
| `t1_medio[produto]` | `mean(t1)` |
| `mult[produto]` | `ltv_medio / t1_medio` |
| `upside_pct[produto]` | `(ltv_medio - t1_medio) / t1_medio * 100` |
| `tx_recompra[produto]` | `% com n_tx > 1` |
| `fat_total[produto]` | `sum(ltv)` |
| `fat_t1[produto]` | `sum(t1)` |
| `fat_rcmp[produto]` | `fat_total - fat_t1` |

---

## Perguntas-guia

1. Qual produto tem o maior LTV médio? É porque tem ticket alto ou multiplicador alto?
2. Qual produto gera mais faturamento total (volume × LTV)?
3. Há produto com ticket baixo mas LTV alto (alto multiplicador)? Esse é um produto de "escada"
4. Há produto com ticket alto mas LTV baixo (multiplicador < 1.1×)? Pode estar capturando cliente errado
5. Os produtos com maior taxa de recompra são os mesmos que geram mais LTV?
6. Quais produtos têm maior potencial de upsell (LTV alto + alta recompra + ticket baixo)?

---

## Estrutura visual

### KPIs de destaque (`.mr`, até 4)

| KPI | Valor | Cor sugerida |
|---|---|---|
| Maior LTV por produto (nome do produto) | `R$ X` | `.c-p` |
| Melhor multiplicador (nome do produto) | `X×` | `.c-g` |
| Maior taxa de recompra (nome) | `X%` | `.c-a` |
| Multiplicador médio geral | `1,5×` (ex.) | neutro |

### Visualizações

| ID sugerido | Tipo | Categorias | Série | O que mostra |
|---|---|---|---|---|
| `chart-produto-ltv` | `bar` horizontal | produtos (ordenados por LTV) | `ltv_medio` | Ranking de LTV médio — excluir parcelado |
| `chart-produto-fat` | `bar` horizontal | produtos (ordenados por faturamento) | `fat_total` | Ranking de faturamento total |

> Parcelado deve ser excluído dos gráficos de LTV ou marcado com aviso — o LTV inclui parcelas, não é recompra real

### Insights (`find-block`) — 3 blocos sugeridos

1. **LTV vs multiplicador** (`find-tag-p`): produto com maior LTV mas multiplicador baixo — "vem do ticket, não da recompra"
2. **Benchmark** (`find-tag-g`): produto com melhor multiplicador — "cada R$ 1 de entrada gera R$ X ao longo do tempo"
3. **Atenção** (`find-tag-r`): produto com alto ticket mas baixa recompra — risco de aquisição cara + sem fidelização

---

## Funções do `ltv_calc.py`

`seg_table(users, key='slug_produto', min_n=30)` — tabela de métricas por produto de entrada  
`calc_ltv_metrics(group)` — métricas detalhadas por produto individual

---

## Notas de qualidade

- Usar `slug_entrada` normalizado — não o nome bruto do produto
- Produtos com n_clientes < 30 devem ser omitidos ou agrupados em "Outros"
- Não comparar LTV de parcelado com LTV de core diretamente — as mecânicas são diferentes
- O "maior LTV" pode ser distorcido por produtos premium com poucos clientes — checar o n antes de destacar
