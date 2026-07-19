"""render_view — recalcula a vista do acompanhamento aplicando os filtros do FAB.

Usado pela rota POST /api/:client/:slug/render. Reusa o assemble do build_report
(fonte única de cálculo): filtra as linhas pelas dimensões selecionadas e re-assembla.
Stdlib, sem pandas.

uso: render_view.py <config.json> <dump.csv> <opts_json>
  opts_json: {"filters": {"dia":["2026-07-12"], "origem":["Pago"],
                          "utm_source":[...], "utm_medium":[...],
                          "utm_campaign":[...], "utm_content":[...]}}
imprime: {"dataset":..., "sections":{s01,...}, "layout":{s01:[...],...}}
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import calc
from build_report import assemble

# Cada dimensão do FAB → como extrair o valor de uma linha. O `dia` e as utms saem
# das colunas canônicas, que o merge_traf_columns já preencheu a partir da família
# `_traf` — por isso o filtro pega também a linha que veio só da integração de mídia.
DIMS = {
    'dia': calc._date,
    'origem': lambda r: 'Pago' if calc.is_paid(r) else 'Orgânico',
    'utm_source': lambda r: calc.norm_source(r.get('utm_source')),
    'utm_medium': lambda r: calc._coalesce(r.get('utm_medium')),
    'utm_campaign': lambda r: calc._coalesce(r.get('utm_campaign')),
    'utm_content': lambda r: calc._coalesce(r.get('utm_content')),
}


def _filter(rows, f):
    """Mantém só as linhas que casam com TODAS as dimensões selecionadas (AND entre
    dimensões, OR dentro de cada uma). Dimensão sem seleção não restringe."""
    sets = {k: set(v) for k, v in (f or {}).items() if v and k in DIMS}
    if not sets:
        return rows

    def keep(r):
        return all(DIMS[k](r) in vals for k, vals in sets.items())
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
    # merge ANTES do filtro: sem isso a linha de mídia entra sem data e sem utm, e
    # qualquer seleção a descartaria — sumindo metade do investimento em silêncio.
    rows = calc.merge_traf_columns(calc.load_rows(argv[2]))
    filtered = _filter(rows, opts.get('filters') or {})
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
