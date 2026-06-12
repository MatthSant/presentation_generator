"""build_report — gerador genérico de uma análise `conversao-perfil`.

Numa passada única, lê o dump bruto (via conv_calc) + a metadata de apresentação
(`config`) + a prosa autoral (`content`) e emite as 4 camadas finais do app
(dataset/data/layout/sXX) em `out_dir`. É o "molde de design" de toda análise de
conversão por perfil — sem nada hardcoded de cliente.

Uso programático:
    from build_report import build
    build(csv_path, config_dict, content_dict, out_dir)

Uso por CLI:
    py -3 build_report.py <config.json> <content.json> <csv_path> <out_dir>

`config` (metadata): { client, title, slug, channels[], window, long_window,
  created_at?, criterios:[{ id, col, label, tab, abbr?, order[], short_labels{},
  cores[], aliases{} }] }.
`content` (prosa): { insights:{header, zones:[{n,color,title,caption,cards:[{tag,
  tagColor,title,detail}]}], method}, detalhamentos:{header, eyebrows:[...],
  cards:[...], crosscut_crit:[a,b] } }.  A seção de cross-cut dos Detalhamentos é
  opcional; a zona de codependência é sempre gerada.
"""
import sys, os, json, datetime
_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _here)                    # irmãos (conv_calc)
sys.path.insert(0, os.path.dirname(_here))   # pysrc/ → pacote common
import conv_calc as cc
from common.layout import Grid
from common.preserve import preserve, preserve_dataset

_M = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
def lcto_label(slug):
    y, m, _ = cc.lcto_sort_key(slug)
    return f'{_M[m]}/{str(y)[2:]}' if 1 <= m <= 12 else slug

EVOL_COLORS = ['#4C1D95', '#6D28D9', '#7C3AED', '#6366F1', '#3B82F6', '#0EA5E9', '#0D9488', '#10B981']
REP_PAL = ['#4C1D95', '#6D28D9', '#7C3AED', '#8B5CF6', '#6366F1', '#3B82F6', '#0EA5E9', '#0D9488', '#10B981']
CLASS_COLOR = {'cons': '#5C9A33', 'pos': '#97C459', 'var': '#D9A406', 'neg': '#E8743B', 'crit': '#DC5048'}

def sorted_groups(cd):
    return sorted(cd['grupos'], key=lambda g: cd['por_grupo'][g].get('avgDiff_lcto') or -1e9, reverse=True)

def rep_opts():
    return {'legend': {'show': True, 'position': 'bottom', 'fontSize': '10px', 'markers': {'width': 9, 'height': 9, 'radius': 3}, 'itemMargin': {'horizontal': 7, 'vertical': 2}},
            'dataLabels': {'enabled': False}, 'plotOptions': {'bar': {'columnWidth': '72%', 'borderRadius': 2}}, 'grid': {'borderColor': '#ECECF1'}}

def assoc_cls(v):
    if v >= 0.5: return 'cup'
    if v >= 0.35: return 'cup2'
    if v >= 0.2: return 'cup3'
    if v > 0.08: return 'cup4'
    return 'cn0'

