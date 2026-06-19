"""render_view — recalcula a vista do debriefing aplicando os filtros do FAB.

Usado pela rota POST /api/:client/:slug/render. Reusa o assemble do build_report
(fonte única de cálculo): filtra as linhas pelas dimensões selecionadas e re-assembla.
Stdlib, sem pandas.

uso: render_view.py <config.json> <dump.csv> <opts_json>
  opts_json: {"filters": {"tipo":["pago"], "canal":["facebook-ads"], "temp":["Frio"],
                          "campanha":[...], "publico":[...], "criativo":[...]}}
imprime: {"dataset":..., "sections":{s01,...}, "layout":{s01:[...],...}}
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import calc
from build_report import assemble


def _filter(rows, f, config):
    """Mantém só as linhas que casam com TODAS as dimensões selecionadas (AND entre
    dimensões, OR dentro de cada uma). Dimensão sem seleção não restringe."""
    sets = {k: set(v) for k, v in (f or {}).items() if v}
    if not sets:
        return rows
    calc.classify(rows, config)   # garante _tipo/_temp/_camp p/ os filtros categóricos
    def keep(r):
        if 'tipo' in sets and r.get('_tipo') not in sets['tipo']:
            return False
        if 'canal' in sets and calc.norm_source(r.get('utm_source')) not in sets['canal']:
            return False
        if 'temp' in sets and (r.get('_temp') or '') not in sets['temp']:
            return False
        if 'campanha' in sets and (r.get('field_campaign_name') or '') not in sets['campanha']:
            return False
        if 'publico' in sets and calc.adset_name(r) not in sets['publico']:
            return False
        if 'criativo' in sets and calc.ad_name(r) not in sets['criativo']:
            return False
        return True
    return [r for r in rows if keep(r)]


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
    filtered = _filter(rows, opts.get('filters') or {}, config)
    if not filtered:        # seleção vazia → não quebra o relatório (volta ao completo)
        filtered = rows
    r = assemble(filtered, config, {}, opts)
    out = json.dumps({'dataset': r['dataset'], 'sections': r['sections'],
                      'layout': r['layout']['sections']}, ensure_ascii=False)
    sys.stdout.buffer.write(out.encode('utf-8'))
    sys.stdout.buffer.write(b'\n')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
