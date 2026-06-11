"""render_view — recalcula a vista de criativos para um MODO (resultado × captação).

Usado pela rota POST /api/:client/:slug/render. Reusa o assemble do build_report
(fonte única de cálculo). Stdlib, sem pandas.

uso: render_view.py <config.json> <dump.csv> <opts_json>
  opts_json: string JSON, ex.: {"mode":"captacao"}
imprime: {"dataset":..., "sections":{s01,...}, "layout":{s01:[...],...}}
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
    # dicionário de criativos (links) — necessário para remontar os embeds das fichas.
    dict_csv = config.get('dict_csv')
    opts['dict'] = calc.load_dict(dict_csv) if dict_csv and os.path.exists(dict_csv) else {}
    r = assemble(rows, config, {}, opts)
    out = json.dumps({'dataset': r['dataset'], 'sections': r['sections'],
                      'layout': r['layout']['sections']}, ensure_ascii=False)
    # UTF-8 explícito: o console Windows (cp1252) não codifica caracteres como ★.
    sys.stdout.buffer.write(out.encode('utf-8'))
    sys.stdout.buffer.write(b'\n')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
