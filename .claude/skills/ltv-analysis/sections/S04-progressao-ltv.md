# S04 — Progressão de LTV por Janela Temporal

**Página:** Visão Geral  
**Tipo:** Visão Geral — Acumulação temporal  
**Posição:** Quarta seção — "quando" acontece o valor

---

## Objetivo

Mostrar em quais janelas de tempo (30d, 90d, 180d, 1 ano, além de 1 ano) o LTV se acumula após a primeira compra. Revela o "multiplicador" que cada cliente gera ao longo do tempo e identifica qual janela é crítica para campanhas de reengajamento. Complementa S03 (que compara safras) focando na trajetória individual do cliente.

---

## Colunas do CSV utilizadas

| Coluna | Uso |
|---|---|
| `user_id` | agrupamento por usuário |
| `valor_venda` | acumulação de LTV |
| `data_pedido` | calcular delta em relação à T1 |

---

## Métricas derivadas necessárias

Para cada janela `W` em `[30, 90, 180, 365, 9999]`:

| Métrica | Fórmula |
|---|---|
| `ltv_medio_W` | `mean(sum de transações do user com data ≤ T1 + W dias)` |
| `delta_W` | `ltv_medio_W - ltv_medio_W_anterior` — incremento por janela |
| `pct_W` | `ltv_medio_W / ltv_medio_total` — quanto do LTV veio até este momento |

Por safra e grupo (para comparação):

| Métrica | Fórmula |
|---|---|
| `ltv_safra_W[safra]` | média da safra para cada janela |
| `mult_safra[safra]` | `ltv_total_safra / t1_medio_safra` |

---

## Perguntas-guia

1. Qual é o multiplicador médio de LTV (LTV total / T1)?
2. Quanto do LTV acontece nos primeiros 30 dias? E nos primeiros 90?
3. Em qual janela o crescimento de LTV desacelera — qual é o "ponto de saturação"?
4. Qual janela é a mais crítica para reengajamento? (maior delta relativo ao esforço)
5. O multiplicador melhorou ou piorou entre as safras mais recentes?
6. Há diferença de multiplicador entre grupos de produto (core vs evento vs parcelado)?

---

## Estrutura visual

### KPIs de destaque (`.mr`, até 4)

| KPI | Valor | Cor sugerida |
|---|---|---|
| Multiplicador médio histórico | `1,5×` (ex.) | `.c-p` |
| LTV médio total | `R$ X` | `.c-p` |
| % do LTV que vem após 30 dias | `X%` | `.c-g` |
| Janela crítica de recompra | `30–180 dias` (ex.) | `.c-a` |

### Visualizações

| ID sugerido | Tipo | X | Séries | O que mostra |
|---|---|---|---|---|
| `chart-progressao` | `area` | `[30d, 90d, 180d, 1a, 1a+]` | `[ltv_medio_W]` | Curva de acumulação média de LTV |
| `chart-progressao-safra-A` | `bar` lado a lado | janelas | safra X e safra Y | Comparação de progressão entre duas safras específicas (ex: penúltima e última completa) |
| `chart-progressao-safra-B` | `bar` | janelas | outra safra | Par de comparação |

> Os dois gráficos de safra ficam melhor em `.g2` (dois gráficos lado a lado)

### Insights (`find-block`) — 3 blocos sugeridos

1. **Multiplicador** (`find-tag-p`): valor do multiplicador histórico e se é consistente entre safras
2. **Portfólio** (`find-tag-g`): se a safra mais recente está mostrando aceleração na janela de 1 ano — indica efeito de portfólio maior
3. **Janela crítica** (`find-tag-a`): "30–180 dias é onde campanhas de reengajamento têm mais impacto" — fundamentar com o maior delta relativo nessa janela

---

## Funções do `ltv_calc.py`

`ltv_progressao(users, all_txs, janelas=[30, 90, 180, 365, 9999])` — LTV médio acumulado por janela de dias  
`ltv_por_safra(users, all_txs, janelas=[30, 90, 180, 365, 9999])` — comparação de progressão entre safras

---

## Notas de qualidade

- A janela `9999` (1a+) representa o LTV total — inclui toda a história do cliente
- Para safras recentes, `ltv_W` onde W > tempo disponível vai ser igual ao `ltv_total` (não há dados futuros)
- O multiplicador de 1a+ pode parecer artificialmente alto em safras maduras — é correto, reflete fidelidade real
- Não incluir clientes sem data válida na T1 nos cálculos de janela
