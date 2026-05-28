# Template — Análise de Dimensão de Perfil

**Uso:** instanciar uma vez para cada `custom_field` que passar nos critérios de cobertura.  
**Quantas seções?** Variável por análise — depende de quais campos foram respondidos na pesquisa.  
**Nomenclatura dos arquivos:** `SXX-[slug-da-dimensao].md`

---

## Critério para criar uma seção de perfil

Antes de criar uma seção para um `custom_field`, verificar:

| Critério | Mínimo | Por quê |
|---|---|---|
| **Cobertura** | ≥ 30% dos clientes responderam | Abaixo disso, o campo não é representativo da base |
| **N por segmento** (após normalização) | ≥ 50 clientes no menor segmento significativo | Segmentos com n < 50 têm variância alta demais |
| **Granularidade** | 2–8 categorias após normalização | Menos de 2 = trivial; mais de 8 = difícil de visualizar |
| **Variância de LTV** | Diferença de ≥ 10% entre maior e menor LTV por segmento | Sem variância, a dimensão não é analiticamente relevante |

Campos que não atingem esses critérios devem ser listados em `temp/[analise]/dicionario.md` como "Campos ignorados".

---

## Como descobrir os valores de um custom_field

```
Função: seg_table(users, key='custom_field_N', min_n=50, norm_fn=norm_[campo])
```

Antes de rodar `seg_table`, fazer análise exploratória:
1. `group_by(users, 'custom_field_N', min_n=0)` — ver todos os valores únicos e frequências
2. Definir `norm_fn` que agrupa valores similares em categorias (ex: variações de grafia, respostas abertas)
3. Confirmar que ≥ 2 categorias passam no threshold de n ≥ 50
4. Consultar `temp/[analise]/dicionario.md` para entender o que o campo pergunta

---

## Colunas do CSV utilizadas

| Coluna | Uso |
|---|---|
| `user_id` | agrupamento por usuário |
| `valor_venda` | LTV e ticket |
| `custom_field_N` | dimensão de perfil analisada |

> Substituir `N` pelo número do campo real conforme `temp/[analise]/dicionario.md`.

---

## Métricas derivadas necessárias

```
Função principal: seg_table(users, key='custom_field_N', min_n=50, norm_fn=norm_fn)
```

Retorna tabela com uma linha por segmento e 10 colunas padrão:

| Coluna | Descrição |
|---|---|
| `segmento` | Valor normalizado da categoria |
| `n` | N de clientes no segmento |
| `ltv_medio` | LTV médio do segmento |
| `mult` | Multiplicador LTV/T1 |
| `upside_pct` | `(ltv - t1) / t1 × 100` |
| `tx_recompra` | % com ≥ 2 compras |
| `ticket_rcmp` | Ticket médio das recompras |
| `fat_1a` | Faturamento de primeiras compras |
| `fat_rcmp` | Faturamento de recompras |
| `fat_total` | Faturamento total do segmento |

Adicional relevante conforme a dimensão:
- **Dimensões demográficas** (gênero, faixa etária): verificar se há viés de safra (segmentos mais novos na base têm LTV menor por construção)
- **Dimensões profissionais** (cargo, área, formação): calcular `razao_ltv = ltv_seg_maior / ltv_seg_menor` — diferença estrutural
- **Dimensões de comportamento** (tempo de acompanhamento, canal): cruzar com `tx_recompra` e `mult` para entender se o segmento compra mais ou paga mais

---

## Perguntas-guia

As perguntas variam conforme o tipo da dimensão. Usar como ponto de partida:

**Volume vs. valor:**
1. Qual segmento tem mais clientes? É o mesmo que tem maior LTV?
2. A diferença de LTV entre segmentos é explicada pelo ticket da 1ª compra, pela taxa de recompra, ou pelos dois?
3. Qual segmento contribui mais para o faturamento total (não apenas LTV médio)?

**Comportamento de compra:**
4. O segmento de maior LTV recompra mais vezes ou paga mais por recompra?
5. Há segmento com alta taxa de recompra mas ticket baixo (volume vs. ticket)?
6. Qual segmento tem o maior `upside_pct` — eles respondem melhor ao portfólio?

