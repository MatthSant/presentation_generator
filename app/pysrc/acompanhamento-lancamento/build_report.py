"""build_report — gerador do "acompanhamento de lançamento" (3 camadas do app).

`assemble(rows, config, content, opts)` (puro) → {dataset, data, layout, sections}.
`build(csv, config, content, out_dir)` carrega o CSV, chama assemble e grava.

config: { client, title, slug, field_conversion?, data_corte?, data_report?,
          nome_campanha?, metas?{cpl,cpmql,...}, goals_csv?, dict_links? }

Descritivo/determinístico — o número nasce no calc.py; a IA (Insights) entra via
`content`. Mapeia o one-pager tático (Visão Geral · Evolução · Canais · Tráfego) para
páginas do app usando widgets de plataforma (kpi-card, chart, table, find-block).
"""
import sys, os, json, datetime
_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _here)
sys.path.insert(0, os.path.dirname(_here))   # pysrc/ → pacote common
import calc
from common.layout import Grid
from common.fmt import money, pctf, intf
from common.preserve import preserve, preserve_dataset

PCT = {'taxa_resp', 'taxa_qual', 'conv_pag', 'hook', 'hold', 'ctr', 'connect'}
INT = {'leads'}  # contagem — nem % nem dinheiro
# Nome da taxa de cada transição do funil (alinhado às 5 transições de FUNNEL_STAGES).
FUNNEL_RATE = ['CTR', 'Connect Rate', 'Conv. de Página', 'Taxa de Resposta', 'Qualidade']
# Ícones limitados ao set do renderer (renderer.ts → ICONS).
ICON = {'leads': ('users', '#7C3AED'), 'investimento': ('coin', '#534AB7'), 'cpl': ('credit-card', '#185FA5'), 'cpmql': ('star', '#854F0B'),
        'taxa_resp': ('arrows-left-right', '#3B6D11'), 'taxa_qual': ('circle-check', '#534AB7'),
        'conv_pag': ('target', '#185FA5'), 'cpm': ('database', '#534AB7'), 'hook': ('bolt', '#EF9F27'),
        'hold': ('trending-up', '#854F0B'), 'ctr': ('trending-up', '#3B6D11'),
        'connect': ('refresh', '#185FA5')}


def vfmt(metric, v):
    if v is None:
        return '—'
    if metric in PCT:
        return pctf(v)
    if metric in INT:
        return intf(v)
    return money(v)


