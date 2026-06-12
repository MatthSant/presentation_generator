"""query_api — consultas sob demanda do modo FUNDO do debriefing de lançamento.

Eixo parametrizável (canal/temperatura/semana). As consultas genéricas (series,
correlacao, trend, ranking) vêm de common.query_core e operam sobre o FRAME montado
em build_frame() para a dimensão escolhida. O modelo decide O QUE olhar; aqui só
calcula e devolve agregados.

CLI:  py -3 query_api.py <config.json> <dump.csv> <fn> <args.json>
saída (1 linha JSON): {"status":"ok","table":{dims,filters,rows},"summary":...} | nao_disponivel | erro
"""
import sys
import os
import json

_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _here)
sys.path.insert(0, os.path.dirname(_here))
import calc  # noqa: E402
import common.query_core as qc  # noqa: E402

METRICS = ['leads', 'vendas', 'conv', 'qual', 'fat', 'invest', 'roas', 'cpl', 'fpl']
LABELS = {'leads': 'Leads', 'vendas': 'Vendas', 'conv': 'Conversão', 'qual': 'Qualificação',
          'fat': 'Faturamento', 'invest': 'Investimento', 'roas': 'ROAS', 'cpl': 'CPL', 'fpl': 'Fat/lead'}
COST = {'cpl'}


def build_frame(M, a):
    """Eixo = dimensão escolhida (canal | temperatura | semana)."""
    dim = a.get('dimensao', 'canal')
    if dim == 'temperatura':
        rows = [{'key': t['temp'], 'm': {'leads': t['leads'], 'invest': t['inv'], 'fat': t['fat'],
                                         'roas': t['roas'], 'vendas': t['vendas'], 'conv': t['conv'], 'qual': t['qual']}}
                for t in M['temp']]
        labs = {k: LABELS[k] for k in ['leads', 'invest', 'fat', 'roas', 'vendas', 'conv', 'qual']}
    elif dim == 'semana':
        rows = [{'key': f"S{w['snum']}", 'm': {'leads': w['leads'], 'vendas': w['vendas'], 'conv': w['conv'],
                                               'qual': w['qual'], 'cpl': w['cpl'], 'fpl': w['fpl']}}
                for w in M['weekly']]
        labs = {k: LABELS[k] for k in ['leads', 'vendas', 'conv', 'qual', 'cpl', 'fpl']}
    else:
        rows = [{'key': c['canal'], 'm': {'leads': c['leads'], 'vendas': c['vendas'], 'conv': c['conv'],
                                          'qual': c['qual'], 'fat': c['fat']}}
                for c in M['chan']]
        labs = {k: LABELS[k] for k in ['leads', 'vendas', 'conv', 'qual', 'fat']}
    return {'axis': dim, 'rows': rows, 'labels': labs, 'cost': {m: (m in COST) for m in labs}}


EXTRA = {}


def main():
    if len(sys.argv) < 5:
        print(json.dumps({'status': 'erro', 'motivo': 'uso: query_api.py config dump fn args'}))
        return
    cfg_path, dump, fn, args_json = sys.argv[1:5]
    try:
        args = json.loads(args_json) if args_json else {}
    except Exception:
        args = {}
    try:
        config = json.load(open(cfg_path, encoding='utf-8')) if os.path.exists(cfg_path) else {}
        rows = calc.load_rows(dump)
        M = calc.build(rows, config)
        out = qc.run(build_frame, EXTRA, M, fn, args)
    except Exception as e:
        out = {'status': 'erro', 'motivo': str(e)}
    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    main()
