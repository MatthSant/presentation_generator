"""build_report — gerador da análise "histórico de lançamentos" (3 camadas do app).

`assemble(rows, config, content, opts)` (puro) devolve {dataset, data, layout, sections}.
`build(csv, config, content, out_dir)` carrega o CSV, chama assemble e grava.

opts = { launches?: [labels], metric?: 'conv'|'qual'|'reembolso' }:
  • launches → restringe a vista aos lançamentos selecionados (filtro reativo).
  • metric   → indicador do bloco "Evolução" do Panorama (4 gráficos de quebra).

Descritivo/determinístico; a IA (Insights) entra via `content`. A vista interativa
(pílulas de lançamento + toggle de métrica + outliers) recalcula chamando assemble
de novo no servidor (routes/historico.ts → render_view.py).
"""
import sys, os, json, datetime
_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _here)                    # irmãos (calc)
sys.path.insert(0, os.path.dirname(_here))   # pysrc/ → pacote common
import calc
from common.layout import Grid
from common.fmt import money, pctf, xf, intf, safe, fmtval
from common.preserve import preserve

LINE_COLORS = ['#4C1D95', '#7C3AED', '#3B82F6', '#0EA5E9', '#0D9488', '#10B981']
METRIC_LABELS = {'cpm': 'CPM', 'ctr': 'CTR', 'cpc': 'CPC', 'cpl': 'CPL', 'conv_paga': 'Conversão paga', 'cpa': 'CPA'}
METRIC_PCT = {'ctr': True, 'conv_paga': True}
METRIC_COST = {'cpm': True, 'cpc': True, 'cpl': True, 'cpa': True}
# toggle de indicador do Panorama — volume (R$/inteiro) + taxas (%) + ROAS (×)
BRK_INFO = {
    'conv':           {'label': 'Conversão',         'cost': False, 'fmt': 'pct'},
    'leads':          {'label': 'Leads',             'cost': False, 'fmt': 'int'},
    'investimento':   {'label': 'Investimento',      'cost': False, 'fmt': 'money'},
    'vendas':         {'label': 'Vendas',            'cost': False, 'fmt': 'int'},
    'faturamento':    {'label': 'Faturamento líq.',  'cost': False, 'fmt': 'money'},
    'qual':           {'label': 'Qualificação',      'cost': False, 'fmt': 'pct'},
    'taxa_qualidade': {'label': 'Taxa de qualidade', 'cost': False, 'fmt': 'pct'},
    'conv_mql':       {'label': 'Conversão de MQL',  'cost': False, 'fmt': 'pct'},
    'reembolso':      {'label': 'Reembolso',         'cost': True,  'fmt': 'pct'},
    'roas':           {'label': 'ROAS',              'cost': False, 'fmt': 'x'},
}


