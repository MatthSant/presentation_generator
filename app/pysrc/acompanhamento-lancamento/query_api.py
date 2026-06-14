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
import math

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
                                     ('canal', 'recorte_canal'), ('criativo', 'recorte_criativo'),
                                     ('publico', 'recorte_publico'), ('campanha', 'recorte_campanha')) if a.get(k2)}
    geral = str(a.get('incluir_geral', '')).lower() in ('sim', 'true', '1')
    if dim == 'dia' and not filtro:
        rows = [{'key': d['label'], 'm': {m: d.get(m) for m in METRICS}} for d in B['days']]
    else:
        rows = calc.frame_rows(B['rows_corte'], dim, filtro, B.get('trules'), incluir_geral=geral)
    if not rows:
        return {'status': 'nao_disponivel', 'motivo': f'sem dados para dimensão={dim} com esse recorte'}
    return {
        'axis': dim,
        'rows': rows,
        'labels': {m: calc.LABELS.get(m, m) for m in METRICS},
        'cost': {m: (m in COST) for m in METRICS},
        # ranking sempre mostra o VOLUME ao lado → a IA não cita taxa de criativo/grupo
        # com amostra mínima (ex.: 100% de qualidade com 1 lead) como se fosse relevante.
        'rank_extra': ['leads', 'investimento'],
    }


def cruzar_dia(B, a):
    """UMA métrica por DIA × dimensão (temperatura|canal|origem), em formato LONG
    (colunas dia/serie/valor) → habilita UM gráfico multi-linha (bind x="dia",
    series="serie", y="valor"), uma linha por grupo. Use NO LUGAR de vários gráficos
    separados quando comparar o MESMO indicador entre grupos ao longo do tempo."""
    metric = a.get('metrica', 'cpl')
    dim = a.get('dimensao', 'temperatura')
    if metric not in METRICS:
        return qc.nao_disp(f"métrica '{metric}' inválida")
    if dim not in ('temperatura', 'canal', 'origem', 'criativo', 'publico', 'campanha'):
        return qc.nao_disp("dimensao deve ser temperatura, canal, origem, criativo, publico ou campanha")
    cells = calc.cross_dia(B['rows_corte'], dim, B.get('trules'))
    rows = [{'dia': c['dia'], 'serie': c['serie'], 'valor': qc.rnd(c['m'].get(metric))}
            for c in cells if c['m'].get(metric) is not None]
    # série "Geral" opcional = valor GLOBAL por dia (do B['days'], mesmo do relatório) →
    # mantém o KPI de variação consistente com a linha geral do gráfico (sem misturar agregados).
    if str(a.get('incluir_geral', '')).lower() in ('sim', 'true', '1'):
        rows += [{'dia': d['label'], 'serie': 'Geral', 'valor': qc.rnd(d.get(metric))}
                 for d in B['days'] if d.get(metric) is not None]
    series = sorted({r['serie'] for r in rows})
    if len(rows) < 2 or len(series) < 1:
        return qc.nao_disp(f'sem dados p/ {metric} por dia × {dim}')
    lab = calc.LABELS.get(metric, metric)
    return qc.ok(rows, ['dia', 'serie'],
                 f'{lab} por dia × {dim} (long: dia/serie/valor — bind x="dia", series="serie", y="valor") — {len(series)} séries: {", ".join(series)}.')


def _merge_sums(days):
    s = {}
    for d in days:
        for k, v in (d.get('sums') or {}).items():
            s[k] = s.get(k, 0) + (v or 0)
    return s


def decomposicao(B, a):
    """Decompõe a variação de CPL ou CPMQL (início → últimos dias) nos seus FATORES,
    com a contribuição de cada um — atribuição PRONTA E AUDITÁVEL (a IA não faz a
    álgebra na mão). Identidades (constantes cancelam no log):
      CPL  ∝ CPM ÷ (CTR × Connect × Conv.Página)   → ΔlnCPL = ΔlnCPM −ΔlnCTR −ΔlnConnect −ΔlnConv
      CPMQL = CPL ÷ Taxa de Qualidade               → ΔlnCPMQL = ΔlnCPL −ΔlnTaxaQual
    Compara a janela inicial (3 primeiros dias com mídia) com a final (3 últimos)."""
    metric = a.get('metrica', 'cpl')
    if metric not in ('cpl', 'cpmql'):
        return qc.nao_disp("decomposicao só para 'cpl' ou 'cpmql'")
    days = [d for d in B['days'] if d.get('cpl') is not None]   # dias com mídia paga
    if len(days) < 4:
        return qc.nao_disp('série de mídia curta demais p/ decompor (mín. ~4 dias)')
    n = min(3, len(days) // 2)
    ini = calc.derive(_merge_sums(days[:n]))
    rec = calc.derive(_merge_sums(days[-n:]))

    LAB = {'cpm': 'CPM', 'ctr': 'CTR', 'connect': 'Connect Rate', 'conv_pag': 'Conv. de Página',
           'cpl': 'CPL', 'cpmql': 'CPMQL', 'taxa_qual': 'Taxa de Qualidade'}
    if metric == 'cpl':
        has_pv = bool(B.get('has_pageviews'))
        factors = [('cpm', +1), ('ctr', -1)] + ([('connect', -1)] if has_pv else []) + [('conv_pag', -1)]
    else:
        factors = [('cpl', +1), ('taxa_qual', -1)]

    tot = None
    if ini.get(metric) and rec.get(metric) and ini[metric] > 0 and rec[metric] > 0:
        tot = math.log(rec[metric] / ini[metric])
    if not tot:
        return qc.nao_disp(f'{metric} sem variação log-decomponível entre as janelas')

    rows = []
    soma_contrib = 0.0
    for key, sign in factors:
        a0, a1 = ini.get(key), rec.get(key)
        if not (isinstance(a0, (int, float)) and isinstance(a1, (int, float)) and a0 > 0 and a1 > 0):
            rows.append({'Fator': LAB[key], 'Início': qc.rnd(a0), 'Recente': qc.rnd(a1),
                         'Variação %': None, 'Contribuição p/ a variação %': None})
            continue
        dln = sign * math.log(a1 / a0)
        contrib = dln / tot * 100.0
        soma_contrib += contrib
        rows.append({'Fator': LAB[key], 'Início': qc.rnd(a0), 'Recente': qc.rnd(a1),
                     'Variação %': qc.rnd((a1 / a0 - 1) * 100, 1),
                     'Contribuição p/ a variação %': qc.rnd(contrib, 1)})
    var_total = round((rec[metric] / ini[metric] - 1) * 100, 1)
    resid = round(100 - soma_contrib, 1)
    summary = (f'{LAB[metric]} variou {var_total:+.0f}% (início {qc.rnd(ini[metric])} → recente '
               f'{qc.rnd(rec[metric])}). Contribuição por fator em % da variação'
               + (f' (resíduo {resid:+.0f}%)' if abs(resid) >= 5 else '') + '. Maior contribuinte = a alavanca.')
    return qc.ok(rows, ['Fator'], summary)


EXTRA = {'cruzar_dia': cruzar_dia, 'decomposicao': decomposicao}


def main():
    # saída sempre UTF-8 (os summaries têm →/×/acentos) — não depende do locale do host
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
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
