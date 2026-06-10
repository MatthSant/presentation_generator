"""render_view — recalcula a vista do histórico para um recorte (launches/metric).

Usado pela rota POST /api/:client/:slug/historico/render. Reusa o assemble do
build_report (fonte única de cálculo). Stdlib, sem pandas.

uso: render_view.py <config.json> <dump.csv> <opts_json>
  opts_json: string JSON, ex.: {"launches":["jul/23","mar/24"],"metric":"qual"}
imprime: {"dataset":..., "sections":{s01,s02,...}, "layout":{s01:[...],...}}
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import calc
from build_report import assemble


def main(argv):
    if len(argv) < 4:
        sys.stderr.write('uso: render_view.py <config.json> <dump.csv> <opts_json>\n')
        return 2
    config = json.load(open(argv[1], encoding='utf-8'))
    try:
        opts = json.loads(argv[3]) or {}
    except (ValueError, TypeError):
        opts = {}
    rows = calc.load_rows(argv[2])
    r = assemble(rows, config, {}, opts)
    print(json.dumps({'dataset': r['dataset'], 'sections': r['sections'],
                      'layout': r['layout']['sections']}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
