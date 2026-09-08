# Design system dos aprofundamentos

Todo aprofundamento entra **dentro do relatório**, como uma seção nova na página
"Aprofundamentos", usando os widgets do app. Nada de HTML solto. O agente escreve prosa
(título, achados, notas); **número só via `bind`** a uma tabela do dataset que você
calculou em Python (importe `python/calc.py` para usar as mesmas definições do relatório). O `python/aprofundar.py` valida e regera o HTML.

## Fluxo

```
python meu_corte.py config.json dump.csv                       → grava q-<id>.json {name, dims, filters, rows} (importe calc: mesmas definições)
   salve como q-<id>.json (o nome do arquivo vira o nome da tabela)
escreva det-<id>.json (seção abaixo)
python python/aprofundar.py --out saida --secao det-<id>.json --tabela q-<id>.json --pergunta "…"
   → valida · grava det-<id>.json, dataset.json, data.json, layout.json · regera saida/relatorio.html
```

## Seção (`det-<id>.json`)

```json
{
  "id": "det-cpl-subindo",
  "header": { "badge": "Aprofundamento", "title": "Por que o CPL subiu nos últimos 3 dias?", "sub": "uma linha de contexto" },
  "widgets": [
    { "id": "hl", "type": "highlight", "label": "Resposta", "text": "O CPM subiu e o CTR ficou estável: a alta é de leilão, não de criativo." },
    { "id": "t1", "type": "table", "title": "Decomposição do CPL", "cols": ["fator", "inicio", "recente", "contrib_pct"],
      "bind": { "dataset": "q-cpl-decomp", "x": "fator", "metrics": ["inicio", "recente", "contrib_pct"] } },
    { "id": "c1", "type": "chart", "chartType": "line", "title": "CPL por dia", "valueFormat": "money",
      "bind": { "dataset": "q-cpl-dia", "x": "dia", "y": "cpl" } },
    { "id": "f1", "type": "find-block", "tag": "Causa", "tagColor": "warn", "title": "Leilão mais caro", "detail": "84% da alta vem do CPM (tabela Decomposição)." },
    { "id": "n1", "type": "find-note", "text": "Sem pageviews na base: a conversão de página é cliques→leads." }
  ]
}
```

- `id` da seção começa com `det-`; `header.title` é a pergunta.
- Cada widget tem `id` único na seção e `type` do catálogo abaixo.
- Prosa (`text`, `detail`, `title`, `sub`): pode citar um número **só se ele está numa
  tabela bindada da seção** (o validador confere). Cite a tabela.
- Tabela do dataset: `{ "name": "q-…", "dims": ["fator"], "filters": [], "rows": [{"fator": "CPM", "inicio": 8.3, "recente": 10.9, "contrib_pct": 84.0}] }`.

## `bind`

| Campo | Uso |
|---|---|
| `dataset` | nome da tabela no dataset (obrigatório) |
| `x` | coluna de categorias (eixo / linhas da tabela) |
| `y` | coluna numérica; array = uma série por coluna (use `secondaryAxis` se as escalas diferem) |
| `series` | coluna cujos valores viram séries (formato longo: `dia/serie/valor`) — não combine com `y` em array |
| `metrics` | colunas numéricas (kpi, table) |
| `agg` | `sum` (padrão) · `avg` · `min` · `max` · `count` |
| `name` | nome da série única |

## Layout

Grid de 12 colunas. `aprofundar.py` empacota sozinho (kpi 3 col · find-block/ni 4 · chart 6 ·
table/highlight/find-note 12). Para controlar, passe `--layout` com `[{ "id", "x", "y", "w", "h" }]`
(h em células de 80 px; um gráfico com `h: 4` tem ~290 px).

## Regras de design (não negociáveis)

- Sem cards ad-hoc, sem HTML/CSS próprio: só widgets do catálogo.
- Um achado por `find-block`; a resposta direta em um `highlight` no topo.
- Gráfico com duas escalas diferentes: `chart-toggle` (abas) ou `secondaryAxis`, nunca sobrepor no mesmo eixo.
- Taxa nunca soma nem tira média simples; para o "geral" use a tabela do motor (`incluir_geral`).
- Sem meta por canal/temperatura/criativo (não existe); sem número que não esteja numa tabela.
- Proibido: gradient text, hero-metric, glassmorphism, stripe lateral colorido, superfície opaca.

## Catálogo de widgets (do app)
