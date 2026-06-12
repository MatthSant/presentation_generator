"""build_report — gerador do "debriefing de lançamento" (3 camadas do app).

`assemble(rows, config, content, opts)` (puro) → {dataset, data, layout, sections}.
7 páginas: Panorama · Canal · Tráfego Pago · Orgânico · Temporal · Análise 360° ·
One Pager. Números nascem no calc.py; mapeados a widgets de plataforma (kpi-card,
chart, table, find-block, highlight). Toggle meta/histórico: v1 mostra Δ vs meta no
card e cita o histórico no sub (controle vivo fica para uma feature de plataforma).
"""
import sys, os, json, datetime
_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _here)
sys.path.insert(0, os.path.dirname(_here))
import calc
from common.layout import Grid
from common.fmt import money, pctf, xf, intf
from common.preserve import preserve


def _pp(v):
    return '—' if v is None else f'{v:+.1f} p.p.'


def _dev(real, meta, invert=False):
    """Δ% vs meta (+ = melhor). invert para custos (menor é melhor)."""
    if not meta:
        return None, 'neutral'
    d = (real - meta) / meta * 100
    if invert:
        d = -d
    tone = 'pos' if d >= 1 else ('neg' if d <= -1 else 'neutral')
    return d, tone


def assemble(rows, config, content, opts=None):
    config = config or {}
    M = calc.build(rows, config)
    G, H = M['goals'], M['hist']
    dataset, sections, layouts = {}, {}, {}

    def add_table(name, dims, rows_):
        dataset[name] = {'dims': list(dims), 'filters': [], 'rows': rows_}

    def km(arr, pg, wid, label, value, sub, icon, color, real=None, meta=None, invert=False, hist=None, w=4, h=3):
        card = {'id': wid, 'type': 'kpi-card', 'tier': 'feature', 'label': label, 'value': value,
                'sub': sub, 'icon': icon, 'iconColor': color}
        if real is not None and meta:
            d, tone = _dev(real, meta, invert)
            if d is not None:
                card['delta'] = f'{d:+.0f}% vs meta'; card['deltaTone'] = tone
                # dual delta para o toggle vs Meta / vs Histórico (hist = '—' sem histórico)
                dh, th = _dev(real, hist, invert) if hist else (None, 'neutral')
                card['cmp'] = {'meta': [f'{d:+.0f}% vs meta', tone],
                               'hist': ([f'{dh:+.0f}% vs hist.', th] if dh is not None else ['— vs hist.', 'neutral'])}
        arr.append(card); pg.add(wid, 'kpi-card', w, h)

    def ks(arr, pg, wid, label, value, sub, icon, color, w=3, h=2):
        arr.append({'id': wid, 'type': 'kpi-card', 'tier': 'volume', 'label': label, 'value': value,
                    'sub': sub, 'icon': icon, 'iconColor': color})
        pg.add(wid, 'kpi-card', w, h)

    def eb(arr, pg, wid, title, caption='', n=None, color=None):
        b = {'id': wid, 'type': 'eyebrow', 'title': title, 'caption': caption}
        if n:
            b['n'] = n
        if color:
            b['color'] = color
        arr.append(b); pg.add(wid, 'eyebrow', 12, 1)

    def fb(arr, pg, wid, tag, tagColor, title, detail, w=4, h=3):
        arr.append({'id': wid, 'type': 'find-block', 'card': True, 'tag': tag, 'tagColor': tagColor,
                    'title': title, 'detail': detail}); pg.add(wid, 'find-block', w, h)

    def table(arr, pg, wid, title, cols, rows_, w=12, h=4):
        arr.append({'id': wid, 'type': 'table', 'title': title, 'cols': cols, 'rows': rows_})
        pg.add(wid, 'table', w, h)

    # daily dataset (gráficos)
    add_table('deb_daily', ['data'], [
        {'data': d['label'], 'leads': d['l_all'], 'l_pago': d['l_pago'], 'l_org': d['l_org'],
         'vendas': d['v_all'], 'conv': d['c_all'], 'q_pago': d['q_pago']} for d in M['daily']])
    # agregados (gráficos do 360° + perguntas norteadoras + deep mode)
    add_table('deb_chan', ['canal'], [
        {'canal': c['canal'], 'tipo': c['tipo'], 'leads': c['leads'], 'vendas': c['vendas'],
         'conv': c['conv'], 'qual': c['qual'], 'fat': c['fat']} for c in M['chan']])
    add_table('deb_temp', ['temperatura'], [
        {'temperatura': t['temp'], 'leads': t['leads'], 'invest': t['inv'], 'fat': t['fat'],
         'roas': t['roas'], 'vendas': t['vendas'], 'conv': t['conv'], 'qual': t['qual'],
         'meta_vendas': t['meta_vendas']} for t in M['temp']])
    add_table('deb_weekly', ['semana'], [
        {'semana': f"S{w['snum']}", 'leads': w['leads'], 'leads_pago': w['leads_pago'], 'leads_org': w['leads_org'],
         'vendas': w['vendas'], 'conv': w['conv'], 'qual': w['qual'], 'cpl': w['cpl'], 'fpl': w['fpl']}
        for w in M['weekly']])
    add_table('deb_camp', ['campanha'], [
        {'campanha': c['campanha'], 'inv': c['inv'], 'fat': c['fat'], 'roas': c['roas'],
         'leads': c['leads'], 'vendas': c['vendas'], 'cpl': c['cpl'], 'conv': c['conv']} for c in M['camp_roas']])
    G2 = M['goals']
    mv = sum((G2.get('meta_vendas_canal') or {}).values()) or G2.get('vendas')
    add_table('deb_kpis', ['metric'], [
        {'metric': k, 'label': lbl, 'value': M.get(vk), 'meta': mt, 'hist': ht, 'grupo': grp}
        for k, lbl, vk, mt, ht, grp in [
            ('vendas', 'Vendas', 'vendas_total', mv, H.get('vendas'), 'volume'),
            ('leads', 'Leads', 'leads_total', G2.get('leads'), H.get('leads'), 'volume'),
            ('fat', 'Faturamento', 'fat', G2.get('fat'), H.get('fat'), 'financeiro'),
            ('conv', 'Conversão', 'conv_geral', G2.get('conv'), None, 'conversao'),
            ('qual', 'Qualificação', 'qual', G2.get('qual'), H.get('qual'), 'qualidade'),
            ('cpl', 'CPL', 'cpl', G2.get('cpl'), H.get('cpl'), 'midia'),
            ('cpmql', 'CPMQL', 'cpmql', G2.get('cpmql'), H.get('cpmql'), 'midia'),
            ('roas', 'ROAS', 'roas', None, H.get('roas'), 'midia'),
            ('invest_cpt', 'Invest. Captação', 'invest_cpt', G2.get('invest_cpt'), H.get('invest_cpt'), 'financeiro'),
        ]])

    # ════ s01 — Panorama ════════════════════════════════════════════════════
    pan, pg = [], Grid()
    eb(pan, pg, 'pan-eb-meta', 'METAS ATINGIDAS?', 'realizado vs meta da campanha')
    # donuts de atingimento como kpi-card com barra
    if M['at_leads'] is not None:
        km(pan, pg, 'pan-at-leads', 'Atingimento · Leads', f"{M['at_leads']:.0f}%",
           f"{intf(M['leads_total'])} de {intf(G.get('leads') or 0)} leads", 'target', '#534AB7',
           real=M['leads_total'], meta=G.get('leads'), hist=H.get('leads'), w=6)
    if M['at_vendas'] is not None:
        km(pan, pg, 'pan-at-vendas', 'Atingimento · Vendas', f"{M['at_vendas']:.0f}%",
           f"{intf(M['vendas_total'])} de {intf((G.get('meta_vendas_canal') and sum(G['meta_vendas_canal'].values())) or G.get('vendas') or 0)} vendas",
           'circle-check', '#3B6D11', real=M['vendas_total'],
           meta=(sum((G.get('meta_vendas_canal') or {}).values()) or G.get('vendas')), hist=H.get('vendas'), w=6)

    eb(pan, pg, 'pan-eb-macro', 'RESULTADO MACRO', '5 indicadores')
    km(pan, pg, 'pan-k-fat', 'Faturamento Bruto', money(M['fat']),
       f"Principal {money(M['fat_sale'])} · Downsell {money(M['fat_dsell'])}", 'coin', '#3B6D11',
       real=M['fat'], meta=G.get('fat'), hist=H.get('fat'))
    km(pan, pg, 'pan-k-ret', 'Retorno Bruto', money(M['retorno']), 'faturamento − investimento total', 'database', '#534AB7')
    km(pan, pg, 'pan-k-roi', 'ROI Global', f"{M['roi']:.0f}%", '(fat − invest) / invest', 'trending-up', '#185FA5')
    km(pan, pg, 'pan-k-roas', 'ROAS Captação', xf(M['roas']), '(fat. pago − invest. cpt) / invest. cpt', 'bolt', '#EF9F27')
    km(pan, pg, 'pan-k-ref', 'Reembolsos', intf(M['refunds_n']),
       f"{money(M['refund_val'])} · {pct_of(M['refund_val'], M['fat'])} do fat.", 'arrow-back-up', '#A32D2D')

    eb(pan, pg, 'pan-eb-vol', 'INDICADORES DE VOLUME', '8 métricas')
    ks(pan, pg, 'pan-v-vendas', 'Vendas', intf(M['vendas_total']), f"pago {intf(M['vendas_pago'])} · org {intf(M['vendas_org'])}", 'shopping-cart', '#534AB7')
    ks(pan, pg, 'pan-v-leads', 'Leads Totais', intf(M['leads_total']), f"pago {pct_of(M['leads_pago'], M['leads_total'])} · org {pct_of(M['leads_org'], M['leads_total'])}", 'users', '#185FA5')
    ks(pan, pg, 'pan-v-qual', 'Qualificação', pctf(M['qual']), f"{intf(M['mqls_total'])} MQLs / {intf(M['resps_total'])} resp.", 'star', '#854F0B')
    ks(pan, pg, 'pan-v-conv', 'Conversão Geral', pctf(M['conv_geral']), f"pago {pctf(M['conv_pago'])} · org {pctf(M['conv_org'])}", 'circle-check', '#534AB7')
    ks(pan, pg, 'pan-v-inv', 'Investimento Total', money(M['invest_total']), f"captação {money(M['invest_cpt'])}", 'coin', '#534AB7')
    ks(pan, pg, 'pan-v-cpl', 'CPL', money(M['cpl']), f"meta {money(G.get('cpl') or 0)}" if G.get('cpl') else 'invest. cpt / leads tráfego', 'users', '#185FA5')
    ks(pan, pg, 'pan-v-cpmql', 'CPMQL', money(M['cpmql']), f"meta {money(G.get('cpmql') or 0)}" if G.get('cpmql') else 'CPL / qualif. paga', 'star', '#854F0B')
    ks(pan, pg, 'pan-v-recap', 'Leads Recapturados', intf(M['l_ant'] + M['l_cli']), f"antigos {intf(M['l_ant'])} · clientes {intf(M['l_cli'])}", 'refresh', '#854F0B')

    eb(pan, pg, 'pan-eb-cmp', 'COMPARATIVO — REALIZADO vs META')
    table(pan, pg, 'pan-cmp', '', ['Indicador', 'Realizado', 'Meta', 'Δ vs Meta', 'Histórico'], [
        cmp_row('Vendas', M['vendas_total'], sum((G.get('meta_vendas_canal') or {}).values()) or G.get('vendas'), H.get('vendas'), 'int'),
        cmp_row('Leads', M['leads_total'], G.get('leads'), H.get('leads'), 'int'),
        cmp_row('Conversão', M['conv_geral'], G.get('conv'), None, 'pct'),
        cmp_row('Invest. Captação', M['invest_cpt'], G.get('invest_cpt'), H.get('invest_cpt'), 'money', invert=True),
        cmp_row('CPL', M['cpl'], G.get('cpl'), H.get('cpl'), 'money', invert=True),
        cmp_row('Qualificação', M['qual'], G.get('qual'), H.get('qual'), 'pct'),
        cmp_row('CPMQL', M['cpmql'], G.get('cpmql'), H.get('cpmql'), 'money', invert=True),
    ], h=5)
    sections['s01'] = {'id': 's01', 'header': {'badge': 'Panorama', 'title': f"Debriefing · {M['nome']}",
                       'sub': f"{M['campaign_label']} — atingiu as metas? resumo macro do lançamento."}, 'widgets': pan}
    layouts['s01'] = pg.items

    # ════ s02 — Canal e Conversão ═══════════════════════════════════════════
    can, cg = [], Grid()
    eb(can, cg, 'can-eb', 'RESUMO POR ESCOPO', 'leads, vendas e tipo de lead por escopo')
    for esc, lbl, lp, lv, cv, nv, an, cl, qc in [
        ('ger', 'Geral', M['leads_total'], M['vendas_total'], M['conv_geral'], M['l_novo'], M['l_ant'], M['l_cli'], 'p'),
        ('pago', 'Pago', M['leads_pago'], M['vendas_pago'], M['conv_pago'], M['l_novo_p'], M['l_ant_p'], M['l_cli_p'], 'p'),
        ('org', 'Orgânico', M['leads_org'], M['vendas_org'], M['conv_org'], M['l_novo_o'], M['l_ant_o'], M['l_cli_o'], 'g')]:
        can.append({'id': f'can-r-{esc}', 'type': 'qa-card', 'qColor': qc, 'title': f'{lbl} · {intf(lp)} leads',
                    'stats': [_st('Vendas', intf(lv), f'conv {pctf(cv)}'),
                              _st('Novos', pct_of(nv, lp), tone='purple'),
                              _st('Antigos', pct_of(an, lp)),
                              _st('Clientes', pct_of(cl, lp), tone='pos')]})
        cg.add(f'can-r-{esc}', 'qa-card', 4, 4)
    # canais vs meta de vendas
    vs = _canais_vs_meta(M['chan'], G.get('by_canal') or {}, M['goals'].get('meta_vendas_canal') or {})
    eb(can, cg, 'can-eb-vs', 'CANAIS vs META DE VENDAS', 'acima / próximo / abaixo')
    for col, key, tagc in [('↑ Acima da meta', 'acima', 'g'), ('≈ Próximo', 'prox', 'a'), ('↓ Abaixo', 'abaixo', 'r')]:
        nomes = vs[key]
        fb(can, cg, f'can-vs-{key}', f'{col} ({len(nomes)})', tagc,
           ', '.join(nomes[:6]) or '—', '', w=4, h=3)
    table(can, cg, 'can-tbl', 'Resultado por Canal',
          ['Canal', 'Tipo', 'Leads', 'Vendas', 'Conv.', 'Qualif.', 'Faturamento'],
          [[c['canal'], 'pago' if c['tipo'] == 'pago' else 'org.', intf(c['leads']), intf(c['vendas']),
            pctf(c['conv']), pctf(c['qual']), money(c['fat'])] for c in M['chan'][:14]], h=6)
    sections['s02'] = {'id': 's02', 'header': {'badge': 'Canal', 'title': 'Canal e Conversão',
                       'sub': 'Performance por canal e por escopo (pago × orgânico).'}, 'widgets': can}
    layouts['s02'] = cg.items

    # ════ s03 — Tráfego Pago ════════════════════════════════════════════════
    tra, tg = [], Grid()
    tra.append({'id': 'tra-rule', 'type': 'highlight', 'color': 'p', 'label': 'Regra do invest_cpt',
                'text': f"Investimento de mídia = só campanhas de captação ({money(M['invest_cpt'])}). "
                        f"Invest. de vendas ({money(M['invest_vnd'])}) fica fora de CPL/ROAS/CPMQL/CPM/CTR."}); tg.add('tra-rule', 'highlight', 12, 2)
    eb(tra, tg, 'tra-eb', 'INDICADORES DE MÍDIA', '9 métricas (só captação)')
    ks(tra, tg, 'tra-cpl', 'CPL', money(M['cpl']), 'invest. cpt / leads tráfego', 'users', '#185FA5')
    ks(tra, tg, 'tra-cpmql', 'CPMQL', money(M['cpmql']), 'CPL / qualif. paga', 'star', '#854F0B')
    ks(tra, tg, 'tra-qual', 'Qualificação', pctf(M['qual_pago']), 'MQLs / respostas (pago)', 'circle-check', '#534AB7')
    ks(tra, tg, 'tra-ctr', 'CTR', pctf(M['ctr']), 'clicks / impressões', 'trending-up', '#3B6D11')
    ks(tra, tg, 'tra-cpm', 'CPM', money(M['cpm']), 'invest. cpt×1000 / impressões', 'database', '#534AB7')
    ks(tra, tg, 'tra-cpc', 'CPC', money(M['cpc']), 'invest. cpt / clicks', 'coin', '#185FA5')
    ks(tra, tg, 'tra-txpag', 'Taxa de Página', pctf(M['tx_pag']), 'leads tráfego / clicks', 'target', '#3B6D11')
    ks(tra, tg, 'tra-inv', 'Invest. Captação', money(M['invest_cpt']), 'verba de mídia paga', 'coin', '#534AB7')
    ks(tra, tg, 'tra-cac', 'CAC', money(M['cac']), 'invest. cpt / vendas pago', 'shopping-cart', '#A32D2D')
    eb(tra, tg, 'tra-eb-d', 'CAPTAÇÃO PAGA POR DIA')
    tra.append({'id': 'tra-daily', 'type': 'chart', 'chartType': 'bar', 'title': 'Leads pagos por dia', 'height': 280,
                'colors': ['#534AB7'], 'bind': {'dataset': 'deb_daily', 'x': 'data', 'y': 'l_pago'}}); tg.add('tra-daily', 'chart', 12, 4)
    table(tra, tg, 'tra-temp', 'Por Temperatura',
          ['Temperatura', 'Leads', 'Invest.', 'Fat.', 'ROAS', 'Vendas', 'Conv.', 'Qualif.'],
          [[t['temp'], intf(t['leads']), money(t['inv']), money(t['fat']),
            {'value': xf(t['roas']), 'cls': 'c-g' if t['roas'] > 1 else 'c-r'}, intf(t['vendas']),
            pctf(t['conv']), pctf(t['qual'])] for t in M['temp']], h=4)
    table(tra, tg, 'tra-roas', 'Melhores Campanhas por ROAS',
          ['Campanha', 'Invest.', 'Fat.', 'ROAS', 'Leads', 'Vendas', 'CPL', 'Conv.'],
          [[c['campanha'][:48], money(c['inv']), money(c['fat']),
            {'value': xf(c['roas']), 'cls': 'c-g' if c['roas'] > 1 else 'c-r'}, intf(c['leads']),
            intf(c['vendas']), money(c['cpl']), pctf(c['conv'])] for c in M['camp_roas'][:12]], h=5)
    sections['s03'] = {'id': 's03', 'header': {'badge': 'Tráfego Pago', 'title': 'Tráfego Pago',
                       'sub': 'Indicadores de mídia (só captação), por temperatura e por campanha.'}, 'widgets': tra}
    layouts['s03'] = tg.items

    # ════ s04 — Orgânico ════════════════════════════════════════════════════
    org_chan = [c for c in M['chan'] if c['tipo'] == 'organico']
    o, og = [], Grid()
    eb(o, og, 'org-eb', 'RESUMO ORGÂNICO')
    km(o, og, 'org-leads', 'Leads Orgânicos', intf(M['leads_org']), f"{pct_of(M['leads_org'], M['leads_total'])} do total", 'users', '#3B6D11')
    km(o, og, 'org-vendas', 'Vendas Orgânicas', intf(M['vendas_org']), f"{pct_of(M['vendas_org'], M['vendas_total'])} do total", 'shopping-cart', '#534AB7')
    km(o, og, 'org-conv', 'Conversão Orgânica', pctf(M['conv_org']), f"{_pp(M['conv_org'] - M['conv_pago'])} vs pago", 'circle-check', '#185FA5')
    eb(o, og, 'org-eb-d', 'DESTAQUES POR CONVERSÃO', '≥20 leads')
    dest = sorted([c for c in org_chan if c['leads'] >= 20], key=lambda c: -c['conv'])[:5]
    for i, c in enumerate(dest):
        fb(o, og, f'org-d-{i}', c['canal'], 'g', pctf(c['conv']), f"{intf(c['leads'])} leads · {intf(c['vendas'])} vendas", w=4, h=2)
    o.append({'id': 'org-daily', 'type': 'chart', 'chartType': 'bar', 'title': 'Leads orgânicos por dia', 'height': 260,
              'colors': ['#3B6D11'], 'bind': {'dataset': 'deb_daily', 'x': 'data', 'y': 'l_org'}}); og.add('org-daily', 'chart', 12, 4)
    table(o, og, 'org-tbl', 'Resultado por Canal Orgânico',
          ['Canal', 'Leads', 'Vendas', 'Conv.', 'Qualif.', 'Faturamento'],
          [[c['canal'], intf(c['leads']), intf(c['vendas']), pctf(c['conv']), pctf(c['qual']), money(c['fat'])]
           for c in org_chan[:12]], h=5)
    sections['s04'] = {'id': 's04', 'header': {'badge': 'Orgânico', 'title': 'Orgânico',
                       'sub': 'Captação e conversão dos canais orgânicos.'}, 'widgets': o}
    layouts['s04'] = og.items

    # ════ s05 — Análise Temporal ════════════════════════════════════════════
    tmp, mg = [], Grid()
    bw = M['best_week']
    tmp.append({'id': 'tmp-note', 'type': 'highlight', 'color': 'a', 'label': 'First Click',
                'text': 'As vendas são atribuídas pela <strong>data de inscrição</strong> (First Click), não pela data da compra. A análise temporal é por semana de inscrição.'}); mg.add('tmp-note', 'highlight', 12, 2)
    eb(tmp, mg, 'tmp-eb', 'VISÃO EXECUTIVA')
    if bw.get('conv_snum'):
        km(tmp, mg, 'tmp-conv', 'Melhor Semana · Conversão', f"S{bw['conv_snum']}", f"{pctf(bw['conv_val'])} de conversão", 'circle-check', '#3B6D11', w=6)
    if bw.get('fpl_snum'):
        km(tmp, mg, 'tmp-fpl', 'Semana mais valiosa · Fat/Lead', f"S{bw['fpl_snum']}", f"{money(bw['fpl_val'])} por lead", 'coin', '#534AB7', w=6)
    table(tmp, mg, 'tmp-tbl', 'Análise Semanal — First Click',
          ['Sem.', 'Início', 'Fim', 'Leads', 'LP', 'LO', 'CPL Pago', 'Qualif.', 'Vendas', 'Conv.', 'Fat/Lead'],
          [[f"S{w['snum']}", w['ini'], w['fim'], intf(w['leads']), intf(w['leads_pago']), intf(w['leads_org']),
            money(w['cpl']), pctf(w['qual']), intf(w['vendas']),
            {'value': pctf(w['conv']), 'cls': 'c-g' if w['conv'] >= 4 else ('c-a' if w['conv'] >= 2.4 else None)},
            money(w['fpl'])] for w in M['weekly']], h=6)
    sections['s05'] = {'id': 's05', 'header': {'badge': 'Temporal', 'title': 'Análise Temporal',
                       'sub': 'Semana a semana por data de inscrição (First Click).'}, 'widgets': tmp}
    layouts['s05'] = mg.items

    # ════ s06 — Análise 360° ════════════════════════════════════════════════
    a3, ag = [], Grid()
    eb(a3, ag, 'a3-eb', 'ANÁLISE 360° — PERGUNTAS ESTRATÉGICAS', '13 perguntas com números, vereditos e gráficos')
    for i, q in enumerate(_a360(M, G, H)):
        wid = f'a3-q{i}'
        if q.get('kind') == 'fb':
            fb(a3, ag, wid, f"{q['q']} · Aprendizados", q['qColor'], q['title'], q['detail'], w=6, h=4)
            continue
        card = {'id': wid, 'type': 'qa-card', 'q': q['q'], 'qColor': q['qColor'], 'title': q['title']}
        for k in ('verdict', 'stats', 'chips', 'chart'):
            if q.get(k):
                card[k] = q[k]
        a3.append(card)
        ag.add(wid, 'qa-card', 6, 6 if q.get('chart') else (4 if q.get('stats') else 3))
    sections['s06'] = {'id': 's06', 'header': {'badge': 'Análise 360°', 'title': 'Análise 360°',
                       'sub': 'As perguntas estratégicas do lançamento, com evidência.'}, 'widgets': a3}
    layouts['s06'] = ag.items

    # ════ s07 — One Pager ═══════════════════════════════════════════════════
    op, opg = [], Grid()
    eb(op, opg, 'op-eb', 'KPIS PRINCIPAIS', '12 indicadores')
    pp = lambda a, b: f"pago {intf(a)} · org {intf(b)}"
    for wid, lbl, val, sub, color in [
            ('op-fat', 'Faturamento', money(M['fat']), f"principal {money(M['fat_sale'])}", '#3B6D11'),
            ('op-roas', 'ROAS', xf(M['roas']), 'fat. pago / invest. cpt', '#EF9F27'),
            ('op-roi', 'ROI Global', f"{M['roi']:.0f}%", '(fat − invest) / invest', '#534AB7'),
            ('op-leads', 'Leads', intf(M['leads_total']), pp(M['leads_pago'], M['leads_org']), '#185FA5'),
            ('op-vendas', 'Vendas', intf(M['vendas_total']), pp(M['vendas_pago'], M['vendas_org']), '#534AB7'),
            ('op-conv', 'Conversão', pctf(M['conv_geral']), f"pago {pctf(M['conv_pago'])} · org {pctf(M['conv_org'])}", '#3B6D11'),
            ('op-inv', 'Invest. Total', money(M['invest_total']), f"captação {money(M['invest_cpt'])}", '#534AB7'),
            ('op-ret', 'Retorno Bruto', money(M['retorno']), 'fat − invest. total', '#185FA5'),
            ('op-cpl', 'CPL', money(M['cpl']), 'invest. cpt / leads tráfego', '#185FA5'),
            ('op-cpmql', 'CPMQL', money(M['cpmql']), 'CPL / qualif. paga', '#854F0B'),
            ('op-qual', 'Qualificação', pctf(M['qual']), f"{intf(M['mqls_total'])} MQLs / {intf(M['resps_total'])} resp.", '#854F0B'),
            ('op-cac', 'CAC', money(M['cac']), 'invest. cpt / vendas pago', '#A32D2D')]:
        ks(op, opg, wid, lbl, val, sub, 'target', color, w=4, h=2)
    op.append({'id': 'op-daily', 'type': 'chart', 'chartType': 'line', 'title': 'Leads por dia', 'height': 260,
               'colors': ['#534AB7'], 'bind': {'dataset': 'deb_daily', 'x': 'data', 'y': 'leads'}}); opg.add('op-daily', 'chart', 6, 4)
    op.append({'id': 'op-conv-c', 'type': 'chart', 'chartType': 'line', 'title': 'Conversão por dia (%)', 'height': 260,
               'pct': True, 'valueFormat': 'pct', 'colors': ['#3B6D11'], 'bind': {'dataset': 'deb_daily', 'x': 'data', 'y': 'conv'}}); opg.add('op-conv-c', 'chart', 6, 4)
    al, ga = calc_alavancas(M, G, H)
    eb(op, opg, 'op-eb-ag', 'ALAVANCAS E GARGALOS', 'gerados dos dados')
    fb(op, opg, 'op-alav', '↑ Alavancas', 'g', 'O que puxou o resultado', '<br>'.join(f'• {x}' for x in al) or '—', w=6, h=4)
    fb(op, opg, 'op-garg', '↓ Gargalos', 'r', 'O que segurou o resultado', '<br>'.join(f'• {x}' for x in ga) or '—', w=6, h=4)
    sections['s07'] = {'id': 's07', 'header': {'badge': 'One Pager', 'title': 'One Pager',
                       'sub': 'Visão executiva de 1 tela.'}, 'widgets': op}
    layouts['s07'] = opg.items

    pages = [{'id': 'panorama', 'label': 'Panorama', 'sections': [{'id': 's01', 'label': 'Panorama'}]},
             {'id': 'canal', 'label': 'Canal', 'sections': [{'id': 's02', 'label': 'Canal e Conversão'}]},
             {'id': 'trafego', 'label': 'Tráfego Pago', 'sections': [{'id': 's03', 'label': 'Tráfego Pago'}]},
             {'id': 'organico', 'label': 'Orgânico', 'sections': [{'id': 's04', 'label': 'Orgânico'}]},
             {'id': 'temporal', 'label': 'Temporal', 'sections': [{'id': 's05', 'label': 'Análise Temporal'}]},
             {'id': 'analise', 'label': 'Análise 360°', 'sections': [{'id': 's06', 'label': 'Análise 360°'}]},
             {'id': 'onepager', 'label': 'One Pager', 'sections': [{'id': 's07', 'label': 'One Pager'}]}]
    created = config.get('created_at') or datetime.date.today().isoformat()
    data_json = {'meta': {'client': config['client'], 'title': config['title'], 'type': 'dashboard',
                          'theme': 'light', 'created_at': created, 'filters': [],
                          'controls': {'kind': 'debriefing-lancamento', 'compare': 'meta',
                                       'pages': [p['id'] for p in pages]}}, 'pages': pages}
    return {'dataset': dataset, 'data': data_json,
            'layout': {'sections': layouts, 'updatedAt': f'{created}T00:00:00.000Z'}, 'sections': sections}


