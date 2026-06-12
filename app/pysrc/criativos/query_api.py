"""query_api — consultas sob demanda do modo FUNDO de criativos.

O modelo decide O QUE olhar; este script CALCULA e devolve SÓ AGREGADOS (nunca linha
bruta). Recortes que o dado não suporta → {"status":"nao_disponivel", ...}, jamais
número inventado.

CLI:  py -3 query_api.py <config.json> <dump.csv> <fn> <args.json>
saída (1 linha JSON): {"status":"ok","table":{dims,filters,rows},"summary":...}
                      | {"status":"nao_disponivel","motivo":...} | {"status":"erro","motivo":...}
"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import calc  # noqa: E402

# Rótulo legível por métrica (vira cabeçalho de coluna nas tabelas).
_LABEL = {
    'roas': 'ROAS', 'retorno': 'Retorno', 'cpl': 'CPL', 'cpmql': 'CPMQL', 'cpm': 'CPM',
    'ctr': 'CTR', 'hook_rate': 'Hook', 'hold_rate': 'Hold', 'connect_rate': 'ConnRate',
    'conv_pagina': 'Conv.Pág', 'qualidade': 'Qualid.', 'tx_resposta': 'Tx.Resp',
    'conv': 'Tx.Conv', 'cac': 'CAC', 'leads': 'Leads', 'invest': 'Invest.',
}


def _r(v, d=4):
    return round(v, d) if isinstance(v, (int, float)) else None


def _pearson(xs, ys):
    pts = [(a, b) for a, b in zip(xs, ys) if isinstance(a, (int, float)) and isinstance(b, (int, float))]
    n = len(pts)
    if n < 3:
        return None, n
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    cov = sum((p[0] - mx) * (p[1] - my) for p in pts)
    vx = sum((p[0] - mx) ** 2 for p in pts)
    vy = sum((p[1] - my) ** 2 for p in pts)
    if vx <= 0 or vy <= 0:
        return None, n
    return cov / (vx ** 0.5 * vy ** 0.5), n


def correlacao(B, a):
    mx, my = a.get('metrica_x'), a.get('metrica_y')
    if mx not in _LABEL or my not in _LABEL:
        return {'status': 'nao_disponivel', 'motivo': 'metrica_x/metrica_y inválida ou ausente'}
    valid = B['valid']
    r, n = _pearson([c['m'].get(mx) for c in valid], [c['m'].get(my) for c in valid])
    if r is None:
        return {'status': 'nao_disponivel', 'motivo': 'poucos criativos com ambas as métricas'}
    rows = [{'criativo': c['name'], _LABEL[mx]: _r(c['m'].get(mx), 2), _LABEL[my]: _r(c['m'].get(my), 2)}
            for c in valid if c['m'].get(mx) is not None and c['m'].get(my) is not None]
    return {'status': 'ok', 'table': {'dims': ['criativo'], 'filters': [], 'rows': rows},
            'summary': f'Correlação {_LABEL[mx]} × {_LABEL[my]} = {r:+.2f} entre {n} criativos.'}


def series(B, a):
    """Várias métricas por criativo numa tabela só (ex.: ROAS, CTR e Hook juntos)."""
    ms = [m for m in (a.get('metrica_x'), a.get('metrica_y'), a.get('metrica_z')) if m in _LABEL]
    ms = list(dict.fromkeys(ms))
    if len(ms) < 2:
        return {'status': 'nao_disponivel', 'motivo': 'informe ao menos metrica_x e metrica_y (e opcional metrica_z)'}
    rows = [{'criativo': c['name'], **{_LABEL[m]: _r(c['m'].get(m), 2) for m in ms}} for c in B['valid']]
    if not rows:
        return {'status': 'nao_disponivel', 'motivo': 'sem criativos válidos'}
    return {'status': 'ok', 'table': {'dims': ['criativo'], 'filters': [], 'rows': rows},
            'summary': f'{", ".join(_LABEL[m] for m in ms)} por criativo ({len(rows)} criativos).'}


def por_temperatura(B, a):
    metrica = a.get('metrica', 'roas')
    if metrica not in _LABEL:
        return {'status': 'nao_disponivel', 'motivo': f"métrica '{metrica}' inválida"}
    rows_all, produto = B['_rows'], B['produto']
    temps = calc._distinct(rows_all, 'temperatura_lead')
    if not temps:
        return {'status': 'nao_disponivel', 'motivo': 'não há dado de temperatura (coluna temperatura_lead vazia)'}
    out = []
    for t in temps:
        sub = [r for r in rows_all if (r.get('temperatura_lead') or '').strip() == t]
        v = calc.metrics(sub, produto).get(metrica)
        if v is not None:
            out.append({'temperatura': t, _LABEL[metrica]: _r(v, 2)})
    if not out:
        return {'status': 'nao_disponivel', 'motivo': 'sem valores por temperatura'}
    return {'status': 'ok', 'table': {'dims': ['temperatura'], 'filters': [], 'rows': out},
            'summary': f'{_LABEL[metrica]} por temperatura ({len(out)} faixas).'}


def saturacao_diaria(B, a):
    crit = a.get('criativo')
    if crit:
        c = next((x for x in B['creatives'] if x['name'] == crit), None)
        if not c:
            return {'status': 'nao_disponivel', 'motivo': f"criativo '{crit}' não encontrado"}
        daily = c['daily']
    else:
        daily = B['daily']
    rows = [{'data': d['data'], 'ROAS': _r(d['m'].get('roas'), 2), 'Retorno': _r(d['m'].get('retorno'), 0)} for d in daily]
    rows = [r for r in rows if r['ROAS'] is not None or r['Retorno'] is not None]
    if len(rows) < 2:
        return {'status': 'nao_disponivel', 'motivo': 'série diária insuficiente'}
    neg = sum(1 for r in rows if (r['ROAS'] or 0) < 1)
    return {'status': 'ok', 'table': {'dims': ['data'], 'filters': [], 'rows': rows},
            'summary': f'ROAS e retorno por dia ({len(rows)} dias; {neg} com ROAS < 1×)' + (f' — {crit}.' if crit else '.')}


def ranking(B, a):
    metrica = a.get('metrica', 'roas')
    if metrica not in _LABEL:
        return {'status': 'nao_disponivel', 'motivo': f"métrica '{metrica}' inválida"}
    cost = calc.METRICS.get(metrica, {}).get('cost') is True
    valid = sorted((c for c in B['valid'] if c['m'].get(metrica) is not None),
                   key=lambda c: c['m'][metrica], reverse=not cost)
    cols = list(dict.fromkeys([metrica, 'roas', 'cpl', 'qualidade', 'leads']))
    rows = [{'criativo': c['name'], **{_LABEL.get(k, k): _r(c['m'].get(k), 2) for k in cols}} for c in valid]
    if not rows:
        return {'status': 'nao_disponivel', 'motivo': 'sem criativos com essa métrica'}
    return {'status': 'ok', 'table': {'dims': ['criativo'], 'filters': [], 'rows': rows},
            'summary': f'{len(rows)} criativos ordenados por {_LABEL[metrica]} ({"menor" if cost else "maior"} melhor).'}


def benchmark_gap(B, a):
    bench, avg = B['bench'], B['avg']
    out = []
    for k in ['hook_rate', 'hold_rate', 'ctr', 'connect_rate', 'conv_pagina']:
        med, ref = avg.get(k), bench.get(k)
        if med is None:
            continue
        gap = ((med - ref) / ref * 100) if ref else None
        out.append({'indicador': _LABEL[k], 'Média': _r(med, 1),
                    'Benchmark': (_r(ref, 1) if ref else '—'),
                    'Gap': (f'{gap:+.0f}%' if gap is not None else '—')})
    if not out:
        return {'status': 'nao_disponivel', 'motivo': 'sem indicadores de anúncio'}
    return {'status': 'ok', 'table': {'dims': ['indicador'], 'filters': [], 'rows': out},
            'summary': f'Média de {len(out)} indicadores de anúncio vs. benchmark/referência.'}


FUNCS = {'correlacao': correlacao, 'series': series, 'por_temperatura': por_temperatura,
         'saturacao_diaria': saturacao_diaria, 'ranking': ranking, 'benchmark_gap': benchmark_gap}


def main():
    if len(sys.argv) < 5:
        print(json.dumps({'status': 'erro', 'motivo': 'uso: query_api.py config dump fn args'}))
        return
    _cfg, dump, fn, args_json = sys.argv[1:5]
    try:
        args = json.loads(args_json) if args_json else {}
    except Exception:
        args = {}
    f = FUNCS.get(fn)
    if not f:
        print(json.dumps({'status': 'nao_disponivel', 'motivo': f"função '{fn}' não existe"}))
        return
    try:
        rows = calc.load_rows(dump)
        B = calc.build(rows, {}, {})
        B['_rows'] = rows
        out = f(B, args)
    except Exception as e:
        out = {'status': 'erro', 'motivo': str(e)}
    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    main()
