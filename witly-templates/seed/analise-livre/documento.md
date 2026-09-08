# O documento: análise livre (a pasta `relatorio/`)

O `montar.py` transforma a pasta `relatorio/` nas 4 camadas do app (dataset, data, layout, seções) e no `relatorio.html` offline, com o mesmo viewer dos templates.

## Arquivos
| Arquivo | O que é |
|---|---|
| `meta.json` | `client` (slug), `client_name`, `title`, `pergunta`, `decisao` |
| `dataset.json` | as tabelas com os **números**: `{"nome": {"dims": ["canal"], "filters": [], "rows": [{"canal": "facebook", "leads": 120, "cpl": 7.5}]}}`. Saída do seu `calc_livre.py`. Valores numéricos crus (o viewer formata). |
| `sNN.json` | uma seção por arquivo: `{"id": "s01", "header": {"badge", "title", "sub"}, "widgets": [...]}` |
| `paginas.json` | opcional: `[{"id","label","sections":[{"id","label"}]}]`; sem ele, uma página com todas as seções |
| `layout.json` | opcional: posição/tamanho por seção; sem ele, um empacotamento padrão por tipo de widget |

## Estrutura recomendada de uma seção
1. `highlight`: a resposta em uma frase, com o número decisivo.
2. `kpi-card` (2 a 4 numa linha): os números-chave, com `bind` ou `value` extraído de uma tabela.
3. `chart` (um) ou `table` (curta): a comparação que sustenta a resposta.
4. `find-block` / `find-note`: a implicação ("e daí?") em 1 a 3 linhas.
5. `ni` / `ni-vertical`: cada ação recomendada como card (por quê + acionável), só se a pergunta pede recomendação.

## Widgets mais usados (contrato completo em `design-system.md`)
- `highlight {id, text, label?, color?}`
- `kpi-card {id, title, value, sub?, delta?, color?}` ou com `bind {dataset, metrics:[...]}`
- `chart {id, chartType: bar|line|bar-horizontal|donut|area|stacked, title, bind {dataset, x, y|y[], series?, agg?}, height?}`
- `table {id, title, bind {dataset}, cols?}`
- `funnel {id, title, steps:[{label, value, rate?}]}` (valores vindos da tabela)
- `find-block {id, tag, tagColor, title, detail}` · `find-note {id, text}`
- `eyebrow {id, title, caption?}` para separar blocos

Cores: `p` roxo · `g` verde · `a` âmbar · `r` vermelho · `n` neutro.

## Validação (o que o `montar.py` recusa)
- Tipo de widget fora do design system.
- `bind` para tabela ou coluna que não existe no `dataset.json`.
- Número na prosa (`text`, `detail`, `title`, `value`…) que não aparece em nenhuma tabela: traga o número para uma tabela via `calc_livre.py` e cite dela.
- Seção sem `widgets` ou sem `header.title`; `paginas.json` que não lista uma seção.

## Depois de gerado
- `saida/relatorio.html` abre offline. Aprofundamentos: `aprofundar.py` (mesmo fluxo dos templates).
- O consultor pode editar `sNN.json` e rodar o `montar.py` de novo.
