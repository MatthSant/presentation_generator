# S05 — Segmentação por Grupo de Produto

**Página:** Análise por Produto  
**Tipo:** Por Produto — Taxonomia e concentração  
**Posição:** Primeira da página de produtos — **define a taxonomia que estrutura toda a Página 2**

---

## Objetivo

Observar o portfólio de produtos e propor uma taxonomia de grupos com base nos dados — não em categorias pré-definidas. Cada negócio tem uma composição diferente: alguns têm produtos de entrada barata, outros têm produtos parcelados, outros têm apenas um tipo de produto com variações de ticket. O objetivo é descobrir os grupos que existem nos dados e nomear cada um de forma que faça sentido para o negócio.

A taxonomia definida aqui é usada em S06, S07, S08 e em todas as seções de detalhe por grupo (a partir de S08+).

---

## Colunas do CSV utilizadas

| Coluna | Uso |
|---|---|
| `user_id` | agrupamento por usuário |
| `valor_venda` | faturamento e ticket por produto |
| `nome_produto` | identificar produtos únicos no portfólio |
| `primeiro_produto` | identificar produto de entrada de cada usuário |
| `data_pedido` | calcular intervalo entre compras (identifica mecânica parcelada) |

---

## Como descobrir os grupos

### Passo 1 — Mapear todos os produtos únicos

```
Função: group_by(users, 'slug_produto', min_n=0) → calc_ltv_metrics por produto
```

Gerar uma tabela com todos os produtos que aparecem como 1ª compra, com pelo menos:
- `n_clientes` — quantos usuários entraram por este produto
- `t1_medio` — ticket médio de entrada
- `tx_recompra` — % com ≥ 2 compras
- `ltv_medio` — LTV total médio
- `fat_total` — faturamento total gerado por clientes que entraram neste produto
- `mediana_intervalo` (de `dist_janela_recompra`) — mediana de dias entre transações

### Passo 2 — Observar padrões nos dados

Com a tabela do Passo 1, identificar clusters naturais:

| Sinal | Comportamento típico | Possível grupo |
|---|---|---|
| `t1` baixo (< R$ 100) + `mult` alto (> 3×) + recompra concentrada em ≤ 90d | Produto de entrada / funil / evento | Entrada, Pitch, Evento |
| `t1` médio-alto + `tx_recompra` 20–50% + crescimento de LTV em meses | Produto de capacitação recorrente | Core, Formação, Especialização |
| `mediana_intervalo` ≤ 35d + `tx_recompra` muito alta (> 70%) | Pagamentos parcelados registrados como transações | Parcelado, Contrato, Assinatura |
| `t1` alto + `tx_recompra` < 10% + LTV ≈ T1 | Produto premium de compra única | Premium, Consultoria, Intensivo |
| `n` pequeno + `t1` baixo + comprado junto com outros produtos | Up-sell ou complemento | Complementar, Add-on |

> **Não force os grupos.** Se o portfólio tem apenas 2 padrões claros, crie 2 grupos. Se tem 4, crie 4. Grupos com menos de 100 clientes de entrada podem ser agrupados em "Outros" se não tiverem comportamento distinto.

### Passo 3 — Nomear os grupos

Use nomes que façam sentido para o negócio analisado. Exemplos:
- "Core" / "Capacitação" / "Formação"
- "Entrada" / "Evento" / "Pitch" / "Trial"
- "Parcelado" / "Pós-grad" / "Contrato" / "Assinatura"
- "Premium" / "Intensivo" / "VIP"

Documenta a taxonomia criada antes de prosseguir — ela será usada em todas as seções seguintes.

### Passo 4 — Criar `norm_produto()` e `norm_grupo()`

Definir a função de normalização que mapeia `nome_produto` (texto livre do CSV) → `slug_produto` → `grupo`. Atualizar `ltv_calc.py` com essas funções específicas do negócio.

---

## Métricas derivadas necessárias

Após definir os grupos:

```
Para cada grupo: filter_by(users, 'grupo_entrada', [grupo]) → calc_ltv_metrics(group)
```

| Métrica por grupo | O que mede |
|---|---|
| `n_clientes` | Clientes cuja 1ª compra foi neste grupo |
| `fat_total` | Faturamento total gerado por esses clientes |
| `fat_1a` | Faturamento de primeiras compras |
| `fat_rcmp` | Faturamento de recompras |
| `ltv_medio` | LTV médio |
| `t1_medio` | Ticket médio de entrada |
| `tx_recompra` | % que recomprou |

Concentração de receita por produto individual (top 10 por faturamento total):
```
Função: group_by(users, 'slug_produto', min_n=10) → calc_ltv_metrics → ordenar por fat_total
```

---

## Perguntas-guia

1. Quantos grupos distintos existem no portfólio? Qual é a lógica que os separa (ticket, recompra, intervalo)?
2. Qual grupo concentra mais faturamento? Qual tem mais clientes?
3. Há produtos com comportamento de parcelamento (intervalo mediano ≤ 35d, `tx_recompra` > 70%)? Quantos clientes?
4. Há produtos de entrada barata que têm `mult` muito alto — indicando que os clientes migram para produtos mais caros?
5. Os 3 produtos com maior faturamento individual representam qual % do faturamento total? O portfólio é concentrado?
6. Há produtos com n < 50 que deveriam ser agrupados em "Outros"? Ou têm comportamento distinto suficiente para grupo próprio?

---

## Estrutura visual

### KPIs de destaque (`.mr`, até 5)

| KPI | Cor sugerida |
|---|---|
| N total de clientes na base | neutro |
| N de grupos identificados | neutro |
| Faturamento do grupo principal | `.c-p` |
| % do faturamento no grupo principal | `.c-p` |
| N de produtos únicos no portfólio | neutro |

### Visualizações

| ID sugerido | Tipo | O que mostra |
|---|---|---|
| `chart-s5-grupos-fat` | `donut` ou `bar` horizontal | Concentração de faturamento por grupo |
| `chart-s5-grupos-comp` | `bar` agrupado horizontal | LTV médio vs ticket T1 por grupo — mostra multiplicador visual |
| `chart-s5-top-produtos` | `bar` horizontal | Top 8–10 produtos por faturamento total (% da receita) |

### Insights (`find-block`) — 2–3 blocos

1. **Concentração** (`find-tag-p`): grupo principal — % de receita e quantos produtos o compõem
2. **Dinâmica de grupos** (`find-tag-g`): o que diferencia os grupos — um é funil? outro é receita contratada?
3. **Risco ou oportunidade** (`find-tag-a`): portfólio muito concentrado em 1–2 produtos? ou grupo de entrada com alto multiplicador que aponta para cross-sell?

---

## Notas de qualidade

- **Taxonomia é decisão analítica**, não automática — verificar com o cliente se os grupos fazem sentido para o negócio antes de prosseguir
- Produtos com `n_clientes < 30` como produto de entrada: provavelmente insuficientes para grupo próprio — agrupar em "Outros" ou descrever em nota
- `norm_produto()` deve ser robusta a variações de grafia no CSV — testar com `group_by(users, 'nome_produto', min_n=0)` e listar todos os valores únicos antes de escrever as regras
- O `mult` do grupo de entrada/evento pode parecer muito alto porque o ticket inicial é baixo — não interpretar como fidelização, mas como sinal de funil
- Grupos parcelados: verificar `mediana_intervalo` antes de classificar — se ~30d, confirmar com o cliente que são parcelas
- Documentar a taxonomia final em `temp/[analise]/dicionario.md` ou em `temp/[analise]/grupos.md` para referência nas seções seguintes
