# O documento: análise livre no design system dos templates

Uma análise livre é um **relatório inteiro**, com a cara do debriefing e do acompanhamento —
não uma seção solta. Abra `exemplo/relatorio.html` (o exemplo desta análise) e
`exemplos/debriefing.html` / `exemplos/acompanhamento-diario.html` (os templates) antes de compor:
é assim que tem de ficar. O que muda numa análise livre é só o cálculo, que **você** escreve.

## Os dois scripts
| Script | O que faz | Copie de |
|---|---|---|
| `calc_livre.py` | lê o CSV agregado (sem dado pessoal) e devolve as **tabelas** com os números: `{"q-canal": {"dims": ["canal"], "rows": [{"canal": "facebook", "leads": 1704, "cpl": 8.88}]}}`. Colunas numéricas cruas; linha "Geral" por soma; taxas e custos ponderados. | `python/exemplo/calc_livre.py` |
| `build.py` | compõe o relatório com `relatorio.py` e grava `saida/` (4 camadas + `relatorio.html`). | `python/exemplo/build.py` |

```
python python/minha-analise/build.py --csv dump.csv --out saida/
```

## O esqueleto (o do debriefing)
1. **Panorama** — `eyebrow ATINGIMENTO` → `banda` (realizado / meta) · `eyebrow INDICADORES GLOBAIS` → 4 `kpi` (faturamento, investimento, ROAS, conversão) · `eyebrow VOLUME` → 8 `kpi` (leads, CPL, resposta, qualificação, CPMQL, CTR, CPM, vendas) · `comparativo` realizado × meta · `evolucao` (métricas no tempo).
2. **A página da pergunta** — `destaque` com a resposta em uma frase · `eyebrow` → 2 `grafico` lado a lado + `tabela` · outro recorte (temperatura, período) · `eyebrow O QUE ISSO DIZ` → 3 `achado` (Resposta / Cuidado / Contexto).
3. **One Pager** — 4 `kpi` · `funil` (2 compactos + `barras`) · 2 `achado` largos (o que puxou / o que segurou) · 3 `acao` em FCA-R.

Uma página só é aceitável quando a pergunta cabe numa tela; ainda assim, Panorama em cima e
achados embaixo. O viewer só mostra a sidebar com duas ou mais páginas.

## Os builders (`relatorio.py`)
| Chamada | Vira | Grade |
|---|---|---|
| `R.tabela(nome, dims, rows)` | tabela do dataset (os números) | — |
| `R.pagina(id, label).secao(id, badge, title, sub)` | página / zona com a própria grade | — |
| `s.eyebrow(title, caption)` | separador de zona | 12×1 |
| `s.kpi(label, valor, fmt, sub, icon, color, meta, hist, invert, emph, info)` | card `feature`; com `meta` ganha o rodapé "Meta X · ±% ✓" | 3×2 (`w=2` para seis por linha) |
| `s.banda(label, real, meta, fmt)` | card de atingimento "X / meta" + pill % | 6×2 |
| `s.comparativo([{label, real, meta, fmt, invert}])` | barras realizado × meta | 12×(n+1) |
| `s.grafico(tipo, title, dataset, x, y, series, fmt, largo)` | ApexCharts por `bind` (`bar`, `line`, `area`, `donut`, `bar-horizontal`, `stacked`) | 6×4 (`largo` 12×6) |
| `s.tabela(title, dataset, cols, sub)` | tabela por `bind` | 12×h |
| `s.evolucao(title, dataset, x, [(col, rótulo, fmt)], current, current2)` | seletor de métrica no tempo (barras + linha) | 12×6 |
| `s.funil(title, [(etapa, valor)], bench, compact)` | funil com passagem, perda e maior furo | 4×5 compacto / 6×8 |
| `s.barras(title, [(rótulo, valor)])` | lista de barras | 6×h |
| `s.destaque(text)` / `s.nota(text)` | callout da resposta / nota | 12×1 |
| `s.achado(tag, tom, title, detail)` | achado em card (tom `ok`, `warn`, `bad`, `n`) | 4×3 (`w=6, h=4` largo) |
| `s.acao(n, title, porque, acionavel)` | ação numerada | 4×3 |
| `R.gravar(saida)` | valida e grava | — |

