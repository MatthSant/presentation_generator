# S08 — Visão Geral de Recompra por Grupo

**Página:** Análise por Produto  
**Tipo:** Por Produto — Comparativo entre grupos  
**Posição:** Quarta da página de produtos — visão comparativa antes do detalhe por grupo

---

## Objetivo

Comparar o comportamento de recompra entre os grupos identificados em S05. Esta seção é o "resumo executivo" do comportamento de fidelização do portfólio: qual grupo fideliza mais, qual tem maior multiplicador de LTV, e qual janela temporal é a mais importante para cada grupo. Serve de introdução para as seções de detalhe por grupo (S08+), que exploram cada grupo individualmente com `PRODUTO_GRUPO_TEMPLATE.md`.

---

## Colunas do CSV utilizadas

| Coluna | Uso |
|---|---|
| `user_id` | agrupamento por usuário |
| `valor_venda` | LTV, ticket e faturamento |
| `data_pedido` | janelas temporais e mediana de retorno |
| `primeiro_produto` | filtrar por grupo de entrada de cada usuário |

---

## Métricas derivadas necessárias

Para cada grupo definido em S05:

```
Função: filter_by(users, 'grupo_entrada', [nome_grupo]) → calc_ltv_metrics(group)
         + dist_janela_recompra(group)
         + mediana_retorno(group)
```

| Métrica | O que mede |
|---|---|
| `n_clientes` | Clientes com entrada neste grupo |
| `ltv_medio` | LTV médio total |
| `t1_medio` | Ticket médio da 1ª compra |
| `mult` | `ltv / t1` — multiplicador do grupo |
| `tx_recompra` | % de clientes com ≥ 2 compras |
| `mediana_retorno` | Mediana de dias até a 2ª compra |
| `dist_janela` | % de recompradores por janela (≤30d, 31–90d, 91–180d, 181–365d, >365d) |

> **Cuidado ao comparar grupos com mecânicas diferentes:** grupos parcelados têm `tx_recompra` artificialmente alta (parcelas registradas como transações) e `mult` que representa número de parcelas, não fidelidade. Sinalizar visualmente.

---

## Perguntas-guia

1. Qual grupo tem a maior taxa de recompra real (excluindo grupos parcelados)?
2. Qual grupo tem o maior multiplicador de LTV (`mult`)? É comparável entre grupos?
3. Em qual janela os clientes de cada grupo mais recompram — há diferença de timing entre grupos?
4. A mediana de retorno varia entre grupos? Um grupo recompra mais rápido que outro?
5. O grupo com mais clientes é também o que mais contribui para o faturamento de recompra?
6. Há grupo com `tx_recompra` muito baixa que deveria ter programas de retenção específicos?
7. **[Para cada diferença observada entre grupos]** A diferença é de safra, de perfil demográfico, de efeito de ticket — ou intrínseca ao produto?

---

## Diagnóstico de diferenças entre grupos

Toda vez que dois grupos apresentam `tx_recompra` ou `ltv_medio` diferentes, há 3 hipóteses a verificar antes de concluir que "grupo X fideliza mais que Y". Verificar na ordem — cada confundidor pode explicar parcial ou totalmente a diferença.

### 1. Safra (cohort bias)

Grupos lançados em épocas diferentes têm distribuições de coorte distintas. Clientes de grupos mais antigos simplesmente tiveram mais tempo para recomprar.

```python
# Verificar janela fixa de 12 meses para cada grupo
tx_janela = {
    grupo: tx_recompra_janela(filter_by(users, 'grupo_entrada', [grupo]), janela=365)
    for grupo in grupos_comparados
}
# Se a diferença cai na janela fixa → confundidor de safra

# Comparar distribuição de coortes (ano de entrada) entre grupos
for grupo in grupos_comparados:
    g = filter_by(users, 'grupo_entrada', [grupo])
    print(group_by(g, 'ano_entrada')[['n', 'pct']])
```

### 2. Perfil demográfico / psicográfico

Grupos que atraem públicos com perfis naturalmente distintos terão diferenças de recompra que não são do produto.