def assemble(rows, config, content, opts=None):
    opts = opts or {}
    S = calc.build_series(rows, only=opts.get('launches'))
    metric = opts.get('metric') if opts.get('metric') in BRK_INFO else 'conv'
    events, labels, ov, media = S['events'], S['labels'], S['ov'], S['media']
    LCTOS = [labels[fc] for fc in events]

    dataset, sections, layouts = {}, {}, {}
    def add_table(name, dims_, rows_):
        dataset[name] = {'dims': list(dims_), 'filters': [], 'rows': rows_}

    def line(wid, title, ds, y, series=None, colors=None, pct=True, height=300, dash=False, vf=None):
        w = {'id': wid, 'type': 'chart', 'chartType': 'line', 'title': title, 'height': height,
             'pct': pct, 'bind': {'dataset': ds, 'x': 'lcto', 'y': y}}
        if series: w['bind']['series'] = series; w['bind']['agg'] = 'sum'
        if colors: w['colors'] = colors
        if dash: w['dashLast'] = True
        if vf: w['valueFormat'] = vf
        return w

    def brk_rows(dimkey, groups, byk):
        """Linhas lcto×grupo da métrica atual + uma série 'Média' (média dos grupos)."""
        rows = []
        for fc in events:
            vals = []
            for g in groups:
                v = ov[fc]['by'][byk][g][metric]
                rows.append({'lcto': labels[fc], dimkey: g, 'valor': v})
                if v is not None:
                    vals.append(v)
            rows.append({'lcto': labels[fc], dimkey: 'Média',
                         'valor': (round(sum(vals) / len(vals), 4) if vals else None)})
        return rows

    def _has_out(seriess):
        """Há outlier (cercas de Tukey, igual ao cliente) em alguma série?"""
        for vals in seriess:
            xs = sorted(v for v in vals if isinstance(v, (int, float)))
            if len(xs) < 4:
                continue
            def q(p):
                i = (len(xs) - 1) * p
                lo = int(i); hi = min(lo + 1, len(xs) - 1)
                return xs[lo] + (xs[hi] - xs[lo]) * (i - lo)
            q1, q3 = q(0.25), q(0.75)
            iqr = q3 - q1
            if iqr <= 0:
                continue
            lof, hif = q1 - 1.5 * iqr, q3 + 1.5 * iqr
            if any(isinstance(v, (int, float)) and (v < lof or v > hif) for v in vals):
                return True
        return False

    def auto_out(chart, _seriess):
        """Outlier vem DESLIGADO por padrão — o usuário liga onde quiser no relatório."""
        return chart

    def bseries(groups, byk):
        return [[ov[fc]['by'][byk][g][metric] for fc in events] for g in groups]

    def cmp_rich(name, rowlabel, groups, getval, fmt, cost):
        """Tabela comparativa: 1 linha/grupo, 1 coluna/lançamento; célula = valor +
        variação (pp/×/R$) vs. coluna anterior + % relativo."""
        def dstr(d):
            if fmt == 'pct': return f'{d:+.2f}pp'
            if fmt == 'money': return ('+' if d >= 0 else '−') + money(abs(d))
            if fmt == 'int': return ('+' if d >= 0 else '−') + intf(abs(d))
            if fmt == 'x': return f'{d:+.2f}×'
            return f'{d:+.1f}'

        def vfmt(v):
            if v is None: return '—'
            if fmt == 'pct': return f'{v:.2f}%'   # 2 casas na tabela comparativa
            return fmtval(fmt, v)
        rows = []
        for key, label in groups:
            row = {rowlabel: label}
            prev = None
            for fc in events:
                v = getval(key, fc)
                cell = {'value': vfmt(v)}
                if prev is not None and v is not None:
                    d = v - prev
                    cell['delta'] = dstr(d)
                    cell['rel'] = (f'{(d / prev * 100):+.0f}%' if prev else '—')
                    cell['tone'] = 'neutral' if abs(d) < 1e-9 else ('pos' if ((d >= 0) != cost) else 'neg')
                row[labels[fc]] = cell
                if v is not None:
                    prev = v
            rows.append(row)
        add_table(name, [rowlabel], rows)
        return [rowlabel] + LCTOS

    # ── dataset numérico ────────────────────────────────────────────────────
    add_table('lc_overview', ['lcto'], [
        {'lcto': labels[fc], 'invest': ov[fc]['invest'], 'leads': ov[fc]['leads'], 'vendas': ov[fc]['vendas'],
         'faturamento': ov[fc]['faturamento'], 'fat_liq': ov[fc]['fat_liq'],
         'conv_ger': ov[fc]['conv_ger'], 'qualificacao': ov[fc]['qualificacao'],
         'taxa_qualidade': ov[fc]['taxa_qualidade'], 'conv_mql': ov[fc]['conv_mql'],
         'mql_pct': calc.pct(ov[fc]['mqls'], ov[fc]['leads']), 'reembolso': ov[fc]['reembolso'],
         'roas': ov[fc]['roas'], 'roi': ov[fc]['roi'], 'ret': ov[fc]['ret'],
         'recap': ov[fc]['recap'], 'leads_antigos': ov[fc]['leads_antigos']}
        for fc in events])
    add_table('lc_leads_temp', ['lcto', 'temperatura'], [
        {'lcto': labels[fc], 'temperatura': t, 'leads': ov[fc]['by']['temp'][t]['leads']}
        for fc in events for t in calc.TEMPS])
    add_table('lc_financ', ['lcto'], [
        {'lcto': labels[fc], 'roas': ov[fc]['roas'], 'roi': ov[fc]['roi'], 'ret': ov[fc]['ret']} for fc in events])
    # bloco "Evolução" do Panorama — dirigido pela métrica selecionada
    add_table('lc_brk_geral', ['lcto'], [{'lcto': labels[fc], 'valor': ov[fc]['by']['canal']['Geral'][metric]} for fc in events])
    add_table('lc_brk_canal', ['lcto', 'canal'], brk_rows('canal', ['Pago', 'Orgânico'], 'canal'))
    add_table('lc_brk_plat', ['lcto', 'plataforma'], brk_rows('plataforma', ['Meta', 'Google'], 'plataforma'))
    add_table('lc_brk_temp', ['lcto', 'temperatura'], brk_rows('temperatura', calc.TEMPS, 'temp'))
    add_table('lc_media', ['lcto'], [
        {'lcto': labels[fc], 'invest': media[fc]['invest'], 'cpm': media[fc]['cpm'], 'ctr': media[fc]['ctr'],
         'cpc': media[fc]['cpc'], 'cpl': media[fc]['cpl'], 'conv_paga': media[fc]['conv_paga'], 'cpa': media[fc]['cpa']}
        for fc in events])
    for m in calc._MEDIA_METRICS:
        add_table(f'lc_{m}_temp', ['lcto', 'temperatura'], [
            {'lcto': labels[fc], 'temperatura': t, 'valor': media[fc]['temp'][t][m]}
            for fc in events for t in calc.TEMPS])

    # ── agregados da série (kpi) ────────────────────────────────────────────
    def tot(get): return sum((get(ov[fc]) or 0) for fc in events)
    inv_t = tot(lambda o: o['invest']); fatliq_t = tot(lambda o: o['fat_liq']); ret_t = tot(lambda o: o['ret'])
    leads_t = tot(lambda o: o['leads']); vendas_t = tot(lambda o: o['vendas'])
    mqls_t = tot(lambda o: o['mqls']); resp_t = tot(lambda o: o['resp'])
    fat_t = tot(lambda o: o['faturamento']); ref_t = tot(lambda o: o['refunded'])
    recap_t = tot(lambda o: o['recap']); refq_t = tot(lambda o: o['refunds_qty'])
    vmql_t = tot(lambda o: o['vendas_mql']); lpago_t = tot(lambda o: o['l_pago']); lorg_t = tot(lambda o: o['l_org'])
    mi = sum(media[fc]['invest'] for fc in events); mimp = sum(media[fc]['imp'] for fc in events)
    mclk = sum(media[fc]['clicks'] for fc in events); mlp = sum(media[fc]['leads_p'] for fc in events)
    mvp = sum(media[fc]['vendas_p'] for fc in events); mfl = sum(media[fc]['fat_liq_p'] for fc in events)

    # ── s01 Panorama ────────────────────────────────────────────────────────
    pan, pg = [], Grid()
    sp = safe(lpago_t * 100, lpago_t + lorg_t)
    # séries por lançamento (sparkline) + variação último vs. anterior
    def osp(key, scale=1.0): return [(ov[fc][key] * scale if ov[fc][key] is not None else None) for fc in events]
    def pdelta(series, kind, cost=False):
        vals = [v for v in series if v is not None]
        if len(vals) < 2: return None, 'neutral'
        d = vals[-1] - vals[-2]; up = d >= 0
        tone = 'neutral' if abs(d) < 1e-9 else ('pos' if (up != cost) else 'neg')
        unit = {'pp': f'{abs(d):.1f}pp', 'x': f'{abs(d):.2f}×', 'money': money(abs(d)), 'int': intf(abs(d))}[kind]
        return f"{'↑' if up else '↓'} {unit} vs. anterior", tone
    s_roi = osp('roi', 100); s_roas = osp('roas'); s_conv = osp('conv_ger'); s_ret = osp('ret')
    d_roi = pdelta(s_roi, 'pp'); d_roas = pdelta(s_roas, 'x'); d_conv = pdelta(s_conv, 'pp'); d_ret = pdelta(s_ret, 'money')
    vraw_t = sum((ov[fc]['vendas_raw'] or 0) for fc in events)
    rcp_t = sum((ov[fc]['recap_pago'] or 0) for fc in events)
    rco_t = sum((ov[fc]['recap_org'] or 0) for fc in events)

    def card(wid, tier, **kw):
        pan.append({'id': wid, 'type': 'kpi-card', 'tier': tier, **kw})
        pg.add(wid, 'kpi-card', 3, 3 if tier == 'feature' else 2)

    pan.append({'id': 'pan-eb-kpi1', 'type': 'eyebrow', 'title': 'INDICADORES PRINCIPAIS', 'caption': '4 métricas'})
    pg.add('pan-eb-kpi1', 'eyebrow', 12, 1)
    card('pan-k-conv', 'feature', label='Taxa de conversão', value=pctf(safe(vendas_t * 100, leads_t)),
         sub='vendas do produto principal / leads totais', icon='target', iconColor='#534AB7',
         delta=d_conv[0], deltaTone=d_conv[1], spark=s_conv)
    card('pan-k-roas', 'feature', label='ROAS', value=xf(safe(fatliq_t, inv_t)),
         sub='faturamento líquido / investimento', icon='bolt', iconColor='#EF9F27',
         delta=d_roas[0], deltaTone=d_roas[1], spark=s_roas)
    card('pan-k-roi', 'feature', label='ROI', value=pctf(safe(ret_t * 100, inv_t)),
         sub='retorno sobre o investimento', icon='trending-up', iconColor='#3B6D11',
         delta=d_roi[0], deltaTone=d_roi[1], spark=s_roi)
    card('pan-k-ret', 'feature', label='Retorno bruto', value=money(ret_t),
         sub='fat. líq. − invest. − impostos − taxas', icon='database', iconColor='#1D9E75',
         delta=d_ret[0], deltaTone=d_ret[1], spark=s_ret)

    pan.append({'id': 'pan-eb-kpi2', 'type': 'eyebrow', 'title': 'VOLUME E QUALIFICAÇÃO', 'caption': '8 métricas'})
    pg.add('pan-eb-kpi2', 'eyebrow', 12, 1)
    sp_pago = safe(lpago_t * 100, lpago_t + lorg_t) or 0
    rc_pago = safe(rcp_t * 100, rcp_t + rco_t)
    refp = safe(refq_t * 100, vendas_t) or 0
    qual_v = safe(mqls_t * 100, resp_t)
    cmql_v = safe(vmql_t * 100, mqls_t)
    card('pan-v-inv', 'volume', label='Investimento total', value=money(inv_t), sub=f'{len(events)} eventos somados',
         icon='coin', iconColor='#534AB7', bar=[{'pct': 100, 'color': '#534AB7'}])
    card('pan-v-leads', 'volume', label='Leads totais', value=intf(leads_t),
         sub=f'pago {intf(lpago_t)} · orgânico {intf(lorg_t)}', icon='users', iconColor='#185FA5',
         bar=[{'pct': sp_pago, 'color': '#534AB7'}, {'pct': 100 - sp_pago, 'color': '#97C459'}])
    card('pan-v-vendas', 'volume', label='Vendas (produto principal)', value=intf(vendas_t),
         sub=f'total geral · {intf(vraw_t)} vendas', icon='shopping-cart', iconColor='#3B6D11',
         bar=[{'pct': (safe(vendas_t * 100, vraw_t) or 0), 'color': '#3B6D11'}])
    card('pan-v-ref', 'volume', label='Reembolsos', value=intf(refq_t),
         sub=f'{refp:.2f}% sobre vendas totais', icon='arrow-back-up', iconColor='#A32D2D',
         bar=[{'pct': refp, 'color': '#E24B4A'}])
    card('pan-v-recap', 'volume', label='Leads recapturados', value=intf(recap_t),
         sub=(f'pago {intf(rcp_t)} ({rc_pago:.0f}%) · orgânico {intf(rco_t)} ({100 - rc_pago:.0f}%)'
              if rc_pago is not None else f'{intf(recap_t)} no total'),
         icon='refresh', iconColor='#854F0B',
         bar=([{'pct': rc_pago, 'color': '#854F0B'}, {'pct': 100 - rc_pago, 'color': '#EF9F27'}]
              if rc_pago is not None else [{'pct': 100, 'color': '#854F0B'}]))
    card('pan-v-qual', 'volume', label='Taxa de qualidade (MQL)', value=pctf(qual_v),
         sub=f'{intf(mqls_t)} MQLs / {intf(resp_t)} pesquisas', icon='star', iconColor='#854F0B',
         bar=[{'pct': (qual_v or 0), 'color': '#EF9F27'}])
    card('pan-v-cmql', 'volume', label='Conversão MQL', value=pctf(cmql_v),
         sub='vendas MQL / total de MQLs', icon='circle-check', iconColor='#534AB7',
         bar=[{'pct': (cmql_v or 0), 'color': '#534AB7'}])
    card('pan-v-split', 'volume', label='Split pago × orgânico',
         value=(f'{sp:.0f}% / {100 - sp:.0f}%' if sp is not None else '—'), sub='distribuição dos leads',
         icon='arrows-left-right', iconColor='#5F5E5A',
         bar=([{'pct': sp, 'color': '#534AB7'}, {'pct': 100 - sp, 'color': '#1D9E75'}] if sp is not None else []))
    blbl = BRK_INFO[metric]['label']
    bfmt = BRK_INFO[metric]['fmt']
    bpct = bfmt == 'pct'
    bcost = BRK_INFO[metric]['cost']

    def bval(byk):
        return lambda key, fc: ov[fc]['by'][byk][key][metric]

    pan.append({'id': 'pan-eb-brk', 'type': 'eyebrow', 'title': 'EVOLUÇÃO DE INDICADORES',
                'caption': 'escolha o indicador — afeta só os gráficos e tabelas abaixo (linha tracejada = média)'})
    pg.add('pan-eb-brk', 'eyebrow', 12, 1)
    pan.append({'id': 'pan-metric', 'type': 'metric-toggle', 'current': metric,
                'metrics': [{'id': k, 'label': BRK_INFO[k]['label']} for k in calc.METRICS]})
    pg.add('pan-metric', 'metric-toggle', 12, 1)
    # blocos gráfico(+tabela) — um card cada, header padronizado (ponto + título +
    # régua, depois o gráfico). Geral em largura cheia (sem tabela); canal e
    # plataforma lado a lado (6+6); temperatura e perfil lado a lado (6+6)
    def ctbl(wid, title, chart_w, cols=None, ds=None, w=12):
        block = {'id': wid, 'type': 'chart-table', 'title': title, 'chart': chart_w}
        if cols:
            block['table'] = {'id': wid + '-t', 'type': 'table', 'cols': cols, 'bind': {'dataset': ds}}
        pan.append(block)
        pg.add(wid, 'chart-table', w, 7 if cols else 5)

    ctbl('pan-ct-ger', f'{blbl} · geral',
         auto_out(line('pan-brk-ger', '', 'lc_brk_geral', 'valor', colors=['#534AB7'], pct=bpct, vf=bfmt),
                  [[ov[fc]['by']['canal']['Geral'][metric] for fc in events]]), w=12)
    cc = cmp_rich('lc_cmp_canal', 'Canal', [('Pago', 'Pago'), ('Orgânico', 'Orgânico')], bval('canal'), bfmt, bcost)
    ctbl('pan-ct-canal', f'{blbl} · pago × orgânico',
         auto_out(line('pan-brk-canal', '', 'lc_brk_canal', 'valor', 'canal', ['#534AB7', '#97C459', '#B9B3E8'], pct=bpct, dash=True, vf=bfmt),
                  bseries(['Pago', 'Orgânico'], 'canal')),
         cc, 'lc_cmp_canal', w=6)
    cp = cmp_rich('lc_cmp_plat', 'Plataforma', [('Meta', 'Meta'), ('Google', 'Google')], bval('plataforma'), bfmt, bcost)
    ctbl('pan-ct-plat', f'{blbl} · por plataforma',
         auto_out(line('pan-brk-plat', '', 'lc_brk_plat', 'valor', 'plataforma', ['#534AB7', '#1D9E75', '#B9B3E8'], pct=bpct, dash=True, vf=bfmt),
                  bseries(['Meta', 'Google'], 'plataforma')),
         cp, 'lc_cmp_plat', w=6)
    ct = cmp_rich('lc_cmp_temp', 'Temperatura', [(t, t) for t in calc.TEMPS], bval('temp'), bfmt, bcost)
    ctbl('pan-ct-temp', f'{blbl} · por temperatura',
         auto_out(line('pan-brk-temp', '', 'lc_brk_temp', 'valor', 'temperatura', LINE_COLORS[:5] + ['#B9B3E8'], pct=bpct, dash=True, vf=bfmt),
                  bseries(calc.TEMPS, 'temp')),
         ct, 'lc_cmp_temp', w=6)
    # Perfil — a métrica selecionada recortada por MQL × não-MQL (reage ao toggle)
    def perfil_val(key, fc):
        o = ov[fc]
        ml, nl = o['mqls'], o['leads'] - o['mqls']
        if metric == 'leads':
            return ml if key == 'cmql' else nl
        if metric == 'vendas':
            return o['vendas_mql'] if key == 'cmql' else o['vendas_nao_mql']
        if metric == 'conv':
            return calc.pct(o['vendas_mql'], ml) if key == 'cmql' else calc.pct(o['vendas_nao_mql'], nl)
        return None  # métricas sem recorte MQL/não-MQL ficam vazias
    pf_mql = [perfil_val('cmql', fc) for fc in events]
    pf_nmql = [perfil_val('cnmql', fc) for fc in events]
    perfil_chart = auto_out({'id': 'pan-perfil', 'type': 'chart', 'chartType': 'line', 'title': '', 'height': 300,
                    'pct': bpct, 'valueFormat': bfmt, 'colors': ['#534AB7', '#AFA9EC'], 'categories': LCTOS,
                    'series': [{'name': 'MQL', 'data': pf_mql}, {'name': 'Não-MQL', 'data': pf_nmql}]},
                    [pf_mql, pf_nmql])
    cperf = cmp_rich('lc_cmp_perfil', 'Grupo', [('cmql', 'MQL'), ('cnmql', 'Não-MQL')], perfil_val, bfmt, bcost)
    ctbl('pan-ct-perfil', f'{blbl} · MQL × não-MQL', perfil_chart, cperf, 'lc_cmp_perfil', w=6)
    pan.append({'id': 'pan-eb-fin', 'type': 'eyebrow', 'title': 'RESULTADO FINANCEIRO',
                'caption': 'ROAS (breakeven em 1×), ROI e retorno por lançamento'})
    pg.add('pan-eb-fin', 'eyebrow', 12, 1)
    pan.append(auto_out(line('pan-roas', 'ROAS por lançamento', 'lc_financ', 'roas', colors=['#7C3AED'], pct=False, vf='x'),
                        [[ov[fc]['roas'] for fc in events]])); pg.add('pan-roas', 'chart', 4, 4)
    pan.append(auto_out(line('pan-roi', 'ROI por lançamento', 'lc_financ', 'roi', colors=['#3B82F6'], pct=False, vf='x'),
                        [[ov[fc]['roi'] for fc in events]])); pg.add('pan-roi', 'chart', 4, 4)
    pan.append({'id': 'pan-ret', 'type': 'chart', 'chartType': 'bar', 'title': 'Retorno (R$)', 'height': 300,
                'diverging': True, 'valueFormat': 'money', 'bind': {'dataset': 'lc_financ', 'x': 'lcto', 'y': 'ret'}}); pg.add('pan-ret', 'chart', 4, 4)
    pan.append({'id': 'pan-note', 'type': 'find-note',
                'text': 'ROAS = faturamento líquido / custo total. ROI desconta impostos e taxas. Conversão = vendas / leads. Qualificação = MQLs / respostas. Orgânico não tem ROAS/CPx.'})
    pg.add('pan-note', 'find-note', 12, 1)
    sub = f'Evolução de {len(events)} lançamentos' + (f' · {LCTOS[0]} → {LCTOS[-1]}.' if LCTOS else '.')
    sections['s01'] = {'id': 's01', 'header': {'badge': 'Panorama', 'title': 'Panorama ao Longo do Tempo', 'sub': sub}, 'widgets': pan}
    layouts['s01'] = pg.items

    # ── s02 Investimentos ───────────────────────────────────────────────────
    def msp(metric_k): return [media[fc][metric_k] for fc in events]
    def kvar(metric_k, cost):
        vals = [v for v in msp(metric_k) if v is not None]
        if len(vals) < 2 or not vals[-2]:
            return None, 'neutral'
        dd = (vals[-1] - vals[-2]) / vals[-2] * 100
        good = (dd < 0) if cost else (dd > 0)
        tone = 'neutral' if abs(dd) < 0.5 else ('pos' if good else 'neg')
        return f"{'↑' if dd >= 0 else '↓'} {abs(dd):.0f}% vs. anterior · {'melhor' if good else 'pior'}", tone

    inv, ig = [], Grid()
    roas_pago_sp = [safe(media[fc]['fat_liq_p'], media[fc]['invest']) for fc in events]

    def icard(wid, value, label, sub, icon, color, mk=None, cost=False, spark=None):
        kw = {'id': wid, 'type': 'kpi-card', 'tier': 'feature', 'label': label, 'value': value,
              'sub': sub, 'icon': icon, 'iconColor': color, 'spark': (spark if spark is not None else msp(mk))}
        if mk is not None:
            kw['delta'], kw['deltaTone'] = kvar(mk, cost)
        inv.append(kw); ig.add(wid, 'kpi-card', 3, 3)

    inv.append({'id': 'inv-eb-kpi', 'type': 'eyebrow', 'title': 'INDICADORES DE MÍDIA', 'caption': '8 métricas'})
    ig.add('inv-eb-kpi', 'eyebrow', 12, 1)
    icard('inv-k-inv', money(mi), 'Investimento pago', 'verba total de mídia paga', 'coin', '#534AB7', 'invest', cost=False)
    icard('inv-k-cpm', ('—' if mimp <= 0 else f'R$ {mi / mimp * 1000:.2f}'), 'CPM', 'custo por mil impressões', 'database', '#185FA5', 'cpm', cost=True)
    icard('inv-k-ctr', pctf(safe(mclk * 100, mimp)), 'CTR', 'cliques / impressões', 'trending-up', '#3B6D11', 'ctr', cost=False)
    icard('inv-k-cpc', ('—' if mclk <= 0 else f'R$ {mi / mclk:.2f}'), 'CPC', 'custo por clique', 'target', '#534AB7', 'cpc', cost=True)
    icard('inv-k-cpl', ('—' if mlp <= 0 else f'R$ {mi / mlp:.2f}'), 'CPL', 'custo por lead', 'users', '#185FA5', 'cpl', cost=True)
    icard('inv-k-conv', pctf(safe(mvp * 100, mlp)), 'Conv. paga', 'vendas / leads (pago)', 'circle-check', '#534AB7', 'conv_paga', cost=False)
    icard('inv-k-cpa', (money(mi / mvp) if mvp > 0 else '—'), 'CPA', 'custo por aquisição', 'shopping-cart', '#3B6D11', 'cpa', cost=True)
    icard('inv-k-roas', xf(safe(mfl, mi)), 'ROAS pago', 'fat. líq. pago / investimento', 'bolt', '#EF9F27', spark=roas_pago_sp)
    inv.append({'id': 'inv-eb-spend', 'type': 'eyebrow', 'title': 'INVESTIMENTO', 'caption': 'verba de mídia paga por lançamento'})
    ig.add('inv-eb-spend', 'eyebrow', 12, 1)
    inv.append({'id': 'inv-invest', 'type': 'chart', 'chartType': 'bar', 'title': 'Investimento por lançamento', 'height': 300,
                'colors': ['#534AB7'], 'valueFormat': 'money', 'bind': {'dataset': 'lc_media', 'x': 'lcto', 'y': 'invest'}})
    ig.add('inv-invest', 'chart', 12, 4)
    for m in calc._MEDIA_METRICS:
        lbl, ispct, cost = METRIC_LABELS[m], METRIC_PCT.get(m, False), METRIC_COST.get(m, False)
        inv.append({'id': f'inv-eb-{m}', 'type': 'eyebrow', 'title': lbl.upper(),
                    'caption': f'{lbl} geral e por temperatura ao longo dos lançamentos'})
        ig.add(f'inv-eb-{m}', 'eyebrow', 12, 1)
        mvf = 'pct' if ispct else 'money'
        inv.append(auto_out(line(f'inv-{m}-geral', f'{lbl} · geral', 'lc_media', m, colors=['#534AB7'], pct=ispct, vf=mvf),
                            [[media[fc][m] for fc in events]]))
        ig.add(f'inv-{m}-geral', 'chart', 6, 4)
        inv.append(auto_out(line(f'inv-{m}-temp', f'{lbl} · por temperatura', f'lc_{m}_temp', 'valor', 'temperatura', LINE_COLORS, pct=ispct, vf=mvf),
                            [[media[fc]['temp'][t][m] for fc in events] for t in calc.TEMPS]))
        ig.add(f'inv-{m}-temp', 'chart', 6, 4)
        cols = cmp_rich(f'lc_cmp_{m}', 'Temperatura', [(t, t) for t in calc.TEMPS],
                        (lambda mm: lambda key, fc: media[fc]['temp'][key][mm])(m),
                        ('pct' if ispct else 'money'), cost)
        inv.append({'id': f'inv-{m}-cmp', 'type': 'table', 'title': f'{lbl} por temperatura · comparação entre lançamentos',
                    'cols': cols, 'bind': {'dataset': f'lc_cmp_{m}'}})
        ig.add(f'inv-{m}-cmp', 'table', 12, 3)
    inv.append({'id': 'inv-note', 'type': 'find-note',
                'text': 'Métricas de mídia paga somam os brutos e calculam sobre o total. Orgânico não entra aqui. Desvio = último vs. média; em custos, subir é pior (vermelho).'})
    ig.add('inv-note', 'find-note', 12, 1)
    sections['s02'] = {'id': 's02', 'header': {'badge': 'Investimentos', 'title': 'Investimentos e Custos de Mídia',
                       'sub': 'CPM, CTR, CPC, CPL, conversão paga e CPA por lançamento e por temperatura.'}, 'widgets': inv}
    layouts['s02'] = ig.items

    # ── páginas + meta.controls ──────────────────────────────────────────────
    pages = [{'id': 'panorama', 'label': 'Panorama', 'sections': [{'id': 's01', 'label': 'Panorama'}]},
             {'id': 'investimentos', 'label': 'Investimentos', 'sections': [{'id': 's02', 'label': 'Investimentos'}]}]

    insights = (content or {}).get('insights') or {}
    if insights.get('zones'):
        ins, ig2 = [], Grid()
        for z, zone in enumerate(insights['zones']):
            ins.append({'id': f'ins-eb{z}', 'type': 'eyebrow', 'n': zone.get('n'), 'color': zone.get('color'),
                        'title': zone.get('title'), 'caption': zone.get('caption', '')})
            ig2.add(f'ins-eb{z}', 'eyebrow', 12, 1)
            for ci, cd in enumerate(zone.get('cards', [])):
                ins.append({'id': f'ins-{z}-{ci}', 'type': 'find-block', 'card': True, 'tag': cd.get('tag'),
                            'tagColor': cd.get('tagColor'), 'title': cd.get('title'), 'detail': cd.get('detail')})
                ig2.add(f'ins-{z}-{ci}', 'find-block', 4, 3)
        if insights.get('method'):
            ins.append({'id': 'ins-method', 'type': 'find-note', 'text': insights['method']}); ig2.add('ins-method', 'find-note', 12, 1)
        sections['s10'] = {'id': 's10', 'header': insights.get('header', {'badge': 'Insights', 'title': 'Insights'}), 'widgets': ins}
        layouts['s10'] = ig2.items
        pages.insert(1, {'id': 'insights', 'label': 'Insights',
                         'sections': [{'id': 's10', 'label': insights.get('header', {}).get('title', 'Insights')}]})

    created = (config or {}).get('created_at') or datetime.date.today().isoformat()
    data_json = {'meta': {'client': config['client'], 'title': config['title'], 'type': 'dashboard',
                          'theme': 'light', 'created_at': created, 'filters': [],
                          'controls': {'kind': 'historico-lancamentos', 'pages': ['panorama', 'investimentos'],
                                       'launches': S['all_labels'],
                                       'metrics': [{'id': k, 'label': BRK_INFO[k]['label']} for k in calc.METRICS]}},
                 'pages': pages}
    return {'dataset': dataset, 'data': data_json,
            'layout': {'sections': layouts, 'updatedAt': f'{created}T00:00:00.000Z'},
            'sections': sections}


def build(csv_path, config, content, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    rows = calc.load_rows(csv_path)
    r = assemble(rows, config, content, {})
    preserve(out_dir, r['data'], r['sections'])
    def dump(name, obj):
        json.dump(obj, open(os.path.join(out_dir, name), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    dump('dataset.json', r['dataset']); dump('data.json', r['data']); dump('layout.json', r['layout'])
    for sid, sec in r['sections'].items():
        dump(f'{sid}.json', sec)
    return {'tables': len(r['dataset']), 'sections': len(r['sections']), 'pages': len(r['data']['pages']), 'out_dir': out_dir}


if __name__ == '__main__':
    if len(sys.argv) < 5:
        print('uso: build_report.py <config.json> <content.json> <csv> <out_dir>'); sys.exit(1)
    cfg_path, content_path, csv_path, out = sys.argv[1:5]
    config = json.load(open(cfg_path, encoding='utf-8'))
    content = json.load(open(content_path, encoding='utf-8')) if os.path.exists(content_path) else {}
    summ = build(csv_path, config, content, out)
    print('OK ->', summ['out_dir'], '| tabelas', summ['tables'], '| seções', summ['sections'], '| páginas', summ['pages'])
