# Template — Análise por Grupo de Produto

**Uso:** instanciar uma vez para cada grupo identificado em S05.  
**Quantos grupos?** Depende do portfólio — S05 define a taxonomia. Geralmente 2–5 grupos.  
**Nomenclatura dos arquivos:** `SXX-grupo-[slug-do-grupo].md`

---

## O que é um grupo de produto

Um grupo é uma categoria do portfólio que agrupa produtos por lógica de compra, ticket e comportamento de recompra — definido em S05 pela análise de:
- Faixa de ticket (T1)
- Taxa de recompra
- Composição de faturamento (fat_1a vs fat_rcmp)
- Padrão de janela de recompra (intervalos curtos = parcelas, longos = decisão nova)

Exemplos de grupos típicos (não são padrão — emergem da análise):
- **Produto core de capacitação** — ticket médio-alto, recompra intencional
- **Produto de entrada / evento** — ticket baixo, funciona como funil de conversão para outros produtos
- **Produto parcelado / contrato** — múltiplas transações mecânicas (parcelas), LTV artificial alto
- **Produto complementar** — ticket baixo, comprado junto com outros (up-sell / cross-sell)

---

## Colunas do CSV utilizadas

| Coluna | Uso |
|---|---|
| `user_id` | agrupamento por usuário |
| `valor_venda` | LTV, ticket e faturamento |
| `data_pedido` | janelas de progressão de LTV e intervalo entre compras |
| `primeiro_produto` | filtrar clientes cuja entrada foi neste grupo |
| `nome_produto` | identificar destino da 2ª compra e sub-produtos dentro do grupo |

---

## Métricas derivadas necessárias

### Visão geral do grupo

```
Funções: filter_by(users, 'grupo_entrada', [nome_grupo]) → calc_ltv_metrics(group)
```

| Métrica | O que mede |
|---|---|
| `n_clientes` | Clientes cuja 1ª compra foi neste grupo |
| `t1_medio` | Ticket médio da 1ª compra no grupo |
| `ltv_medio` | LTV médio total (todas compras) |
| `mult` | Multiplicador: `ltv / t1` |
| `upside_pct` | `(ltv - t1) / t1 × 100` — % além da 1ª compra |
| `tx_recompra` | % de clientes com ≥ 2 compras |
| `ticket_rcmp` | Ticket médio das compras de recompra |
| `fat_1a` | Faturamento gerado pelas primeiras compras |
| `fat_rcmp` | Faturamento gerado pelas recompras |

> ⚠️ **Grupos parcelados:** `tx_recompra` e `mult` são artificialmente altos — cada parcela conta como transação. Identificar se o intervalo mediano entre compras é ~30 dias (mecânico) ou >60 dias (decisão nova). Sinalizar na visualização.

> ⚠️ **Grupos de entrada/evento:** o "LTV" inclui a 1ª compra barata + conversão para outro produto. O `mult` aqui reflete ROI do funil, não fidelidade.

---

### Progressão de LTV

```
Função: ltv_progressao(group, all_txs, janelas=[30, 90, 180, 365, 9999])
```

Retorna LTV acumulado médio em cada janela de dias a partir da 1ª compra. Mostra se o grupo cresce rápido (produto-funil: cresc. brusco em 30–90d) ou lento (produto-ticket alto: crescimento tardio).

---

### Distribuição da janela de recompra

```
Função: dist_janela_recompra(group, janelas=[30, 90, 180, 365, 9999])
```

% de recompradores por janela. Para grupos parcelados, spike em ≤30d é diagnóstico da mecânica.

---

### Destinos da 2ª compra

```
Função: recompra_destinos(group, all_txs, norm_fn=norm_produto, top_n=7)
```

Para cada recomprador, produto da 2ª transação. Responde: este grupo serve de porta de entrada para quê? Ou é um produto terminal?

---

### Sub-produtos do grupo (se houver mais de 1 produto no grupo)

```
Função: group_by(group, 'slug_produto') → calc_ltv_metrics por sub-grupo
```

Se o grupo tem múltiplos produtos, tabela comparativa com as mesmas 10 métricas. Útil para priorizar produto campeão dentro do grupo.

