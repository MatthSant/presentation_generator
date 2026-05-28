# S03 — LTV e Recompra por Safra de Entrada

**Página:** Visão Geral  
**Tipo:** Visão Geral — Análise de coorte  
**Posição:** Terceira seção — qualidade de cada geração de clientes

---

## Objetivo

Comparar o desempenho de LTV e recompra entre coortes de clientes que compraram pela primeira vez em anos diferentes (safras). Permite identificar se os clientes mais recentes são mais ou menos valiosos que os antigos, e se o comportamento de recompra está melhorando, estável ou degradando ao longo das gerações.

---

## Colunas do CSV utilizadas

| Coluna | Uso |
|---|---|
| `user_id` | agrupamento por usuário |
| `valor_venda` | LTV acumulado |
| `data_pedido` | determinar safra (ano da T1) e calcular LTV em janelas temporais desde a T1 |

---

## Métricas derivadas necessárias

Para cada safra (ano da primeira compra):

| Métrica | Fórmula |
|---|---|
| `n_clientes[safra]` | número de clientes com T1 no ano |
| `ltv_12m[safra]` | `mean(LTV acumulado até 365 dias após T1)` |
| `ltv_24m[safra]` | `mean(LTV acumulado até 730 dias após T1)` |
| `ltv_total[safra]` | `mean(LTV total de todas as transações)` |
| `tx_recompra[safra]` | `% de clientes com n_tx > 1` |
| `ltv_limpo_12m[safra]` | mesmo que `ltv_12m` mas excluindo transações com `valor_venda <= R$50` |

> "LTV em janela" = soma de todas as transações do usuário cuja `data_pedido` está entre `data_t1` e `data_t1 + N dias`.  
> Safras recentes terão menos janelas disponíveis (ex: safra 2025 só tem ~12m de dados).

---

## Perguntas-guia

1. Qual safra tem o LTV acumulado mais alto após 12 meses?
2. As safras mais recentes estão "rastreando" (tracking) o mesmo crescimento que as antigas?
3. A taxa de recompra melhorou ou piorou por safra?
4. O LTV inicial (1ª transação) mudou entre safras? Queda de ticket explica LTV menor?
5. Se corrigirmos entradas de baixo valor (≤ R$50, provavelmente eventos de pitch), o LTV "limpo" das safras recentes é comparável ao das safras maduras?
6. Qual é o "teto natural" de LTV para uma safra madura? (convergência das curvas mais antigas)

---

## Estrutura visual

### KPIs de destaque (`.mr`, até 5)

| KPI | Valor | Cor sugerida |
|---|---|---|
| LTV médio da safra mais madura | `R$ ltv_total[safra_mais_antiga]` | `.c-p` |
| Taxa de recompra da safra mais recente | `tx_recompra[ano_atual-1] %` | `.c-a` |
| LTV "limpo" safra mais recente (12m) | `R$ ltv_limpo_12m[ano_atual-1]` | `.c-g` |
| N clientes safra mais recente | `n_clientes[ano_atual-1]` | neutro |

### Visualizações

| ID sugerido | Tipo | X | Séries | O que mostra |
|---|---|---|---|---|
| `chart-ltv-safra` | `line` multi-série | janela temporal (12m, 24m, ...) | uma linha por safra | Curvas de crescimento de LTV por geração |
| `chart-recompra-safra` | `bar` | safras | `tx_recompra` | Taxa de recompra por geração de clientes |
| `chart-ltv-limpo` | `area` ou `bar` | safras | `ltv_12m` vs `ltv_limpo_12m` | Impacto de entradas de baixo valor no LTV aparente |

### Insights (`find-block`) — 3 blocos sugeridos

1. **Maturidade** (`find-tag-p`): convergência das safras maduras — "Safras X–Y: LTV converge para R$ Z — teto da base madura"
2. **Safra recente** (`find-tag-a`): "Safra [atual–1]: LTV inicial R$ X — Y% abaixo de [ano anterior]"
3. **Core intacto** (`find-tag-g`): LTV limpo (sem entradas baratas) das safras recentes comparado às anteriores — mostrar que o produto core não degradou

---

## Funções do `ltv_calc.py`

`ltv_por_safra(users, all_txs, janelas=[365, 730, 1095, 1460, 9999])` — LTV médio acumulado por coorte de entrada e janela temporal  
`group_by(users, 'safra', min_n=0)` + `calc_ltv_metrics(group)` — taxa de recompra e métricas por safra

---

## Notas de qualidade

- Safras com menos de 12 meses de dados devem ser marcadas com aviso visual (ex: "parcial" ou tag amber)
- Safras com n < 200 clientes têm alta variância — interpolar com cautela
- O "LTV limpo" é uma métrica analítica, não definitiva — valores ≤ R$50 podem incluir produtos legítimos de baixo preço; ajustar o threshold por contexto
- Não confundir LTV "total" (toda a vida) com LTV "12m" — safras maduras têm muito mais tempo para acumular
