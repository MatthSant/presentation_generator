# Mapa de Seções — Skill de Análise de LTV

Guia de referência para construir relatórios de LTV a partir de dados transacionais. A estrutura de seções adapta-se ao portfólio de produtos e ao conjunto de campos de pesquisa de cada negócio.

---

## Fonte de dados

**Arquivo:** `input/dados_ltv.csv`  
**Formato:** uma linha por transação (não por usuário)  
**Schema completo:** ver `analyze-ltv/dictionary.md`

### Colunas principais

Campos padrão presentes em qualquer análise:

| Coluna | Tipo | Descrição |
|---|---|---|
| `user_id` | string | Identificador único do cliente |
| `valor_venda` | float | Valor da transação (vírgula como decimal) |
| `data_pedido` | datetime | Data do pedido (`YYYY-MM-DD` ou `DD/MM/YYYY`) |
| `nome_produto` | string | Nome completo do produto desta transação |
| `primeiro_produto` | string | Nome do primeiro produto comprado por este usuário |
| `genero`, `escolaridade`, `renda_mensal`, `idade` | string | Campos de perfil padrão — podem estar vazios |
| `custom_field_N` | string | Campos de pesquisa variáveis — ver `temp/[analise]/dicionario.md` |

> **Campos customizados:** cada análise tem seus próprios `custom_field_N`. Antes de iniciar, criar `temp/[analise]/dicionario.md` a partir do template em `analyze-ltv/dictionary.md` e preencher o mapeamento de cada campo com o usuário.

---

## Campos derivados por usuário

Antes de calcular qualquer seção, consolidar uma lista de usuários únicos.  
**Função:** `build_users()` em `ltv_calc.py`

| Campo | Fórmula |
|---|---|
| `ltv` | `sum(valor_venda)` de todas as transações do usuário |
| `t1` | `valor_venda` da transação mais antiga |
| `n_tx` | número de transações |
| `recompra` | `n_tx > 1` |
| `ticket_rcmp` | `mean(valor_venda)` das transações 2ª em diante (`None` se sem recompra) |
| `safra` | `year(data_pedido)` da primeira transação |
| `data_t1` | data da primeira transação |
| `data_t2` | data da segunda transação (`None` se sem recompra) |
| `dias_ate_2a` | `(data_t2 - data_t1).days` (`None` se sem recompra) |
| `slug_produto` | produto normalizado da primeira compra — `norm_produto()` definido por análise |
| `grupo_entrada` | grupo de produto — definido pela taxonomia de S05, por análise |
| `[custom_field_N]` | valor do campo no registro de perfil canônico do usuário |

---

## Funções do `ltv_calc.py`

Módulo Python reutilizável com todas as funções de cálculo. Nenhum código de análise deve ser escrito fora dele — as seções apenas referenciam as funções por nome.

| Função | O que faz |
|---|---|
| `load_csv(path)` | Lê o CSV e retorna lista de dicts |
| `build_users(rows, ...)` | Consolida transações em nível de usuário |
| `safe_float(v)` | Converte string para float (trata vírgula) |
| `parse_date(v)` | Converte string para datetime (múltiplos formatos) |
| `filter_by(users, key, values)` | Filtra lista de usuários por campo e lista de valores |
| `group_by(users, key, min_n)` | Agrupa usuários por campo; exclui grupos com n < min_n |
| `calc_ltv_metrics(group)` | Retorna dict com 10 métricas padrão para um grupo |
| `seg_table(users, key, min_n, norm_fn)` | Tabela de segmentação: executa group_by + calc_ltv_metrics |
| `ltv_progressao(users, all_txs, janelas)` | LTV acumulado médio por janela de dias |
| `dist_janela_recompra(users, janelas)` | Distribuição de recompradores por janela |
| `mediana_retorno(users)` | Mediana de dias até a 2ª compra |
| `recompra_destinos(users, all_txs, norm_fn, top_n)` | Top destinos de 2ª compra |
| `ltv_por_safra(users, all_txs, janelas)` | LTV por coorte de entrada (safra) |
| `faturamento_anual(rows, ...)` | Faturamento total e de 1ªs compras por ano |
| `fmt_brl(v)` | Formata float como `R$ X.XXX` |
| `fmt_pct(v, decimals)` | Formata float como `X,X%` |

---

## Estrutura do relatório

A estrutura tem 3 páginas. As páginas 2 e 3 têm número variável de seções conforme o negócio.

---

### Página 1 — Visão Geral
*Responde: Como é a base? Qual o volume e saúde geral do LTV?*

Seções fixas — presentes em toda análise.

