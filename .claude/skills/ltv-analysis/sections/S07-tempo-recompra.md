# S07 — Tempo até a Recompra

**Página:** Análise por Produto  
**Tipo:** Por Produto — Análise temporal de comportamento  
**Posição:** Terceira da página de produtos — timing do ciclo de compra

---

## Objetivo

Entender quando os clientes recompram — em quantos dias após a primeira compra voltam e qual a distribuição entre janelas curtas (≤30d), médias (31–180d) e longas (>365d). Informa o design de campanhas de reengajamento: onde está a janela de maior impacto potencial.

---

## Colunas do CSV utilizadas

| Coluna | Uso |
|---|---|
| `user_id` | agrupamento por usuário |
| `valor_venda` | LTV por janela |
| `data_pedido` | calcular `dias_ate_2a = data_t2 - data_t1` |
| `primeiro_produto` (via `norm_grupo()`) | comparar timing por grupo de produto |

---

## Métricas derivadas necessárias

Para cada recomprador (usuários com n_tx > 1):

| Métrica | Fórmula |
|---|---|
| `dias_ate_2a` | `(data_t2 - data_t1).days` |
| `janela` | `≤30d` / `31–90d` / `91–180d` / `181–365d` / `>365d` |

Agregados:

| Métrica | Fórmula |
|---|---|
| `mediana_geral` | mediana de `dias_ate_2a` sobre todos os recompradores |
| `p25`, `p75` | percentis 25 e 75 |
| `pct_por_janela` | `{janela: count / n_recompradores * 100}` |
| `ltv_por_janela` | `mean(ltv where janela == X)` — LTV médio por velocidade de retorno |
| `mediana_por_grupo` | mediana de `dias_ate_2a` para Core / Evento / Parcelado |

---

## Perguntas-guia

1. Qual % dos recompradores volta em até 30 dias? (compra imediata ou parcelamento disfarçado)
2. Qual % leva mais de 1 ano — o cliente que "sumiu e voltou"?
3. Qual é a mediana geral? E por grupo de produto?
4. O grupo Parcelado tem mediana em ~30 dias (próxima parcela) — isso distorce a métrica geral?
5. Clientes que recompram mais rápido têm LTV maior ou menor do que os que demoram?
6. Qual janela concentra mais clientes "recuperáveis" (chegaram a recomprar mas demoraram)?

---

## Estrutura visual

### KPIs de destaque (`.mr`, até 5)

| KPI | Valor | Cor sugerida |
|---|---|---|
| Mediana geral (dias) | `X dias` | neutro |
| P25 / P75 | `P25 = X · P75 = Y` | `.xs` (subtexto) |
| % que recompra em ≤ 30 dias | `X%` | `.c-g` |
| % que leva > 1 ano | `X%` | `.c-a` |
| Diferença de LTV: ≤30d vs >365d | `R$ X vs R$ Y` | `.c-p` / `.c-r` |

### Visualizações

| ID sugerido | Tipo | Categorias | Série | O que mostra |
|---|---|---|---|---|
| `chart-tempo-janela` | `bar` | `[≤30d, 31–90d, 91–180d, 181–365d, >365d]` | `pct_por_janela` | Distribuição de recompradores por janela |
| `chart-tempo-grupo` | `bar` horizontal | grupos de produto | `mediana_dias` | Mediana de retorno por grupo |

> A separação por grupo é crítica porque Parcelado (mediana ~31d = próxima fatura) e Evento (42d = conversão pós-pitch) têm dinâmicas completamente distintas do Core

### Insights (`find-block`) — 3–4 blocos sugeridos

1. **Parcelado** (`find-tag-a`): "Parcelado: mediana 31d — próxima fatura, não recompra real"
2. **Evento** (`find-tag-g`): "Eventos (pitch): 15% taxa, mediana 42d — conversão pós-evento"
3. **Core** (`find-tag-p`): comportamento do segmento core — quando voltam e qual é o LTV associado a cada janela
4. **Janela crítica** (`find-tag-a`): "90–180 dias: maior concentração de clientes 'recuperáveis' — janela ideal para reengajamento"

---

## Funções do `ltv_calc.py`

`dist_janela_recompra(users, janelas=[30, 90, 180, 365, 9999])` — distribuição de recompradores por janela de dias  
`mediana_retorno(users)` — mediana de `dias_ate_2a` sobre recompradores  
`filter_by(users, 'grupo_entrada', [grupo])` + `mediana_retorno(group)` — mediana de retorno por grupo de produto

---

## Notas de qualidade

- Parcelados têm "recompra" que é o próximo boleto — distorce a mediana e % da janela ≤30d. Analisar com e sem parcelado
- Clientes que tiveram a 2ª compra no mesmo dia da T1 (dias_ate_2a == 0) provavelmente representam compras do mesmo carrinho — investigar se devem ser excluídos
- Clientes sem data válida na T2 devem ser excluídos desta análise
- "Janela crítica" é onde o esforço de reengajamento tem ROI máximo — não necessariamente onde mais recompradores estão, mas onde mais respondem a comunicação ativa
