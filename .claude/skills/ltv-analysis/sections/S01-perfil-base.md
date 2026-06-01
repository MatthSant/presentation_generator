# S01 — Perfil da Base de Clientes

**Página:** Visão Geral  
**Tipo:** Visão Geral  
**Posição:** Primeira seção — baseline de toda a análise

---

## Objetivo

Apresentar o retrato de mais alto nível da base: quantos clientes únicos existem, qual proporção comprou apenas uma vez versus múltiplas vezes, qual é o LTV médio e qual é o upside potencial ao aumentar recompra. É a seção que responde "qual é o tamanho do problema e da oportunidade" antes de mergulhar em produto ou perfil.

---

## Colunas do CSV utilizadas

| Coluna | Uso |
|---|---|
| `user_id` | agrupamento — um registro por usuário único |
| `valor_venda` | soma → LTV; primeiro valor → T1 |
| `data_pedido` | ordenação cronológica para identificar T1 |

---

## Métricas derivadas necessárias

| Métrica | Fórmula |
|---|---|
| `n_clientes` | `len(users)` |
| `n_single` | `count(u where n_tx == 1)` |
| `n_recompradores` | `count(u where n_tx > 1)` |
| `tx_recompra` | `n_recompradores / n_clientes` |
| `ltv_medio` | `mean(ltv)` |
| `t1_medio` | `mean(t1)` |
| `upside_medio` | `mean(ltv - t1)` |
| `mult_medio` | `mean(ltv / t1)` — apenas recompradores |
| `avg_tx_recompradores` | `mean(n_tx where n_tx > 1)` |
| `dist_tx` | distribuição: `{1: n, 2: n, 3: n, 4+: n}` |
| `ltv_single` | `mean(ltv where n_tx == 1)` |
| `ltv_recomprador` | `mean(ltv where n_tx > 1)` |
| `fat_total` | `sum(ltv)` |
| `fat_recompra` | `sum(ltv - t1)` |

---

## Perguntas-guia

1. Qual % da base comprou apenas uma vez? (identificar o "teto de oportunidade")
2. Qual é a diferença de LTV entre um cliente que só comprou uma vez e um recomprador?
3. Quantas compras em média um recomprador faz?
4. Qual é o upside médio por cliente — ou seja, quanto cada cliente vale além da 1ª compra?
5. O faturamento de recompra representa qual % do faturamento total?
6. Se a taxa de recompra dobrasse, qual seria o impacto no faturamento total?

---

## Estrutura visual

### KPIs de destaque (`.mr`, até 6)

| KPI | Valor | Cor sugerida |
|---|---|---|
| Total de clientes únicos | `n_clientes` formatado | `.c-p` |
| Taxa de recompra | `tx_recompra %` | `.c-a` ou `.c-r` (se baixo) |
| LTV médio | `R$ ltv_medio` | `.c-p` |
| Upside médio / cliente | `R$ upside_medio` | `.c-g` |
| Nº de recompradores | `n_recompradores` | neutro |
| Ticket médio 1ª compra | `R$ t1_medio` | neutro |

### Visualizações

| ID sugerido | Tipo | X / Categorias | Y / Série | O que mostra |
|---|---|---|---|---|
| `chart-base-dist` | `donut` | `["1 compra", "2 compras", "3 compras", "4+ compras"]` | percentuais | Proporção da base por número de compras |
| `chart-base-ltv-comp` | `bar` horizontal | `["Compraram 1×", "Recompradores"]` | `[ltv_single, ltv_recomprador]` | Diferença de LTV entre os grupos |

### Insights (`find-block`) — 3 blocos sugeridos

1. **Desafio** (`find-tag-r`): "X% compraram apenas uma vez" — destacar o número absoluto e o que isso representa em faturamento não realizado
2. **Upside** (`find-tag-g`): "+Y% além da 1ª venda por cliente" — o multiplicador de LTV que recompradores apresentam
3. **Retenção** (`find-tag-p`): "Recompradores fazem X compras em média" — para mostrar que quem fica, compra muito

---

## Funções do `ltv_calc.py`

`calc_ltv_metrics(users)` — métricas globais da base  
`group_by(users, 'n_tx', min_n=0)` — distribuição por número de compras

---

## Notas de qualidade

- Excluir transações com `valor_venda <= 0` antes de qualquer cálculo (são estornos ou erros)
- Se o mesmo usuário tem duas transações na mesma data e mesmo valor, investigar duplicata antes de incluir
- `ltv_single` inclui apenas usuários com n_tx == 1 — não confundir com o ticket médio geral
- O multiplicador médio deve ser calculado apenas sobre recompradores (divisão por zero no caso de n_tx == 1)