---

## Diagnóstico de diferenças entre sub-produtos

**Quando acionar:** dois sub-produtos do mesmo grupo com diferença de `tx_recompra` ≥ 10 p.p. **ou** `ltv_medio` ≥ 25% entre si.

**Regra obrigatória:** nunca atribuir a diferença a "o produto fideliza mais" sem antes verificar os 3 confundidores abaixo. A ordem importa — eliminar cada um antes de passar ao próximo.

---

### Confundidor 1 — Safra (cohort bias)

Sub-produto mais antigo tem mais tempo disponível para recomprar. A diferença de `tx_recompra` pode ser inteiramente de maturidade, não de produto.

```python
# Comparar tx_recompra em janela fixa de 365 dias (neutraliza tempo disponível)
tx_janela_a = tx_recompra_janela(group_a, janela=365)
tx_janela_b = tx_recompra_janela(group_b, janela=365)

# Comparar distribuição de coortes entre os dois sub-produtos
dist_coorte_a = group_by(group_a, 'ano_entrada')  # % por ano de 1ª compra
dist_coorte_b = group_by(group_b, 'ano_entrada')
```

**Interpretação:** se a diferença de `tx_recompra` cai ou desaparece na janela fixa → safra explica. Se as distribuições de coorte forem similares e a diferença persiste → passar ao confundidor 2.

---

### Confundidor 2 — Perfil demográfico / psicográfico

Produtos diferentes podem atrair públicos com propensão de recompra naturalmente distinta. A diferença de fidelização seria de mercado, não de produto.

```python
# Para cada custom_field relevante mapeado no dicionário:
for field in ['renda', 'escolaridade', 'papel_cliente', 'canal_aquisicao']:
    seg_a = seg_table(group_a, key=field, min_n=30)
    seg_b = seg_table(group_b, key=field, min_n=30)
    # Comparar distribuição: se renda alta ou escolaridade superior está concentrada em A → diferença é de perfil
```

**Interpretação:** se a distribuição de renda, escolaridade ou papel for muito diferente entre os sub-produtos → a diferença de recompra pode ser de audiência. Reportar como "perfis distintos" — não como produto melhor.

---

### Confundidor 3 — Efeito de ticket

Produto mais caro cria barreira orçamentária para recompra. Diferença de `tx_recompra` correlacionada com `t1_medio` é esperada e não implica problema de produto.

```python
# Verificar se a direção da diferença é consistente com ticket
# Produto A: t1 = R$ 400, tx_rcmp = 38%
# Produto B: t1 = R$ 1.800, tx_rcmp = 19%
# → ticket 4,5× maior, tx_rcmp 2× menor: efeito de ticket plausível

# Calcular: tx_recompra × t1_medio para cada sub-produto
# Se o "valor esperado de recompra" for similar → diferença é de ticket, não de fidelização
```

**Interpretação:** se a razão de tickets for comparável à razão inversa das taxas de recompra → o produto de maior ticket não fideliza menos, só fideliza diferente (em valor, não em frequência). Focar em `ltv_medio` como métrica final.

---

### Tabela de conclusão diagnóstica

| Resultado | Interpretação correta |
|---|---|
| Diferença desaparece na janela fixa | Confundidor de safra — reportar como "produtos em fases distintas de maturidade" |
| Distribuição de coortes similar, diferença persiste | Safra não explica — investigar perfil |
| Perfil demográfico diferente entre sub-produtos | Diferença é de audiência — reportar como "públicos distintos" |
| Ticket mais alto → tx_rcmp proporcionalmente menor | Efeito de ticket — reportar `ltv_medio`, não frequência |
| Nenhum confundidor explica | Diferença intrínseca de produto — investigar mecanismo de recompra (onboarding, proposta de valor, frequência de uso) |

---

## Perguntas-guia