# ── helpers de conteúdo ────────────────────────────────────────────────────────

def pct_of(a, b):
    return '—' if not b else f'{a / b * 100:.0f}%'


def cmp_row(label, real, meta, hist, fmt, invert=False):
    from common.fmt import money as _m, pctf as _p, intf as _i

    def f(v):
        if v is None:
            return '—'
        return _m(v) if fmt == 'money' else (_p(v) if fmt == 'pct' else _i(v))
    cell_real = f(real)
    cell_meta = f(meta) if meta else '—'
    if meta:
        d = (real - meta) / meta * 100
        if invert:
            d = -d
        delta = {'value': f'{d:+.0f}%', 'cls': 'c-g' if d >= 1 else ('c-r' if d <= -1 else None)}
    else:
        delta = '—'
    return [label, cell_real, cell_meta, delta, f(hist)]


def _canais_vs_meta(chan, by_canal, mvc):
    acima, prox, abaixo = [], [], []
    for c in chan:
        meta = mvc.get(c['canal']) or (by_canal.get(c['canal'], {}).get('meta_vendas'))
        if not meta:
            continue
        dv = (c['vendas'] - meta) / meta * 100
        (acima if dv > 5 else prox if dv >= -5 else abaixo).append(c['canal'])
    return {'acima': acima, 'prox': prox, 'abaixo': abaixo}