| # | Seção | Arquivo |
|---|---|---|
| S01 | Perfil da Base de Clientes | `sections/S01-perfil-base.md` |
| S02 | Faturamento e Ticket (evolução anual) | `sections/S02-faturamento-ticket.md` |
| S03 | LTV e Recompra por Safra de Entrada | `sections/S03-ltv-safra.md` |
| S04 | Progressão de LTV por Janela Temporal | `sections/S04-progressao-ltv.md` |

---

### Página 2 — Análise por Produto
*Responde: Qual grupo de produto gera mais valor? Como cada grupo se comporta?*

**S05 é obrigatória e define o restante da página.**  
S06–S07 são fixas. A partir de S08, criar uma seção por grupo identificado em S05.

| # | Seção | Arquivo |
|---|---|---|
| S05 | Segmentação por Grupo de Produto (taxonomia) | `sections/S05-segmentacao-produto.md` |
| S06 | LTV e Faturamento por Produto de Entrada | `sections/S06-ltv-por-produto.md` |
| S07 | Tempo até a Recompra | `sections/S07-tempo-recompra.md` |
| S08 | Visão Geral de Recompra por Grupo | `sections/S08-recompra-por-grupo.md` |
| S08+ | **Uma seção por grupo de produto** | Instanciar `sections/PRODUTO_GRUPO_TEMPLATE.md` |

> **Como determinar os grupos:** S05 propõe a taxonomia com base em faixa de ticket + taxa de recompra + padrão de intervalo entre compras. Para cada grupo com n ≥ 100 clientes, criar uma seção de detalhe seguindo `PRODUTO_GRUPO_TEMPLATE.md`.

> **Grupos típicos (não padrão):** produto core de alta capacitação, produto de entrada/evento, produto parcelado/contrato. Cada negócio pode ter combinações diferentes — a taxonomia emerge da análise de dados.

---

### Página 3 — Análise de Perfil
*Responde: Qual perfil de cliente gera mais LTV? Quais segmentos priorizar?*

**Número de seções variável** — depende de quais campos (`genero`, `escolaridade`, `renda_mensal`, `idade`, `custom_field_N`) têm cobertura e granularidade suficiente.

| # | Seção | Como determinar |
|---|---|---|
| Sxx–Syy | **Uma seção por dimensão qualificada** | Ver critérios em `sections/PERFIL_TEMPLATE.md` |

**Critérios para incluir uma dimensão de perfil:**
- Cobertura ≥ 30% dos clientes responderam
- ≥ 2 segmentos com n ≥ 50 após normalização
- Variância de LTV ≥ 10% entre maior e menor segmento

> **Campos de perfil padrão a verificar primeiro:** `genero`, `escolaridade`, `renda_mensal`, `idade`  
> **Campos customizados:** verificar todos os `custom_field_N` mapeados no `temp/[analise]/dicionario.md`  
> **Ordem sugerida:** ordenar por relevância estratégica (variância de LTV × cobertura). Geralmente 3–6 seções.

---

## Tipos de seção

| Tipo | Seções | Template / Arquivo de referência |
|---|---|---|
| **Visão Geral** | S01–S04 | Arquivo próprio em `sections/` |
| **Estrutura de Produto** | S05–S07 | Arquivo próprio em `sections/` |
| **Visão de Recompra por Grupo** | S08 | `sections/S08-recompra-por-grupo.md` |
| **Detalhe de Grupo** | S08+ (1 por grupo) | `sections/PRODUTO_GRUPO_TEMPLATE.md` |
| **Perfil** | Sxx+ (1 por dimensão qualificada) | `sections/PERFIL_TEMPLATE.md` |

---

## Limites de amostra

| Contexto | n mínimo para exibir segmento | Marcação se n entre mínimo e 100 |
|---|---|---|
| Grupos de produto (Página 2) | 100 | — (segmentos menores descritos em nota) |
| Dimensões de perfil (Página 3) | 50 | `†` se n < 100 |
| Sub-segmentos dentro de grupo | 30 | `†` se n < 100 |

Segmentos abaixo do n mínimo: excluir dos gráficos. Podem aparecer na tabela de detalhamento modal com nota explicativa.

---

## Fluxo de setup por análise

```
1. Colocar CSV em input/dados_ltv.csv
2. Criar temp/[analise]/dicionario.md a partir do template em analyze-ltv/dictionary.md
3. Preencher com o usuário o significado de cada custom_field_N presente no CSV
4. Rodar ltv_calc.py → build_users() para gerar a lista de usuários
5. Análise exploratória de custom_fields → decidir quais viram seções de perfil
6. Construir S05 → definir taxonomia de grupos de produto
7. Construir seções S01–S08 (fixas) + S08+ (por grupo) + Sxx+ (por perfil)
```
