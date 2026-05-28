# S02 — Faturamento e Ticket Médio

**Página:** Visão Geral  
**Tipo:** Visão Geral — Série temporal  
**Posição:** Segunda seção — contexto histórico de crescimento

---

## Objetivo

Mostrar como o faturamento evoluiu ano a ano, separando a origem (clientes novos vs recompra), e como o ticket médio se comportou no mesmo período. Responde se o crescimento é saudável (vindo de fidelização) ou frágil (dependente de novos clientes), e se há pressão de queda no ticket.

---

## Colunas do CSV utilizadas

| Coluna | Uso |
|---|---|
| `user_id` | identificar se a transação é nova (primeira do usuário) ou recompra |
| `valor_venda` | faturamento |
| `data_pedido` | agrupamento por ano |

---

## Métricas derivadas necessárias

Para cada ano em `range(ano_min, ano_max + 1)`:

| Métrica | Fórmula |
|---|---|
| `fat_nova[ano]` | `sum(valor_venda)` de transações que são T1 do usuário, no ano |
| `fat_rcmp[ano]` | `sum(valor_venda)` de transações que são T2+ do usuário, no ano |
| `fat_total[ano]` | `fat_nova + fat_rcmp` |
| `ticket_medio[ano]` | `mean(valor_venda)` de todas as transações do ano |
| `ticket_nova[ano]` | `mean(valor_venda)` apenas transações T1 do ano |
| `n_novos[ano]` | número de clientes com T1 no ano |
| `n_recompradores[ano]` | número de usuários distintos com T2+ no ano |

> **Como identificar T1 vs recompra:** para cada `user_id`, a transação mais antiga é a primeira compra (T1). Todas as demais são recompra. Uma transação em 2024 pode ser T1 de um usuário que entrou em 2024, ou T2+ de um usuário que entrou em 2020.

---

## Perguntas-guia

1. O faturamento total está crescendo? Qual foi a CAGR nos últimos 3–5 anos?
2. O crescimento vem de novos clientes ou de recompra? Em qual ano essa proporção mudou?
3. O faturamento de novos clientes está estável, crescendo ou caindo?
4. O faturamento de recompra acelerou? A partir de qual ano?
5. Como evoluiu o ticket médio? Há queda consistente?
6. A queda de ticket (se existir) é compensada por volume ou pela recompra?

---

## Estrutura visual

### KPIs de destaque (`.mr`, até 5)

| KPI | Valor | Cor sugerida |
|---|---|---|
| Faturamento total histórico | `R$ fat_total_acumulado` | `.c-p` |
| Crescimento total (primeiro vs último ano completo) | `+X%` | `.c-g` |
| Ticket médio último ano | `R$ ticket_medio[ano_atual-1]` | neutro |
| Faturamento nova (último ano completo) | `R$ fat_nova` | neutro |
| Faturamento recompra (último ano completo) | `R$ fat_rcmp` | `.c-g` |

### Visualizações

| ID sugerido | Tipo | Categorias | Séries | O que mostra |
|---|---|---|---|---|
| `chart-fat` | `bar` empilhado + `line` | anos | `[fat_nova, fat_rcmp]` + `ticket_medio` | Faturamento total com composição + tendência de ticket |
| `chart-fat-nova` | `bar` simples | anos | `fat_nova` | Crescimento de novos clientes isolado |
| `chart-fat-rcmp` | `bar` simples | anos | `fat_rcmp` | Crescimento de recompra isolado |

> Os dois últimos podem ser exibidos lado a lado em `.g2` com destaque para o contraste de curvas

### Insights (`find-block`) — 4 blocos sugeridos

1. **Crescimento** (`find-tag-p`): trajetória total — "R$ X → R$ Y em N anos (+Z%)"
2. **Ticket** (`find-tag-r`): queda de ticket se existir — "Ticket R$ X (ano) → R$ Y (ano) — −Z%"
3. **Recompra** (`find-tag-g`): "Faturamento de recompra saltou de R$ X para R$ Y em [ano]" — inflexão
4. **Nova** (`find-tag-a`): comportamento do faturamento de novos — se estabilizou, declinou, cresceu

---

## Funções do `ltv_calc.py`

`faturamento_anual(rows, col_user, col_value, col_date, col_primeira)` — séries anuais de faturamento por origem (nova vs recompra)

---

## Notas de qualidade

- Ano corrente (parcial) deve ser marcado visualmente — o volume estará incompleto vs anos anteriores
- Um usuário que comprou em 2021 e compra novamente em 2024 contribui para `fat_nova[2021]` e `fat_rcmp[2024]` — não para `fat_nova[2024]`
- Se o negócio tem pré-venda ou eventos sazonais concentrados em um mês, o último ano pode parecer "menor" por corte de data — verificar antes de interpretar como queda