def assemble(rows, config, content, opts=None):
    config = config or {}
    B = calc.build(rows, config)
    dataset, sections, layouts = {}, {}, {}

    def add_table(name, dims, rows_):
        dataset[name] = {'dims': list(dims), 'filters': [], 'rows': rows_}

    def trend_delta(metric):
        tr = B['trend'].get(metric)
        if not tr or tr['dir'] == 'neutro':
            return '◦ estável', 'neutral'
        arrow = '▲' if tr['dir'] == 'up' else '▼'
        # investimento: variação de gasto não é boa nem ruim → tom neutro
        if metric == 'investimento':
            tone = 'neutral'
        else:
            tone = 'pos' if tr.get('good') else ('neg' if tr.get('good') is False else 'neutral')
        return f"{arrow} {tr['pct']:.0f}% · 3d", tone

    def kpi_sub(metric):
        parts = [f"3d {vfmt(metric, B['d3'].get(metric))}"]
        st = B['meta_status'].get(metric)
        meta = B['meta'].get(metric)
        if st and meta is not None:
            sym = {'ok': '✓', 'warn': '⚠', 'bad': '✕'}[st['cls']]
            parts.append(f"meta {vfmt(metric, meta)} · {st['dev']:+.0f}% {sym}")
        return ' · '.join(parts)

    def kcard(arr, pg, metric, prefix='k'):
        wid = f'{prefix}-{metric}'
        ic, color = ICON.get(metric, ('chart-bar', '#534AB7'))
        flag_txt, flag_tone = trend_delta(metric)
        card = {'id': wid, 'type': 'kpi-card', 'tier': 'feature',
                'label': calc.LABELS[metric], 'value': vfmt(metric, B['tot'].get(metric)),
                'icon': ic, 'iconColor': color}
        # tendência 3d (vs início) — inline ao lado do valor, presente em todas as métricas
        if flag_txt:
            card['flag'] = {'text': flag_txt, 'tone': flag_tone}
        # rodapé de meta + desvio com selo ✓/⚠/✕ (fixo no fim do card)
        st = B['meta_status'].get(metric)
        meta = B['meta'].get(metric)
        if st and meta is not None:
            glabel = 'meta (proj.)' if metric == 'investimento' else 'meta'
            card['goal'] = {'label': f"{glabel} {vfmt(metric, meta)}", 'delta': f"{st['dev']:+.0f}%", 'status': st['cls']}
        arr.append(card)
        pg.add(wid, 'kpi-card', 2, 2)   # w:2 → 6 KPIs numa linha só; h:2 — card compacto (h:4 desperdiçava metade da altura)

    def risk_blocks(arr, pg, risks, prefix):
        for i, r in enumerate(risks):
            sym = '⚠' if r['cls'] == 'warn' else '✕'
            arr.append({'id': f'{prefix}-risk-{i}', 'type': 'find-block', 'card': True,
                        'tag': f"{sym} {r['label']}", 'tagColor': 'r' if r['cls'] == 'bad' else 'a',
                        'title': f"{vfmt(r['metric'], r['value'])} · {r['meta_dev']:+.0f}% vs meta",
                        'detail': RISK_IMPACT.get(r['metric'], '')})
            pg.add(f'{prefix}-risk-{i}', 'find-block', 6, 2)

    # ── dataset diário (charts) ──────────────────────────────────────────────
    add_table('acom_daily', ['dia'], [
        {'dia': d['label'], 'cum': d['cum'], 'leads': d['leads'], 'invest': round(d['sums']['invest'], 2),
         'cpl': d['cpl'], 'cpmql': d['cpmql'], 'taxa_qual': d['taxa_qual'], 'cpm': d['cpm']}
        for d in B['days']])
    sp = B['split']
    add_table('acom_origem', ['origem'], [{'origem': 'Pago', 'leads': sp['leads_pago']},
                                          {'origem': 'Orgânico', 'leads': sp['leads_org']}])
    # canais orgânicos por utm_source (top 8) — alimenta o breakdown da seção Canais
    add_table('acom_canais', ['canal'], [{'canal': c['source'], 'leads': c['leads']}
                                         for c in B['canais_org'][:8]])
    # agregados (não têm widget próprio; alimentam perguntas norteadoras + deep mode)
    add_table('acom_kpis', ['metric'], [
        {'metric': m, 'label': calc.LABELS[m], 'grupo': 'macro' if m in calc.KPI_MACRO else 'trafego',
         'value': B['tot'].get(m), 'd3': B['d3'].get(m), 'meta': B['meta'].get(m),
         'dev': (B['meta_status'].get(m) or {}).get('dev'), 'cls': (B['meta_status'].get(m) or {}).get('cls'),
         'trend_dir': B['trend'].get(m, {}).get('dir'), 'trend_pct': B['trend'].get(m, {}).get('pct')}
        for m in dict.fromkeys(calc.KPI_MACRO + calc.KPI_TRAF)])
    add_table('acom_funnel', ['etapa'], [
        {'etapa': s['label'], 'value': s['value'],
         'migracao': (s.get('trans') or {}).get('migracao'), 'bench': (s.get('trans') or {}).get('bench'),
         'gap': (s.get('trans') or {}).get('gap'), 'maior_furo': bool((s.get('trans') or {}).get('maior_furo'))}
        for s in B['funnel_total']])

    # ════ s01 — Visão Geral ════════════════════════════════════════════════
    pan, pg = [], Grid()
    pan.append({'id': 'pan-eb-vg', 'type': 'eyebrow', 'title': 'CAPTAÇÃO',
                'caption': f"leads captados, origem e atingimento de meta · dia {B['dia_campanha']} · dados até {B['corte_label']}"})
    pg.add('pan-eb-vg', 'eyebrow', 12, 1)

    # acumulado de leads (barras, últimas 3 destacadas) + linhas de meta + número-destaque
    mt = B['meta'].get('_leads_total')
    mtd = B['meta'].get('_leads_td')
    leads_tot = B['tot_sums']['leads']
    cum_chart = {'id': 'pan-cum', 'type': 'chart', 'chartType': 'bar', 'title': 'Total de Leads Captados',
                 'headline': {'value': intf(leads_tot), 'caption': f"acumulado até {B['corte_label']}"},
                 'height': 230, 'colors': ['#AFA9EC', '#534AB7'], 'highlightLast': 3,
                 'categories': B['series']['labels'], 'series': [{'name': 'Acumulado', 'data': B['series']['cum']}]}
    goals = []
    if mt:
        goals.append({'value': round(mt), 'label': f'Meta total ({intf(mt)})', 'color': '#EF9F27'})
    if mtd:
        goals.append({'value': round(mtd), 'label': f'Meta to date ({intf(mtd)})', 'color': '#3B6D11'})
    if goals:
        cum_chart['goalLines'] = goals
        cum_max = max([v for v in B['series']['cum'] if isinstance(v, (int, float))] + [g['value'] for g in goals])
        cum_chart['axisMax'] = round(cum_max * 1.06)
    pan.append(cum_chart)

    # Hero de uma tela: à direita, bandas de atingimento (% grande, 1 linha cada) +
    # donut compacto (3 linhas); à esquerda, o gráfico de leads estica para fechar na
    # mesma base. A altura de gráfico no read-path = cells×80 − chrome, então o span
    # do grid é o que dimensiona — mantê-lo enxuto é o que faz a seção caber na dobra.
    DONUT_H = 3
    hero_lay = [{'id': 'pan-eb-vg', 'type': 'eyebrow', 'x': 0, 'y': 0, 'w': 12, 'h': 1}]
    ry = 1
    if mt:
        at = calc.pct(leads_tot, mt) or 0
        # Meta Geral = progresso vs a meta TOTAL (naturalmente abaixo no meio da campanha),
        # então é o card de DESTAQUE (roxo escuro), não um semáforo de performance.
        pan.append({'id': 'pan-meta-geral', 'type': 'kpi-card', 'tier': 'feature', 'band': True,
                    'label': 'Atingimento · Meta Geral', 'value': f'{intf(leads_tot)} / {intf(mt)}',
                    'sub': 'leads captados vs meta total da campanha',
                    'delta': f'{at:.1f}%', 'deltaTone': 'emph'})
        hero_lay.append({'id': 'pan-meta-geral', 'type': 'kpi-card', 'x': 5, 'y': ry, 'w': 7, 'h': 1}); ry += 1
    if mtd:
        atd = calc.pct(leads_tot, mtd) or 0
        # Meta To Date = performance vs o esperado p/ hoje → semáforo: ≥95% no rumo (verde),
        # 80–95% atenção (âmbar), <80% abaixo (vermelho). 98,4% deixa de ser âmbar.
        pan.append({'id': 'pan-meta-td', 'type': 'kpi-card', 'tier': 'feature', 'band': True,
                    'label': 'Atingimento · Meta To Date', 'value': f'{intf(leads_tot)} / {intf(mtd)}',
                    'sub': f'leads captados vs meta esperada até {B["corte_label"]}',
                    'delta': f'{atd:.1f}%', 'deltaTone': 'pos' if atd >= 95 else ('neg' if atd < 80 else 'neutral')})
        hero_lay.append({'id': 'pan-meta-td', 'type': 'kpi-card', 'x': 5, 'y': ry, 'w': 7, 'h': 1}); ry += 1
    pan.append({'id': 'pan-donut', 'type': 'chart', 'chartType': 'donut', 'title': 'Pago × Orgânico',
                'height': 185, 'colors': ['#534AB7', '#97C459'], 'donutTotal': True, 'totalLabel': 'leads',
                'legendValues': True,
                'bind': {'dataset': 'acom_origem', 'x': 'origem', 'y': 'leads'}})
    hero_lay.append({'id': 'pan-donut', 'type': 'chart', 'x': 5, 'y': ry, 'w': 7, 'h': DONUT_H})
    bottom = ry + DONUT_H                          # base comum da coluna direita
    cum_h = bottom - 1                             # gráfico de leads vai do topo até a base
    hero_lay.insert(1, {'id': 'pan-cum', 'type': 'chart', 'x': 0, 'y': 1, 'w': 5, 'h': cum_h})
    # prima o grid com o layout manual do hero; os KPIs fluem a partir do fim do hero.
    pg.items = hero_lay
    pg.x, pg.y, pg.rowh = 0, bottom, 0

    pan.append({'id': 'pan-eb-kpi', 'type': 'eyebrow', 'title': 'KPIS MACRO', 'caption': '6 indicadores · valor geral · 3 dias · tendência · meta'})
    pg.add('pan-eb-kpi', 'eyebrow', 12, 1)
    for m in calc.KPI_MACRO:
        kcard(pan, pg, m)

    if B['risks_macro']:
        pan.append({'id': 'pan-eb-risk', 'type': 'eyebrow', 'n': '!', 'color': 'red',
                    'title': 'PRINCIPAIS RISCOS', 'caption': 'KPIs com maior desvio negativo vs meta'})
        pg.add('pan-eb-risk', 'eyebrow', 12, 1)
        risk_blocks(pan, pg, B['risks_macro'], 'pan')

    sections['s01'] = {'id': 's01', 'header': {'badge': 'Visão Geral', 'title': B['nome'],
                       'sub': f"Acompanhamento tático · dia {B['dia_campanha']} · emitido {B['report_date'] or '—'}"}, 'widgets': pan}
    layouts['s01'] = pg.items

    # ════ s02 — Evolução Diária ════════════════════════════════════════════
    # (o eyebrow do grupo é o divisor injetado no merge — não duplicar aqui)
    evo, eg = [], Grid()

    def chart(wid, title, y, ctype, pct, vf, color='#534AB7', w=6, trendkey=None):
        c = {'id': wid, 'type': 'chart', 'chartType': ctype, 'title': title, 'height': 280,
             'pct': pct, 'valueFormat': vf, 'bind': {'dataset': 'acom_daily', 'x': 'dia', 'y': y}}
        if ctype == 'bar':
            c['colors'] = ['#AFA9EC', '#534AB7']; c['highlightLast'] = 3   # últimas 3 = roxo forte
        else:
            c['colors'] = [color]
        if trendkey:
            txt, tone = trend_delta(trendkey)
            if txt and txt != 'estável':
                c['badge'] = {'text': txt, 'tone': tone}
        evo.append(c)
        eg.add(wid, 'chart', w, 4)
    chart('evo-leads', 'Leads por dia', 'leads', 'bar', False, 'int', w=6, trendkey='leads')
    chart('evo-invest', 'Investimento por dia (R$)', 'invest', 'bar', False, 'money', w=6, trendkey='investimento')
    chart('evo-cpl', 'CPL por dia (R$)', 'cpl', 'area', False, 'money', '#EF4444', w=4, trendkey='cpl')
    chart('evo-qual', 'Taxa de Qualidade (%)', 'taxa_qual', 'area', True, 'pct', '#EF9F27', w=4, trendkey='taxa_qual')
    chart('evo-cpmql', 'CPMQL por dia (R$)', 'cpmql', 'area', False, 'money', '#EF4444', w=4, trendkey='cpmql')
    sections['s02'] = {'id': 's02', 'header': {'badge': 'Evolução', 'title': 'Evolução Diária',
                       'sub': 'Leads, investimento, CPL, qualidade e CPMQL ao longo dos dias.'}, 'widgets': evo}
    layouts['s02'] = eg.items

    # ════ s03 — Canais & Audiência ═════════════════════════════════════════
    can, cg = [], Grid()
    # Origem do Tráfego (bar-list hierárquico: Pago/Orgânico + canais) + Temperatura
    # (bar-list + cards de CPL médio) — 2 colunas. Widget único 'bar-list'.
    can.append({'id': 'can-eb-orig', 'type': 'eyebrow', 'title': 'ORIGEM E TEMPERATURA', 'caption': 'distribuição dos leads'})
    cg.add('can-eb-orig', 'eyebrow', 12, 1)
    sp = B['split']; tot_leads = sp['leads_pago'] + sp['leads_org']
    orig_rows = [
        {'label': 'Pago', 'value': intf(sp['leads_pago']), 'pct': calc.pct(sp['leads_pago'], tot_leads) or 0,
         'bar': sp['leads_pago'], 'icon': 'credit-card', 'color': '#7C3AED'},
        {'label': 'Orgânico', 'value': intf(sp['leads_org']), 'pct': calc.pct(sp['leads_org'], tot_leads) or 0,
         'bar': sp['leads_org'], 'icon': 'sprout', 'color': '#A78BFA'},
    ]
    for c in B['canais_org'][:6]:
        orig_rows.append({'label': c['source'], 'value': intf(c['leads']), 'pct': c.get('pct') or 0,
                          'bar': c['leads'], 'indent': True, 'color': '#C3A4F7'})
    can.append({'id': 'can-orig', 'type': 'bar-list', 'title': 'Origem do Tráfego', 'rows': orig_rows})
    cg.add('can-orig', 'bar-list', 6, 4)
    # temperatura — bar-list (Quente/Morno) + cards de stat com CPL médio em destaque
    if B['temp']:
        TC = {'Quente': '#DC2626', 'Morno': '#EA580C', 'Frio': '#2563EB', 'Indefinido': '#9b98a3'}
        TI = {'Quente': 'flame', 'Morno': 'sun'}
        TT = {'Quente': 'red', 'Morno': 'green', 'Frio': 'purple', 'Indefinido': 'purple'}
        temp_items = [(t, v) for t, v in B['temp'].items() if v.get('leads')]
        temp_tot = sum(v['leads'] for _, v in temp_items) or 1
        temp_rows = [{'label': t, 'value': intf(v['leads']), 'pct': calc.pct(v['leads'], temp_tot) or 0,
                      'bar': v['leads'], 'icon': TI.get(t), 'color': TC.get(t, '#7C3AED')} for t, v in temp_items]
        temp_cards = [{'label': t, 'tone': TT.get(t, 'purple'), 'icon': TI.get(t),
                       'stats': [{'label': 'Leads', 'value': intf(v['leads'])}, {'label': 'Invest', 'value': money(v['invest'])}],
                       'headline': {'label': 'CPL médio', 'value': vfmt('cpl', v['cpl'])}} for t, v in temp_items]
        can.append({'id': 'can-temp', 'type': 'bar-list', 'title': 'Temperatura · tráfego pago', 'rows': temp_rows, 'cards': temp_cards})
        cg.add('can-temp', 'bar-list', 6, 4)
    # tipo de lead (6 células como kpi-cards)
    tl = B['tipo_lead']
    can.append({'id': 'can-eb-tipo', 'type': 'eyebrow', 'title': 'TIPO DE LEAD', 'caption': 'novos, antigos e clientes por origem'})
    cg.add('can-eb-tipo', 'eyebrow', 12, 1)
    # tom por categoria (como na fonte): roxo na base, vermelho no pago, verde no orgânico.
    tl_cells = [
        ('Leads Novos', tl['novos'], calc.pct(tl['novos'], tl['novos'] + tl['antigos']), 'do total', 'p'),
        ('Leads Antigos', tl['antigos'], calc.pct(tl['antigos'], tl['novos'] + tl['antigos']), 'do total', 'p'),
        ('Antigos · Pago', tl['antigos_pago'], calc.pct(tl['antigos_pago'], tl['antigos']), 'dos antigos', 'r'),
        ('Antigos · Orgânico', tl['antigos_org'], calc.pct(tl['antigos_org'], tl['antigos']), 'dos antigos', 'g'),
        ('Clientes · Pago', tl['cli_pago'], calc.pct(tl['cli_pago'], tl['cli_total']), 'dos clientes', 'p'),
        ('Clientes · Orgânico', tl['cli_org'], calc.pct(tl['cli_org'], tl['cli_total']), 'dos clientes', 'g'),
    ]
    for i, (lbl, val, p, suf, tint) in enumerate(tl_cells):
        can.append({'id': f'can-tl-{i}', 'type': 'kpi-card', 'tier': 'volume', 'label': lbl, 'tint': tint,
                    'value': intf(val), 'sub': f'{(p or 0):.1f}% {suf}', 'icon': 'users', 'iconColor': '#534AB7'})
        cg.add(f'can-tl-{i}', 'kpi-card', 4, 2)
    # criativos do último dia (best/worst)
    cr = B['criativos']
    if cr['best'] or cr['eff']:
        can.append({'id': 'can-eb-cri', 'type': 'eyebrow', 'title': 'CRIATIVOS',
                    'caption': f"maior volume e mais eficientes por CPMQL projetado · campanha até {B['corte_label']}"})
        cg.add('can-eb-cri', 'eyebrow', 12, 1)

        def cri_list_rows(lst, eff=False):
            rows = []
            for c in lst:
                meta = f"R$ {intf(c['invest'])} invest · CPL {vfmt('cpl', c['cpl'])} · TQ {pctf(c['taxa_qual'])}"
                if eff:
                    meta += f" · {intf(c['respostas'])} resp."
                rows.append({'name': c['name'], 'link': c.get('link') or None, 'meta': meta,
                             'stats': [{'value': intf(c['leads']), 'label': 'leads'},
                                       {'value': vfmt('cpmql', c['cpmql_proj']), 'label': 'CPMQL proj.', 'tone': 'neg'}]})
            return rows
        if cr['best']:
            can.append({'id': 'can-cri-best', 'type': 'cri-list', 'title': 'Maior volume',
                        'rows': cri_list_rows(cr['best'])})
            cg.add('can-cri-best', 'cri-list', 6, 4)
        if cr['eff']:
            can.append({'id': 'can-cri-eff', 'type': 'cri-list', 'title': 'Menor CPMQL projetado',
                        'caption': 'Corte: só criativos com ≥ 20 respostas de pesquisa — base mínima para o CPMQL projetado ser confiável.',
                        'rows': cri_list_rows(cr['eff'], eff=True)})
            cg.add('can-cri-eff', 'cri-list', 6, 4)
    sections['s03'] = {'id': 's03', 'header': {'badge': 'Canais', 'title': 'Canais e Audiência',
                       'sub': 'Origem, temperatura, tipo de lead e criativos do último dia.'}, 'widgets': can}
    layouts['s03'] = cg.items

    # ════ s04 — Tráfego Pago ═══════════════════════════════════════════════
    tra, tg = [], Grid()
    tra.append({'id': 'tra-eb-kpi', 'type': 'eyebrow', 'title': 'INDICADORES DE TRÁFEGO PAGO', 'caption': '6 indicadores de mídia'})
    tg.add('tra-eb-kpi', 'eyebrow', 12, 1)
    for m in calc.KPI_TRAF:
        kcard(tra, tg, m, 'kt')
    if B['risks_traf']:
        tra.append({'id': 'tra-eb-risk', 'type': 'eyebrow', 'n': '!', 'color': 'red',
                    'title': 'RISCOS DE TRÁFEGO', 'caption': 'KPIs de tráfego com maior desvio'})
        tg.add('tra-eb-risk', 'eyebrow', 12, 1)
        risk_blocks(tra, tg, B['risks_traf'], 'tra')
    # funis (total + últimos 3 dias) como tabelas
    tra.append({'id': 'tra-eb-fun', 'type': 'eyebrow', 'title': 'FUNIL DE TRÁFEGO PAGO',
                'caption': 'Impressões → Cliques → Pageviews → Leads → Respostas → MQLs'})
    tg.add('tra-eb-fun', 'eyebrow', 12, 1)

    def funnel_widget(wid, title, sub, stages, w=6):
        # Widget de funil visual: barras degradê por etapa + pills perda/migram por
        # transição + MAIOR FURO (relativo ao benchmark) + dado inválido.
        steps = [{'label': s['label'], 'value': s['value']} for s in stages]
        trans = []
        for i in range(len(stages) - 1):
            tr = stages[i].get('trans') or {}
            if tr.get('invalid'):
                trans.append({'invalid': True})
            elif 'migracao' in tr:
                t = {'loss': tr['perda'], 'migrate': tr['migracao']}
                if tr.get('bench'):
                    t['bench'] = tr['bench']
                if tr.get('gap') is not None:
                    t['gap'] = tr['gap']
                if tr.get('maior_furo'):
                    t['worst'] = True
                trans.append(t)
            else:
                trans.append({})
        tra.append({'id': wid, 'type': 'funnel', 'title': title, 'sub': sub, 'steps': steps, 'transitions': trans})
        tg.add(wid, 'funnel', w, 7)
    funnel_widget('tra-fun-tot', 'Funil Total da Campanha', f"{B['n_dias']} dias", B['funnel_total'])
    funnel_widget('tra-fun-3d', 'Funil · Últimos 3 dias', 'dias recentes', B['funnel_3d'])
    sections['s04'] = {'id': 's04', 'header': {'badge': 'Tráfego', 'title': 'Indicadores de Tráfego Pago',
                       'sub': 'CPM, Hook, Hold, CTR, Connect, Conversão de Página e funil de conversão.'}, 'widgets': tra}
    layouts['s04'] = tg.items

    # ── merge: dashboard de leitura rápida numa ÚNICA página ──────────────────
    # Acompanhamento é leitura rápida: os 4 grupos (Visão Geral, Evolução, Canais,
    # Tráfego) empilham numa só seção rolável, cada um aberto por um eyebrow-divisor.
    # Só Detalhamentos e Perguntas ficam em páginas à parte (criadas pela rota/preserve).
    groups = [('s01', None, None), ('s02', 'EVOLUÇÃO DIÁRIA', 'séries por dia da campanha'),
              ('s03', 'CANAIS E AUDIÊNCIA', None), ('s04', 'TRÁFEGO PAGO', None)]
    merged_w, merged_items, y_off = [], [], 0
    for sid, divider, dcap in groups:
        if divider:   # s02+ ganham um divisor com o nome do grupo (s01 usa o header da página)
            did = f'div-{sid}'
            dw = {'id': did, 'type': 'eyebrow', 'title': divider}
            if dcap:
                dw['caption'] = dcap
            merged_w.append(dw)
            merged_items.append({'id': did, 'type': 'eyebrow', 'x': 0, 'y': y_off, 'w': 12, 'h': 1})
            y_off += 1
        merged_w.extend(sections[sid]['widgets'])
        for it in layouts[sid]:
            merged_items.append({**it, 'y': it['y'] + y_off})
        y_off += max((it['y'] + it['h'] for it in layouts[sid]), default=0)

    sections = {'s01': {'id': 's01', 'header': sections['s01']['header'], 'widgets': merged_w}}
    layouts = {'s01': merged_items}
    pages = [{'id': 'acompanhamento', 'label': 'Acompanhamento',
              'sections': [{'id': 's01', 'label': 'Acompanhamento'}]}]

    created = config.get('created_at') or datetime.date.today().isoformat()
    data_json = {'meta': {'client': config['client'], 'title': config['title'], 'type': 'dashboard',
                          'theme': 'light', 'created_at': created, 'filters': [],
                          'cover': {'eyebrow': f"{config.get('client_name') or config['client']} · Relatório", 'title': config['title'],
                                    'meta': [f"Dia {B['dia_campanha']} de campanha", f"{intf(B['tot_sums']['leads'])} leads captados"]},
                          'controls': {'kind': 'acompanhamento-lancamento',
                                       'pages': ['acompanhamento']}},
                 'pages': pages}
    return {'dataset': dataset, 'data': data_json,
            'layout': {'sections': layouts, 'updatedAt': f'{created}T00:00:00.000Z'},
            'sections': sections}


