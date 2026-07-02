"""query_api — consultas sob demanda do modo FUNDO do histórico de lançamentos.

O modelo decide O QUE olhar; este script CALCULA e devolve SÓ AGREGADOS. Recortes
sem dado → {"status":"nao_disponivel", ...}, nunca número inventado.

As consultas genéricas (series, correlacao, trend, ranking) vêm de common.query_core
e operam sobre o FRAME montado em build_frame(). Aqui ficam só as específicas do
histórico (decomposicao do CPA, por_dimensao).

CLI:  py -3 query_api.py <config.json> <dump.csv> <fn> <args.json>
saída (1 linha JSON): {"status":"ok","table":{dims,filters,rows},"summary":...} | nao_disponivel | erro
"""
import sys
import os
import json

_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _here)
sys.path.insert(0, os.path.dirname(_here))  # pysrc/ -> pacote common
import calc  # noqa: E402
import common.query_core as qc  # noqa: E402

# Métricas por lançamento: overview (ov[fc]) vs mídia paga (media[fc]).
_MEDIA = {'cpm', 'ctr', 'cpc', 'cpl', 'conv_paga', 'cpa'}
_OV = {'conv_ger', 'qualificacao', 'taxa_qualidade', 'conv_mql', 'reembolso', 'roas',
       'roi', 'ret', 'leads', 'invest', 'fat_liq', 'vendas', 'recap'}
# Métricas de custo (menor é melhor) — direção do ranking genérico.
_COST = {'cpm', 'ctr', 'cpc', 'cpl', 'cpa', 'reembolso'}
_LABEL = {
    'conv_ger': 'Conversão', 'qualificacao': 'Qualificação', 'taxa_qualidade': 'Taxa qualidade',
    'conv_mql': 'Conv. MQL', 'reembolso': 'Reembolso', 'roas': 'ROAS', 'roi': 'ROI', 'ret': 'Retorno',
    'leads': 'Leads', 'invest': 'Investimento', 'fat_liq': 'Fat. líq.', 'vendas': 'Vendas',
    'recap': 'Recapturados', 'cpm': 'CPM', 'ctr': 'CTR', 'cpc': 'CPC', 'cpl': 'CPL',
    'conv_paga': 'Conv. paga', 'cpa': 'CPA',
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


def _serie(S, m):
    return [_val(S, fc, m) for fc in S['events']]


def build_frame(ctx, _a):
    """Eixo = lançamento (cronológico); métricas = catálogo overview + mídia paga."""
    return {
        'axis': 'lcto',
        'rows': [{'key': ctx['labels'][fc], 'm': {m: _val(ctx, fc, m) for m in _LABEL}} for fc in ctx['events']],
        'labels': _LABEL,
        'cost': {m: (m in _COST) for m in _LABEL},
    }


def decomposicao(S, _a):
    """CPA = CPL ÷ Conversão paga. Atribui a variação do CPA a CPL vs. conversão."""
    cpl, conv, cpa = _serie(S, 'cpl'), _serie(S, 'conv_paga'), _serie(S, 'cpa')
    c_cpl, _ = qc.pearson(cpa, cpl)
    c_conv, _ = qc.pearson(cpa, [(-x if isinstance(x, (int, float)) else None) for x in conv])
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
    # Devolve TODAS as métricas do grupo (uma coluna cada) por (lançamento × grupo),
    # em vez de uma só — evita o modelo referenciar coluna inexistente. O arg
    # 'metrica' (opcional) só guia a leitura/summary, não restringe as colunas.
    dim = _DIM.get(a.get('dimensao', ''))
    if not dim:
        return {'status': 'nao_disponivel', 'motivo': "dimensao deve ser canal/plataforma/temperatura"}
    out = []
    for fc in S['events']:
        by = S['ov'].get(fc, {}).get('by', {}).get(dim, {})
        for grupo, trio in by.items():
            row = {'lcto': S['labels'][fc], a.get('dimensao'): grupo}
            for m, v in trio.items():
                if v is not None and m in _LABEL:
                    row[_LABEL[m]] = _r(v, 2)
            if len(row) > 2:
                out.append(row)
    if not out:
        return {'status': 'nao_disponivel', 'motivo': f"sem dado por {a.get('dimensao')}"}
    return {'status': 'ok', 'table': {'dims': ['lcto', a.get('dimensao')], 'filters': [], 'rows': out},
            'summary': f'Métricas por {a.get("dimensao")} ao longo dos lançamentos.'}


EXTRA = {'decomposicao': decomposicao, 'por_dimensao': por_dimensao}


def main():
    if len(sys.argv) < 5:
        print(json.dumps({'status': 'erro', 'motivo': 'uso: query_api.py config dump fn args'}))
        return
    _cfg, dump, fn, args_json = sys.argv[1:5]
    try:
        args = json.loads(args_json) if args_json else {}
    except Exception:
        args = {}
    try:
        rows = calc.load_rows(dump)
        S = calc.build_series(rows)
        out = qc.run(build_frame, EXTRA, S, fn, args)
    except Exception as e:
        out = {'status': 'erro', 'motivo': str(e)}
    # UTF-8 direto no buffer — o console Windows (cp1252) quebraria fora do pygen.
    sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False).encode('utf-8'))


if __name__ == '__main__':
    main()
