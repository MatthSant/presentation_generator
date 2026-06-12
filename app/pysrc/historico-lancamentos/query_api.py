"""query_api — consultas sob demanda do modo FUNDO do histórico de lançamentos.

O modelo decide O QUE olhar; este script CALCULA e devolve SÓ AGREGADOS. Recortes
sem dado → {"status":"nao_disponivel", ...}, nunca número inventado.

CLI:  py -3 query_api.py <config.json> <dump.csv> <fn> <args.json>
saída (1 linha JSON): {"status":"ok","table":{dims,filters,rows},"summary":...} | nao_disponivel | erro
"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import calc  # noqa: E402

# Métricas por lançamento: overview (ov[fc]) vs mídia paga (media[fc]).
_MEDIA = {'cpm', 'ctr', 'cpc', 'cpl', 'conv_paga', 'cpa'}
_OV = {'conv_ger', 'qualificacao', 'taxa_qualidade', 'conv_mql', 'reembolso', 'roas',
       'roi', 'ret', 'leads', 'invest', 'fat_liq', 'vendas', 'recap'}
_LABEL = {
    'conv_ger': 'Conversão', 'qualificacao': 'Qualificação', 'taxa_qualidade': 'Taxa qualidade',
    'conv_mql': 'Conv. MQL', 'reembolso': 'Reembolso', 'roas': 'ROAS', 'roi': 'ROI', 'ret': 'Retorno',
    'leads': 'Leads', 'invest': 'Investimento', 'fat_liq': 'Fat. líq.', 'vendas': 'Vendas',
    'recap': 'Recapturados', 'cpm': 'CPM', 'ctr': 'CTR', 'cpc': 'CPC', 'cpl': 'CPL',
    'conv_paga': 'Conv. paga', 'cpa': 'CPA', 'conv': 'Conversão', 'qual': 'Qualificação',
    'investimento': 'Investimento', 'faturamento': 'Faturamento',
}
_DIM = {'canal': 'canal', 'plataforma': 'plataforma', 'temperatura': 'temp'}


def _r(v, d=4):
    return round(v, d) if isinstance(v, (int, float)) else None


def _val(S, fc, m):
    if m == 'invest':
        return S['ov'].get(fc, {}).get('invest')
    if m in _MEDIA:
        return S['media'].get(fc, {}).get(m)
    return S['ov'].get(fc, {}).get(m)


def _series(S, m):
    return [_val(S, fc, m) for fc in S['events']]


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


def trend(S, a):
    m = a.get('metrica')
    if m not in _LABEL or (m not in _OV and m not in _MEDIA):
        return {'status': 'nao_disponivel', 'motivo': f"métrica '{m}' inválida"}
    rows = [{'lcto': S['labels'][fc], _LABEL[m]: _r(_val(S, fc, m), 2)} for fc in S['events']]
    rows = [r for r in rows if r[_LABEL[m]] is not None]
    if len(rows) < 2:
        return {'status': 'nao_disponivel', 'motivo': 'série insuficiente'}
    return {'status': 'ok', 'table': {'dims': ['lcto'], 'filters': [], 'rows': rows},
            'summary': f'{_LABEL[m]} ao longo de {len(rows)} lançamentos.'}


def series(S, a):
    """Várias métricas por lançamento numa tabela só (ex.: CPL, CPM e CTR juntos)."""
    ms = [m for m in (a.get('metrica_x'), a.get('metrica_y'), a.get('metrica_z'))
          if m in _LABEL and (m in _OV or m in _MEDIA)]
    ms = list(dict.fromkeys(ms))
    if len(ms) < 2:
        return {'status': 'nao_disponivel', 'motivo': 'informe ao menos metrica_x e metrica_y (e opcional metrica_z)'}
    rows = [{'lcto': S['labels'][fc], **{_LABEL[m]: _r(_val(S, fc, m), 2) for m in ms}} for fc in S['events']]
    return {'status': 'ok', 'table': {'dims': ['lcto'], 'filters': [], 'rows': rows},
            'summary': f'{", ".join(_LABEL[m] for m in ms)} ao longo de {len(rows)} lançamentos.'}


def correlacao(S, a):
    mx, my = a.get('metrica_x'), a.get('metrica_y')
    if mx not in _LABEL or my not in _LABEL:
        return {'status': 'nao_disponivel', 'motivo': 'metrica_x/metrica_y inválida ou ausente'}
    r, n = _pearson(_series(S, mx), _series(S, my))
    if r is None:
        return {'status': 'nao_disponivel', 'motivo': 'poucos lançamentos com ambas as métricas'}
    rows = [{'lcto': S['labels'][fc], _LABEL[mx]: _r(_val(S, fc, mx), 2), _LABEL[my]: _r(_val(S, fc, my), 2)}
            for fc in S['events'] if _val(S, fc, mx) is not None and _val(S, fc, my) is not None]
    return {'status': 'ok', 'table': {'dims': ['lcto'], 'filters': [], 'rows': rows},
            'summary': f'Correlação {_LABEL[mx]} × {_LABEL[my]} = {r:+.2f} entre {n} lançamentos.'}


def decomposicao(S, _a):
    """CPA = CPL ÷ Conversão paga. Atribui a variação do CPA a CPL vs. conversão."""
    cpl, conv, cpa = _series(S, 'cpl'), _series(S, 'conv_paga'), _series(S, 'cpa')
    c_cpl, _ = _pearson(cpa, cpl)
    c_conv, _ = _pearson(cpa, [(-x if isinstance(x, (int, float)) else None) for x in conv])
    if c_cpl is None and c_conv is None:
        return {'status': 'nao_disponivel', 'motivo': 'sem série de CPA/CPL/conversão'}
    driver = 'CPL (mídia)' if abs(c_cpl or 0) >= abs(c_conv or 0) else 'conversão paga (funil)'
    rows = [{'lcto': S['labels'][fc], 'CPL': _r(_val(S, fc, 'cpl'), 2),
             'Conv. paga': _r(_val(S, fc, 'conv_paga'), 2), 'CPA': _r(_val(S, fc, 'cpa'), 2)}
            for fc in S['events']]
    return {'status': 'ok', 'table': {'dims': ['lcto'], 'filters': [], 'rows': rows},
            'summary': (f'Variação do CPA mais explicada por {driver} '
                        f'(corr CPA×CPL={(c_cpl or 0):+.2f}; CPA×conversão={(c_conv or 0):+.2f}).')}


def por_dimensao(S, a):
    dim = _DIM.get(a.get('dimensao', ''))
    metrica = a.get('metrica', 'conv')
    if not dim:
        return {'status': 'nao_disponivel', 'motivo': "dimensao deve ser canal/plataforma/temperatura"}
    lab = _LABEL.get(metrica, metrica)
    out = []
    for fc in S['events']:
        by = S['ov'].get(fc, {}).get('by', {}).get(dim, {})
        for grupo, trio in by.items():
            v = trio.get(metrica)
            if v is not None:
                out.append({'lcto': S['labels'][fc], a.get('dimensao'): grupo, lab: _r(v, 2)})
    if not out:
        return {'status': 'nao_disponivel', 'motivo': f"sem dado de {metrica} por {a.get('dimensao')}"}
    return {'status': 'ok', 'table': {'dims': ['lcto', a.get('dimensao')], 'filters': [], 'rows': out},
            'summary': f'{lab} por {a.get("dimensao")} ao longo dos lançamentos.'}


FUNCS = {'trend': trend, 'series': series, 'correlacao': correlacao,
         'decomposicao': decomposicao, 'por_dimensao': por_dimensao}


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
        S = calc.build_series(rows)
        out = f(S, args)
    except Exception as e:
        out = {'status': 'erro', 'motivo': str(e)}
    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    main()