def _st(label, value, sub=None, delta=None, tone=None):
    s = {'label': label, 'value': value}
    if sub:
        s['sub'] = sub
    if delta:
        s['delta'] = delta
    if tone:
        s['tone'] = tone
    return s


def _chart(ctype, dataset, x, y, **kw):
    c = {'chartType': ctype, 'height': 200, 'bind': {'dataset': dataset, 'x': x, 'y': y}}
    c.update(kw)
    return c


def _a360(M, G, H):
    """Cada pergunta vira um qa-card: chip + título + grade de números + chips de
    veredito + gráfico embutido. Q13 (listas) sai como find-block (kind='fb')."""
    out = []
    recap = M['l_ant'] + M['l_cli']
    recap_pct = pct_of(recap, M['leads_total'])
    at_v, at_l = M['at_vendas'], M['at_leads']
    mv = sum((G.get('meta_vendas_canal') or {}).values()) or G.get('vendas')

    # Q1 Resultado Global
    out.append({'q': 'Q1', 'qColor': 'g' if (at_v and at_v >= 100) else 'a', 'title': 'Resultado Global',
                'verdict': {'label': ('✓ Meta superada' if (at_v and at_v >= 100) else '✗ Abaixo da meta'),
                            'tone': 'pos' if (at_v and at_v >= 100) else 'neg'},
                'stats': [_st('Faturamento', money(M['fat']), (f'meta {money(G["fat"])}' if G.get('fat') else None),
                              (cmp_pct(M['fat'], G.get('fat')) if G.get('fat') else None), 'purple'),
                          _st('Vendas', intf(M['vendas_total']), (f'meta {intf(mv)}' if mv else None),
                              (cmp_pct(M['vendas_total'], mv) if mv else None)),
                          _st('ROAS Captação', xf(M['roas'])), _st('ROI Global', f"{M['roi']:.0f}%")]})
    # Q2 Receita e Retorno
    out.append({'q': 'Q2', 'qColor': 'p', 'title': 'Receita, Vendas e Retorno',
                'stats': [_st('Retorno', money(M['retorno']), 'fat − invest.'),
                          _st('Por R$1 investido', f"R$ {M['roi'] / 100:.2f}"),
                          _st('Invest. captação', pct_of(M['invest_cpt'], M['invest_total']), 'do total'),
                          _st('Recaptação', recap_pct, 'sustentabilidade')]})
    # Q3 Captação por Canal + gráfico
    out.append({'q': 'Q3', 'qColor': 'g', 'title': 'Captação por Canal',
                'stats': [_st('Leads totais', intf(M['leads_total']), (f'{at_l:.0f}% da meta' if at_l else None),
                              (cmp_pct(M['leads_total'], G.get('leads')) if G.get('leads') else None), 'pos' if (at_l and at_l >= 100) else None),
                          _st('Novos', pct_of(M['l_novo'], M['leads_total'])),
                          _st('Antigos', pct_of(M['l_ant'], M['leads_total']))],
                'chart': _chart('bar-horizontal', 'deb_chan', 'canal', 'leads', distributed=True, height=220)})
    # Q4 Qualidade
    out.append({'q': 'Q4', 'qColor': 'a', 'title': 'Qualidade dos Leads',
                'stats': [_st('Qualificação', pctf(M['qual']), (f'meta {pctf(G["qual"])}' if G.get('qual') else None),
                              (cmp_pct(M['qual'], G.get('qual')) if G.get('qual') else None)),
                          _st('Novos', pct_of(M['l_novo'], M['leads_total'])),
                          _st('Antigos', pct_of(M['l_ant'], M['leads_total'])),
                          _st('Clientes', pct_of(M['l_cli'], M['leads_total']))]})
    # Q5 Conversão + gráfico
    out.append({'q': 'Q5', 'qColor': 'r' if (G.get('conv') and M['conv_geral'] < G['conv']) else 'g', 'title': 'Conversão — geral, pago e orgânico',
                'stats': [_st('Geral', pctf(M['conv_geral']), (f'meta {pctf(G["conv"])}' if G.get('conv') else None),
                              (cmp_pct(M['conv_geral'], G.get('conv')) if G.get('conv') else None)),
                          _st('Pago', pctf(M['conv_pago']), tone='purple'),
                          _st('Orgânico', pctf(M['conv_org']), f"{_pp(M['conv_org'] - M['conv_pago'])} vs pago", tone='pos')],
                'chart': _chart('bar-horizontal', 'deb_chan', 'canal', 'conv', pct=True, valueFormat='pct', distributed=True, height=220)})
    # Q6 Orgânico vs Pago
    out.append({'q': 'Q6', 'qColor': 'g', 'title': 'Orgânico vs Pago',
                'stats': [_st('Vendas orgânico', pct_of(M['vendas_org'], M['vendas_total']), tone='pos'),
                          _st('Vendas pago', pct_of(M['vendas_pago'], M['vendas_total']), tone='purple'),
                          _st('Fat. orgânico', pct_of(M['fat_org'], M['fat']), tone='pos'),
                          _st('Fat. pago', pct_of(M['fat_pago'], M['fat']), tone='purple')]})
    # Q7 Captação Orgânica
    org = [c for c in M['chan'] if c['tipo'] == 'organico']
    if org:
        top = max(org, key=lambda c: c['leads']); ol = sum(c['leads'] for c in org)
        conc = (top['leads'] / ol * 100) if ol else 0
        out.append({'q': 'Q7', 'qColor': 'r' if conc > 50 else 'g', 'title': 'Captação Orgânica por Canal',
                    'verdict': {'label': ('⚠ Dependência crítica' if conc > 50 else '✓ Diversificada'),
                                'tone': 'neg' if conc > 50 else 'pos'},
                    'stats': [_st('Canal dominante', str(top['canal'])), _st('Concentração', f'{conc:.0f}%'),
                              _st('Leads orgânicos', intf(ol))]})
    # Q8 Mídia Paga
    out.append({'q': 'Q8', 'qColor': 'a', 'title': 'Mídia Paga',
                'stats': [_st('CPL', money(M['cpl']), (f'meta {money(G["cpl"])}' if G.get('cpl') else None),
                              (cmp_pct(M['cpl'], G.get('cpl'), invert=True) if G.get('cpl') else None)),
                          _st('CPMQL', money(M['cpmql'])), _st('CPM', money(M['cpm'])),
                          _st('CTR', pctf(M['ctr'])), _st('Taxa de Página', pctf(M['tx_pag']))]})
    # Q9 Temperatura — chips veredito + gráfico
    if M['temp']:
        chips = []
        for t in sorted(M['temp'], key=lambda t: -t['roas']):
            r = t['roas']
            chips.append({'label': f"{t['temp']} {xf(r)}", 'glyph': '✓' if r >= 2 else ('⚠' if r >= 0 else '✗'),
                          'tone': 'pos' if r >= 2 else ('neutral' if r >= 0 else 'neg')})
        out.append({'q': 'Q9', 'qColor': 'p', 'title': 'Temperatura — ROAS por público', 'chips': chips,
                    'chart': _chart('bar', 'deb_temp', 'temperatura', 'roas', valueFormat='x', distributed=True, height=200)})
    # Q10 Dinâmica Temporal
    bw = M['best_week']
    if bw.get('conv_snum'):
        out.append({'q': 'Q10', 'qColor': 'p', 'title': 'Dinâmica de Vendas — Temporal',
                    'stats': [_st('Melhor semana (conv)', f"S{bw['conv_snum']}", pctf(bw['conv_val'])),
                              _st('Semana mais valiosa', f"S{bw['fpl_snum']}", f"{money(bw['fpl_val'])}/lead")]})
    # Q11 Momento de Inscrição — gráfico
    if M['weekly']:
        wb = max(M['weekly'], key=lambda w: w['fpl'])
        out.append({'q': 'Q11', 'qColor': 'p', 'title': 'Momento de Inscrição — valor por semana',
                    'stats': [_st('Pico fat/lead', f"S{wb['snum']}", f"{money(wb['fpl'])}/lead"),
                              _st('Conversão na semana', pctf(wb['conv']))],
                    'chart': _chart('bar', 'deb_weekly', 'semana', 'fpl', valueFormat='money', colors=['#534AB7'], height=200)})
    # Q12 Perfil — gráfico
    if M['chan']:
        topc = sorted(M['chan'], key=lambda c: -c['conv'])[:3]
        out.append({'q': 'Q12', 'qColor': 'g', 'title': 'Perfil — conversão por canal',
                    'stats': [_st(c['canal'][:14], pctf(c['conv'])) for c in topc],
                    'chart': _chart('bar-horizontal', 'deb_chan', 'canal', 'vendas', distributed=True, height=220)})
    # Q13 Aprendizados (listas → find-block)
    certezas, interromper = [], []
    if M['temp']:
        b = max(M['temp'], key=lambda t: t['roas']); w = min(M['temp'], key=lambda t: t['roas'])
        certezas.append(f"{b['temp']} é o melhor ROAS ({xf(b['roas'])}) — escalar")
        if w['roas'] < 1:
            interromper.append(f"{w['temp']} ROAS {xf(w['roas'])} — revisar")
    if M['vendas_total'] and M['vendas_org'] / M['vendas_total'] * 100 > 50:
        certezas.append(f"Orgânico = {pct_of(M['vendas_org'], M['vendas_total'])} das vendas")
    if G.get('cpmql') and M['cpmql'] > G['cpmql']:
        interromper.append(f"CPMQL {money(M['cpmql'])} acima da meta ({money(G['cpmql'])})")
    out.append({'kind': 'fb', 'q': 'Q13', 'qColor': 'g', 'title': '✓ Certezas — manter',
                'detail': '<br>'.join(f"• {x}" for x in certezas) or '• Sem certezas claras nos dados.'})
    out.append({'kind': 'fb', 'q': 'Q13', 'qColor': 'r', 'title': '✗ Interromper / corrigir',
                'detail': '<br>'.join(f"• {x}" for x in interromper) or '• Nada no negativo.'})
    return out


