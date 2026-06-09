"""query_api — catálogo FECHADO de consultas sobre o dump retido (Fase 3b).

O modelo decide O QUE olhar; este script CALCULA e devolve SÓ AGREGADOS (nunca
linhas brutas). Parâmetros são enums validados contra o config → recortes que o
dado não suporta retornam {"status":"nao_disponivel", ...}, nunca número inventado.

CLI:  py -3 query_api.py <config.json> <dump.csv> <fn> <args.json>
saída: uma linha JSON {"status":"ok","table":{dims,filters,rows},"summary":...}
       ou {"status":"nao_disponivel","motivo":...} ou {"status":"erro","motivo":...}
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import conv_calc as cc

METRICAS = {'conv_lcto', 'conv_12m', 'diff', 'uplift', 'rep'}
LIST_KEY = {'conv_lcto': 'conv_lcto', 'conv_12m': 'conv_12m', 'diff': 'diff_lcto', 'uplift': 'uplift_12m', 'rep': 'rep'}


def _mean(xs):
    vals = [v for v in (xs or []) if isinstance(v, (int, float))]
    return round(sum(vals) / len(vals), 2) if vals else None


def _canon(crit):
    return cc.make_canon(crit.get('order', []), crit.get('aliases'))


def _group_scalar(pg, metrica):
    if metrica == 'conv_lcto':
        return round(pg.get('avgConvLcto'), 2) if pg.get('avgConvLcto') is not None else None
    if metrica == 'diff':
        return round(pg.get('avgDiff_lcto'), 2) if pg.get('avgDiff_lcto') is not None else None
    return _mean(pg.get(LIST_KEY[metrica]))


def meta(ctx, _a):
    config = ctx['config']
    return {'status': 'ok', 'table': {'dims': ['campo'], 'filters': [], 'rows': []},
            'criterios': [{'id': c['id'], 'label': c.get('label', c['id'])} for c in config['criterios']],
            'canais': config.get('channels', ['Geral']), 'metricas': sorted(METRICAS),
            'lancamentos': ctx['lctos']}


def cut_by_criterion(ctx, a):
    crit = ctx['crit'].get(a.get('criterio'))
    if not crit:
        return {'status': 'nao_disponivel', 'motivo': f"critério '{a.get('criterio')}' não existe"}
    metrica = a.get('metrica', 'diff')
    if metrica not in METRICAS:
        return {'status': 'nao_disponivel', 'motivo': f"métrica '{metrica}' não suportada"}
    canal = a.get('canal', ctx['canais'][0])
    agg = cc.agg_criterio(ctx['rows'], crit['col'], ctx['dims'], ctx['lctos_id'], canal, _canon(crit))
    rows = [{'grupo': g, 'valor': _group_scalar(agg['por_grupo'][g], metrica)} for g in agg['grupos']]
    rows = [r for r in rows if r['valor'] is not None]
    if not rows:
        return {'status': 'nao_disponivel', 'motivo': 'sem dados para esse recorte'}
    return {'status': 'ok', 'table': {'dims': ['grupo'], 'filters': [], 'rows': rows},
            'summary': f"{crit.get('label', crit['id'])} — {metrica} ({canal})"}


def trend(ctx, a):
    crit = ctx['crit'].get(a.get('criterio'))
    if not crit:
        return {'status': 'nao_disponivel', 'motivo': f"critério '{a.get('criterio')}' não existe"}
    metrica = a.get('metrica', 'diff')
    if metrica not in METRICAS:
        return {'status': 'nao_disponivel', 'motivo': f"métrica '{metrica}' não suportada"}
    canal = a.get('canal', ctx['canais'][0])
    agg = cc.agg_criterio(ctx['rows'], crit['col'], ctx['dims'], ctx['lctos_id'], canal, _canon(crit))
    labels = ctx['lctos']
    out = []
    for g in agg['grupos']:
        series = agg['por_grupo'][g].get(LIST_KEY[metrica]) or []
        for i, lab in enumerate(labels):
            v = series[i] if i < len(series) else None
            if isinstance(v, (int, float)):
                out.append({'lancamento': lab, 'grupo': g, 'valor': round(v, 2)})
    if not out:
        return {'status': 'nao_disponivel', 'motivo': 'sem série temporal para esse recorte'}
    return {'status': 'ok', 'table': {'dims': ['lancamento', 'grupo'], 'filters': [], 'rows': out},
            'summary': f"Evolução de {crit.get('label', crit['id'])} — {metrica} ({canal})"}


def crosstab(ctx, a):
    """Conversão 60d de `criterio` DENTRO de cada nível de `cruzar_com` — a
    distribuição conjunta que a leitura isolada de cada critério não tem."""
    ca = ctx['crit'].get(a.get('criterio'))
    cb = ctx['crit'].get(a.get('cruzar_com'))
    if not ca or not cb:
        return {'status': 'nao_disponivel', 'motivo': 'critério ou cruzar_com inexistente'}
    if ca['id'] == cb['id']:
        return {'status': 'nao_disponivel', 'motivo': 'cruzar um critério com ele mesmo não faz sentido'}
    canal = a.get('canal', ctx['canais'][0])
    cna, cnb = _canon(ca), _canon(cb)
    colA, colB = ca['col'], cb['col']
    src = cc.channel_filter(ctx['rows'], canal)
    cells = {}
    for r in src:
        va, vb = (r.get(colA, '') or '').strip(), (r.get(colB, '') or '').strip()
        if not va or not vb or not cc.is_respondent(r, ctx['dims']):
            continue
        key = (cna(va), cnb(vb))
        acc = cells.setdefault(key, [0.0, 0.0])
        acc[0] += cc.num(r.get('total_leads'))
        acc[1] += cc.num(r.get('vendas_lancamento'))
    rows = []
    for (ga, gb), (leads, sales) in cells.items():
        if leads <= 0:
            continue
        rows.append({'grupo': ga, 'cruzar': gb, 'valor': round(sales / leads * 100, 2), 'leads': int(leads)})
    if not rows:
        return {'status': 'nao_disponivel', 'motivo': 'sem respondentes nesse cruzamento'}
    return {'status': 'ok', 'table': {'dims': ['grupo', 'cruzar'], 'filters': [], 'rows': rows},
            'summary': f"Conversão 60d: {ca.get('label')} × {cb.get('label')} ({canal})"}


def association(ctx, a):
    ca = ctx['crit'].get(a.get('criterio'))
    cb = ctx['crit'].get(a.get('cruzar_com'))
    if not ca or not cb:
        return {'status': 'nao_disponivel', 'motivo': 'critério ou cruzar_com inexistente'}
    canal = a.get('canal', ctx['canais'][0])
    v = cc.cramers_v(ctx['rows'], ca['col'], cb['col'], ctx['dims'], canal, _canon(ca), _canon(cb))
    return {'status': 'ok',
            'table': {'dims': ['par'], 'filters': [], 'rows': [{'par': f"{ca.get('label')} × {cb.get('label')}", 'valor': round(v, 3)}]},
            'summary': f"Associação (Cramér's V) {ca.get('label')} × {cb.get('label')} ({canal}) = {v:.2f}"}


FNS = {'meta': meta, 'cut_by_criterion': cut_by_criterion, 'trend': trend, 'crosstab': crosstab, 'association': association}


def run(config, rows, fn, args):
    dims = cc.dim_columns(rows)
    lctos_id = cc.ordered_lancamentos(rows)
    ctx = {
        'config': config, 'rows': rows, 'dims': dims,
        'lctos_id': lctos_id,
        'lctos': lctos_id,
        'canais': config.get('channels', ['Geral']),
        'crit': {c['id']: c for c in config['criterios']},
    }
    handler = FNS.get(fn)
    if not handler:
        return {'status': 'nao_disponivel', 'motivo': f"função '{fn}' não existe no catálogo"}
    return handler(ctx, args or {})


if __name__ == '__main__':
    try:
        cfg_path, dump_path, fn = sys.argv[1:4]
        args = json.loads(sys.argv[4]) if len(sys.argv) > 4 else {}
        config = json.load(open(cfg_path, encoding='utf-8'))
        rows = cc.load_dump(dump_path)
        print(json.dumps(run(config, rows, fn, args), ensure_ascii=False))
    except Exception as e:  # noqa: BLE001 — devolve erro estruturado p/ o Node
        print(json.dumps({'status': 'erro', 'motivo': str(e)}, ensure_ascii=False))