**Estratégia:**
7. O segmento de maior LTV tem volume suficiente para ser foco estratégico?
8. Há segmento com LTV alto mas n pequeno — por quê? Restrição de canal ou de portfólio?
9. Como a comunicação ou oferta deveria ser diferenciada para os 2 principais segmentos?

---

## Estrutura visual

### Cabeçalho da seção

```html
<div class="slide-hd">
  <span class="badge badge-p">ANÁLISE DE PERFIL</span>
  <h1 class="slide-title"><em>[Nome da Dimensão]</em>: impacto no LTV do cliente</h1>
</div>
```

### KPIs de destaque (`.mr`, até 5)

| KPI | Cor sugerida |
|---|---|
| N respondentes (com campo preenchido) | neutro |
| Segmento de maior volume (nome + n) | neutro |
| LTV do segmento de maior LTV | `.c-p` |
| LTV do segmento de referência (mais comum) | neutro |
| Diferença entre maior e menor LTV (`+X%`) | `.c-g` |

> Se a dimensão tiver um segmento "âncora" natural (ex: o mais comum), usar esse como referência de comparação nos KPIs.

### Visualizações

| ID sugerido | Tipo | O que mostra |
|---|---|---|
| `chart-sXX-[dim]-ltv` | `bar-horizontal` | LTV médio por segmento, ordenado do maior para o menor |
| `chart-sXX-[dim]-dist` | `bar` empilhado | % de clientes vs % de faturamento por segmento — revela volume vs. valor |

> **Marcação de n pequeno:** segmentos com n < 100 marcados com `†` no gráfico ou excluídos se n < 50.

> **Ordenação:** sempre ordenar barras por LTV decrescente (não por volume) para destacar o padrão de valor.

### Insights (`find-block`) — 2–3 blocos

Estrutura sugerida:

1. **Segmento líder por LTV** (`find-tag-p`): quem tem maior LTV e por quê — ticket alto, mais recompras, ou ambos?
2. **Volume vs. qualidade** (`find-tag-g`): o segmento maior (por n) tem LTV proporcional ao seu volume? Se não, qual é a implicação estratégica?
3. **Outlier ou oportunidade** (`find-tag-a`): segmento pequeno com LTV alto (escalar?), ou segmento grande com LTV surpreendentemente baixo (problema de portfólio?)

### Detalhamento (modal)

Tabela completa com todos os segmentos e as 10 colunas padrão. Segmentos com n < 100 marcados com †.

---

## Notas de qualidade

- **Autodeclarado vs. objetivo:** campos de pesquisa são autodeclarados — há viés de resposta (quem responde pode ser diferente de quem não responde)
- **Cobertura variável:** um campo pode ter 80% de cobertura em um negócio e 20% em outro — verificar sempre antes de criar a seção
- **Correlação entre dimensões:** não interpretar uma dimensão de forma isolada se ela está correlacionada com outra (ex: renda e escolaridade, cargo e área — sempre verificar se a diferença de LTV vem da dimensão ou de uma correlação oculta)
- **Segmentos com n < 50:** excluir completamente da análise — muito susceptíveis a viés. Listar na tabela modal com nota, não no gráfico principal
- **Segmentos com n entre 50–100:** incluir mas marcar com `†` — interpretar com cautela, especialmente se o LTV for muito diferente da média
- **Normalização crítica:** respostas abertas precisam de `norm_fn` bem definida antes de agrupar — validar os valores únicos do campo antes de rodar `seg_table`
- **Viés de safra:** segmentos que cresceram mais recentemente na base (foram adquiridos mais tarde) têm LTV menor por construção — não é qualidade do segmento, é tempo de relacionamento. Checar `data_primeira_compra` mediana por segmento para identificar esse viés

---

## Decidindo o número de seções de perfil

Após análise exploratória de todos os `custom_fields` do `dicionario.md`:

1. Listar todos os campos com cobertura ≥ 30%
2. Para cada um, rodar `seg_table(min_n=0)` e verificar granularidade e variância de LTV
3. Ordenar por relevância estratégica (variância de LTV × cobertura)
4. Criar seções para os **top N campos mais relevantes** — geralmente 3–6 seções
5. Campos restantes: listar em `temp/[analise]/dicionario.md` como "ignorados" com justificativa

Não há um número fixo de seções — é uma decisão analítica por negócio.
