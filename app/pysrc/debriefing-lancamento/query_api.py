"""query_api — consultas sob demanda do modo FUNDO do debriefing de lançamento.

Eixo parametrizável (escopo|canal|temperatura|campanha|criativo|publico|semana). As
consultas genéricas (series, correlacao, trend, ranking, …) vêm de common.query_core e
operam sobre o FRAME montado em build_frame() para a dimensão escolhida. Funções
específicas: atingimento (realizado×meta), cruzar_dia (dia×dimensão), decomposicao
(CPL/CPMQL em fatores) e onde_concentra (drill-down de atribuição). O modelo decide O
QUE olhar; aqui só calcula e devolve agregados (nunca número inventado).

CLI:  py -3 query_api.py <config.json> <dump.csv> <fn> <args.json>
saída (1 linha JSON): {"status":"ok","table":{dims,filters,rows},"summary":...} | nao_disponivel | erro
"""
import sys
import os
import json
import math

_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _here)
sys.path.insert(0, os.path.dirname(_here))
import calc  # noqa: E402
import common.query_core as qc  # noqa: E402


def _media_days(rows):
    """Dias com mídia paga de captação (invest>0) — usado p/ podar a cauda pós-
    lançamento (mídia desligada) em séries temporais quando so_midia=sim."""
    return {calc._date(r) for r in rows
            if r.get('_camp') == 'captacao' and calc.fnum(r.get('invest_total')) > 0 and calc._date(r)}


