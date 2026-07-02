"""query_api — consultas sob demanda do modo FUNDO de criativos.

O modelo decide O QUE olhar; este script CALCULA e devolve SÓ AGREGADOS (nunca linha
bruta). Recortes que o dado não suporta → {"status":"nao_disponivel", ...}, jamais
número inventado.

As consultas genéricas (series, correlacao, trend, ranking) vêm de common.query_core
e operam sobre o FRAME montado em build_frame(). Aqui ficam só as específicas de
criativos (por_temperatura, saturacao_diaria, benchmark_gap).

CLI:  py -3 query_api.py <config.json> <dump.csv> <fn> <args.json>
saída (1 linha JSON): {"status":"ok","table":{dims,filters,rows},"summary":...}
                      | {"status":"nao_disponivel","motivo":...} | {"status":"erro","motivo":...}
"""
import sys
import os
import json

_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _here)
sys.path.insert(0, os.path.dirname(_here))  # pysrc/ -> pacote common
import calc  # noqa: E402
import common.query_core as qc  # noqa: E402

# Rótulo legível por métrica (vira cabeçalho de coluna nas tabelas).
_LABEL = {
    'roas': 'ROAS', 'retorno': 'Retorno', 'cpl': 'CPL', 'cpmql': 'CPMQL', 'cpm': 'CPM',
    'ctr': 'CTR', 'hook_rate': 'Hook', 'hold_rate': 'Hold', 'connect_rate': 'ConnRate',
    'conv_pagina': 'Conv.Pág', 'qualidade': 'Qualid.', 'tx_resposta': 'Tx.Resp',
    'conv': 'Tx.Conv', 'cac': 'CAC', 'leads': 'Leads', 'invest': 'Invest.',
}


def _r(v, d=4):
    return round(v, d) if isinstance(v, (int, float)) else None


def build_frame(ctx, _a):
    """Eixo = criativo válido; métricas = catálogo _LABEL já calculado por criativo."""
    return {
        'axis': 'criativo',
        'rows': [{'key': c['name'], 'm': c['m']} for c in ctx['valid']],
        'labels': _LABEL,
        'cost': {k: (calc.METRICS.get(k, {}).get('cost') is True) for k in _LABEL},
        'rank_extra': ['roas', 'cpl', 'qualidade', 'leads'],
    }


def por_temperatura(B, a):
    # Devolve TODAS as métricas por temperatura (uma coluna cada) — assim o modelo
    # monta tabela/gráfico com qualquer recorte sem cair em coluna inexistente. O
    # arg 'metrica' (opcional) só ordena a leitura/summary, não restringe colunas.
    rows_all, produto = B['_rows'], B['produto']
    temps = calc._distinct(rows_all, 'temperatura_lead')
    if not temps:
        return {'status': 'nao_disponivel', 'motivo': 'não há dado de temperatura (coluna temperatura_lead vazia)'}
    out = []
    for t in temps:
        sub = [r for r in rows_all if (r.get('temperatura_lead') or '').strip() == t]
        M = calc.metrics(sub, produto)
        row = {'temperatura': t}
        for k, lab in _LABEL.items():
            v = M.get(k)
            if v is not None:
                row[lab] = _r(v, 2)
        if len(row) > 1:
            out.append(row)
    if not out:
        return {'status': 'nao_disponivel', 'motivo': 'sem valores por temperatura'}
    return {'status': 'ok', 'table': {'dims': ['temperatura'], 'filters': [], 'rows': out},
            'summary': f'Métricas por temperatura do lead ({len(out)} faixas).'}


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


def benchmark_gap(B, _a):
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


EXTRA = {'por_temperatura': por_temperatura, 'saturacao_diaria': saturacao_diaria, 'benchmark_gap': benchmark_gap}


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
        B = calc.build(rows, {}, {})
        B['_rows'] = rows
        out = qc.run(build_frame, EXTRA, B, fn, args)
    except Exception as e:
        out = {'status': 'erro', 'motivo': str(e)}
    # UTF-8 direto no buffer — o console Windows (cp1252) quebraria fora do pygen.
    sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False).encode('utf-8'))


if __name__ == '__main__':
    main()
