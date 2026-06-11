# Contrato das 3 camadas + motor

Referência rápida para a Fase 2. O schema **completo dos widgets** está em
`conversao-perfil/BLOCKS.md` (e validado por `app/src/shared/validate.ts`,
`WIDGET_TYPES`). Aqui ficam só os contratos estruturais.

## Camadas (arquivos em `output/<cliente>/<slug>/`)

| arquivo | papel | forma |
|---|---|---|
| `dataset.json` | **números** (formato longo) | `{ "<tabela>": { "dims": [cols], "filters": [], "rows": [ {…} ] } }` |
| `sNN.json` | **view** de uma seção (lista de widgets) | `{ "id":"sNN", "header": {badge,title,sub}, "widgets": [ …, modals? ] }` |
| `layout.json` | grid (x,y,w,h por widget) | `{ "sections": { "sNN": [ {id,x,y,w,h} ] }, "updatedAt": "…" }` |
| `data.json` | **navegação + meta** | ver abaixo |

### data.json
```jsonc
{
  "meta": {
    "client": "...", "title": "...", "type": "dashboard", "theme": "light",
    "created_at": "YYYY-MM-DD", "filters": [],
    "controls": { "kind": "<tipo>", "pages": ["p1","p2"], /* launches/metrics se houver */ },
    "nav": "topnav"            // ou "sidebar" (recurso de plataforma; default topnav)
  },
  "pages": [ { "id":"p1", "label":"…", "sections":[ {"id":"sNN","label":"…"} ] } ]
}
```

## Widget = bind, nunca número embutido

Gráfico/tabela/kpi referenciam uma tabela do dataset:
```jsonc
{ "id":"w1", "type":"chart", "chartType":"line", "title":"…", "height":300,
  "bind": { "dataset":"<tabela>", "x":"<dim>", "y":"<coluna numérica>",
            "series":"<dim opcional>", "agg":"sum|avg|…", "where": {"<dim>":"<valor>"} } }
```
- O `y` de um GRÁFICO tem que ser **coluna numérica** (colunas formatadas "16,7%" só em
  TABELA — num gráfico renderizam zerado).
- `where` isola um valor de dimensão (filtro real → pode rotular o recorte).
- Tipos comuns: `kpi`, `kpi-card`, `eyebrow`, `chart`, `chart-table`, `table`, `heatmap`,
  `rank-card`, `find-block`, `find-note`, `ni`/`ni-vertical`, `highlight`, `metric-toggle`.

## Motor (`build_report.py`)

```python
from common.layout import Grid
from common.fmt import money, pctf, xf, intf, safe, fmtval
from common.preserve import preserve

def assemble(rows, config, content, opts=None) -> dict:   # {dataset, data, layout, sections}
    dataset, sections, layouts = {}, {}, {}
    pg = Grid()
    # ... monta widgets; pg.add(wid, type, w, h); layouts['sNN'] = pg.items
    return {'dataset': dataset, 'data': data_json,
            'layout': {'sections': layouts, 'updatedAt': f'{created}T00:00:00.000Z'},
            'sections': sections}

def build(csv_path, config, content, out_dir):
    rows = calc.load_rows(csv_path)
    r = assemble(rows, config, content, {})
    preserve(out_dir, r['data'], r['sections'])   # mescla com o que já existe
    # grava dataset.json, data.json, layout.json e cada sNN.json
```

## Grid (layout)

`pg = Grid(); pg.add(widget_id, widget_type, w, h)` em ordem de leitura; `pg.items` →
lista `[{id,x,y,w,h}]`. Largura total = 12 colunas. Veja usos em
`historico-lancamentos/build_report.py`.

## config / content

- `config` = metadata de apresentação (`client, title, slug, type, created_at`, + campos
  do tipo). Validado por `typeRegistry.validateConfig`.
- `content` = prosa autoral (insights/detalhamentos) — opcional; números só via `bind`.

## Regras de design (de CLAUDE.md — proibições)

Sem `border-left>1px` como stripe; sem gradient text; sem hero-metric; sem glassmorphism;
sem cards ad-hoc (use componentes); superfícies semi-transparentes; altura de gráfico via
JS; sem comentários óbvios.