def cmp_pct(real, meta, invert=False):
    if not meta:
        return None
    d = (real - meta) / meta * 100
    if invert:
        d = -d
    return f'{d:+.0f}%'


def calc_alavancas(M, G, H):
    al, ga = [], []
    for t in M['temp']:
        if t['roas'] > 1:
            al.append(f"{t['temp']}: ROAS {xf(t['roas'])} — escalar")
        elif t['roas'] < 1 and t['leads'] >= 100:
            ga.append(f"{t['temp']}: ROAS {xf(t['roas'])} — revisar")
    if M['vendas_total'] and M['vendas_org'] / M['vendas_total'] * 100 > 50:
        al.append(f"Orgânico dominou ({pct_of(M['vendas_org'], M['vendas_total'])} das vendas)")
    if G.get('cpl') and (M['cpl'] - G['cpl']) / G['cpl'] * 100 > 10:
        ga.append(f"CPL {money(M['cpl'])} acima da meta ({money(G['cpl'])})")
    if G.get('qual') and M['qual'] - G['qual'] < -5:
        ga.append(f"Qualificação {pctf(M['qual'])} abaixo da meta ({pctf(G['qual'])})")
    recap = M['l_ant'] + M['l_cli']
    if M['leads_total'] and recap / M['leads_total'] * 100 > 45:
        ga.append(f"{pct_of(recap, M['leads_total'])} de leads recaptados — base nova cresceu pouco")
    if M['at_vendas'] and M['at_vendas'] >= 100:
        al.append(f"Meta de vendas superada ({M['at_vendas']:.0f}%)")
    return al[:4], ga[:4]


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
