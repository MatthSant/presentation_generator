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

# Métricas diárias disponíveis para cruzamento (eixo = dia). Dependem da MECÂNICA:
# no pago o que se cruza é caixa, CAC, ROAS e order bump — CPL/CPMQL nem existem.
METRICS = calc.FRAME_METRICS
METRICS_PAGO = calc.FRAME_METRICS_PAGO
COST = {'cpl', 'cpmql', 'cpm', 'custo_ing_pago', 'custo_ing_geral'}


def build_frame(ctx, a):
    """Eixo parametrizável: dia (default) | temperatura | canal | origem. `recorte_*`
    (origem/temperatura/canal) filtra as linhas antes — ex.: CPL por dia só do Quente."""
    dim = a.get('dimensao', 'dia')
    pago = bool(ctx.get('pago'))
    mets = METRICS_PAGO if pago else METRICS
    filtro = {k: a[k2] for k, k2 in (('origem', 'recorte_origem'), ('temperatura', 'recorte_temperatura'),
                                     ('canal', 'recorte_canal'), ('criativo', 'recorte_criativo'),
                                     ('publico', 'recorte_publico'), ('campanha', 'recorte_campanha'),
                                     ('dia', 'recorte_dia')) if a.get(k2)}
    geral = str(a.get('incluir_geral', '')).lower() in ('sim', 'true', '1')
    days, src = ctx['days'], ctx['rows_corte']
    # so_midia: poda dias sem mídia paga (investimento=0) — ex.: cauda pós-captação onde
    # leads orgânicos residuais distorcem CPL/custo (CPL "+1714%" virando ruído).
    if str(a.get('so_midia', '')).lower() in ('sim', 'true', '1'):
        keep = {d['date'] for d in days if (d.get('investimento') or 0) > 0}
        days = [d for d in days if d['date'] in keep]
        src = [r for r in src if calc._date(r) in keep]
    if dim == 'dia' and not filtro:
        rows = [{'key': d['label'], 'm': {m: d.get(m) for m in mets}} for d in days]
    else:
        rows = calc.frame_rows(src, dim, filtro, ctx.get('trules'), incluir_geral=geral, pago=pago)
    if not rows:
        return {'status': 'nao_disponivel', 'motivo': f'sem dados para dimensão={dim} com esse recorte'}
    return {
        'axis': dim,
        'rows': rows,
        'labels': {m: calc.LABELS.get(m, m) for m in mets},
        'cost': {m: (m in COST) for m in mets},
        # ranking sempre mostra o VOLUME ao lado → a IA não cita taxa de criativo/grupo
        # com amostra mínima (ex.: 100% de qualidade com 1 lead) como se fosse relevante.
        'rank_extra': (['ingressos', 'investimento'] if pago else ['leads', 'investimento']),
    }