RISK_IMPACT = {
    'cpl': 'Custo de entrada do lead acima do planejado — dificulta atingir as metas de volume com o budget disponível.',
    'cpmql': 'Indicador com maior correlação com vendas — a projeção de retorno está pressionada e a probabilidade de ROI positivo reduzindo.',
    'taxa_resp': 'Amostra insuficiente para o nível de mapeamento da base — dificulta a qualificação e a projeção de conversão.',
    'taxa_qual': 'Base captada pior do que o planejado — pode afetar a conversão, pois o público tem perfil diferente do esperado.',
    'conv_pag': 'Funil com vazamento — leads e investimento perdidos no caminho. Pode ser incongruência criativo × página ou página fraca.',
    'hook': 'Anúncios pouco interessantes — a maioria passa sem parar para assistir. Revisar o criativo de abertura.',
    'hold': 'O anúncio chama atenção mas não sustenta — as pessoas saem antes do convite. Fortalecer o corpo do vídeo.',
    'ctr': 'Baixo interesse no convite do anúncio — incongruência entre anúncio e oferta, ou convite pouco atrativo.',
    'connect': 'Pessoas clicam mas não chegam na página — provável problema de velocidade ou performance técnica da página.',
}


def _load_dict_links(path):
    """CSV auxiliar (field_ad_name,link) → dict de links dos criativos."""
    import csv as _csv
    links = {}
    try:
        with open(path, encoding='utf-8-sig', errors='replace') as f:
            for r in _csv.DictReader(f):
                ad = (r.get('field_ad_name') or '').strip()
                if ad:
                    links[ad] = (r.get('link') or '').strip() or None
    except Exception:
        pass
    return links


def build(csv_path, config, content, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    if config.get('dict_csv') and not config.get('dict_links'):
        config['dict_links'] = _load_dict_links(config['dict_csv'])
    rows = calc.load_rows(csv_path)
    r = assemble(rows, config, content, {})
    preserve(out_dir, r['data'], r['sections'])
    preserve_dataset(out_dir, r['dataset'])   # tabelas q-* dos detalhamentos sobrevivem
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