`fmt`: `money` (R$ 7,97 · R$ 23k, abrevia) · `brl` (R$ 2.350,00, exato — custo unitário em gráfico) · `pct` (53.6%) · `x` (3.52×) · `int` (2.832) · `num`.
`invert=True` quando menor é melhor (CPL, CPM, CPMQL, CAC). Ícones: `coin`, `database`, `bolt`,
`circle-check`, `trending-up`, `arrow-back-up`. Cores: `#3B6D11` verde · `#534AB7` roxo ·
`#EF9F27` âmbar · `#185FA5` azul · `#A32D2D` vermelho.

## Filtro, valores vivos e acabamento (feedback de uso)
| Chamada | O que faz |
|---|---|
| `R.filtro(id, label, opcoes=None, todos='Todos')` | declara o filtro do FAB; as tabelas que respondem declaram `R.tabela(..., filters=[id])`. O `gravar()` confere opções × valores reais em cada tabela e **falha na divergência** (rótulo diferente esvaziava gráfico em silêncio) |
| `s.seletor(id, label)` | o mesmo filtro como toggle inline na seção; "todos" volta ao início |
| `s.kpi(..., bind={'dataset','ratio': (num, den) \| 'metric', 'mult', 'exclude': {'canal': 'Geral'}})` | card **vivo**: recalcula valor e rodapé de meta nas linhas filtradas (razão de somas, nunca soma de linhas) |
| `s.destaque(text, bind=..., vars={'cpl': {'ratio': (...), 'fmt': 'money'}})` | `{cpl}` no texto vira o valor filtrado |
| `s.kpi(..., formato='exato')` | R$ 2.350,00 em vez de R$ 2k |
| `s.tabela(..., colunas={...}, escala={'cpl': (alvo, True)}, ordem='desc')` | cabeçalho rotulado; fundo em 5 degraus contra o alvo (True = menor é melhor); mais recente/maior primeiro. Célula pode ser `{"value": 7.5, "cls": "hmd-pos1", "title": "…"}` nas linhas do dataset |
| `s.grafico(..., curva='reta'\|'suave', eixo_x=, eixo_y=, rotulos=, comparar=True)` | curva (reta a partir de 50 pontos por padrão); nomes de eixo; rótulo branco dentro da barra (padrão em barras); `y=[a, b]` + `comparar` = barra + linha em eixos separados |
| `s.funil(..., transicao={0: 'msgs por R$', -1: 'R$ por comprador'})` | transição em razão nas pontas (custo → volume → receita) |
| `s.achado/nota/acao/destaque(..., autoria='consultor')` | texto humano: números declarados, sem exigir tabela |
| `Relatorio(..., chrome={'marca': False, 'atalho': False, 'trocar': False, 'busca': False, 'sidebar': 'fechada'})` | o que esconder na sidebar do HTML entregue |
| `R.css_extra(css)` / `R.js_extra(js)` | ponto de extensão: injetados no HTML e guardados no `data.json` (sobrevivem ao `aprofundar.py`) |

**Página × seção.** `R.pagina(id, label)` cria uma página (entrada no menu); `p.secao(id, badge, title)` cria uma seção dentro dela (aba/zona com a própria grade). Blocos (kpi, gráfico, achado…) vão **dentro** da seção — nunca crie uma página para um bloco.

## O que o builder recusa
- Valor de card como **texto** (`'R$ 7,00'`): o número entra como número e ele formata.
- `bind` para tabela ou coluna que não existe.
- Prosa (`sub`, `destaque`, `achado`, `nota`, `acao`) com número que não está numa tabela nem num card.
- Widget fora do catálogo (`design-system.md`).

## Caminho alternativo: pasta `relatorio/` em JSON
`python python/montar.py --relatorio relatorio/ --out saida/` aceita `meta.json`, `dataset.json`,
`sNN.json` (seções no contrato dos widgets), `paginas.json` e `layout.json`. Serve quando o
consultor edita as seções à mão; para compor do zero, prefira o `build.py`.

## Depois de gerado
`saida/relatorio.html` abre offline. Aprofundamentos: `aprofundar.py` (mesmo fluxo dos templates).
Vale repetir? `salvar_template` com `calc_livre.py`, `build.py`, as queries e as regras.