def cruzar_dia(B, a):
    """UMA métrica por DIA × dimensão (temperatura|canal|origem), em formato LONG
    (colunas dia/serie/valor) → habilita UM gráfico multi-linha (bind x="dia",
    series="serie", y="valor"), uma linha por grupo. Use NO LUGAR de vários gráficos
    separados quando comparar o MESMO indicador entre grupos ao longo do tempo."""
    pago = bool(B.get('pago'))
    mets = METRICS_PAGO if pago else METRICS
    metric = a.get('metrica', 'custo_ing_pago' if pago else 'cpl')
    dim = a.get('dimensao', 'temperatura')
    if metric not in mets:
        return qc.nao_disp(f"métrica '{metric}' inválida")
    if dim not in ('temperatura', 'canal', 'origem', 'criativo', 'publico', 'campanha'):
        return qc.nao_disp("dimensao deve ser temperatura, canal, origem, criativo, publico ou campanha")
    src, days = B['rows_corte'], B['days']
    if str(a.get('so_midia', '')).lower() in ('sim', 'true', '1'):   # poda cauda sem mídia paga
        keep = {d['date'] for d in days if (d.get('investimento') or 0) > 0}
        src = [r for r in src if calc._date(r) in keep]
        days = [d for d in days if d['date'] in keep]
    cells = calc.cross_dia(src, dim, B.get('trules'), pago=pago)
    rows = [{'dia': c['dia'], 'serie': c['serie'], 'valor': qc.rnd(c['m'].get(metric))}
            for c in cells if c['m'].get(metric) is not None]
    # série "Geral" opcional = valor GLOBAL por dia (do B['days'], mesmo do relatório) →
    # mantém o KPI de variação consistente com a linha geral do gráfico (sem misturar agregados).
    if str(a.get('incluir_geral', '')).lower() in ('sim', 'true', '1'):
        rows += [{'dia': d['label'], 'serie': 'Geral', 'valor': qc.rnd(d.get(metric))}
                 for d in days if d.get(metric) is not None]
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
    pago = bool(B.get('pago'))
    metric = a.get('metrica', 'custo_ing_pago' if pago else 'cpl')
    validas = ('custo_ing_pago',) if pago else ('cpl', 'cpmql')
    if metric not in validas:
        return qc.nao_disp(f"decomposicao só para {' ou '.join(repr(v) for v in validas)}")
    _mk = 'custo_ing_pago' if pago else 'cpl'
    days = [d for d in B['days'] if d.get(_mk) is not None]   # dias com mídia paga
    if len(days) < 4:
        return qc.nao_disp('série de mídia curta demais p/ decompor (mín. ~4 dias)')
    n = min(3, len(days) // 2)
    ini = calc.derive(_merge_sums(days[:n]), pago)
    rec = calc.derive(_merge_sums(days[-n:]), pago)

    LAB = {'cpm': 'CPM', 'ctr': 'CTR', 'connect': 'Connect Rate', 'conv_pag': 'Conv. de Página',
           'cpl': 'CPL', 'cpmql': 'CPMQL', 'taxa_qual': 'Taxa de Qualidade',
           'custo_ing_pago': 'CAC'}
    if metric in ('cpl', 'custo_ing_pago'):
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


def _windows(B, n=3):
    """Janela inicial (n primeiros dias COM mídia) × final (n últimos)."""
    days = [d for d in B['days'] if d.get('cpl') is not None]
    if len(days) < 4:
        return None, None
    k = min(n, len(days) // 2)
    ini_d = {d['date'] for d in days[:k]}
    rec_d = {d['date'] for d in days[-k:]}
    rows = B.get('rows_corte') or []
    return ([r for r in rows if calc._date(r) in ini_d],
            [r for r in rows if calc._date(r) in rec_d])


def _concentra(ini_rows, rec_rows, dim, metric, trules, is_cost):
    """Para uma dimensão: como cada item moveu (início→recente) e se a piora é
    CONCENTRADA num item ou AMPLA (quase todos). Contribuição ponderada por volume."""
    fi = {x['key']: x['m'] for x in calc.frame_rows(ini_rows, dim, None, trules)}
    fr = {x['key']: x['m'] for x in calc.frame_rows(rec_rows, dim, None, trules)}
    # item no início e AUSENTE no recente = provavelmente DESLIGADO (não "piorou pra zero");
    # presente só no recente = NOVO. Nenhum dos dois conta como piora (a piora só olha quem
    # tem dado nas DUAS janelas) — mas reportamos p/ a IA interpretar ("pausaram os ruins").
    pausados = [k for k in fi if k not in fr and (fi[k].get('leads') or 0) > 0]
    novos = [k for k in fr if k not in fi and (fr[k].get('leads') or 0) > 0]
    tot_leads = sum((fr[k].get('leads') or 0) for k in fr) or 1.0
    items = []
    for k, m in fr.items():
        mr, mi, vol = m.get(metric), fi.get(k, {}).get(metric), (m.get('leads') or 0)
        if not (isinstance(mr, (int, float)) and isinstance(mi, (int, float)) and mr > 0 and mi > 0):
            continue
        dln = math.log(mr / mi)
        worse = (dln > 0) if is_cost else (dln < 0)
        items.append({'item': k, 'inicio': qc.rnd(mi), 'recente': qc.rnd(mr),
                      'var_pct': qc.rnd((mr / mi - 1) * 100, 1), 'leads': round(vol),
                      'piorou': worse, '_contrib': (vol / tot_leads) * dln})
    if not items:
        return {'dim': dim, 'n': 0, 'verdict': 'sem dado', 'pausados': len(pausados), 'novos': len(novos)}
    items.sort(key=lambda it: -abs(it['_contrib']))
    sum_abs = sum(abs(it['_contrib']) for it in items) or 1e-9
    top = items[0]
    top_share = abs(top['_contrib']) / sum_abs
    vol_worse = sum(it['leads'] for it in items if it['piorou']) / tot_leads
    n = len(items)
    # O sinal decisivo é QUANTO volume piorou: se a maioria piora, é AMPLO (sobe de
    # nível), por maior que seja o top (ele só pesa por ser grande). CONCENTRADO = só uma
    # MINORIA do volume piora, mas puxa o agregado (top domina entre os que pioraram).
    if n == 1:
        verdict = 'inconclusivo (1 item só)'
    elif vol_worse >= 0.6:
        verdict = 'amplo'                       # maioria do volume piora → não é este nível
    elif vol_worse <= 0.4 and top['piorou'] and top_share >= 0.4:
        verdict = 'concentrado'                 # poucos pioram e 1 domina → é este nível
    else:
        verdict = 'misto'
    for it in items:
        it.pop('_contrib', None)
    return {'dim': dim, 'n': n, 'verdict': verdict, 'top_item': top['item'],
            'top_share_%': qc.rnd(top_share * 100, 0), 'vol_pior_%': qc.rnd(vol_worse * 100, 0),
            'pausados': len(pausados), 'novos': len(novos), 'itens': items[:6]}


# ordem do drill-down (fino → grosso → ortogonais); global = uniforme em tudo
_DRILL = ['criativo', 'publico', 'campanha', 'canal', 'temperatura']


def onde_concentra(B, a):
    """DRILL-DOWN de atribuição: para a métrica que piorou, acha ONDE o impacto se
    concentra. Varre criativo → publico → campanha → canal → temperatura: se um item
    DOMINA a piora num nível, é a causa; se a piora é AMPLA (quase todos pioram), sobe
    de nível; se uniforme em tudo → GLOBAL (mídia/leilão/sazonalidade/estrutural). 1 item
    num nível é inconclusivo (testa o próximo). A IA reporta o veredito e ARGUMENTA."""
    metric = a.get('metrica', 'cpl')
    if metric not in METRICS:
        return qc.nao_disp(f"métrica '{metric}' inválida")
    ini_rows, rec_rows = _windows(B)
    if ini_rows is None:
        return qc.nao_disp('série de mídia curta demais p/ atribuir (mín. ~4 dias)')
    is_cost = metric in COST
    trules = B.get('trules')
    niveis = [_concentra(ini_rows, rec_rows, d, metric, trules, is_cost) for d in _DRILL]
    causa = next((lv for lv in niveis if lv['verdict'] == 'concentrado'), None)
    if causa:
        conclusao = f"Concentra em {causa['dim']} = '{causa['top_item']}' ({causa['top_share_%']:.0f}% da piora)."
    else:
        conclusao = 'Piora AMPLA/uniforme em todos os níveis → causa GLOBAL (mídia/leilão/sazonalidade/estrutural), não um recorte específico.'
    rows = [{'nível': lv['dim'], 'veredito': lv['verdict'],
             'item que mais pesa': lv.get('top_item'), 'peso do top %': lv.get('top_share_%'),
             '% volume que piorou': lv.get('vol_pior_%'), 'itens': lv['n'],
             'pausados': lv.get('pausados', 0), 'novos': lv.get('novos', 0)} for lv in niveis]
    return {'status': 'ok', 'table': {'dims': ['nível'], 'filters': [], 'rows': rows},
            'summary': f'Atribuição de {calc.LABELS.get(metric, metric)} (início→recente). {conclusao}',
            'detalhe': {lv['dim']: lv.get('itens') for lv in niveis}}


EXTRA = {'cruzar_dia': cruzar_dia, 'decomposicao': decomposicao, 'onde_concentra': onde_concentra}


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
    # UTF-8 direto no buffer — o console Windows (cp1252) quebraria fora do pygen.
    sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False).encode('utf-8'))


if __name__ == '__main__':
    main()