def _week_rows(rows):
    """Linhas agrupadas por semana da campanha (S1, S2, …) com KPIs completos —
    início = 1º dia com tração (leads > 5), como no relatório semanal."""
    dated = [(calc._dt(calc._date(r)), r) for r in rows if calc._dt(calc._date(r))]
    if not dated:
        return []
    start = min((d for d, r in dated if calc.fnum(r.get('leads')) > 5), default=min(d for d, _ in dated))
    buck = {}
    for d, r in dated:
        sn = max(1, (d - start).days // 7 + 1)
        buck.setdefault(sn, []).append(r)
    out = []
    for sn in sorted(buck):
        m = calc._derive(buck[sn])
        out.append({'key': f'S{sn}', 'm': {k: m.get(k) for k in calc.FRAME_METRICS}})
    return out


def build_frame(B, a):
    """Eixo parametrizável: escopo | canal | temperatura | campanha | criativo | publico
    | semana | dia. `recorte_*` filtra as linhas antes (escopo/temperatura/canal/criativo/
    publico/campanha) — ex.: ROAS por temperatura só do canal X. `incluir_geral=sim`
    acrescenta a linha 'Geral' (valor global ponderado, não a soma dos grupos)."""
    dim = a.get('dimensao', 'canal')
    geral = str(a.get('incluir_geral', '')).lower() in ('sim', 'true', '1')
    filtro = {k: a[k2] for k, k2 in (('escopo', 'recorte_escopo'), ('temperatura', 'recorte_temperatura'),
                                     ('canal', 'recorte_canal'), ('criativo', 'recorte_criativo'),
                                     ('publico', 'recorte_publico'), ('campanha', 'recorte_campanha')) if a.get(k2)}
    src = B.get('_rows') or []
    # so_midia: nas séries temporais, poda a cauda pós-lançamento (dias sem mídia paga)
    # que distorce a leitura de custo/saturação (ex.: trend de leads caindo p/ "-100%").
    if dim in ('dia', 'semana') and str(a.get('so_midia', '')).lower() in ('sim', 'true', '1'):
        md = _media_days(src)
        src = [r for r in src if calc._date(r) in md]
    if dim == 'semana' and not filtro:
        rows = _week_rows(src)
        if geral and rows:
            g = calc._derive(src)
            rows.append({'key': 'Geral', 'm': {m: g.get(m) for m in calc.FRAME_METRICS}})
    else:
        rows = calc.frame_rows(src, dim, filtro, incluir_geral=geral)
    if not rows:
        return {'status': 'nao_disponivel', 'motivo': f'sem dados para dimensão={dim} com esse recorte'}
    return {
        'axis': dim,
        'rows': rows,
        'labels': {m: calc.LABELS.get(m, m) for m in calc.FRAME_METRICS},
        'cost': {m: (m in calc.COST) for m in calc.FRAME_METRICS},
        # ranking sempre mostra o VOLUME ao lado → a IA não cita taxa/ROAS de um grupo
        # com amostra mínima (ex.: ROAS altíssimo com 1 venda) como se fosse relevante.
        'rank_extra': ['leads', 'vendas', 'invest'],
    }


def atingimento(M, _a):
    """Realizado × meta × gap por indicador GLOBAL. A meta mora aqui (o build_frame é
    cross-tab e não a carrega) — serve 'a meta foi atingida? onde ficou o gap?'. As
    métricas de custo (CPL/CPMQL) atingem a meta quando ficam ABAIXO dela."""
    G = M.get('goals') or {}
    spec = [('vendas', 'Vendas', M.get('vendas_total')), ('leads', 'Leads', M.get('leads_total')),
            ('fat', 'Faturamento', M.get('fat')), ('qual', 'Qualificação', M.get('qual')),
            ('cpl', 'CPL', M.get('cpl')), ('cpmql', 'CPMQL', M.get('cpmql'))]
    rows = []
    for key, lab, val in spec:
        meta = G.get(key)
        row = {'indicador': lab, 'Realizado': round(val, 2) if isinstance(val, (int, float)) else None}
        if meta:
            row['Meta'] = round(meta, 2)
            row['Gap'] = round((val or 0) - meta, 2)
            row['Atingimento'] = round((val or 0) / meta * 100, 1)
        rows.append(row)
    if not any('Meta' in r for r in rows):
        return {'status': 'nao_disponivel', 'motivo': 'sem metas configuradas na base'}
    nota = ' As metas existem só no nível GLOBAL — não há meta por canal/temperatura/criativo.' if _a.get('dimensao') else ''
    return {'status': 'ok', 'table': {'dims': ['indicador'], 'filters': [], 'rows': rows},
            'summary': 'Realizado vs meta da campanha (Gap absoluto e Atingimento %).' + nota}


def cruzar_dia(B, a):
    """UMA métrica por DIA × dimensão (escopo|canal|temperatura|criativo|publico|campanha),
    em formato LONG (colunas dia/serie/valor) → habilita UM gráfico multi-linha (bind
    x="dia", series="serie", y="valor"), uma linha por grupo. Use NO LUGAR de vários
    gráficos quando comparar o MESMO indicador entre grupos ao longo do tempo (saturação,
    CPL por temperatura ao longo do lançamento, etc.)."""
    metric = a.get('metrica', 'cpl')
    dim = a.get('dimensao', 'temperatura')
    if metric not in calc.FRAME_METRICS:
        return qc.nao_disp(f"métrica '{metric}' inválida")
    if dim not in ('escopo', 'canal', 'temperatura', 'criativo', 'publico', 'campanha'):
        return qc.nao_disp("dimensao deve ser escopo, canal, temperatura, criativo, publico ou campanha")
    src = B.get('_rows') or []
    if str(a.get('so_midia', '')).lower() in ('sim', 'true', '1'):
        md = _media_days(src)
        src = [r for r in src if calc._date(r) in md]
    cells = calc.cross_dia(src, dim)
    rows = [{'dia': c['dia'], 'serie': c['serie'], 'valor': qc.rnd(c['m'].get(metric))}
            for c in cells if c['m'].get(metric) is not None]
    series = sorted({r['serie'] for r in rows})
    if len(rows) < 2 or len(series) < 1:
        return qc.nao_disp(f'sem dados p/ {metric} por dia × {dim}')
    lab = calc.LABELS.get(metric, metric)
    return qc.ok(rows, ['dia', 'serie'],
                 f'{lab} por dia × {dim} (long: dia/serie/valor — bind x="dia", series="serie", y="valor") — {len(series)} séries: {", ".join(series)}.')


def _windows(B, n=3):
    """Janela inicial × final do lançamento (dias com mídia paga de captação). Janela
    adaptativa: ~20% dos dias de cada ponta (mín. n) — para 'a eficiência deteriorou ao
    longo do lançamento?' (saturação) sem ruído de 1 dia."""
    rows = B.get('_rows') or []
    paid = sorted({calc._date(r) for r in rows
                   if r.get('_camp') == 'captacao' and calc.fnum(r.get('invest_total')) > 0 and calc._date(r)})
    base = paid or sorted({calc._date(r) for r in rows if calc._date(r)})
    if len(base) < 4:
        return None, None
    k = min(max(n, round(len(base) * 0.2)), len(base) // 2)
    ini_d, rec_d = set(base[:k]), set(base[-k:])
    return ([r for r in rows if calc._date(r) in ini_d],
            [r for r in rows if calc._date(r) in rec_d])


def decomposicao(B, a):
    """Decompõe a variação de CPL ou CPMQL (início → fim do lançamento) nos seus
    FATORES, com a contribuição de cada um — atribuição PRONTA E AUDITÁVEL (a IA não
    faz a álgebra na mão). Identidades (constantes cancelam no log):
      CPL  ∝ CPM ÷ (CTR × Connect × Conv.Página)   → ΔlnCPL = ΔlnCPM −ΔlnCTR −ΔlnConnect −ΔlnConv
      CPMQL = CPL ÷ Taxa de Qualidade (paga)        → ΔlnCPMQL = ΔlnCPL −ΔlnTaxaQual
    Compara a janela inicial com a final do lançamento (dias com mídia de captação)."""
    metric = a.get('metrica', 'cpl')
    if metric not in ('cpl', 'cpmql'):
        return qc.nao_disp("decomposicao só para 'cpl' ou 'cpmql'")
    ini_rows, rec_rows = _windows(B)
    if ini_rows is None:
        return qc.nao_disp('série de mídia curta demais p/ decompor (mín. ~4 dias com captação)')
    ini, rec = calc._derive(ini_rows), calc._derive(rec_rows)

    LAB = {'cpm': 'CPM', 'ctr': 'CTR', 'connect': 'Connect Rate', 'conv_pag': 'Conv. de Página',
           'cpl': 'CPL', 'cpmql': 'CPMQL', 'qual_pago': 'Taxa de Qualidade (paga)'}
    if metric == 'cpl':
        has_pv = any(calc.fnum(r.get('pageviews')) for r in (B.get('_rows') or []))
        factors = [('cpm', +1), ('ctr', -1)] + ([('connect', -1)] if has_pv else []) + [('conv_pag', -1)]
    else:
        factors = [('cpl', +1), ('qual_pago', -1)]

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
    summary = (f'{LAB[metric]} variou {var_total:+.0f}% (início {qc.rnd(ini[metric])} → fim '
               f'{qc.rnd(rec[metric])}). Contribuição por fator em % da variação'
               + (f' (resíduo {resid:+.0f}%)' if abs(resid) >= 5 else '') + '. Maior contribuinte = a alavanca.')
    return qc.ok(rows, ['Fator'], summary)


def _concentra(ini_rows, rec_rows, dim, metric, is_cost):
    """Para uma dimensão: como cada item moveu (início→fim) e se a piora é CONCENTRADA
    num item ou AMPLA (quase todos). Contribuição ponderada por volume de leads."""
    fi = {x['key']: x['m'] for x in calc.frame_rows(ini_rows, dim)}
    fr = {x['key']: x['m'] for x in calc.frame_rows(rec_rows, dim)}
    # item no início e AUSENTE no fim = provavelmente DESLIGADO (não "piorou pra zero");
    # presente só no fim = NOVO. Nenhum conta como piora (a piora só olha quem tem dado
    # nas DUAS janelas) — mas reportamos p/ a IA interpretar ("pausaram os ruins").
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
    # nível). CONCENTRADO = só uma MINORIA do volume piora, mas 1 item domina o agregado.
    if n == 1:
        verdict = 'inconclusivo (1 item só)'
    elif vol_worse >= 0.6:
        verdict = 'amplo'
    elif vol_worse <= 0.4 and top['piorou'] and top_share >= 0.4:
        verdict = 'concentrado'
    else:
        verdict = 'misto'
    for it in items:
        it.pop('_contrib', None)
    return {'dim': dim, 'n': n, 'verdict': verdict, 'top_item': top['item'],
            'top_share_%': qc.rnd(top_share * 100, 0), 'vol_pior_%': qc.rnd(vol_worse * 100, 0),
            'pausados': len(pausados), 'novos': len(novos), 'itens': items[:6]}


# ordem do drill-down (fino → grosso → ortogonais); uniforme em tudo = GLOBAL
_DRILL = ['criativo', 'publico', 'campanha', 'canal', 'temperatura']


def onde_concentra(B, a):
    """DRILL-DOWN de atribuição: para a métrica que piorou ao longo do lançamento, acha
    ONDE o impacto se concentra. Varre criativo → publico → campanha → canal →
    temperatura: se um item DOMINA a piora num nível, é a causa; se a piora é AMPLA
    (quase todos pioram), sobe de nível; se uniforme em tudo → GLOBAL (mídia/leilão/
    sazonalidade/estrutural). 1 item num nível é inconclusivo (testa o próximo). A IA
    reporta o veredito e ARGUMENTA."""
    metric = a.get('metrica', 'cpl')
    if metric not in calc.FRAME_METRICS:
        return qc.nao_disp(f"métrica '{metric}' inválida")
    ini_rows, rec_rows = _windows(B)
    if ini_rows is None:
        return qc.nao_disp('série de mídia curta demais p/ atribuir (mín. ~4 dias com captação)')
    is_cost = metric in calc.COST
    niveis = [_concentra(ini_rows, rec_rows, d, metric, is_cost) for d in _DRILL]
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
            'summary': f'Atribuição de {calc.LABELS.get(metric, metric)} (início→fim do lançamento). {conclusao}',
            'detalhe': {lv['dim']: lv.get('itens') for lv in niveis}}


EXTRA = {'atingimento': atingimento, 'cruzar_dia': cruzar_dia,
         'decomposicao': decomposicao, 'onde_concentra': onde_concentra}


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
        M = calc.build(rows, config)
        out = qc.run(build_frame, EXTRA, M, fn, args)
    except Exception as e:
        out = {'status': 'erro', 'motivo': str(e)}
    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    main()