```python
# Para cada custom_field relevante:
for field in ['renda', 'escolaridade', 'papel_cliente']:
    for grupo in grupos_comparados:
        g = filter_by(users, 'grupo_entrada', [grupo])
        print(f"--- {grupo} × {field} ---")
        print(seg_table(g, key=field, min_n=30)[['segmento', 'n', 'pct', 'tx_recompra']])
```

Se a distribuição de renda ou escolaridade for muito diferente entre grupos → a diferença de recompra é de audiência.

### 3. Efeito de ticket

Grupos com ticket médio muito diferente têm propensão de recompra estruturalmente diferente. Produto de R$ 2.000 terá sempre menor `tx_recompra` que produto de R$ 400 — independente da qualidade do produto.

```python
# Comparar: ticket × tx_recompra × ltv por grupo
for grupo in grupos_comparados:
    g = filter_by(users, 'grupo_entrada', [grupo])
    m = calc_ltv_metrics(g)
    print(f"{grupo}: t1={m['t1_medio']:.0f}, tx_rcmp={m['tx_recompra']:.1%}, ltv={m['ltv_medio']:.0f}")
# Se a ordenação de tx_recompra é inversa à de t1 → efeito de ticket
```

### Regra de reportagem

| Confundidor confirmado | Como reportar o achado |
|---|---|
| Safra | "Grupos em fases distintas de maturidade — comparar pela janela de 12 meses" |
| Perfil | "Públicos com propensão de recompra diferente — não é diferença de produto" |
| Ticket | "Recompra de frequência menor no produto de maior ticket — mas LTV comparável" |
| Nenhum | "Diferença intrínseca de produto — investigar mecanismo de fidelização" |

---

## Estrutura visual

### KPIs de destaque (`.mr`, até 5)

| KPI | Cor sugerida |
|---|---|
| Taxa de recompra do grupo principal | `.c-p` |
| Multiplicador LTV do grupo principal | `.c-p` |
| Mediana de retorno do grupo principal | `.c-a` (urgência da janela de reengajamento) |
| N de grupos comparados | neutro |
| % do faturamento total vindo de recompras | `.c-g` |

> "Grupo principal" = o grupo com mais faturamento ou mais clientes (definido em S05).

### Visualizações

| ID sugerido | Tipo | O que mostra |
|---|---|---|
| `chart-s8-grupos-mult` | `bar` horizontal | Multiplicador LTV por grupo — ordenado por `mult` |
| `chart-s8-grupos-janela` | `bar` agrupado ou stacked | Distribuição de recompra por janela, por grupo — compara timing |
| `chart-s8-grupos-tx` | `bar` horizontal | Taxa de recompra por grupo |

> Se houver apenas 2–3 grupos, os três gráficos podem ser combinados em `.g2` (dois gráficos lado a lado).

### Insights (`find-block`) — 2–3 blocos

1. **Fidelização** (`find-tag-p`): qual grupo fideliza mais? É o mesmo que tem maior volume? O que explica a diferença?
2. **Timing** (`find-tag-g`): qual janela é crítica para cada grupo — e o que isso implica para campanhas de reengajamento
3. **Alerta** (`find-tag-a`): se houver grupo parcelado, alertar que a `tx_recompra` é mecânica; ou se houver grupo com `mult` ≈ 1× (sem fidelização), destacar como risco

---

## Transição para seções de detalhe

Ao final desta seção, o relatório mergulha em cada grupo individualmente.  
Para cada grupo com n ≥ 100 clientes, criar uma seção de detalhe seguindo `PRODUTO_GRUPO_TEMPLATE.md`.

A ordem das seções de detalhe deve seguir a relevância estratégica (por faturamento ou por n de clientes), não uma ordem fixa.

---

## Notas de qualidade

- `dist_janela_recompra` usa `dias_ate_2a` — apenas usuários com 2ª compra registrada entram no cálculo
- Grupos parcelados: a janela ≤30d terá spike artificial — identificar e sinalizar antes de apresentar
- Mediana de retorno deve ser calculada apenas sobre recompradores com `dias_ate_2a` válido (não None)
- Se um grupo tem n < 100, pode não aparecer nesta visão comparativa — incluir em nota ao pé da seção
- Não comparar `tx_recompra` de grupos parcelados com grupos de compra discreta — são métricas incomparáveis
