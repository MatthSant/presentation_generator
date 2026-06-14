"""query_api — consultas sob demanda do modo FUNDO do acompanhamento de lançamento.

Eixo = dia da campanha; métricas = KPIs diários derivados pelo calc. As consultas
genéricas (series, correlacao, trend, ranking) vêm de common.query_core e operam
sobre o FRAME montado em build_frame(). O modelo decide O QUE olhar; aqui só
calcula e devolve agregados (nunca número inventado).

CLI:  py -3 query_api.py <config.json> <dump.csv> <fn> <args.json>
saída (1 linha JSON): {"status":"ok","table":{dims,filters,rows},"summary":...} | nao_disponivel | erro
"""
import sys
import os
import json

_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _here)
sys.path.insert(0, os.path.dirname(_here))   # pysrc/ → pacote common
import calc  # noqa: E402
import common.query_core as qc  # noqa: E402

# Métricas diárias disponíveis para cruzamento (eixo = dia).
METRICS = ['leads', 'investimento', 'cpl', 'cpmql', 'taxa_resp', 'taxa_qual',
           'conv_pag', 'cpm', 'ctr', 'hook', 'hold', 'connect']
COST = {'cpl', 'cpmql', 'cpm'}


def build_frame(B, a):
    """Eixo parametrizável: dia (default) | temperatura | canal | origem. `recorte_*`
    (origem/temperatura/canal) filtra as linhas antes — ex.: CPL por dia só do Quente."""
    dim = a.get('dimensao', 'dia')
    filtro = {k: a[k2] for k, k2 in (('origem', 'recorte_origem'), ('temperatura', 'recorte_temperatura'),
                                     ('canal', 'recorte_canal')) if a.get(k2)}
    if dim == 'dia' and not filtro:
        rows = [{'key': d['label'], 'm': {m: d.get(m) for m in METRICS}} for d in B['days']]
    else:
        rows = calc.frame_rows(B['rows_corte'], dim, filtro, B.get('trules'))
    if not rows:
        return {'status': 'nao_disponivel', 'motivo': f'sem dados para dimensão={dim} com esse recorte'}
    return {
        'axis': dim,
        'rows': rows,
        'labels': {m: calc.LABELS.get(m, m) for m in METRICS},
        'cost': {m: (m in COST) for m in METRICS},
    }


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
        B = calc.build(rows, config)
        out = qc.run(build_frame, EXTRA, B, fn, args)
    except Exception as e:
        out = {'status': 'erro', 'motivo': str(e)}
    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    main()