1. Qual é o multiplicador de LTV deste grupo? É explicado por ticket de recompra ou por volume de recompras?
2. O crescimento de LTV é concentrado nos primeiros 90 dias ou continua crescendo depois de 1 ano?
3. Para onde vão os clientes deste grupo na 2ª compra? Há cross-sell claro para outro grupo?
4. O grupo funciona como funil de entrada (LTV principal vem depois) ou como produto terminal (maioria não recompra)?
5. Se o grupo for parcelado: a taxa de recompra é real ou mecânica (intervalo ≤30d)?
6. Se o grupo for de entrada/evento: qual % converte para produto de maior ticket? Em quantos dias?
7. O `upside_pct` é significativo? O que o explica — frequência ou ticket?
8. **[Se houver ≥ 2 sub-produtos com diferença ≥ 10 p.p. em tx_recompra]** A diferença é de safra, de perfil, de ticket — ou intrínseca ao produto?

---

## Estrutura visual

### Cabeçalho da seção

```html
<div class="slide-hd">
  <span class="badge badge-g">ANÁLISE POR PRODUTO</span>
  <h1 class="slide-title">Grupo <em>[Nome do grupo]</em>: comportamento de compra</h1>
</div>
```

### KPIs de destaque (`.mr`, até 5)

| KPI | Cor sugerida |
|---|---|
| N clientes (entrada neste grupo) | neutro |
| LTV médio | `.c-p` ou `.c-g` |
| Multiplicador (`mult`) | `.c-g` se alto, `.c-a` se baixo |
| Taxa de recompra ⚠️ se parcelado | `.c-a` |
| Upside `%` | `.c-g` |

### Visualizações

| ID sugerido | Tipo | O que mostra |
|---|---|---|
| `chart-sXX-[grupo]-ltv` | `area` | Progressão de LTV por janela de dias |
| `chart-sXX-[grupo]-janela` | `bar` | Distribuição de recompras por janela (identifica mecânica parcelada) |
| `chart-sXX-[grupo]-destinos` | `bar-horizontal` | Top destinos de 2ª compra (% da base total do grupo) |

> Se o grupo tem sub-produtos relevantes: adicionar `chart-sXX-[grupo]-sub` (`bar-horizontal`) com LTV por sub-produto.

> Para grupos de entrada/evento: substituir `chart-janela` por `chart-funil` mostrando % que converte para produtos core.

### Insights (`find-block`) — 2–3 blocos

1. **Dinâmica principal** (`find-tag-p`): o que caracteriza este grupo — é funil? é fidelizador? é receita contratada?
2. **Cross-sell** (`find-tag-g`): principal destino de 2ª compra — "X% vai para [outro grupo]"
3. **Alerta ou oportunidade** (`find-tag-a`): se parcelado, alertar sobre métrica artificial; se evento, destacar taxa de conversão ou timing

### Detalhamento (modal)

Tabela com 10 métricas por sub-produto (se o grupo tiver mais de 1 produto) ou por janela temporal.

---

## Notas de comportamento por tipo de grupo

| Tipo de grupo | Sinal típico | Cuidados de interpretação |
|---|---|---|
| Core / capacitação | `mult` 1.5–3×, `tx_recompra` 20–45%, crescimento em 90d–1a | Comparar safras — LTV cresce com tempo de base |
| Entrada / evento | `t1` baixo, `mult` 3–8×, crescimento brusco em ≤90d | Mult alto não é fidelidade — é funil. Medir taxa de conversão, não recompra |
| Parcelado / contrato | `mult` = n_parcelas, `tx_recompra` artificial, spike ≤30d | Nunca comparar `tx_recompra` com outros grupos. Medir contrato médio (ltv) e abandono |
| Complementar / up-sell | `t1` baixo, alta `tx_recompra` real | Pode distorcer LTV médio do portfólio se tiver muito volume |

---

## Nota sobre order de seções no relatório

Para cada grupo identificado em S05:
1. Primeiro slide: visão geral do grupo (este template)
2. Segundo slide (opcional, se grupo complexo): detalhe por sub-produto — usar `group_by(group, 'slug_produto')` e exibir um card por produto com progressão LTV + destinos de 2ª compra

Se o portfólio tiver 3 grupos e 2 deles forem complexos, o relatório terá ~5 slides de produto. Se todos forem simples, 3 slides. Ajustar conforme o negócio.