def build(csv_path, config, content, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    rows = cc.load_dump(csv_path)
    dims = cc.dim_columns(rows)
    LCTOS_ID = cc.ordered_lancamentos(rows)
    LBL = [lcto_label(s) for s in LCTOS_ID]
    CANAIS = config['channels']
    CRIT = config['criterios']
    CIDS = [c['id'] for c in CRIT]
    CFG = {c['id']: c for c in CRIT}
    WINDOW = config.get('window', 'lcto'); LONG = config.get('long_window', '12m')
    N = len(LCTOS_ID)
    LAST2, PREV2 = [N - 2, N - 1], [N - 4, N - 3]

    CANON = {c['id']: cc.make_canon(c['order'], c.get('aliases') or None) for c in CRIT}
    ABBR = {c['id']: (c.get('abbr') or c.get('tab') or c['label']) for c in CRIT}
    LABEL = {c['id']: c['label'] for c in CRIT}
    def short(cid, g): return CFG[cid]['short_labels'].get(g, g)

    # Ordem de EXIBIÇÃO dos grupos em gráficos, heatmaps e tabelas = a ordem
    # definida no config `order` (sequência natural das categorias), para TODO
    # critério. Só o rank-card usa diff (é um ranking). Grupos presentes fora do
    # `order` (raro) vão ao final. `ordinal` é apenas guia de como definir o `order`.
    def display_groups(cd, cid):
        present = set(cd['grupos'])
        ordered = [g for g in CFG[cid].get('order', []) if g in present]
        return ordered + [g for g in cd['grupos'] if g not in ordered]

    DATA = {c['id']: {ch: cc.agg_criterio(rows, c['col'], dims, LCTOS_ID, ch,
                                          canon=CANON[c['id']], window=WINDOW, long_window=LONG)
                      for ch in CANAIS} for c in CRIT}

    dataset, sections, layouts = {}, {}, {}
    def add_table(name, dims_, rows_, filters=('canal',)):
        dataset[name] = {'dims': list(dims_), 'filters': list(filters), 'rows': rows_}

    # ── seções por critério ──────────────────────────────────────────────
    for ci, c in enumerate(CRIT):
        cid = c['id']; sid = f's{ci + 2:02d}'
        g = Grid(); widgets = []
        rank_rows, grp_rows, diff_rows, conv_rows, evol_rows, uplift_rows = [], [], [], [], [], []
        conv12_rows = []
        bench_rows, detail_rows, rep_rows, repclass_rows = [], [], [], []
        repclass_present = []
        for canal in CANAIS:
            cd = DATA[cid][canal]
            sg = display_groups(cd, cid)        # ordem de exibição (ordinal → config; nominal → diff)
            rank_sg = sorted_groups(cd)          # ranking é sempre por diff
            for pos, gname in enumerate(rank_sg, 1):
                pg = cd['por_grupo'][gname]; cls = cc.classify(pg['wins'], pg['n'])[1]
                rank_rows.append({'canal': canal, 'grupo': (gname[:50] + '…') if len(gname) > 50 else gname,
                                  'pos': pos, 'diff_lcto': pg['avgDiff_lcto'], 'diff_12m': pg['avgDiff_12m'],
                                  'rep': pg['avgRep'], 'wins': pg['wins'], 'n': pg['n'], 'classe': cls})
            for gname in sg:
                pg = cd['por_grupo'][gname]
                grp_rows.append({'canal': canal, 'grupo': short(cid, gname),
                                 'diff_lcto': round(pg['avgDiff_lcto'] or 0, 2), 'conv_lcto': round(pg['avgConvLcto'] or 0, 3),
                                 'conv_12m': round(pg['avgConv12m'] or 0, 3), 'uplift': round(pg['avgUplift'] or 0, 2)})
            for gname in sg:
                pg = cd['por_grupo'][gname]; sl = short(cid, gname)
                for i, l in enumerate(LBL):
                    v = cc.safe(pg['diff_lcto'], i)
                    diff_rows.append({'canal': canal, 'grupo': sl, 'lancamento': l, 'valor': '—' if v is None else f'{v:+.0f}%', 'cls': cc.diff_class(v)})
            for label, arr in [('Bench pesquisa', cd['bench_pesq_lcto']), ('Bench total leads', cd['bench_total_lcto'])]:
                for i, l in enumerate(LBL):
                    v = cc.safe(arr, i)
                    conv_rows.append({'canal': canal, 'grupo': label, 'lancamento': l, 'valor': '—' if v is None else f'{v:.2f}%', 'cls': 'cn0'})
            for gname in sg:
                pg = cd['por_grupo'][gname]; sl = short(cid, gname)
                for i, l in enumerate(LBL):
                    v = cc.safe(pg['conv_lcto'], i); dv = cc.safe(pg['diff_lcto'], i)
                    conv_rows.append({'canal': canal, 'grupo': sl, 'lancamento': l, 'valor': '—' if v is None else f'{v:.2f}%', 'cls': cc.diff_class(dv)})
            # conversão acumulada 12m por lançamento (mesma estrutura do 60d) — heatmap "Conv. 12m"
            for label, arr in [('Bench pesquisa', cd['bench_pesq_12m']), ('Bench total leads', cd['bench_total_12m'])]:
                for i, l in enumerate(LBL):
                    v = cc.safe(arr, i)
                    conv12_rows.append({'canal': canal, 'grupo': label, 'lancamento': l, 'valor': '—' if v is None else f'{v:.2f}%', 'cls': 'cn0'})
            for gname in sg:
                pg = cd['por_grupo'][gname]; sl = short(cid, gname)
                for i, l in enumerate(LBL):
                    v = cc.safe(pg['conv_12m'], i); dv = cc.safe(pg['diff_12m'], i)
                    conv12_rows.append({'canal': canal, 'grupo': sl, 'lancamento': l, 'valor': '—' if v is None else f'{v:.2f}%', 'cls': cc.diff_class(dv)})
            for gname in sg:
                pg = cd['por_grupo'][gname]; sl = short(cid, gname)
                for i, l in enumerate(LBL):
                    v = cc.safe(pg['conv_lcto'], i)
                    if v is not None: evol_rows.append({'canal': canal, 'grupo': sl, 'lancamento': l, 'valor': round(v, 3)})
            for i, l in enumerate(LBL):
                v = cc.safe(cd['bench_pesq_lcto'], i)
                if v is not None: evol_rows.append({'canal': canal, 'grupo': 'Benchmark', 'lancamento': l, 'valor': round(v, 3)})
            for gname in sg:
                pg = cd['por_grupo'][gname]; sl = short(cid, gname)
                for i, l in enumerate(LBL):
                    v = cc.safe(pg['uplift_12m'], i)
                    uplift_rows.append({'canal': canal, 'grupo': sl, 'lancamento': l, 'valor': '—' if v is None else f'{v:+.0f}%', 'cls': cc.uplift_class(v)})
                uplift_rows.append({'canal': canal, 'grupo': sl, 'lancamento': 'Média', 'valor': cc.fmtP(pg['avgUplift'], 1), 'cls': cc.uplift_class(pg['avgUplift'])})
            avgBL = cc.avg([x for x in cd['bench_pesq_lcto'] if x is not None]); avgB12 = cc.avg([x for x in cd['bench_pesq_12m'] if x is not None])
            avgBT = cc.avg([x for x in cd['bench_total_lcto'] if x is not None]); benchUp = ((avgB12 - avgBL) / avgBL * 100) if (avgBL and avgB12) else None
            bench_rows.append({'canal': canal, 'Conv. 60d pesquisa': cc.fmtPabs(avgBL, 3), 'Conv. 12m pesquisa': cc.fmtPabs(avgB12, 3),
                               'Uplift benchmark': cc.fmtP(benchUp, 1), 'Conv. total leads': cc.fmtPabs(avgBT, 3)})
            for gname in sg:
                pg = cd['por_grupo'][gname]; ab, rel, read = cc.trend_cells(pg, cd, LAST2, PREV2)
                detail_rows.append({'canal': canal, 'Grupo': short(cid, gname),
                                    'Conv. 60d': cc.fmtPabs(pg['avgConvLcto'], 3),
                                    'Diff 60d': {'value': cc.fmtP(pg['avgDiff_lcto'], 1), 'cls': cc.diff_class(pg['avgDiff_lcto'])},
                                    'Conv. 12m': cc.fmtPabs(pg['avgConv12m'], 3),
                                    'Diff 12m': {'value': cc.fmtP(pg['avgDiff_12m'], 1), 'cls': cc.diff_class(pg['avgDiff_12m'])},
                                    'Uplift 12m': {'value': cc.fmtP(pg['avgUplift'], 1), 'cls': cc.uplift_class(pg['avgUplift'])},
                                    'Tend. Abs.': ab, 'Tend. Rel.': rel, 'Leitura': read,
                                    'Wins/N': f"{pg['wins']}/{pg['n']}", 'Rep. méd.': (f"{pg['avgRep']:.1f}%" if pg['avgRep'] is not None else '—')})
            totals = [sum(cc.safe(cd['por_grupo'][gn]['leads'], i) or 0 for gn in sg) for i in range(N)]
            for gname in sg:
                pg = cd['por_grupo'][gname]; sl = short(cid, gname)
                for i, l in enumerate(LBL):
                    ld = cc.safe(pg['leads'], i) or 0
                    rep_rows.append({'canal': canal, 'grupo': sl, 'lancamento': l, 'valor': round(ld / totals[i] * 100, 1) if totals[i] else 0})
            rc_rows, present = cc.repclass_series(cd, LBL)
            for r in rc_rows: r['canal'] = canal
            repclass_rows += rc_rows
            for p in present:
                if p not in repclass_present: repclass_present.append(p)

        add_table(f'crit_{cid}_rank', ['grupo'], rank_rows); add_table(f'crit_{cid}_grp', ['grupo'], grp_rows)
        add_table(f'crit_{cid}_diff', ['grupo', 'lancamento'], diff_rows); add_table(f'crit_{cid}_conv', ['grupo', 'lancamento'], conv_rows)
        add_table(f'crit_{cid}_conv12', ['grupo', 'lancamento'], conv12_rows)
        add_table(f'crit_{cid}_evol', ['grupo', 'lancamento'], evol_rows); add_table(f'crit_{cid}_uplift', ['grupo', 'lancamento'], uplift_rows)
        add_table(f'crit_{cid}_bench', [], bench_rows); add_table(f'crit_{cid}_detail', ['Grupo'], detail_rows)
        add_table(f'crit_{cid}_rep', ['grupo', 'lancamento'], rep_rows); add_table(f'crit_{cid}_repclass', ['classe', 'lancamento'], repclass_rows)
        repclass_colors = [CLASS_COLOR[p] for p in repclass_present]

        gd = DATA[cid][CANAIS[0]]; sgG = sorted_groups(gd); best, worst = sgG[0], sgG[-1]
        bpg, wpg = gd['por_grupo'][best], gd['por_grupo'][worst]
        benchN = cc.fmtPabs(cc.avg([x for x in gd['bench_pesq_lcto'] if x is not None]), 2)
        widgets += [
            {'id': f'{cid}-kpi', 'type': 'kpi-strip', 'items': [
                {'value': cc.fmtP(bpg['avgDiff_lcto'], 1), 'label': f'Melhor grupo · {short(cid, best)}', 'sub': 'converte acima da média', 'subTone': 'pos'},
                {'value': cc.fmtP(wpg['avgDiff_lcto'], 1), 'label': f'Pior grupo · {short(cid, worst)}', 'sub': 'converte abaixo da média', 'subTone': 'neg'},
                {'value': benchN, 'label': 'Conversão média (benchmark)', 'small': True}]},
            {'id': f'{cid}-eb1', 'type': 'eyebrow', 'n': '1', 'title': 'RANKING DOS GRUPOS', 'caption': 'ordenado por variação vs. benchmark (60d)'},
            {'id': f'{cid}-rank', 'type': 'rank-card', 'title': 'Ranking de Grupos · ordenado por variação vs. benchmark', 'bind': {'dataset': f'crit_{cid}_rank'}},
            {'id': f'{cid}-hmtoggle', 'type': 'heatmap-toggle', 'tabs': [
                {'label': 'Variação vs. bench', 'sub': 'diff % por lançamento — verde acima, vermelho abaixo', 'bind': {'dataset': f'crit_{cid}_diff'}},
                {'label': 'Conv. 60d', 'sub': 'conversão real 60d por lançamento', 'bind': {'dataset': f'crit_{cid}_conv'}},
                {'label': 'Conv. 12m', 'sub': 'conversão acumulada 12m por lançamento', 'bind': {'dataset': f'crit_{cid}_conv12'}},
                {'label': 'Uplift 12m', 'sub': 'ganho do acumulado 12m sobre a janela 60d', 'bind': {'dataset': f'crit_{cid}_uplift'}}]},
            {'id': f'{cid}-conv60', 'type': 'chart', 'chartType': 'bar-horizontal', 'title': 'Conversão média · Lançamento 60d', 'height': 300, 'showLabels': True, 'colors': ['#7C3AED'], 'pct': True, 'meanLine': True, 'bind': {'dataset': f'crit_{cid}_grp', 'x': 'grupo', 'y': 'conv_lcto', 'agg': 'avg'}},
            {'id': f'{cid}-conv12', 'type': 'chart', 'chartType': 'bar-horizontal', 'title': 'Conversão média · Long-term 12m', 'height': 300, 'showLabels': True, 'colors': ['#7C3AED'], 'pct': True, 'meanLine': True, 'bind': {'dataset': f'crit_{cid}_grp', 'x': 'grupo', 'y': 'conv_12m', 'agg': 'avg'}},
            {'id': f'{cid}-upliftbar', 'type': 'chart', 'chartType': 'bar-horizontal', 'title': 'Uplift médio por grupo', 'height': 300, 'showLabels': True, 'colors': ['#7C3AED'], 'pct': True, 'meanLine': True, 'bind': {'dataset': f'crit_{cid}_grp', 'x': 'grupo', 'y': 'uplift', 'agg': 'avg'}},
            {'id': f'{cid}-evol', 'type': 'chart', 'chartType': 'line', 'title': 'Evolução da conversão 60d por grupo', 'height': 360, 'colors': EVOL_COLORS, 'pct': True, 'bind': {'dataset': f'crit_{cid}_evol', 'x': 'lancamento', 'y': 'valor', 'series': 'grupo', 'agg': 'avg'}},
            {'id': f'{cid}-eb-rep', 'type': 'eyebrow', 'n': '%', 'color': 'purple', 'title': 'PROPORÇÃO DA BASE', 'caption': 'composição dos leads por lançamento — mudanças aqui podem mover a conversão ao longo do tempo'},
            {'id': f'{cid}-reptoggle', 'type': 'chart-toggle', 'title': 'Proporção de leads por lançamento', 'sub': 'participação de cada grupo na base, por lançamento', 'tabs': [
                {'label': 'Por grupo', 'sub': 'participação de cada grupo na base, por lançamento', 'chart': {'chartType': 'stacked', 'stackType': '100%', 'height': 320, 'pct': True, 'colors': REP_PAL, 'options': rep_opts(), 'bind': {'dataset': f'crit_{cid}_rep', 'x': 'lancamento', 'series': 'grupo', 'y': 'valor', 'agg': 'sum'}}},
                {'label': 'Por classificação', 'sub': 'participação por classe de conversão (Consistente → Crítico)', 'chart': {'chartType': 'stacked', 'stackType': '100%', 'height': 320, 'pct': True, 'colors': repclass_colors, 'options': rep_opts(), 'bind': {'dataset': f'crit_{cid}_repclass', 'x': 'lancamento', 'series': 'classe', 'y': 'valor', 'agg': 'sum'}}}]},
            {'id': f'{cid}-nota', 'type': 'find-note', 'text': 'Benchmark = taxa de conversão dos <strong>respondentes da pesquisa</strong> (não do total de leads). Diff % = (conv grupo − bench pesquisa) / bench pesquisa × 100. Wins = lançamentos com diff &gt; 0. Use o filtro de canal no canto inferior direito.'},
        ]
        for wid, typ, w, h in [(f'{cid}-kpi', 'kpi-strip', 12, 2), (f'{cid}-eb1', 'eyebrow', 12, 1), (f'{cid}-rank', 'rank-card', 12, 4),
                               (f'{cid}-hmtoggle', 'heatmap-toggle', 12, 6), (f'{cid}-conv60', 'chart', 6, 4), (f'{cid}-conv12', 'chart', 6, 4),
                               (f'{cid}-upliftbar', 'chart', 12, 4), (f'{cid}-evol', 'chart', 12, 5), (f'{cid}-eb-rep', 'eyebrow', 12, 1),
                               (f'{cid}-reptoggle', 'chart-toggle', 12, 6), (f'{cid}-nota', 'find-note', 12, 1)]:
            g.add(wid, typ, w, h)
        sections[sid] = {'id': sid, 'header': {'badge': 'Critério', 'title': c['label'],
                         'sub': f"Conversão por {c['label'].lower()} ao longo de {N} lançamentos · benchmark = respondentes da pesquisa."}, 'widgets': widgets}
        layouts[sid] = g.items

    # ── Panorama (s01) ────────────────────────────────────────────────────
    comp_rows = []
    for canal in CANAIS:
        for cid in CIDS:
            cd = DATA[cid][canal]; sg = sorted_groups(cd); best, worst = sg[0], sg[-1]
            bpg, wpg = cd['por_grupo'][best], cd['por_grupo'][worst]
            npos = sum(1 for x in sg if (cd['por_grupo'][x]['avgDiff_lcto'] or 0) > 0)
            avgUp = cc.avg([cd['por_grupo'][x]['avgUplift'] for x in sg])
            comp_rows.append({'canal': canal, 'Critério': LABEL[cid], 'Melhor grupo': short(cid, best),
                              'Diff melhor': {'value': cc.fmtP(bpg['avgDiff_lcto'], 1), 'cls': cc.diff_class(bpg['avgDiff_lcto'])},
                              'Pior grupo': short(cid, worst), 'Diff pior': {'value': cc.fmtP(wpg['avgDiff_lcto'], 1), 'cls': cc.diff_class(wpg['avgDiff_lcto'])},
                              'Positivos': f'{npos}/{len(sg)}', 'Uplift méd.': {'value': cc.fmtP(avgUp, 1), 'cls': cc.uplift_class(avgUp)}})
    add_table('panorama_comp', ['Critério'], comp_rows)

    pan, pg = [], Grid()
    win_lbl = {'lcto': '60d', '6m': '6m', '12m': '12m'}
    pan.append({'id': 'pan-kpi', 'type': 'kpi-strip', 'items': [
        {'value': str(N), 'label': 'Lançamentos analisados'}, {'value': str(len(CIDS)), 'label': 'Critérios de perfil'},
        {'value': f'{win_lbl.get(WINDOW, WINDOW)} / {win_lbl.get(LONG, LONG)}', 'label': 'Janelas de conversão', 'small': True}]})
    pg.add('pan-kpi', 'kpi-strip', 12, 2)
    pan.append({'id': 'pan-eb1', 'type': 'eyebrow', 'title': 'PERFIL DA BASE', 'caption': 'variação vs. benchmark por grupo, em cada critério — verde acima, vermelho abaixo'})
    pg.add('pan-eb1', 'eyebrow', 12, 1)
    for cid in CIDS:
        pan.append({'id': f'pan-{cid}', 'type': 'chart', 'chartType': 'bar-horizontal', 'diverging': True, 'title': LABEL[cid],
                    'height': 260, 'showLabels': True, 'axisMin': -120, 'axisMax': 120, 'bind': {'dataset': f'crit_{cid}_grp', 'x': 'grupo', 'y': 'diff_lcto', 'agg': 'avg'}})
        pg.add(f'pan-{cid}', 'chart', 4, 4)   # w:4 → 3 gráficos por linha (largura legível p/ barras + rótulos)
    pg.newrow()
    pan.append({'id': 'pan-eb2', 'type': 'eyebrow', 'title': 'COMPARATIVO POR CRITÉRIO', 'caption': 'melhor e pior grupo de cada perfil frente ao benchmark'})
    pg.add('pan-eb2', 'eyebrow', 12, 1)
    pan.append({'id': 'pan-comp', 'type': 'table', 'title': 'Comparativo por Critério',
                'cols': ['Critério', 'Melhor grupo', 'Diff melhor', 'Pior grupo', 'Diff pior', 'Positivos', 'Uplift méd.'],
                'colorScale': {'Diff melhor': 'diff', 'Diff pior': 'diff', 'Uplift méd.': 'uplift'}, 'bind': {'dataset': 'panorama_comp'}})
    pg.add('pan-comp', 'table', 12, 4)
    pan.append({'id': 'pan-eb3', 'type': 'eyebrow', 'title': 'DETALHE POR GRUPO', 'caption': 'cada critério, todos os grupos — passe o cursor sobre ⓘ para a definição da métrica'})
    pg.add('pan-eb3', 'eyebrow', 12, 1)
    DEFS = {'Conv. 60d': 'Taxa de conversão na janela de lançamento (60 dias).',
            'Diff 60d': 'Variação da conversão do grupo vs. o benchmark dos respondentes da pesquisa.',
            'Conv. 12m': 'Conversão acumulada em 12 meses.', 'Diff 12m': 'Variação do 12m vs. o benchmark da pesquisa.',
            'Uplift 12m': '(conv 12m − conv 60d) / conv 60d × 100.',
            'Tend. Abs.': 'Δ em pp dos 2 lançamentos mais recentes vs. os 2 anteriores.',
            'Tend. Rel.': 'Como a Tend. Abs., descontando a variação do próprio benchmark.',
            'Wins/N': 'Lançamentos acima do benchmark / total com dados.', 'Rep. méd.': 'Representatividade média do grupo na base de respondentes.'}
    for cid in CIDS:
        pan.append({'id': f'pan-{cid}-bench', 'type': 'table', 'title': LABEL[cid],
                    'cols': ['Conv. 60d pesquisa', 'Conv. 12m pesquisa', 'Uplift benchmark', 'Conv. total leads'], 'bind': {'dataset': f'crit_{cid}_bench'}})
        pg.add(f'pan-{cid}-bench', 'table', 12, 1)
        pan.append({'id': f'pan-{cid}-detail', 'type': 'table', 'title': LABEL[cid], 'defs': DEFS,
                    'cols': ['Grupo', 'Conv. 60d', 'Diff 60d', 'Conv. 12m', 'Diff 12m', 'Uplift 12m', 'Tend. Abs.', 'Tend. Rel.', 'Leitura', 'Wins/N', 'Rep. méd.'],
                    'colorScale': {'Diff 60d': 'diff', 'Diff 12m': 'diff', 'Uplift 12m': 'uplift'}, 'bind': {'dataset': f'crit_{cid}_detail'}})
        pg.add(f'pan-{cid}-detail', 'table', 12, 4)
    sections['s01'] = {'id': 's01', 'header': {'badge': 'Panorama', 'title': 'Panorama Geral',
                       'sub': f'Visão consolidada de todos os critérios · {N} lançamentos · use o filtro de canal no canto inferior direito.'}, 'widgets': pan}
    layouts['s01'] = pg.items

    # ── Insights (s10) ────────────────────────────────────────────────────
    ins, ig = [], Grid()
    for z, zone in enumerate(content['insights']['zones']):
        lid = f'ins-sec{z}'
        ins.append({'id': lid, 'type': 'eyebrow', 'n': zone['n'], 'color': zone['color'], 'title': zone['title'], 'caption': zone.get('caption', '')})
        ig.add(lid, 'eyebrow', 12, 1)
        w = 6 if len(zone['cards']) == 4 else 4
        for j, card in enumerate(zone['cards']):
            wid = f'ins-{z}-{j}'
            ins.append({'id': wid, 'type': 'find-block', 'card': True, 'tag': card['tag'], 'tagColor': card['tagColor'], 'title': card['title'], 'detail': card['detail']})
            ig.add(wid, 'find-block', w, 3)
        ig.newrow()
    ins.append({'id': 'ins-method', 'type': 'find-note', 'text': content['insights']['method']})
    ig.add('ins-method', 'find-note', 12, 1)
    sections['s10'] = {'id': 's10', 'header': content['insights']['header'], 'widgets': ins}
    layouts['s10'] = ig.items

    # ── Detalhamentos (s11): cross-cut autoral (opcional) + codependência ──
    det, dg = [], Grid()
    dcfg = content.get('detalhamentos', {})
    cards = {c['id']: c for c in dcfg.get('cards', [])}
    ebs = {e['id']: e for e in dcfg.get('eyebrows', [])}
    crosscut = dcfg.get('crosscut_crit', [])
    if 'det-hyp' in cards and len(crosscut) >= 2:
        cc1, cc2 = crosscut[0], crosscut[1]
        det.append({'id': 'det-hyp', 'type': 'find-block', 'card': True, **{k: cards['det-hyp'][k] for k in ('tag', 'tagColor', 'title', 'detail')}})
        dg.add('det-hyp', 'find-block', 12, 2)
        if 'det-eb1' in ebs:
            det.append({'id': 'det-eb1', 'type': 'eyebrow', **{k: ebs['det-eb1'].get(k) for k in ('n', 'color', 'title', 'caption')}})
            dg.add('det-eb1', 'eyebrow', 12, 1)
        det.append({'id': 'det-perfil', 'type': 'chart', 'chartType': 'bar-horizontal', 'title': LABEL[cc1], 'diverging': True, 'axisMin': -110, 'axisMax': 110, 'showLabels': True, 'bind': {'dataset': f'crit_{cc1}_grp', 'x': 'grupo', 'y': 'diff_lcto', 'agg': 'avg'}})
        det.append({'id': 'det-patrim', 'type': 'chart', 'chartType': 'bar-horizontal', 'title': LABEL[cc2], 'diverging': True, 'axisMin': -110, 'axisMax': 110, 'showLabels': True, 'bind': {'dataset': f'crit_{cc2}_grp', 'x': 'grupo', 'y': 'diff_lcto', 'agg': 'avg'}})
        dg.add('det-perfil', 'chart', 6, 3); dg.add('det-patrim', 'chart', 6, 3)
        if 'det-eb2' in ebs:
            det.append({'id': 'det-eb2', 'type': 'eyebrow', **{k: ebs['det-eb2'].get(k) for k in ('n', 'color', 'title', 'caption')}})
            dg.add('det-eb2', 'eyebrow', 12, 1)
        extra = [c for c in dcfg.get('cards', []) if c['id'] != 'det-hyp'][:3]
        for idx, card in enumerate(extra):
            wid = f'det-i{idx + 1}'
            det.append({'id': wid, 'type': 'find-block', 'card': True, **{kk: card[kk] for kk in ('tag', 'tagColor', 'title', 'detail')}})
            dg.add(wid, 'find-block', 4, 3)

    # ── Zona Relevância × Codependência — FILTRÁVEL por canal ──────────────
    # Codependência sem relevância não prioriza (um fator pode ser independente mas
    # mexer pouco na conversão). Cruzamos amplitude (quanto move) × independência
    # (sinal próprio ou proxy). Calculado nos 3 canais → datasets long-format com
    # filters:["canal"], consumidos por heatmap + tabela bound (reagem ao filtro).
    REL_ALTA, REL_MED = 30.0, 12.0   # amplitude (% vs benchmark, desvio médio ponderado)
    crit_spec = [{'id': c['id'], 'label': c['label'], 'col': c['col'], 'canon': CANON[c['id']]} for c in CRIT]
    cods = {canal: cc.codependencia(rows, crit_spec, dims, canal, LCTOS_ID) for canal in CANAIS}
    relv = {canal: {cid: cc.relevancia(DATA[cid][canal]) for cid in CIDS} for canal in CANAIS}
    cod = cods[CANAIS[0]]  # referência p/ o resumo no fim

    assoc_rows, fator_rows = [], []
    for canal in CANAIS:
        cz = cods[canal]; ids = cz['ids']
        for i, a in enumerate(ids):
            for j, b in enumerate(ids):
                v = cz['matrix'][i][j]
                assoc_rows.append({'canal': canal, 'fatorA': ABBR[a], 'fatorB': ABBR[b],
                                   'valor': '—' if i == j else f'{v:.2f}', 'cls': 'cn0' if i == j else assoc_cls(v)})
        for cid in sorted(ids, key=lambda c: -relv[canal][c]):
            f = cz['fatores'][cid]; a = relv[canal][cid]; s = f['survival_min']
            papel = ('baixo impacto' if a < REL_MED else
                     (f"proxy de {ABBR.get(f['explicado_por'], '')}" if f['papel'] == 'qualificante' else 'qualificador'))
            fator_rows.append({'canal': canal, 'Fator': ABBR[cid], 'Amplitude': f'{a:.0f}%',
                               'Independ.': f'{s*100:.0f}%', 'Papel': papel})
    add_table('cod_assoc', ['fatorA', 'fatorB'], assoc_rows)
    add_table('cod_fatores', ['Fator'], fator_rows)

    # s11 (Detalhamentos) fica só com o cross-cut autoral; a codependência ganha
    # PÁGINA PRÓPRIA (s12). Sem cross-cut, s11 nem é criada — a página Detalhamentos
    # passa a ser povoada sob demanda pelos detalhamentos das perguntas norteadoras.
    has_det = len(det) > 0
    if has_det:
        sections['s11'] = {'id': 's11', 'header': dcfg.get('header', {'badge': 'Detalhamentos', 'title': 'Detalhamentos'}), 'widgets': det}
        layouts['s11'] = dg.items

    cod_w = [
        {'id': 'cod-eb', 'type': 'eyebrow', 'n': '⚖', 'color': 'purple', 'title': 'RELEVÂNCIA × CODEPENDÊNCIA',
         'caption': 'o que move a conversão (amplitude) e se o sinal é próprio ou proxy — reage ao filtro de canal'},
        {'id': 'cod-hm', 'type': 'heatmap', 'bind': {'dataset': 'cod_assoc'},
         'rowKey': 'fatorA', 'colKey': 'fatorB', 'valKey': 'valor', 'clsKey': 'cls',
         'caption': "Associação (Cramér's V): quanto mais escuro, mais os dois critérios se explicam mutuamente."},
        {'id': 'cod-tbl', 'type': 'table', 'title': 'Relevância × Independência',
         'cols': ['Fator', 'Amplitude', 'Independ.', 'Papel'], 'bind': {'dataset': 'cod_fatores'},
         'colorScale': {'Amplitude': 'amp', 'Independ.': 'surv'},
         'defs': {
             'Amplitude': 'Desvio médio do diff vs. benchmark entre os grupos, ponderado pela representatividade — quanto o fator de fato move a conversão (alta ≥30% · média ≥12% · baixa <12%).',
             'Independ.': '% do sinal de conversão que sobrevive ao controlar pelo fator mais associado. Alto = sinal próprio (qualificador); baixo = proxy de outro fator.',
             'Papel': 'Veredito: qualificador (sinal próprio e relevante) · proxy de X (relevante, mas explicado por X) · baixo impacto (amplitude baixa).',
         }},
        {'id': 'cod-note', 'type': 'find-note', 'text': 'Associação ≠ causalidade. Amplitude e lift controlado são indícios sobre a distribuição de leads — use para priorizar, confirmando no nível do lead quando possível. Tudo nesta página reage ao filtro de canal.'},
    ]
    sections['s12'] = {'id': 's12', 'header': {'badge': 'Codependência', 'title': 'Relevância × Codependência'}, 'widgets': cod_w}
    layouts['s12'] = [
        {'id': 'cod-eb', 'type': 'eyebrow', 'x': 0, 'y': 0, 'w': 12, 'h': 1},
        {'id': 'cod-hm', 'type': 'heatmap', 'x': 0, 'y': 1, 'w': 7, 'h': 6},
        {'id': 'cod-tbl', 'type': 'table', 'x': 7, 'y': 1, 'w': 5, 'h': 6},
        {'id': 'cod-note', 'type': 'find-note', 'x': 0, 'y': 7, 'w': 12, 'h': 1},
    ]

    # ── navegação ─────────────────────────────────────────────────────────
    all_pages = [{'id': 'panorama', 'label': 'Panorama', 'sections': [{'id': 's01', 'label': 'Panorama Geral'}]},
                 {'id': 'insights', 'label': 'Insights', 'sections': [{'id': 's10', 'label': content['insights']['header']['title']}]}]
    if has_det:
        all_pages.append({'id': 'detalhamentos', 'label': 'Detalhamentos', 'sections': [{'id': 's11', 'label': sections['s11']['header'].get('title', 'Detalhamentos')}]})
    all_pages.append({'id': 'codependencia', 'label': 'Codependência', 'sections': [{'id': 's12', 'label': 'Relevância × Codependência'}]})
    for ci, c in enumerate(CRIT):
        all_pages.append({'id': c['id'], 'label': c['tab'], 'sections': [{'id': f's{ci + 2:02d}', 'label': c['label']}]})

    created = config.get('created_at') or datetime.date.today().isoformat()
    # 'Geral' é um canal REAL (o combinado), não um "sem filtro" — por isso NÃO se
    # declara allValue: senão o app trataria o default como "não filtrar" e mostraria
    # as 3 fatias (Geral/Pago/Orgânico) somadas/duplicadas em toda tabela e gráfico.
    _wl = {'lcto': '60d', '6m': '6m', '12m': '12m'}
    data_json = {'meta': {'client': config['client'], 'title': config['title'], 'type': 'dashboard', 'theme': 'light',
                          'created_at': created, 'filters': [{'id': 'canal', 'label': 'Canal', 'options': CANAIS, 'default': CANAIS[0]}],
                          'cover': {'eyebrow': f"{config.get('client_name') or config['client']} · Relatório",
                                    'title': config['title'],
                                    'meta': [f"{N} lançamentos", f"{len(CIDS)} critérios de perfil",
                                             f"janelas {_wl.get(WINDOW, WINDOW)} · {_wl.get(LONG, LONG)}"]}},
                 'pages': all_pages}

    preserve(out_dir, data_json, sections)   # detalhamentos, perguntas e modais sobrevivem à regeneração
    preserve_dataset(out_dir, dataset)       # tabelas q-* dos detalhamentos sobrevivem

    def dump(name, obj): json.dump(obj, open(os.path.join(out_dir, name), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    dump('dataset.json', dataset); dump('data.json', data_json)
    dump('layout.json', {'sections': layouts, 'updatedAt': f'{created}T00:00:00.000Z'})
    for sid, sec in sections.items(): dump(f'{sid}.json', sec)

    return {'tables': len(dataset), 'sections': len(sections), 'pages': len(all_pages),
            'codependencia': {k: v['papel'] for k, v in cod['fatores'].items()}, 'out_dir': out_dir}


if __name__ == '__main__':
    if len(sys.argv) < 5:
        print('uso: py -3 build_report.py <config.json> <content.json> <csv_path> <out_dir>'); sys.exit(1)
    cfg_path, content_path, csv_path, out_dir = sys.argv[1:5]
    config = json.load(open(cfg_path, encoding='utf-8'))
    content = json.load(open(content_path, encoding='utf-8'))
    summ = build(csv_path, config, content, out_dir)
    print('OK ->', summ['out_dir'])
    print('tabelas:', summ['tables'], '| seções:', summ['sections'], '| páginas:', summ['pages'])
    print('codependência papéis:', summ['codependencia'])
