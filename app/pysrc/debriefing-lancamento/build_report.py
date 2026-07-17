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
from common.preserve import preserve, preserve_dataset, preserve_layout
# Builders de card/seção + motor de comparação Meta×Histórico — fonte canônica em common.report.
from common.report import (dev as _dev, gstatus as _gstatus, goalcmp as _goalcmp,
                           apply_goal as _apply_goal, hmcls as _hmcls, km, ks, eb, fb, table)


def _pp(v):
    return '—' if v is None else f'{v:+.1f} p.p.'


def assemble(rows, config, content, opts=None):
    config = config or {}
    M = calc.build(rows, config)
    G, H = M['goals'], M['hist']
    dataset, sections, layouts = {}, {}, {}

    def add_table(name, dims, rows_):
        dataset[name] = {'dims': list(dims), 'filters': [], 'rows': rows_}
    # _dev/_gstatus/_goalcmp/_apply_goal/km/ks/eb/fb/table → importados de common.report.

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
    # tabelas dos gráficos da Análise 360° (Q1 realizado×meta, Q4 tipos, Q6 split vendas)
    add_table('deb_tipos', ['tipo'], [{'tipo': 'Novos', 'leads': M['l_novo']},
                                      {'tipo': 'Antigos', 'leads': M['l_ant']},
                                      {'tipo': 'Clientes', 'leads': M['l_cli']}])
    add_table('deb_split_vend', ['escopo'], [{'escopo': 'Orgânico', 'vendas': M['vendas_org']},
                                            {'escopo': 'Pago', 'vendas': M['vendas_pago']}])
    add_table('deb_q1', ['indicador'], [
        {'indicador': 'Fat. (÷1k)', 'serie': 'Realizado', 'v': round(M['fat'] / 1000)},
        {'indicador': 'Fat. (÷1k)', 'serie': 'Meta', 'v': round((G2.get('fat') or 0) / 1000)},
        {'indicador': 'Leads (÷100)', 'serie': 'Realizado', 'v': round(M['leads_total'] / 100)},
        {'indicador': 'Leads (÷100)', 'serie': 'Meta', 'v': round((G2.get('leads') or 0) / 100)},
        {'indicador': 'Vendas', 'serie': 'Realizado', 'v': M['vendas_total']},
        {'indicador': 'Vendas', 'serie': 'Meta', 'v': round(mv or 0)}])
    # Q2 (receita × invest × retorno) e Q8 (escada de custos da mídia) — gráficos da Análise 360°.
    add_table('deb_q2', ['indicador'], [
        {'indicador': 'Faturamento', 'v': round(M['fat'])},
        {'indicador': 'Investimento', 'v': round(M['invest_total'])},
        {'indicador': 'Retorno', 'v': round(M['retorno'])}])
    add_table('deb_q8', ['metrica'], [
        {'metrica': 'CPM', 'v': M['cpm']}, {'metrica': 'CPL', 'v': M['cpl']}, {'metrica': 'CPMQL', 'v': M['cpmql']}])

    # ════ s01 — Panorama ════════════════════════════════════════════════════
    pan, pg = [], Grid()
    # ── Indicadores globais: metas (bandas em destaque) + resultado macro juntos ──
    def at_tone(p):
        p = p or 0
        return 'pos' if p >= 100 else ('neg' if p < 80 else 'neutral')

    def band(wid, label, real, meta, at, tone, w=6, h=2, x=None, y=None):
        if real is None or not meta or at is None:
            return
        pan.append({'id': wid, 'type': 'kpi-card', 'tier': 'feature', 'band': True,
                    'label': label, 'value': f'{intf(real)} / {intf(meta)}',
                    'sub': 'realizado vs meta da campanha', 'delta': f'{at:.0f}%', 'deltaTone': tone})
        if x is not None: pg.at(wid, 'kpi-card', x, y, w, h)
        else: pg.add(wid, 'kpi-card', w, h)

    eb(pan, pg, 'pan-eb-glob', 'INDICADORES GLOBAIS', 'atingimento de metas + resultado macro do lançamento')
    # Layout 2D explícito (y=1): duas bandas de atingimento EMPILHADAS à esquerda (w=6),
    # e a grade 2×3 de macros à direita (w=2 cada). Linha de cima: Faturamento, Reembolsos,
    # Conversão; linha de baixo: Retorno, ROI, ROAS (eficiência em roxo, fórmula no (i)).
    # A cor das bandas avalia o atingimento (verde ≥100% · âmbar 80–99% · vermelho <80%).
    mv_meta = sum((G.get('meta_vendas_canal') or {}).values()) or G.get('vendas')
    band('pan-at-leads', 'Atingimento · Leads', M['leads_total'], G.get('leads'), M['at_leads'], at_tone(M['at_leads']), x=0, y=1)
    band('pan-at-vendas', 'Atingimento · Vendas', M['vendas_total'], mv_meta, M['at_vendas'], at_tone(M['at_vendas']), x=0, y=3)

    # Metas derivadas das goals p/ Retorno e ROI (meta_receita − meta_invest);
    # histórico (lançamento anterior) p/ o ROAS. Mesmo rodapé "Meta/Hist · ±%".
    g_fat, g_inv = G.get('fat'), G.get('invest_cpt')
    retorno_meta = (g_fat - g_inv) if (g_fat and g_inv) else None
    roi_meta = (retorno_meta / g_inv * 100) if (retorno_meta is not None and g_inv) else None
    # ROAS captação usa receita PAGA: meta = (meta_fat_pago − meta_invest) / meta_invest.
    # meta_fat_pago vem das metas POR CANAL (meta_receita dos canais pagos). Fallback p/
    # análises sem meta por canal: estima pela fração paga realizada (menos preciso).
    mfat_pago = sum(((G.get('by_canal') or {}).get(c['canal'], {}).get('meta_fat') or 0)
                    for c in M['chan'] if c['tipo'] == 'pago')
    if mfat_pago and g_inv:
        roas_meta = (mfat_pago - g_inv) / g_inv
    else:
        paid_share = (M['fat_pago'] / M['fat']) if M.get('fat') else None
        roas_meta = (((g_fat * paid_share) - g_inv) / g_inv) if (g_fat and g_inv and paid_share) else None
    h_inv = H.get('invest')
    retorno_h = (H['fat'] - h_inv) if (H.get('fat') is not None and h_inv) else None
    roi_h = (retorno_h / h_inv * 100) if (retorno_h is not None and h_inv) else None
    roas_h = H.get('roas')
    # ── linha de cima (direita): Faturamento, Reembolsos, Conversão ──
    km(pan, pg, 'pan-k-fat', 'Faturamento Bruto', money(M['fat']),
       f"Principal {money(M['fat_sale'])} · Downsell {money(M['fat_dsell'])}", 'coin', '#3B6D11',
       real=M['fat'], meta=G.get('fat'), hist=H.get('fat'), w=2, x=6, y=1, meta_fmt=money(G.get('fat')) if G.get('fat') else None,
       hist_fmt=(money(H.get('fat')) if H.get('fat') else None))
    km(pan, pg, 'pan-k-ref', 'Reembolsos', intf(M['refunds_n']),
       f"{money(M['refund_val'])} · {pct_of(M['refund_val'], M['fat'])} do fat.", 'arrow-back-up', '#A32D2D', w=2, x=8, y=1)
    km(pan, pg, 'pan-k-conv', 'Conversão Geral', pctf(M['conv_geral']),
       f"pago {pctf(M['conv_pago'])} · org {pctf(M['conv_org'])}", 'circle-check', '#3B6D11', w=2, x=10, y=1,
       real=M['conv_geral'], meta=G.get('conv'), meta_fmt=(pctf(G.get('conv')) if G.get('conv') else None))
    # ── linha de baixo (direita): Retorno, ROI, ROAS — eficiência em roxo, fórmula no (i) ──
    km(pan, pg, 'pan-k-ret', 'Retorno Bruto', money(M['retorno']), '', 'database', '#534AB7', w=2, x=6, y=3,
       real=M['retorno'], meta=retorno_meta, hist=retorno_h,
       meta_fmt=(money(retorno_meta) if retorno_meta is not None else None),
       hist_fmt=(money(retorno_h) if retorno_h is not None else None))
    pan[-1]['emph'] = True
    pan[-1]['info'] = 'Indicador calculado: faturamento total − investimento total. Lucro bruto da campanha, antes de impostos e demais custos.'
    km(pan, pg, 'pan-k-roi', 'ROI Global', f"{M['roi']:.0f}%", 'retorno líq. / R$1 investido', 'trending-up', '#185FA5', w=2, x=8, y=3,
       real=M['roi'], meta=roi_meta, hist=roi_h,
       meta_fmt=(f"{roi_meta:.0f}%" if roi_meta is not None else None),
       hist_fmt=(f"{roi_h:.0f}%" if roi_h is not None else None))
    pan[-1]['emph'] = True
    pan[-1]['info'] = 'Indicador calculado: (faturamento total − investimento total) ÷ investimento total — retorno LÍQUIDO por R$1 investido, já descontado o principal (equivale a fat÷invest − 1).'
    km(pan, pg, 'pan-k-roas', 'ROAS Captação', xf(M['roas']), 'retorno líq. / R$1 de mídia', 'bolt', '#EF9F27', w=2, x=10, y=3,
       real=M['roas'], meta=roas_meta, hist=roas_h, meta_fmt=(xf(roas_meta) if roas_meta is not None else None),
       hist_fmt=(xf(roas_h) if roas_h else None))
    pan[-1]['emph'] = True
    pan[-1]['info'] = 'Indicador calculado: (faturamento pago − investimento de captação) ÷ investimento de captação — retorno LÍQUIDO por R$1 de mídia, já descontado o investimento (equivale a fat÷invest − 1; 1× = dobrou o dinheiro).'
    pg.cursor_to(5)  # bloco de indicadores globais ocupa y=0..5 (eyebrow + 2 linhas h=2)

    eb(pan, pg, 'pan-eb-vol', 'INDICADORES DE VOLUME', '8 métricas')
    # Ordem fixa do grid (definida pelo consultor): linha 1 Investimento · Leads · CPL ·
    # Recapturados; linha 2 Taxa de Resposta · Qualificação · CPMQL · Vendas. (Reordenar
    # arrastando na UI não sobrevive à regeração — a ordem durável é esta.)
    ks(pan, pg, 'pan-v-inv', 'Investimento Total', money(M['invest_total']), f"captação {money(M['invest_cpt'])}", 'coin', '#534AB7', real=M['invest_total'], hist=H.get('invest'), invert=True, hist_fmt=(money(H.get('invest')) if H.get('invest') else None))
    ks(pan, pg, 'pan-v-leads', 'Leads Totais', intf(M['leads_total']), f"pago {pct_of(M['leads_pago'], M['leads_total'])} · org {pct_of(M['leads_org'], M['leads_total'])}", 'users', '#185FA5', real=M['leads_total'], meta=G.get('leads'), hist=H.get('leads'), meta_fmt=(intf(G.get('leads')) if G.get('leads') else None), hist_fmt=(intf(H.get('leads')) if H.get('leads') else None))
    ks(pan, pg, 'pan-v-cpl', 'CPL', money(M['cpl']), '', 'users', '#185FA5', real=M['cpl'], meta=G.get('cpl'), invert=True, hist=H.get('cpl'), meta_fmt=(money(G.get('cpl')) if G.get('cpl') else None), hist_fmt=(money(H.get('cpl')) if H.get('cpl') else None))
    pan[-1]['info'] = 'Indicador calculado: investimento de captação ÷ leads de tráfego (mídia paga). Custo por lead.'
    ks(pan, pg, 'pan-v-recap', 'Leads Recapturados', intf(M['l_ant'] + M['l_cli']), f"antigos {intf(M['l_ant'])} · clientes {intf(M['l_cli'])}", 'refresh', '#854F0B')
    # Taxa de Resposta = respostas da pesquisa ÷ leads totais (vs meta meta_taxa_resp).
    ks(pan, pg, 'pan-v-resp', 'Taxa de Resposta', pctf(M['taxa_resp']),
       f"{intf(M['resps_total'])} resp. / {intf(M['leads_total'])} leads", 'message', '#185FA5',
       real=M['taxa_resp'], meta=G.get('taxa_resp'), hist=H.get('taxa_resp'),
       meta_fmt=(pctf(G.get('taxa_resp')) if G.get('taxa_resp') else None),
       hist_fmt=(pctf(H.get('taxa_resp')) if H.get('taxa_resp') else None))
    ks(pan, pg, 'pan-v-qual', 'Qualificação', pctf(M['qual']), f"{intf(M['mqls_total'])} MQLs / {intf(M['resps_total'])} resp.", 'star', '#854F0B', real=M['qual'], meta=G.get('qual'), hist=H.get('qual'), meta_fmt=(pctf(G.get('qual')) if G.get('qual') else None), hist_fmt=(pctf(H.get('qual')) if H.get('qual') else None))
    ks(pan, pg, 'pan-v-cpmql', 'CPMQL', money(M['cpmql']), '', 'star', '#854F0B', real=M['cpmql'], meta=G.get('cpmql'), invert=True, hist=H.get('cpmql'), meta_fmt=(money(G.get('cpmql')) if G.get('cpmql') else None), hist_fmt=(money(H.get('cpmql')) if H.get('cpmql') else None))
    pan[-1]['info'] = 'Indicador calculado: CPL ÷ taxa de qualificação paga. Custo por lead qualificado (MQL).'
    ks(pan, pg, 'pan-v-vendas', 'Vendas', intf(M['vendas_total']), f"pago {intf(M['vendas_pago'])} · org {intf(M['vendas_org'])}", 'shopping-cart', '#534AB7', real=M['vendas_total'], meta=mv_meta, hist=H.get('vendas'), meta_fmt=(intf(mv_meta) if mv_meta else None), hist_fmt=(intf(H.get('vendas')) if H.get('vendas') else None))

    eb(pan, pg, 'pan-eb-cmp', 'COMPARATIVO — REALIZADO vs META', 'indicadores na ordem do funil')
    # Barras de atingimento (widget meta-bars), na ordem do FUNIL: verba → leads (+CPL)
    # → qualificação (+CPMQL) → conversão → vendas → faturamento → lucro bruto. A barra é
    # colorida pela AVALIAÇÃO (verde/âmbar/vermelho), igual ao Δ. Meta/Histórico absolutos.
    mvm = sum((G.get('meta_vendas_canal') or {}).values()) or G.get('vendas')
    pan.append({'id': 'pan-cmp', 'type': 'meta-bars', 'rows': [
        mb_row('Investimento Captação', M['invest_cpt'], G.get('invest_cpt'), H.get('invest_cpt'), 'money', invert=True),
        mb_row('Leads', M['leads_total'], G.get('leads'), H.get('leads'), 'int'),
        mb_row('CPL', M['cpl'], G.get('cpl'), H.get('cpl'), 'money', invert=True),
        mb_row('Qualificação', M['qual'], G.get('qual'), H.get('qual'), 'pct'),
        mb_row('CPMQL', M['cpmql'], G.get('cpmql'), H.get('cpmql'), 'money', invert=True),
        mb_row('Conversão', M['conv_geral'], G.get('conv'), None, 'pct'),
        mb_row('Vendas', M['vendas_total'], mvm, H.get('vendas'), 'int'),
        mb_row('Faturamento', M['fat'], G.get('fat'), H.get('fat'), 'money'),
        mb_row('Lucro Bruto', M['retorno'], retorno_meta, retorno_h, 'money'),
        mb_row('ROI Global', M['roi'], roi_meta, roi_h, 'pct'),
    ]})
    pg.add('pan-cmp', 'meta-bars', 12, 10)
    # Métricas no tempo (combo barras+linha, seletores) — visão da campanha inteira no tempo.
    eb(pan, pg, 'pan-eb-evo', 'MÉTRICAS NO TEMPO', 'qualquer métrica × métrica da campanha no tempo (barras + linha)')
    _pmjson = [{'id': k, 'label': l, 'fmt': f} for k, l, f in [
        ('leads', 'Leads', 'int'), ('vendas', 'Vendas', 'int'), ('fat', 'Faturamento', 'money'),
        ('inv', 'Investimento', 'money'), ('retorno', 'Retorno Bruto', 'money'), ('roas', 'ROAS', 'x'),
        ('cpl', 'CPL', 'money'), ('conv', 'Conversão', 'pct'), ('qual', 'Qualificação', 'pct'),
        ('taxa_resp', 'Taxa de Resposta', 'pct'), ('ticket', 'Ticket Médio', 'money'), ('mqls', 'MQLs', 'int')]]
    pan.append({'id': 'pan-evo', 'type': 'evolution-picker', 'title': 'Métricas no tempo', 'height': 330,
                'metrics': _pmjson, 'points': M.get('daily_all') or [], 'current': 'fat', 'current2': 'inv', 'combo': True})
    pg.add('pan-evo', 'evolution-picker', 12, 6)
    sections['s01'] = {'id': 's01', 'header': {'badge': 'Panorama Geral', 'title': f"Debriefing · {M['nome']}",
                       'sub': f"{M['campaign_label']} — atingiu as metas? resumo macro do lançamento."}, 'widgets': pan}
    layouts['s01'] = pg.items

    # ════ s02 — Canal e Conversão ═══════════════════════════════════════════
    can, cg = [], Grid()
    eb(can, cg, 'can-eb', 'RESUMO EXECUTIVO', 'vendas, leads e tipo de lead por escopo')
    byc = G.get('by_canal') or {}
    mvc = G.get('meta_vendas_canal') or {}
    org_ch = [c for c in M['chan'] if c['tipo'] != 'pago']
    pago_ch = [c for c in M['chan'] if c['tipo'] == 'pago']
    _mv = lambda chans: sum((mvc.get(c['canal']) or byc.get(c['canal'], {}).get('meta_vendas') or 0) for c in chans)
    mvm = sum(mvc.values()) or G.get('vendas')
    hf_esc = M.get('hist_funnel') or {}

    def _chip(at, base_lbl):
        if at is None:
            return None
        return {'text': f'{at:.0f}% {base_lbl}', 'tone': ('pos' if at >= 100 else 'warn' if at >= 80 else 'neg')}

    esc_cards = []
    for lbl, tone, scope, lp, lv, cv, nv, an, cl, mv in [
        ('Geral', 'purple', 'geral', M['leads_total'], M['vendas_total'], M['conv_geral'], M['l_novo'], M['l_ant'], M['l_cli'], mvm),
        ('Pago', 'blue', 'pago', M['leads_pago'], M['vendas_pago'], M['conv_pago'], M['l_novo_p'], M['l_ant_p'], M['l_cli_p'], _mv(pago_ch)),
        ('Orgânico', 'green', 'org', M['leads_org'], M['vendas_org'], M['conv_org'], M['l_novo_o'], M['l_ant_o'], M['l_cli_o'], _mv(org_ch))]:
        at = (lv / mv * 100) if mv else None
        hv = (hf_esc.get(scope) or {}).get('vendas')
        ath = (lv / hv * 100) if hv else None
        card = {
            'label': lbl, 'tone': tone, 'value': intf(lv), 'unit': 'vendas', 'chip': _chip(at, 'da meta'),
            'sub': f'{intf(lp)} leads · {pctf(cv)} conv.',
            'minis': [
                {'label': 'Novos', 'tone': 'purple', 'value': intf(nv), 'pct': pct_of(nv, lp)},
                {'label': 'Antigos', 'tone': 'amber', 'value': intf(an), 'pct': pct_of(an, lp)},
                {'label': 'Clientes', 'tone': 'green', 'value': intf(cl), 'pct': pct_of(cl, lp)},
            ]}
        ch = _chip(ath, 'do histórico')
        if ch:
            card['chipHist'] = ch
        esc_cards.append(card)
    can.append({'id': 'can-resumo', 'type': 'escopo-cards', 'cards': esc_cards})
    cg.add('can-resumo', 'escopo-cards', 12, 4)

    # Pipeline de conversão — 3 funis lado a lado (Geral · Orgânico · Pago). A ÚLTIMA
    # transição é a CONVERSÃO (vendas/leads, não MQL→venda) com tag de comparação com a
    # META de conversão do escopo, derivada das metas por canal do launch goals
    # (by_canal: meta_vendas ÷ meta_leads agregados por tipo de tráfego).
    byc = G.get('by_canal') or {}
    mvc = G.get('meta_vendas_canal') or {}

    def _meta_conv(channels):
        ml = sum((byc.get(c['canal'], {}).get('meta_leads') or 0) for c in channels)
        mv = sum((mvc.get(c['canal']) or byc.get(c['canal'], {}).get('meta_vendas') or 0) for c in channels)
        return (mv / ml * 100) if ml else None

    def _meta_rate(channels, wkey):
        # taxa-meta do escopo (resp/qualif): soma ponderada por meta_leads ÷ meta_leads.
        ml = sum((byc.get(c['canal'], {}).get('meta_leads') or 0) for c in channels)
        w = sum((byc.get(c['canal'], {}).get(wkey) or 0) for c in channels)
        return (w / ml * 100) if ml else None

    hfun = M.get('hist_funnel') or {}

    def _hrates(scope):
        h = hfun.get(scope)
        if not h:
            return (None, None, None)
        rr = (h['resps'] / h['leads'] * 100) if h['leads'] else None       # taxa de resposta
        qr = (h['mqls'] / h['resps'] * 100) if h['resps'] else None        # qualificação
        cr = (h['vendas'] / h['leads'] * 100) if h['leads'] else None      # conversão lead→venda
        return (cr, rr, qr)

    def _funil(wid, title, leads, resps, mqls, vendas, meta_conv, meta_resp, meta_qual, scope):
        vals = [leads, resps, mqls, vendas]
        mig = lambda i: round(vals[i + 1] / vals[i] * 100, 1) if vals[i] else 0.0
        hist_conv, hist_resp, hist_qual = _hrates(scope)

        def step(i, bench, hbench):
            m = mig(i)
            tr = {'migrate': m, 'loss': round(100 - m, 1)}
            if bench:
                tr['bench'] = round(bench, 1)
                if m < bench:
                    tr['gap'] = round(bench - m, 1)
            if hbench:
                tr['benchHist'] = round(hbench, 1)
                if m < hbench:
                    tr['gapHist'] = round(hbench - m, 1)
            return tr
        conv = round(vendas / leads * 100, 1) if leads else 0.0
        trans = [
            step(0, meta_resp, hist_resp),   # leads → respostas vs taxa de resposta (meta/hist)
            step(1, meta_qual, hist_qual),   # respostas → MQLs vs qualificação (meta/hist)
            # conversão lead→venda + comparação com a base (sem "perda" de quem sai)
            {'migrate': conv,
             'bench': round(meta_conv, 1) if meta_conv else None,
             'gap': round(meta_conv - conv, 1) if (meta_conv and conv < meta_conv) else None,
             'benchHist': round(hist_conv, 1) if hist_conv else None,
             'gapHist': round(hist_conv - conv, 1) if (hist_conv and conv < hist_conv) else None},
        ]
        steps = [{'label': l, 'value': v} for l, v in zip(['Leads', 'Respostas', 'MQLs', 'Vendas'], vals)]
        return {'id': wid, 'type': 'funnel', 'title': title, 'steps': steps, 'transitions': trans}

    org_ch = [c for c in M['chan'] if c['tipo'] != 'pago']
    pago_ch = [c for c in M['chan'] if c['tipo'] == 'pago']
    eb(can, cg, 'can-eb-pipe', 'PIPELINE DE CONVERSÃO', 'taxas do funil vs a base (meta ou histórico), por escopo')
    can.append(_funil('can-fun-ger', 'Geral', M['leads_total'], M['resps_total'], M['mqls_total'], M['vendas_total'],
                      _meta_conv(M['chan']), _meta_rate(M['chan'], 'resp_w'), _meta_rate(M['chan'], 'qual_w'), 'geral'))
    cg.add('can-fun-ger', 'funnel', 4, 5)
    can.append(_funil('can-fun-org', 'Orgânico', M['leads_org'], M['resps_org'], M['mqls_org'], M['vendas_org'],
                      _meta_conv(org_ch), _meta_rate(org_ch, 'resp_w'), _meta_rate(org_ch, 'qual_w'), 'org'))
    cg.add('can-fun-org', 'funnel', 4, 5)
    can.append(_funil('can-fun-pago', 'Pago', M['leads_pago'], M['resps_pago'], M['mqls_pago'], M['vendas_pago'],
                      _meta_conv(pago_ch), _meta_rate(pago_ch, 'resp_w'), _meta_rate(pago_ch, 'qual_w'), 'pago'))
    cg.add('can-fun-pago', 'funnel', 4, 5)

    mvc = M['goals'].get('meta_vendas_canal') or {}
    byc = G.get('by_canal') or {}

    # Mapa 2×2: x = conversão vs base, y = leads vs base, cor = vendas vs base,
    # tamanho da bolha = % de leads. Base = planejado (meta) ou lançamento anterior
    # (toggle de plataforma). Vem ANTES do bullet "Canais vs Meta".
    chist = M.get('chan_hist') or {}
    quad_pts = []
    leads_tot = M.get('leads_total') or 0
    for c in M['chan']:
        meta_v = mvc.get(c['canal']) or byc.get(c['canal'], {}).get('meta_vendas')
        ml = byc.get(c['canal'], {}).get('meta_leads')
        if not (meta_v and ml):
            continue
        lshare = (c['leads'] / leads_tot * 100) if leads_tot else 0
        pt = {'name': c['canal'], 'size': round(lshare, 1), 'slabel': f'{lshare:.0f}% dos leads',
              'conv': round(c['conv'], 4), 'leads': c['leads'], 'vendas': c['vendas'],
              'meta': {'conv': round(meta_v / ml * 100, 4), 'leads': ml, 'vendas': meta_v}}
        h = chist.get(c['canal'])
        if h and h.get('leads') and h.get('vendas'):
            pt['hist'] = {'conv': round(h['conv'], 4), 'leads': h['leads'], 'vendas': h['vendas']}
        quad_pts.append(pt)
    if len(quad_pts) >= 2:
        has_hist = any('hist' in p for p in quad_pts)
        modes = {'meta': {
            'axes': {'x': 'Conversão vs planejado', 'y': 'Leads vs planejado', 'heat': 'Vendas vs planejado'},
            'note': 'Tudo é comparado ao planejado (meta) de cada canal — que varia por canal. Ex.: um canal pode converter bem e ainda ficar abaixo do que foi planejado pra ele.',
            'quadrants': [
                {'pos': 'tr', 'label': 'Escala + eficiência', 'tone': 'pos',
                 'desc': 'Leads e conversão acima do planejado. Manter o investimento e escalar.'},
                {'pos': 'tl', 'label': 'Volume sem conversão', 'tone': 'warn',
                 'desc': 'Leads acima do planejado, conversão abaixo. Revisar qualificação e oferta.'},
                {'pos': 'br', 'label': 'Eficiente, falta escala', 'tone': 'neutral',
                 'desc': 'Conversão acima do planejado, leads abaixo. Investir em volume.'},
                {'pos': 'bl', 'label': 'Abaixo em tudo', 'tone': 'neg',
                 'desc': 'Leads e conversão abaixo do planejado. Diagnosticar a fundo ou cortar.'}]}}
        if has_hist:
            modes['hist'] = {
                'axes': {'x': 'Conversão vs anterior', 'y': 'Leads vs anterior', 'heat': 'Vendas vs anterior'},
                'note': 'Comparado ao lançamento anterior, mesmo canal. Canais sem histórico ficam de fora neste modo.',
                'quadrants': [
                    {'pos': 'tr', 'label': 'Cresceu nos dois', 'tone': 'pos',
                     'desc': 'Leads e conversão acima do lançamento anterior. Tendência de alta.'},
                    {'pos': 'tl', 'label': 'Mais leads, pior conv.', 'tone': 'warn',
                     'desc': 'Cresceu em leads, mas converteu pior que antes. Olhar qualificação.'},
                    {'pos': 'br', 'label': 'Melhor conv., menos leads', 'tone': 'neutral',
                     'desc': 'Converteu melhor que antes, mas perdeu volume. Recuperar leads.'},
                    {'pos': 'bl', 'label': 'Caiu nos dois', 'tone': 'neg',
                     'desc': 'Leads e conversão abaixo do lançamento anterior. Atenção.'}]}
        eb(can, cg, 'can-eb-quad', 'MAPA DE CANAIS', 'cada ponto é um canal — posição vs o planejado (meta) do canal · cor = vendas, tamanho = leads')
        can.append({'id': 'can-quad', 'type': 'quadrant-scatter', 'title': 'Mapa de Canais',
                    'size': '% de leads', 'modes': modes, 'points': quad_pts})
        cg.add('can-quad', 'quadrant-scatter', 12, 6)

    # canais vs base — bullet-bars por desempenho, toggle de métrica (leads/vendas/conv)
    # × toggle de plataforma (meta/planejado ↔ histórico).
    eb(can, cg, 'can-eb-vs', 'CANAIS vs META', 'realizado vs a base (meta ou histórico) por canal — alterne a métrica')
    blt_ch = []
    for c in M['chan']:
        meta_v = mvc.get(c['canal']) or byc.get(c['canal'], {}).get('meta_vendas')
        ml = byc.get(c['canal'], {}).get('meta_leads')
        if not (meta_v or ml):
            continue
        meta_conv = (meta_v / ml * 100) if (meta_v and ml) else None
        h = chist.get(c['canal']) or {}

        def _metric(value, vlabel, mbase, mfmt, hbase):
            bases = {}
            if mbase:
                bases['meta'] = {'v': mbase, 'label': mfmt(mbase)}
            if hbase:
                bases['hist'] = {'v': hbase, 'label': mfmt(hbase)}
            return {'value': value, 'vlabel': vlabel, 'bases': bases} if bases else None

        hconv = h.get('conv') if (h.get('leads') and h.get('vendas')) else None
        blt_ch.append({'name': c['canal'], 'metrics': {
            'leads': _metric(c['leads'], intf(c['leads']), ml, intf, h.get('leads')),
            'vendas': _metric(c['vendas'], intf(c['vendas']), meta_v, intf, h.get('vendas')),
            'conv': _metric(c['conv'], pctf(c['conv']), meta_conv, pctf, hconv)}})
    if blt_ch:
        can.append({'id': 'can-vs-blt', 'type': 'bullet-groups', 'title': 'Canais vs Meta',
                    'toggle': [{'key': 'leads', 'label': 'Leads'}, {'key': 'vendas', 'label': 'Vendas'}, {'key': 'conv', 'label': 'Conversão'}],
                    'groups': [{'key': 'acima', 'label': '↑ Acima', 'tone': 'pos'},
                               {'key': 'prox', 'label': '≈ Próximo (±5%)', 'tone': 'warn'},
                               {'key': 'abaixo', 'label': '↓ Abaixo', 'tone': 'neg'}],
                    'channels': blt_ch})

        def _maxbucket(metric):
            g = {'acima': 0, 'prox': 0, 'abaixo': 0}
            for ch in blt_ch:
                e = ch['metrics'].get(metric)
                b = e and e['bases'].get('meta')
                if not b:
                    continue
                dv = (e['value'] - b['v']) / b['v'] * 100
                g['acima' if dv > 5 else 'prox' if dv >= -5 else 'abaixo'] += 1
            return max(g.values())
        _mr = max(_maxbucket('leads'), _maxbucket('vendas'), _maxbucket('conv'))
        cg.add('can-vs-blt', 'bullet-groups', 12, max(4, 2 + (_mr + 1) // 2 + 1))

    # Resultado por canal — duas tabelas (Orgânico · Pago) no widget channel-table.
    # Δ e a coluna de base (Meta Vendas ↔ Hist Vendas) seguem o toggle de plataforma.
    ch_cols = [{'label': 'Canal'}, {'label': 'Leads'}, {'label': 'Δ Leads', 'align': 'center'},
               {'label': 'Qualif.'}, {'label': 'Conv.'}, {'label': 'Δ Conv.', 'align': 'center'},
               {'label': 'Vendas'}, {'label': 'Δ Vendas', 'align': 'center'},
               {'label': 'Fat.'}, {'label': 'Δ Fat.', 'align': 'center'}]

    def _dpill(real, base):
        # delta % com a escala de avaliação (verde · âmbar · cinza · vermelho), via _dev.
        if not base:
            return {'value': '–', 'tone': 'muted', 'align': 'center'}
        d, tone = _dev(real, base)
        return {'value': f'{d:+.1f}%', 'pill': True, 'tone': tone, 'align': 'center'}

    def _ch_rows(chans, mode):
        out = []
        for c in chans:
            if mode == 'hist':
                h = chist.get(c['canal']) or {}
                b_leads = h.get('leads')
                b_vendas = h.get('vendas')
                b_conv = h.get('conv') if (h.get('leads') and h.get('vendas')) else None
                b_fat = h.get('fat')
            else:
                bc = byc.get(c['canal'], {})
                b_vendas = mvc.get(c['canal']) or bc.get('meta_vendas')
                b_leads = bc.get('meta_leads')
                b_conv = (b_vendas / b_leads * 100) if (b_vendas and b_leads) else None
                b_fat = bc.get('meta_fat')
            out.append({'name': c['canal'], 'cells': [
                {'value': intf(c['leads'])}, _dpill(c['leads'], b_leads),
                {'value': pctf(c['qual'])},
                {'value': pctf(c['conv'])}, _dpill(c['conv'], b_conv),
                {'value': intf(c['vendas'])}, _dpill(c['vendas'], b_vendas),
                {'value': money(c['fat'])}, _dpill(c['fat'], b_fat)]})
        return out

    has_chist = bool(chist)

    def _ch_widget(wid, title, chans):
        w = {'id': wid, 'type': 'channel-table', 'title': title,
             'cols': ch_cols, 'rows': _ch_rows(chans, 'meta')}
        if has_chist:
            w['cmp'] = {'meta': {'cols': ch_cols, 'rows': _ch_rows(chans, 'meta')},
                        'hist': {'cols': ch_cols, 'rows': _ch_rows(chans, 'hist')}}
        return w

    org = sorted([c for c in M['chan'] if c['tipo'] != 'pago'], key=lambda c: -c['fat'])
    pago = sorted([c for c in M['chan'] if c['tipo'] == 'pago'], key=lambda c: -c['fat'])
    eb(can, cg, 'can-eb-tbl', 'RESULTADO POR CANAL', 'orgânico e pago, separados')
    if pago:
        can.append(_ch_widget('can-tbl-pago', 'Pago', pago))
        cg.add('can-tbl-pago', 'channel-table', 12, max(3, len(pago) + 2))
    if org:
        can.append(_ch_widget('can-tbl-org', 'Orgânico', org[:14]))
        cg.add('can-tbl-org', 'channel-table', 12, max(3, min(len(org), 14) + 2))
    sections['s02'] = {'id': 's02', 'header': {'badge': 'Canal', 'title': 'Canal e Conversão',
                       'sub': 'Performance por canal e por escopo (pago × orgânico).'}, 'widgets': can}
    layouts['s02'] = cg.items

    # ════ s03 — Tráfego Pago ════════════════════════════════════════════════
    tra, tg = [], Grid()
    # ── 1ª dobra: indicadores de RESULTADO no estilo macro do Panorama (bandas de
    # atingimento + grade 2×3). Mídia: ROI→CPL e Reembolso→CPMQL. ──
    eb(tra, tg, 'tra-eb-res', 'INDICADORES DE RESULTADO', 'atingimento + eficiência da mídia paga')

    def _tband(wid, label, real, meta, at, x, y, w=3):
        if real is None or not meta or at is None:
            return
        tra.append({'id': wid, 'type': 'kpi-card', 'tier': 'feature', 'band': True,
                    'label': label, 'value': f'{intf(real)} / {intf(meta)}',
                    'sub': 'realizado vs meta da mídia paga', 'delta': f'{at:.0f}%', 'deltaTone': at_tone(at)})
        tg.at(wid, 'kpi-card', x, y, w, 2)

    # Tudo nesta página é PAGO → metas/histórico do escopo pago (soma dos canais pagos).
    _pago_ch = [c for c in M['chan'] if c['tipo'] == 'pago']
    _bycp = G.get('by_canal') or {}
    _mvcp = G.get('meta_vendas_canal') or {}
    _mlp = sum((_bycp.get(c['canal'], {}).get('meta_leads') or 0) for c in _pago_ch)      # meta leads pago
    _mvp = sum((_mvcp.get(c['canal']) or _bycp.get(c['canal'], {}).get('meta_vendas') or 0) for c in _pago_ch)  # meta vendas pago
    _mfp = sum((_bycp.get(c['canal'], {}).get('meta_fat') or 0) for c in _pago_ch)        # meta faturamento pago
    _ginv = G.get('invest_cpt')                                                           # meta invest captação (toda paga)
    meta_conv_pago = (_mvp / _mlp * 100) if _mlp else None
    meta_ret_pago = (_mfp - _ginv) if (_mfp and _ginv) else None
    at_leads_p = (M['leads_pago'] / _mlp * 100) if _mlp else None
    at_vendas_p = (M['vendas_pago'] / _mvp * 100) if _mvp else None
    ret_pago = M['fat_pago'] - M['invest_cpt']
    # histórico pago: chan_hist tem fat/leads/vendas por canal (sem invest → sem hist de retorno).
    _hfp = (M.get('hist_funnel') or {}).get('pago') or {}
    hist_conv_pago = (_hfp['vendas'] / _hfp['leads'] * 100) if (_hfp.get('leads') and _hfp.get('vendas')) else None
    _hfat_pago = (sum(((chist.get(c['canal']) or {}).get('fat') or 0) for c in _pago_ch) or None)
    ticket_pago = (M['fat_pago'] / M['vendas_pago']) if M['vendas_pago'] else None
    meta_ticket = (_mfp / _mvp) if _mvp else None
    hist_ticket = (_hfat_pago / _hfp['vendas']) if (_hfat_pago and _hfp.get('vendas')) else None

    # esquerda: bandas de atingimento empilhadas (w=4, um pouco mais largas) na 1ª coluna;
    # Investimento e Ticket empilhados (w=2, igual aos demais cards) na 2ª coluna.
    _tband('tra-at-leads', 'Atingimento · Leads', M['leads_pago'], _mlp or None, at_leads_p, 0, 1, 4)
    _tband('tra-at-vendas', 'Atingimento · Vendas', M['vendas_pago'], _mvp or None, at_vendas_p, 0, 3, 4)
    km(tra, tg, 'tra-k-inv', 'Investimento', money(M['invest_cpt']), '', 'coin', '#534AB7',
       real=M['invest_cpt'], meta=_ginv, invert=True, hist=H.get('invest'), w=2, h=2, x=4, y=1,
       meta_fmt=(money(_ginv) if _ginv else None), hist_fmt=(money(H.get('invest')) if H.get('invest') else None))
    tra[-1]['info'] = 'Verba de mídia paga investida em captação (exclui campanhas de venda).'
    _rs = lambda v: f"R$ {intf(round(v))}" if v else '—'   # ticket em reais cheios (money() abreviaria p/ "R$ 1k")
    km(tra, tg, 'tra-k-ticket', 'Ticket Médio', _rs(ticket_pago), '', 'shopping-cart', '#3B6D11',
       real=ticket_pago, meta=meta_ticket, hist=hist_ticket, w=2, h=2, x=4, y=3,
       meta_fmt=(_rs(meta_ticket) if meta_ticket else None), hist_fmt=(_rs(hist_ticket) if hist_ticket else None))
    tra[-1]['info'] = 'Faturamento pago ÷ vendas pagas — valor médio por venda na mídia paga.'
    # topo (direita): Faturamento Pago · CPL · Conversão Paga
    km(tra, tg, 'tra-k-fat', 'Faturamento Pago', money(M['fat_pago']), '', 'coin', '#3B6D11',
       real=M['fat_pago'], meta=(_mfp or None), hist=_hfat_pago, w=2, x=6, y=1,
       meta_fmt=(money(_mfp) if _mfp else None), hist_fmt=(money(_hfat_pago) if _hfat_pago else None))
    tra[-1]['info'] = f"Faturamento das vendas atribuídas a canais pagos — {pct_of(M['fat_pago'], M['fat'])} do faturamento total."
    km(tra, tg, 'tra-k-cpl', 'CPL', money(M['cpl']), '', 'users', '#185FA5', w=2, x=8, y=1,
       real=M['cpl'], meta=G.get('cpl'), invert=True, hist=H.get('cpl'),
       meta_fmt=(money(G.get('cpl')) if G.get('cpl') else None), hist_fmt=(money(H.get('cpl')) if H.get('cpl') else None))
    tra[-1]['info'] = 'Indicador calculado: investimento de captação ÷ leads de tráfego (mídia paga). Custo por lead.'
    km(tra, tg, 'tra-k-conv', 'Conversão Paga', pctf(M['conv_pago']), '', 'circle-check', '#3B6D11', w=2, x=10, y=1,
       real=M['conv_pago'], meta=meta_conv_pago, hist=hist_conv_pago,
       meta_fmt=(pctf(meta_conv_pago) if meta_conv_pago else None),
       hist_fmt=(pctf(hist_conv_pago) if hist_conv_pago else None))
    tra[-1]['info'] = f"Vendas ÷ leads, só mídia paga ({intf(M['vendas_pago'])} vendas / {intf(M['leads_pago'])} leads)."
    # baixo (direita): Retorno Pago · CPMQL · ROAS — eficiência em roxo, fórmula no (i)
    km(tra, tg, 'tra-k-ret', 'Retorno Pago', money(ret_pago), '', 'database', '#534AB7', w=2, x=6, y=3,
       real=ret_pago, meta=meta_ret_pago,
       meta_fmt=(money(meta_ret_pago) if meta_ret_pago is not None else None))
    tra[-1]['emph'] = True
    tra[-1]['info'] = 'Indicador calculado: faturamento pago − investimento de captação. Lucro bruto da mídia paga (antes de impostos e demais custos).'
    km(tra, tg, 'tra-k-cpmql', 'CPMQL', money(M['cpmql']), '', 'star', '#854F0B', w=2, x=8, y=3,
       real=M['cpmql'], meta=G.get('cpmql'), invert=True, hist=H.get('cpmql'),
       meta_fmt=(money(G.get('cpmql')) if G.get('cpmql') else None), hist_fmt=(money(H.get('cpmql')) if H.get('cpmql') else None))
    tra[-1]['emph'] = True
    tra[-1]['info'] = 'Indicador calculado: CPL ÷ taxa de qualificação paga. Custo por lead qualificado (MQL).'
    km(tra, tg, 'tra-k-roas', 'ROAS Captação', xf(M['roas']), 'retorno líq. / R$1 de mídia', 'bolt', '#EF9F27', w=2, x=10, y=3,
       real=M['roas'], meta=roas_meta, hist=roas_h,
       meta_fmt=(xf(roas_meta) if roas_meta is not None else None), hist_fmt=(xf(roas_h) if roas_h else None))
    tra[-1]['emph'] = True
    tra[-1]['info'] = 'Indicador calculado: (faturamento pago − investimento de captação) ÷ investimento de captação — retorno LÍQUIDO por R$1 de mídia, já descontado o investimento (equivale a fat÷invest − 1; 1× = dobrou o dinheiro).'
    tg.cursor_to(5)

    eb(tra, tg, 'tra-eb', 'INDICADORES DE CAPTURA', 'funil de captação (impressão → MQL) + métricas vs bench/meta, na ordem do funil')
    # esquerda: funil de captação paga (impressões → clicks → [pageviews] → leads → MQLs).
    # remove etapas sem dado (ex.: pageviews zerado neste dump) p/ não quebrar o funil.
    # CTR e a conversão clicks→leads (conv. de página) usam BENCHMARK: default do app
    # (FUNNEL_BENCH) sobrescrito por config['funnel_bench'] (editável na criação).
    _fb = {'ctr': 1.5, 'connect': 80.0, 'conv_pag': 40.0}
    _fb.update(config.get('funnel_bench') or {})
    # benchs derivados (usados no funil e nos cards): CPM = CPL × CTR × (clk→lead) ÷ 10.
    _ctrb = _fb.get('ctr') or 0
    _clb = (_fb.get('connect', 0) / 100.0) * _fb.get('conv_pag', 0)      # clicks→leads bench (%)
    _cplm = G.get('cpl')
    _cpmb = (_cplm * _ctrb * _clb / 10.0) if (_cplm and _ctrb and _clb) else None
    _cpcb = (_cpmb / (10.0 * _ctrb)) if (_cpmb and _ctrb) else None
    _trp = (M['resps_pago'] / M['leads_pago'] * 100) if M.get('leads_pago') else 0.0
    # etapa inicial = Investimento (verba que origina o funil; rótulo em R$). A transição
    # Investimento→Impressões mostra o CPM (custo), não uma taxa de passagem.
    _fv = [(l, v, vl) for l, v, vl in [
           ('Investimento', M['invest_cpt'], money(M['invest_cpt'])),
           ('Impressões', M['impressoes'], None), ('Clicks', M['clicks'], None),
           ('Pageviews', M['pageviews'], None), ('Leads', M['leads_traf'], None),
           ('Respostas', M['resps_pago'], None), ('MQLs', M['mqls_pago'], None)] if v]
    _fmig = lambda a, b: round(b / a * 100, 2) if a else 0.0   # 2 casas (display controla as casas mostradas)

    def _tbench(frm, to):
        if frm == 'Impressões' and to == 'Clicks':
            return _fb.get('ctr')
        if frm == 'Clicks' and to == 'Pageviews':
            return _fb.get('connect')
        if frm == 'Pageviews' and to == 'Leads':
            return _fb.get('conv_pag')
        if frm == 'Clicks' and to == 'Leads':   # sem pageviews: bench = connect × conv. de página
            return (_fb.get('connect', 0) / 100.0 * _fb.get('conv_pag', 0)) or None
        if frm == 'Leads' and to == 'Respostas':    # taxa de resposta (meta da campanha)
            return G.get('taxa_resp')
        if frm == 'Respostas' and to == 'MQLs':     # qualificação (meta da campanha)
            return G.get('qual')
        return None

    def _thist(frm, to):   # SÓ transições de META togglam p/ histórico; bench fixo fica no bench
        if frm == 'Leads' and to == 'Respostas':
            return H.get('taxa_resp')
        if frm == 'Respostas' and to == 'MQLs':
            return H.get('qual')
        return None

    _ftr = []
    for i in range(len(_fv) - 1):
        frm, to = _fv[i][0], _fv[i + 1][0]
        if frm == 'Investimento':   # custo: CPM vs bench (não taxa de passagem)
            if _cpmb:
                _dc, _tc = _dev(M['cpm'], _cpmb, invert=True)
                _bad = _tc in ('warn', 'neg')
                _sym = '⚠' if _tc == 'warn' else ('✕' if _tc == 'neg' else '✓')
                _ftr.append({'note': f"{_sym} CPM {money(M['cpm'])}" + (f" · bench {money(_cpmb)}" if _bad else ''),
                             'noteTone': _tc})
            else:
                _ftr.append({'note': f"CPM {money(M['cpm'])}"})
            continue
        m = _fmig(_fv[i][1], _fv[i + 1][1])
        tr = {'migrate': m, 'loss': round(100 - m, 1)}
        b = _tbench(frm, to)
        if b:
            tr['bench'] = round(b, 1)
            if m < b:
                tr['gap'] = round(b - m, 1)
            if frm in ('Leads', 'Respostas'):   # taxa de resposta / qualificação = meta da campanha
                tr['baseLabel'] = 'meta'
        bh = _thist(frm, to)
        if bh:
            tr['benchHist'] = round(bh, 1)
            if m < bh:
                tr['gapHist'] = round(bh - m, 1)
        if frm == 'Impressões' and to == 'Clicks':   # CTR mostra 2 casas decimais
            tr['decimals'] = 2
        _ftr.append(tr)
    # MAIOR FURO = transição com maior queda RELATIVA ao bench (gap ÷ bench).
    _wi, _wr = None, 0.0
    for i, tr in enumerate(_ftr):
        if tr.get('gap') and tr.get('bench'):
            rel = tr['gap'] / tr['bench']
            if rel > _wr:
                _wr, _wi = rel, i
    if _wi is not None:
        _ftr[_wi]['worst'] = True
    tra.append({'id': 'tra-funil-cpt', 'type': 'funnel', 'title': 'Funil de Captação (pago)',
                'sub': 'do investimento ao lead qualificado · taxas vs bench', 'baseLabel': 'bench', 'hideLoss': True,
                'steps': [{'label': l, 'value': v, **({'vlabel': vl} if vl else {})} for l, v, vl in _fv],
                'transitions': _ftr})
    tg.at('tra-funil-cpt', 'funnel', 0, 6, 6, 8)

    # direita: 2 indicadores por linha, na ORDEM DO FUNIL (CPM·CTR / CPC·Taxa Página /
    # CPL·Taxa Resposta / Qualif·CPMQL). Cada um vs bench (CPM/CTR/CPC/Taxa Página) ou
    # meta (CPL/Taxa Resp/Qualif/CPMQL). CPL e CPMQL (custos-chave) em roxo (emph).
    # bench-cards (CPM/CTR/CPC/Taxa Página): SEM hist — ficam sempre vs bench (referência fixa).
    km(tra, tg, 'tra-cpm', 'CPM', money(M['cpm']), '', 'database', '#534AB7', w=3, h=2, x=6, y=6,
       real=M['cpm'], meta=_cpmb, invert=True, glabel='Bench', meta_fmt=(money(_cpmb) if _cpmb else None))
    tra[-1]['info'] = 'Investimento de captação × 1000 ÷ impressões. Bench derivado da meta de CPL × benchs de CTR e clicks→leads.'
    _p2 = lambda x: (f'{x:.2f}%' if x is not None else None)   # CTR em 2 casas decimais
    km(tra, tg, 'tra-ctr', 'CTR', _p2(M['ctr']), '', 'trending-up', '#3B6D11', w=3, h=2, x=9, y=6,
       real=M['ctr'], meta=(_ctrb or None), glabel='Bench', meta_fmt=_p2(_ctrb or None))
    tra[-1]['info'] = 'Clicks ÷ impressões.'
    km(tra, tg, 'tra-cpc', 'CPC', money(M['cpc']), '', 'coin', '#185FA5', w=3, h=2, x=6, y=8,
       real=M['cpc'], meta=_cpcb, invert=True, glabel='Bench', meta_fmt=(money(_cpcb) if _cpcb else None))
    tra[-1]['info'] = 'Investimento de captação ÷ clicks. Bench = CPM-bench ÷ (10 × CTR-bench).'
    km(tra, tg, 'tra-txpag', 'Taxa de Página', pctf(M['tx_pag']), '', 'target', '#3B6D11', w=3, h=2, x=9, y=8,
       real=M['tx_pag'], meta=(_clb or None), glabel='Bench', meta_fmt=(pctf(_clb) if _clb else None))
    tra[-1]['info'] = 'Leads de tráfego ÷ clicks (quem clicou e virou lead). Bench = Connect × Conv. de Página.'
    km(tra, tg, 'tra-cap-cpl', 'CPL', money(M['cpl']), '', 'users', '#185FA5', w=3, h=2, x=6, y=10,
       real=M['cpl'], meta=G.get('cpl'), invert=True, meta_fmt=(money(G.get('cpl')) if G.get('cpl') else None),
       hist=H.get('cpl'), hist_fmt=(money(H.get('cpl')) if H.get('cpl') else None))
    tra[-1]['emph'] = True
    tra[-1]['info'] = 'Investimento de captação ÷ leads de tráfego. Custo por lead.'
    km(tra, tg, 'tra-txresp', 'Taxa de Resposta', pctf(_trp), '', 'message', '#185FA5', w=3, h=2, x=9, y=10,
       real=_trp, meta=G.get('taxa_resp'), meta_fmt=(pctf(G.get('taxa_resp')) if G.get('taxa_resp') else None),
       hist=H.get('taxa_resp'), hist_fmt=(pctf(H.get('taxa_resp')) if H.get('taxa_resp') else None))
    tra[-1]['info'] = 'Respostas ÷ leads (mídia paga).'
    km(tra, tg, 'tra-qual', 'Qualificação', pctf(M['qual_pago']), '', 'circle-check', '#534AB7', w=3, h=2, x=6, y=12,
       real=M['qual_pago'], meta=G.get('qual'), meta_fmt=(pctf(G.get('qual')) if G.get('qual') else None),
       hist=H.get('qual'), hist_fmt=(pctf(H.get('qual')) if H.get('qual') else None))
    tra[-1]['info'] = 'MQLs ÷ respostas (mídia paga).'
    km(tra, tg, 'tra-cap-cpmql', 'CPMQL', money(M['cpmql']), '', 'star', '#854F0B', w=3, h=2, x=9, y=12,
       real=M['cpmql'], meta=G.get('cpmql'), invert=True, meta_fmt=(money(G.get('cpmql')) if G.get('cpmql') else None),
       hist=H.get('cpmql'), hist_fmt=(money(H.get('cpmql')) if H.get('cpmql') else None))
    tra[-1]['emph'] = True
    tra[-1]['info'] = 'CPL ÷ taxa de qualificação paga. Custo por lead qualificado (MQL).'
    tg.cursor_to(14)

    # ── ANÁLISE DE MÍDIA — combo no tempo (esq.) + correlação (dir.) ────────────
    def _dfull(v):
        return 'Não classificado' if (not v or str(v).strip().lower() in ('n/c', 'nan', 'none', '')) else str(v)

    _TM = [('retorno', 'Retorno Bruto', 'money'), ('inv', 'Investimento', 'money'), ('fat', 'Faturamento', 'money'),
           ('leads', 'Leads', 'int'), ('vendas', 'Vendas', 'int'), ('cpl', 'CPL', 'money'), ('cpmql', 'CPMQL', 'money'),
           ('cpm', 'CPM', 'money'), ('ctr', 'CTR', 'pct'), ('conv', 'Conversão', 'pct'), ('qual', 'Qualificação', 'pct'),
           ('taxa_resp', 'Taxa de Resposta', 'pct'), ('roas', 'ROAS', 'x')]
    _mjson = [{'id': k, 'label': l, 'fmt': f} for k, l, f in _TM]
    eb(tra, tg, 'tra-eb-mid', 'ANÁLISE DE MÍDIA', 'qualquer métrica × métrica no tempo (combo) · correlação por público ou criativo')
    if M.get('daily_traf'):
        tra.append({'id': 'tra-evo', 'type': 'evolution-picker', 'title': 'Métricas no tempo', 'height': 250,
                    'metrics': _mjson, 'points': M['daily_traf'], 'current': 'retorno', 'current2': 'inv', 'combo': True})
        tg.at('tra-evo', 'evolution-picker', 0, 15, 12, 5)

    def _scpts(segs, namekey):
        out = []
        for s in segs:
            if (s.get('leads') or 0) < 50:   # pontos com poucos leads são ruído na correlação
                continue
            out.append({'name': _dfull(s.get(namekey))[:54], 'vals': {
                'retorno': (s.get('fat') or 0) - (s.get('inv') or 0), 'inv': s.get('inv'), 'fat': s.get('fat'),
                'leads': s.get('leads'), 'vendas': s.get('vendas'), 'cpl': s.get('cpl'), 'cpmql': s.get('cpmql'),
                'cpm': s.get('cpm'), 'ctr': s.get('ctr'), 'conv': s.get('conv'), 'qual': s.get('qual'),
                'taxa_resp': s.get('taxa_resp'), 'roas': s.get('roas')}})
        return out

    _scdims, _scdt = {}, []
    for _k, _l, _segs, _nk in [('publico', 'Público', M.get('publico') or [], 'publico'),
                               ('criativo', 'Criativo', M.get('criativo_pago') or [], 'criativo'),
                               ('campanha', 'Campanha', M.get('camp_roas') or [], 'campanha')]:
        _pts = _scpts(_segs, _nk)
        if _pts:
            _scdims[_k] = _pts; _scdt.append({'key': _k, 'label': _l})
    if _scdims:
        _first = _scdt[0]['key']
        tra.append({'id': 'tra-corr', 'type': 'scatter-picker', 'title': 'Correlação', 'height': 270,
                    'metrics': _mjson, 'dimToggle': _scdt, 'dims': _scdims, 'points': _scdims[_first],
                    'x': 'cpmql', 'y': 'roas', 'trend': 'best', 'sizeBy': 'inv'})
        tg.at('tra-corr', 'scatter-picker', 0, 20, 8, 6)
        fb(tra, tg, 'tra-corr-help', 'COMO USAR', 'p', 'Correlação & R²',
           ('O <strong>R²</strong> (0 a 1) mede o quanto uma métrica explica a outra: perto de '
            '<strong>1</strong>, relação forte; perto de <strong>0</strong>, sem relação. O motor testa '
            '<strong>reta, log e exp</strong> e plota o melhor ajuste.<br><br>'
            '<strong>Como usar:</strong> troque X e Y para comparar pares — ex.: <strong>CPMQL × ROAS</strong> '
            'vs <strong>CPL × ROAS</strong>. O par com maior R² é o que mais <strong>explica o retorno</strong> '
            'da mídia paga; é nele que vale focar pra otimizar. Alterne <strong>Público / Criativo / '
            'Campanha</strong> pra ver onde a relação é mais forte. O <strong>tamanho do ponto</strong> '
            '= investimento.<br><br>'
            '<strong>Cuidado:</strong> com <strong>poucos pontos</strong> (n baixo), um R² alto pode ser '
            'ilusório — trate como sinal, não prova.'), w=4, h=6, x=8, y=20)
    tg.cursor_to(26)

    # ── GARGALOS NO FUNIL — heatmap (Temperatura · Campanha · Público) ──────────
    # Cada célula = uma etapa do funil pago do segmento, colorida vs meta/bench da
    # página (verde acima · vermelho abaixo). A célula mais vermelha da linha é o furo
    # daquele segmento; a coluna ROAS é a leitura de retorno. Generalista: seja qual
    # for o gargalo do lançamento, ele acende. Abas/segmentos sem dado somem.
    # Colunas: contexto/volume (Investimento, Leads — sem cor), funil vs meta (CPL→ROAS,
    # tint por desvio), e Retorno Bruto (cor por sinal: lucro verde, prejuízo vermelho).
    _garg_cols = [
        {'lbl': 'Investimento',  'get': lambda s: s.get('inv'),   'fmt': 'money', 'mode': 'none'},
        {'lbl': 'Leads',         'get': lambda s: s.get('leads'), 'fmt': 'int',   'mode': 'none'},
        {'lbl': 'CPM',           'get': lambda s: s.get('cpm'),   'fmt': 'money', 'mode': 'meta', 'hk': 'cpm',       'ref': _cpmb,              'inv': True},
        {'lbl': 'CTR',           'get': lambda s: s.get('ctr'),   'fmt': 'pct2',  'mode': 'meta', 'hk': 'ctr',       'ref': _ctrb or None,      'inv': False},
        {'lbl': 'Taxa Página',   'get': lambda s: s.get('tx_pag'),'fmt': 'pct',   'mode': 'meta', 'hk': 'tx_pag',    'ref': _clb or None,       'inv': False},
        {'lbl': 'CPL',           'get': lambda s: s.get('cpl'),   'fmt': 'money', 'mode': 'meta', 'hk': 'cpl',       'ref': G.get('cpl'),       'inv': True},
        {'lbl': 'Taxa Resp',     'get': lambda s: s.get('taxa_resp'), 'fmt': 'pct', 'mode': 'meta', 'hk': 'taxa_resp', 'ref': G.get('taxa_resp'), 'inv': False},
        {'lbl': 'Qualif',        'get': lambda s: s.get('qual'),  'fmt': 'pct',   'mode': 'meta', 'hk': 'qual',      'ref': G.get('qual'),      'inv': False},
        {'lbl': 'CPMQL',         'get': lambda s: s.get('cpmql'), 'fmt': 'money', 'mode': 'meta', 'hk': 'cpmql',     'ref': G.get('cpmql'),     'inv': True},
        {'lbl': 'Conversão',     'get': lambda s: s.get('conv'),  'fmt': 'pct',   'mode': 'meta', 'hk': 'conv',      'ref': meta_conv_pago,     'inv': False},
        {'lbl': 'Retorno Bruto', 'get': lambda s: (s.get('fat') or 0) - (s.get('inv') or 0), 'fmt': 'money', 'mode': 'sign'},
        {'lbl': 'ROAS',          'get': lambda s: s.get('roas'),  'fmt': 'x',     'mode': 'meta', 'hk': 'roas',      'ref': (roas_meta or 1.0), 'inv': False},
    ]

    # Connect rate (pageviews ÷ clicks) só entra se o dump tiver pageviews.
    if M.get('pageviews'):
        _garg_cols.insert(4, {'lbl': 'Connect', 'get': lambda s: s.get('connect'), 'fmt': 'pct',
                              'mode': 'meta', 'hk': 'connect', 'ref': (_fb.get('connect') or None), 'inv': False})

    def _fmtv(fmt, v):
        if v is None:
            return '—'
        if fmt == 'money':
            return money(v)
        if fmt == 'x':
            return xf(v)
        if fmt == 'int':
            return intf(v)
        if fmt == 'pct2':
            return f'{v:.2f}%'
        return pctf(v)

    def _garg_rows(segs, namekey, histsegs=None):
        # Cada célula carrega a comparação vs META (cls/title) e vs HISTÓRICO do mesmo
        # segmento (clsHist/titleHist) — o renderer troca conforme o toggle da plataforma.
        # Dimensões sem histórico (campanha/público) → clsHist = cls (toggle não muda nada).
        histsegs = histsegs or {}
        out = []
        for s in segs:
            h = histsegs.get(s.get(namekey)) or {}
            full = _dfull(s.get(namekey))   # nome completo: rótulo (quebra em linhas) + identidade
            nm = full
            cells, mirror, wi_m, wm_m, wi_h, wm_h = [], [], None, 0.0, None, 0.0
            for i, col in enumerate(_garg_cols):
                v = col['get'](s)
                val = _fmtv(col['fmt'], v)
                cls = clsH = 'hmd-neu'
                ttl = ttlH = f"{col['lbl']}: {val}"
                no_hist = True   # célula sem histórico próprio → clsHist espelha o cls final
                if col['mode'] == 'meta':
                    ref, inv = col.get('ref'), col.get('inv', False)
                    d, tone = _dev(v, ref, inv) if ref else (None, 'neutral')
                    cls = _hmcls(d, tone)
                    if ref:
                        ttl += f" · meta {_fmtv(col['fmt'], ref)}" + (f" ({d:+.0f}%)" if d is not None else '')
                    if tone in ('warn', 'neg') and d is not None and abs(d) > wm_m:
                        wm_m, wi_m = abs(d), i
                    hv = h.get(col.get('hk'))
                    if hv:
                        no_hist = False
                        dh, toneh = _dev(v, hv, inv)
                        clsH = _hmcls(dh, toneh)
                        ttlH = f"{col['lbl']}: {val} · hist {_fmtv(col['fmt'], hv)}" + (f" ({dh:+.0f}%)" if dh is not None else '')
                        if toneh in ('warn', 'neg') and dh is not None and abs(dh) > wm_h:
                            wm_h, wi_h = abs(dh), i
                elif col['mode'] == 'sign':
                    cls = clsH = 'hmd-pos1' if (v or 0) > 0 else ('hmd-neg1' if (v or 0) < 0 else 'hmd-neu')
                    ttl = ttlH = f"{col['lbl']}: {val} (faturamento − investimento)"
                mirror.append(no_hist)
                cells.append({'seg': full, 'segLabel': nm, 'segFull': full, 'etapa': col['lbl'], 'val': val,
                              'cls': cls, 'title': ttl, 'clsHist': clsH, 'titleHist': ttlH})
            if wi_m is not None:
                cells[wi_m]['cls'] += ' hm-worst'; cells[wi_m]['title'] += ' · maior furo'
            if wi_h is not None:
                cells[wi_h]['clsHist'] += ' hm-worst'; cells[wi_h]['titleHist'] += ' · maior furo'
            for j, c in enumerate(cells):   # células sem hist próprio espelham o cls/title finais
                if mirror[j]:
                    c['clsHist'], c['titleHist'] = c['cls'], c['title']
            out.extend(cells)
        return out

    _garg_keys = {'rowKey': 'seg', 'rowLabelKey': 'segLabel', 'rowTitleKey': 'segFull',
                  'colKey': 'etapa', 'valKey': 'val', 'clsKey': 'cls',
                  'titleKey': 'title', 'clsHistKey': 'clsHist', 'titleHistKey': 'titleHist'}
    # histórico por segmento só nos eixos estáveis entre lançamentos (canal e temperatura).
    _hist_by_dim = {'temp': M.get('hist_temp_seg') or {}, 'canal': M.get('hist_canal_seg') or {}}
    # Campanha ordenada por INVESTIMENTO (onde a verba foi), não por ROAS — senão as
    # campanhas grandes (ROAS mediano) sumiam e a aba contradizia temp/canal. Rótulo corta
    # em 30 chars; nome completo no tooltip da linha (rowTitleKey).
    _camp_src = sorted([c for c in M['camp_roas'] if (c.get('inv') or 0) > 0],
                       key=lambda c: -(c.get('inv') or 0))[:8]
    _garg_tabs = []
    for _lbl, _ds, _src, _nk in [('Canal', 'deb_garg_canal', M.get('canal_pago') or [], 'canal'),
                                 ('Temperatura', 'deb_garg_temp', M['temp'], 'temp'),
                                 ('Campanha', 'deb_garg_camp', _camp_src, 'campanha'),
                                 ('Público', 'deb_garg_pub', M.get('publico') or [], 'publico'),
                                 ('Criativo', 'deb_garg_cri', M.get('criativo_pago') or [], 'criativo')]:
        _src = [s for s in _src if (s.get('inv') or 0) > 0]   # sem verba = fora desta página
        if not _src:
            continue
        add_table(_ds, ['seg', 'etapa'], _garg_rows(_src, _nk, _hist_by_dim.get(_nk)))
        _garg_tabs.append({'label': _lbl, 'sub': 'etapa do funil vs meta (ou histórico) · verde acima, vermelho abaixo',
                           'bind': {'dataset': _ds}, **_garg_keys})
    if _garg_tabs:
        eb(tra, tg, 'tra-eb-garg', 'GARGALOS NO FUNIL', 'onde cada segmento perde — troque a dimensão',
           info=('Cor das etapas de funil (CPL · Taxa Resp · Qualif · CPMQL · Conversão · ROAS): '
                 'desvio vs a meta da campanha — verde = acima/melhor, vermelho = abaixo/pior, '
                 'neutro = perto da meta (±10%). Tom mais forte = desvio maior. '
                 'O anel marca a pior etapa de cada linha (o maior furo). '
                 'Retorno Bruto (faturamento − investimento): verde = lucro, vermelho = prejuízo. '
                 'Investimento e Leads são contexto de volume — sem cor.'))
        tra.append({'id': 'tra-garg', 'type': 'heatmap-toggle', 'title': 'Gargalos no Funil (pago)', 'tabs': _garg_tabs})
        tg.add('tra-garg', 'heatmap-toggle', 12, 6)

    # ── COMPARATIVO POR SEGMENTO — bullet-groups com toggle de DIMENSÃO + métrica ──
    # acima/próximo/abaixo da base (meta global ou histórico do mesmo segmento). Custos
    # (CPL/CPMQL) invertem: acima da base é PIOR. % vs base aparece dentro da barra.
    # Histórico por segmento só em canal/temp (eixos estáveis); público/criativo só vs meta.
    def _bm(value, vlabel, mbase, hbase, fmt):
        bases = {}
        if mbase:
            bases['meta'] = {'v': mbase, 'label': fmt(mbase)}
        if hbase:
            bases['hist'] = {'v': hbase, 'label': fmt(hbase)}
        return {'value': value, 'vlabel': vlabel, 'bases': bases} if bases else None

    def _bull_chs(segs, namekey, hseg):
        hseg = hseg or {}
        chs = []
        for s in segs:
            h = hseg.get(s.get(namekey)) or {}
            full = _dfull(s.get(namekey))
            retv = (s.get('fat') or 0) - (s.get('inv') or 0)
            hret = ((h.get('fat') or 0) - (h.get('inv') or 0)) if h else None
            chs.append({'name': full[:30], 'nameFull': full, 'metrics': {
                'roas':   _bm(s.get('roas'), xf(s.get('roas')), (roas_meta or None), h.get('roas'), xf),
                'conv':   _bm(s.get('conv'), pctf(s.get('conv')), (meta_conv_pago or None), h.get('conv'), pctf),
                'qual':   _bm(s.get('qual'), pctf(s.get('qual')), (G.get('qual') or None), h.get('qual'), pctf),
                'cpl':    _bm(s.get('cpl'), money(s.get('cpl')), (G.get('cpl') or None), h.get('cpl'), money),
                'cpmql':  _bm(s.get('cpmql'), money(s.get('cpmql')), (G.get('cpmql') or None), h.get('cpmql'), money),
                'retorno': _bm(retv, money(retv), None, hret, money)}})
        return chs

    _bull_src = [('canal', 'Canal', M.get('canal_pago') or [], M.get('hist_canal_seg')),
                 ('temp', 'Temperatura', M['temp'], M.get('hist_temp_seg')),
                 ('publico', 'Público', M.get('publico') or [], None),
                 ('criativo', 'Criativo', M.get('criativo_pago') or [], None)]
    _bdims, _bdimToggle = {}, []
    for _k, _l, _segs, _hs in _bull_src:
        _segs = [s for s in _segs if (s.get('inv') or 0) > 0]
        if not _segs:
            continue
        _bdims[_k] = _bull_chs(_segs, _k, _hs)
        _bdimToggle.append({'key': _k, 'label': _l})
    if _bdims:
        eb(tra, tg, 'tra-eb-tcmp', 'COMPARATIVO POR SEGMENTO', 'realizado vs base (meta ou histórico) — alterne dimensão e métrica · % vs base na barra')
        tra.append({'id': 'tra-tcmp', 'type': 'bullet-groups', 'title': 'Comparativo por segmento',
                    'dimToggle': _bdimToggle, 'dims': _bdims,
                    'toggle': [{'key': 'roas', 'label': 'ROAS'}, {'key': 'conv', 'label': 'Conversão'},
                               {'key': 'qual', 'label': 'Qualif.'}, {'key': 'cpl', 'label': 'CPL', 'invert': True},
                               {'key': 'cpmql', 'label': 'CPMQL', 'invert': True}, {'key': 'retorno', 'label': 'Retorno Bruto'}],
                    'groups': [{'key': 'acima', 'label': '↑ Acima', 'tone': 'pos'},
                               {'key': 'prox', 'label': '≈ Próximo (±5%)', 'tone': 'warn'},
                               {'key': 'abaixo', 'label': '↓ Abaixo', 'tone': 'neg'}]})
        _bmax = max((len(v) for v in _bdims.values()), default=4)
        tg.add('tra-tcmp', 'bullet-groups', 12, max(5, 3 + (_bmax + 1) // 2 + 1))
    sections['s03'] = {'id': 's03', 'header': {'badge': 'Tráfego Pago', 'title': 'Tráfego Pago',
                       'sub': 'Indicadores de mídia (só captação), por temperatura e por campanha.'}, 'widgets': tra}
    layouts['s03'] = tg.items

    # ════ s04 — Orgânico ════════════════════════════════════════════════════
    org_chan = [c for c in M['chan'] if c['tipo'] == 'organico']
    by_canal = G.get('by_canal') or {}
    mvc = M['goals'].get('meta_vendas_canal') or {}
    def _org_meta(c, key):  # meta de leads/vendas do canal orgânico (0 se não houver)
        bc = by_canal.get(c['canal']) or {}
        return (mvc.get(c['canal']) if key == 'meta_vendas' else None) or bc.get(key) or 0
    meta_leads_org = sum(_org_meta(c, 'meta_leads') for c in org_chan)
    meta_vendas_org = sum(_org_meta(c, 'meta_vendas') for c in org_chan)
    o, og = [], Grid()
    # 1ª dobra macro (Panorama/Tráfego): 2 bandas de atingimento MAIORES (w=4) à esquerda
    # (Leads, Vendas vs meta) + grade de feature-cards (w=2) à direita — Vendas e Faturamento
    # em ROXO lado a lado, e os % de leads/vendas como card.
    eb(o, og, 'org-eb-res', 'INDICADORES DE RESULTADO', 'atingimento de metas + resultado dos canais orgânicos')

    def _oband(wid, label, real, meta, x, y):
        if real is None or not meta:
            return False
        at = real / meta * 100
        o.append({'id': wid, 'type': 'kpi-card', 'tier': 'feature', 'band': True,
                  'label': label, 'value': f'{intf(real)} / {intf(meta)}',
                  'sub': 'realizado vs meta da campanha', 'delta': f'{at:.0f}%', 'deltaTone': at_tone(at)})
        og.at(wid, 'kpi-card', x, y, 4, 2)
        return True

    _hfo = (M.get('hist_funnel') or {}).get('org') or {}
    _hfat_org = sum(((chist.get(c['canal']) or {}).get('fat') or 0) for c in org_chan) or None
    hist_conv_org = (_hfo['vendas'] / _hfo['leads'] * 100) if (_hfo.get('leads') and _hfo.get('vendas')) else None
    hist_qual_org = (_hfo['mqls'] / _hfo['resps'] * 100) if (_hfo.get('resps') and _hfo.get('mqls')) else None
    _tro = (M['resps_org'] / M['leads_org'] * 100) if M['leads_org'] else 0.0
    hist_tr_org = (_hfo['resps'] / _hfo['leads'] * 100) if (_hfo.get('leads') and _hfo.get('resps')) else None
    ticket_org = (M['fat_org'] / M['vendas_org']) if M['vendas_org'] else None
    _rso = lambda v: f"R$ {intf(round(v))}" if v else '—'
    # comparativos das participações (share planejado/histórico) e do ticket (planejado/histórico).
    _tmv = sum((G.get('meta_vendas_canal') or {}).values()) or G.get('vendas')
    _sh = lambda a, b: ((a / b * 100) if b else None)
    _shf = lambda v: (f"{v:.0f}%" if v is not None else None)
    shv_r, shv_m, shv_h = _sh(M['vendas_org'], M['vendas_total']), _sh(meta_vendas_org, _tmv), _sh(_hfo.get('vendas'), H.get('vendas'))
    shl_r, shl_m, shl_h = _sh(M['leads_org'], M['leads_total']), _sh(meta_leads_org, G.get('leads')), _sh(_hfo.get('leads'), H.get('leads'))
    meta_tkt = (G.get('fat') / _tmv) if (G.get('fat') and _tmv) else None
    hist_tkt_org = (_hfat_org / _hfo['vendas']) if (_hfat_org and _hfo.get('vendas')) else None

    # esquerda (w=4): bandas de atingimento Leads e Vendas (fallback p/ card de volume).
    if not _oband('org-at-leads', 'Atingimento · Leads', M['leads_org'], meta_leads_org or None, 0, 1):
        km(o, og, 'org-at-leads', 'Leads Orgânicos', intf(M['leads_org']), f"{pct_of(M['leads_org'], M['leads_total'])} do total",
           'users', '#185FA5', real=M['leads_org'], hist=_hfo.get('leads'), w=4, x=0, y=1, hist_fmt=(intf(_hfo['leads']) if _hfo.get('leads') else None))
    if not _oband('org-at-vendas', 'Atingimento · Vendas', M['vendas_org'], meta_vendas_org or None, 0, 3):
        km(o, og, 'org-at-vendas', 'Vendas Orgânicas', intf(M['vendas_org']), f"{pct_of(M['vendas_org'], M['vendas_total'])} do total",
           'shopping-cart', '#534AB7', real=M['vendas_org'], hist=_hfo.get('vendas'), w=4, x=0, y=3, hist_fmt=(intf(_hfo['vendas']) if _hfo.get('vendas') else None))
    # direita — topo (y=1): Vendas (roxo) · Faturamento (roxo) · % das Vendas · % dos Leads
    km(o, og, 'org-vendas', 'Vendas Orgânicas', intf(M['vendas_org']), '', 'shopping-cart', '#534AB7', w=2, x=4, y=1,
       real=M['vendas_org'], meta=meta_vendas_org or None, hist=_hfo.get('vendas'),
       meta_fmt=(intf(meta_vendas_org) if meta_vendas_org else None), hist_fmt=(intf(_hfo['vendas']) if _hfo.get('vendas') else None))
    o[-1]['emph'] = True
    km(o, og, 'org-fat', 'Faturamento Orgânico', money(M['fat_org']), '', 'coin', '#3B6D11', w=2, x=6, y=1,
       real=M['fat_org'], hist=_hfat_org, hist_fmt=(money(_hfat_org) if _hfat_org else None))
    o[-1]['emph'] = True
    o[-1]['info'] = 'Faturamento das vendas atribuídas a canais orgânicos.'
    km(o, og, 'org-shv', '% das Vendas', pct_of(M['vendas_org'], M['vendas_total']), f"{intf(M['vendas_org'])} de {intf(M['vendas_total'])}", 'shopping-cart', '#534AB7', w=2, x=8, y=1,
       real=shv_r, meta=shv_m, hist=shv_h, meta_fmt=_shf(shv_m), hist_fmt=_shf(shv_h))
    o[-1]['info'] = 'Vendas orgânicas ÷ vendas totais. Meta = participação planejada; Hist = lançamento anterior.'
    km(o, og, 'org-shl', '% dos Leads', pct_of(M['leads_org'], M['leads_total']), f"{intf(M['leads_org'])} de {intf(M['leads_total'])}", 'users', '#185FA5', w=2, x=10, y=1,
       real=shl_r, meta=shl_m, hist=shl_h, meta_fmt=_shf(shl_m), hist_fmt=_shf(shl_h))
    o[-1]['info'] = 'Leads orgânicos ÷ leads totais. Meta = participação planejada; Hist = lançamento anterior.'
    # direita — baixo (y=3): Conversão · Taxa de Resposta · Qualificação · Ticket
    km(o, og, 'org-conv', 'Conversão Orgânica', pctf(M['conv_org']), '', 'circle-check', '#185FA5', w=2, x=4, y=3,
       real=M['conv_org'], hist=hist_conv_org, hist_fmt=(pctf(hist_conv_org) if hist_conv_org else None))
    o[-1]['info'] = f"Vendas ÷ leads (orgânico) · {_pp(M['conv_org'] - M['conv_pago'])} vs pago."
    km(o, og, 'org-tr', 'Taxa de Resposta', pctf(_tro), '', 'message', '#185FA5', w=2, x=6, y=3,
       real=_tro, meta=G.get('taxa_resp'), hist=hist_tr_org,
       meta_fmt=(pctf(G.get('taxa_resp')) if G.get('taxa_resp') else None), hist_fmt=(pctf(hist_tr_org) if hist_tr_org else None))
    o[-1]['info'] = 'Respostas ÷ leads (orgânico).'
    km(o, og, 'org-qual', 'Qualificação', pctf(M['qual_org']), '', 'star', '#854F0B', w=2, x=8, y=3,
       real=M['qual_org'], meta=G.get('qual'), hist=hist_qual_org,
       meta_fmt=(pctf(G.get('qual')) if G.get('qual') else None), hist_fmt=(pctf(hist_qual_org) if hist_qual_org else None))
    o[-1]['info'] = 'MQLs ÷ respostas (orgânico).'
    km(o, og, 'org-tkt', 'Ticket Médio', _rso(ticket_org), '', 'shopping-cart', '#534AB7', w=2, x=10, y=3,
       real=ticket_org, meta=meta_tkt, hist=hist_tkt_org, meta_fmt=_rso(meta_tkt), hist_fmt=_rso(hist_tkt_org))
    o[-1]['info'] = 'Faturamento orgânico ÷ vendas orgânicas. Meta = ticket planejado da campanha; Hist = orgânico anterior.'
    og.cursor_to(5)
    # Canais orgânicos vs base — bullet-groups (mesmo estilo da página Canal): buckets
    # acima/próximo/abaixo, toggle de métrica (leads/vendas/conversão) × toggle de plataforma.
    def _om(value, vlabel, mbase, mfmt, hbase):
        bases = {}
        if mbase:
            bases['meta'] = {'v': mbase, 'label': mfmt(mbase)}
        if hbase:
            bases['hist'] = {'v': hbase, 'label': mfmt(hbase)}
        return {'value': value, 'vlabel': vlabel, 'bases': bases} if bases else None

    blt_org = []
    for c in org_chan:
        ml, mv = _org_meta(c, 'meta_leads'), _org_meta(c, 'meta_vendas')
        h = chist.get(c['canal']) or {}
        if not (ml or mv or h.get('leads')):
            continue
        meta_conv = (mv / ml * 100) if (mv and ml) else None
        hconv = h.get('conv') if (h.get('leads') and h.get('vendas')) else None
        blt_org.append({'name': c['canal'], 'metrics': {
            'leads': _om(c['leads'], intf(c['leads']), ml or None, intf, h.get('leads')),
            'vendas': _om(c['vendas'], intf(c['vendas']), mv or None, intf, h.get('vendas')),
            'conv': _om(c['conv'], pctf(c['conv']), meta_conv, pctf, hconv)}})
    if blt_org:
        eb(o, og, 'org-eb-vs', 'CANAIS ORGÂNICOS vs META', 'realizado vs a base (meta ou histórico) por canal — alterne a métrica')
        o.append({'id': 'org-vs-blt', 'type': 'bullet-groups', 'title': 'Canais Orgânicos vs Meta',
                  'toggle': [{'key': 'vendas', 'label': 'Vendas'}, {'key': 'leads', 'label': 'Leads'}, {'key': 'conv', 'label': 'Conversão'}],
                  'groups': [{'key': 'acima', 'label': '↑ Acima', 'tone': 'pos'},
                             {'key': 'prox', 'label': '≈ Próximo (±5%)', 'tone': 'warn'},
                             {'key': 'abaixo', 'label': '↓ Abaixo', 'tone': 'neg'}],
                  'channels': blt_org})

        def _maxb_org(metric):
            g = {'acima': 0, 'prox': 0, 'abaixo': 0}
            for ch in blt_org:
                e = ch['metrics'].get(metric)
                b = e and e['bases'].get('meta')
                if not b:
                    continue
                dv = (e['value'] - b['v']) / b['v'] * 100
                g['acima' if dv > 5 else 'prox' if dv >= -5 else 'abaixo'] += 1
            return max(g.values())
        _mro = max(_maxb_org('leads'), _maxb_org('vendas'), _maxb_org('conv'))
        og.add('org-vs-blt', 'bullet-groups', 12, max(4, 2 + (_mro + 1) // 2 + 1))
    # Métricas no tempo (combo barras+linha, seletores) — mesmo widget do Tráfego.
    eb(o, og, 'org-eb-evo', 'MÉTRICAS NO TEMPO', 'qualquer métrica × métrica orgânica no tempo (barras + linha)')
    _omjson = [{'id': k, 'label': l, 'fmt': f} for k, l, f in [
        ('leads', 'Leads', 'int'), ('vendas', 'Vendas', 'int'), ('fat', 'Faturamento', 'money'),
        ('conv', 'Conversão', 'pct'), ('qual', 'Qualificação', 'pct'), ('taxa_resp', 'Taxa de Resposta', 'pct'),
        ('ticket', 'Ticket Médio', 'money'), ('mqls', 'MQLs', 'int')]]
    o.append({'id': 'org-evo', 'type': 'evolution-picker', 'title': 'Métricas no tempo', 'height': 330,
              'metrics': _omjson, 'points': M.get('daily_org') or [], 'current': 'leads', 'current2': 'vendas', 'combo': True})
    og.add('org-evo', 'evolution-picker', 12, 6)
    # Resultado por canal orgânico no estilo "Gargalos no Funil" (heatmap-toggle), com
    # quebras: Canal (utm_source) e Conteúdo (utm_content). Sem custo no orgânico → colunas
    # de contexto (Leads/Vendas/Faturamento) + taxas vs meta (Taxa Resp/Qualif/Conversão).
    meta_conv_org = (meta_vendas_org / meta_leads_org * 100) if (meta_vendas_org and meta_leads_org) else None
    _ogcols = [
        {'lbl': 'Leads',       'k': 'leads',     'fmt': 'int',   'mode': 'none'},
        {'lbl': 'Taxa Resp',   'k': 'taxa_resp', 'fmt': 'pct',   'mode': 'meta', 'ref': G.get('taxa_resp'), 'inv': False},
        {'lbl': 'Qualif',      'k': 'qual',      'fmt': 'pct',   'mode': 'meta', 'ref': G.get('qual'),      'inv': False},
        {'lbl': 'Conversão',   'k': 'conv',      'fmt': 'pct',   'mode': 'meta', 'ref': meta_conv_org,      'inv': False},
        {'lbl': 'Vendas',      'k': 'vendas',    'fmt': 'int',   'mode': 'none'},
        {'lbl': 'Faturamento', 'k': 'fat',       'fmt': 'money', 'mode': 'none'},
    ]

    def _ofmt(fmt, v):
        if v is None:
            return '—'
        return money(v) if fmt == 'money' else (intf(v) if fmt == 'int' else pctf(v))

    def _ocls(d, tone):
        if d is None or tone in ('neutral', 'warn'):
            return 'hmd-neu'
        if tone == 'pos':
            return 'hmd-pos2' if abs(d) >= 15 else 'hmd-pos1'
        return 'hmd-neg2' if abs(d) > 25 else 'hmd-neg1'

    def _org_seg(keyfn, top=12):
        by = {}
        for r in (M.get('_rows') or []):
            if r.get('_tipo') != 'organico':
                continue
            k = keyfn(r)
            if not k:
                continue
            c = by.setdefault(k, {'k': k, 'leads': 0, 'vendas': 0, 'fat': 0.0, 'mqls': 0, 'resps': 0})
            c['leads'] += int(calc.fnum(r.get('leads'))); c['vendas'] += int(calc.fnum(r.get('vendas')))
            c['fat'] += calc.fnum(r.get('faturamento')); c['mqls'] += int(calc.fnum(r.get('leads_mqls'))); c['resps'] += int(calc.fnum(r.get('respostas')))
        out = []
        for c in by.values():
            if c['leads'] < 1:
                continue
            c['fat'] = round(c['fat'], 2)
            c['conv'] = (c['vendas'] / c['leads'] * 100) if c['leads'] else 0.0
            c['qual'] = (c['mqls'] / c['resps'] * 100) if c['resps'] else 0.0
            c['taxa_resp'] = (c['resps'] / c['leads'] * 100) if c['leads'] else 0.0
            out.append(c)
        return sorted(out, key=lambda x: -x['leads'])[:top]

    def _ogrows(segs):
        out = []
        for s in segs:
            nm = str(s['k'])[:30]
            cells, wi, wm = [], None, 0.0
            for i, col in enumerate(_ogcols):
                v = s.get(col['k'])
                cls, ttl = 'hmd-neu', f"{col['lbl']}: {_ofmt(col['fmt'], v)}"
                if col['mode'] == 'meta':
                    ref, inv = col.get('ref'), col.get('inv', False)
                    d, tone = _dev(v, ref, inv) if ref else (None, 'neutral')
                    cls = _ocls(d, tone)
                    if ref:
                        ttl += f" · meta {_ofmt(col['fmt'], ref)}" + (f" ({d:+.0f}%)" if d is not None else '')
                    if tone in ('warn', 'neg') and d is not None and abs(d) > wm:
                        wm, wi = abs(d), i
                cells.append({'seg': nm, 'segLabel': nm, 'segFull': str(s['k']), 'etapa': col['lbl'], 'val': _ofmt(col['fmt'], v), 'cls': cls, 'title': ttl})
            if wi is not None:
                cells[wi]['cls'] += ' hm-worst'; cells[wi]['title'] += ' · maior furo'
            out.extend(cells)
        return out

    def _oclean(raw):   # vazio / 'null' / 'nan' viram "Não trackeado" (agrega, não descarta)
        v = str(raw or '').strip()
        return 'Não trackeado' if (not v or v.lower() in ('null', 'nan', 'none')) else v

    def _ocamp(r):   # utm_campaign limpo (número malformado também = não trackeado)
        v = _oclean(r.get('utm_campaign'))
        return 'Não trackeado' if 'e+' in v.lower() else v

    _ogkeys = {'rowKey': 'seg', 'rowLabelKey': 'segLabel', 'rowTitleKey': 'segFull', 'colKey': 'etapa',
               'valKey': 'val', 'clsKey': 'cls', 'titleKey': 'title'}
    _ogtabs = []
    for _lbl, _ds, _segs in [('Canal', 'deb_org_canal', _org_seg(lambda r: calc.norm_source(r.get('utm_source')))),
                             ('Campanha', 'deb_org_camp', _org_seg(_ocamp)),
                             ('Público', 'deb_org_pub', _org_seg(lambda r: _oclean(r.get('utm_medium')))),
                             ('Conteúdo', 'deb_org_cont', _org_seg(calc.ad_name))]:
        if not _segs:
            continue
        add_table(_ds, ['seg', 'etapa'], _ogrows(_segs))
        _ogtabs.append({'label': _lbl, 'sub': 'etapa vs meta da campanha · verde acima, vermelho abaixo',
                        'bind': {'dataset': _ds}, **_ogkeys})
    if _ogtabs:
        eb(o, og, 'org-eb-garg', 'RESULTADO POR CANAL ORGÂNICO', 'cada etapa vs meta — verde acima, vermelho abaixo · troque a quebra',
           info=('Colunas de taxa (Taxa Resp · Qualif · Conversão) coloridas vs a meta da campanha — '
                 'verde acima, vermelho abaixo, neutro perto da meta (±10%); o anel marca o maior furo da linha. '
                 'Leads · Vendas · Faturamento são contexto de volume (sem cor). Sem CPL/ROAS porque o orgânico não tem mídia paga.'))
        o.append({'id': 'org-garg', 'type': 'heatmap-toggle', 'title': 'Resultado por Canal Orgânico', 'tabs': _ogtabs})
        og.add('org-garg', 'heatmap-toggle', 12, 6)
    sections['s04'] = {'id': 's04', 'header': {'badge': 'Orgânico', 'title': 'Orgânico',
                       'sub': 'Captação e conversão dos canais orgânicos.'}, 'widgets': o}
    layouts['s04'] = og.items

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
    # KPIs no MESMO padrão do Panorama: INDICADORES GLOBAIS (bandas de atingimento +
    # grade 2×3 de macros com ícone · meta/hist toggle · emph roxo · info) e INDICADORES
    # DE VOLUME (8 cards). Reaproveita os valores já calculados no s01 (mesma fonte).
    def op_band(wid, label, real, meta, at, tone, w=6, h=2, x=None, y=None):
        if real is None or not meta or at is None:
            return
        op.append({'id': wid, 'type': 'kpi-card', 'tier': 'feature', 'band': True,
                   'label': label, 'value': f'{intf(real)} / {intf(meta)}',
                   'sub': 'realizado vs meta da campanha', 'delta': f'{at:.0f}%', 'deltaTone': tone})
        if x is not None: opg.at(wid, 'kpi-card', x, y, w, h)
        else: opg.add(wid, 'kpi-card', w, h)

    eb(op, opg, 'op-eb-glob', 'INDICADORES GLOBAIS', 'atingimento de metas + resultado macro do lançamento')
    op_band('op-at-leads', 'Atingimento · Leads', M['leads_total'], G.get('leads'), M['at_leads'], at_tone(M['at_leads']), x=0, y=1)
    op_band('op-at-vendas', 'Atingimento · Vendas', M['vendas_total'], mv_meta, M['at_vendas'], at_tone(M['at_vendas']), x=0, y=3)
    km(op, opg, 'op-k-fat', 'Faturamento Bruto', money(M['fat']),
       f"Principal {money(M['fat_sale'])} · Downsell {money(M['fat_dsell'])}", 'coin', '#3B6D11',
       real=M['fat'], meta=G.get('fat'), hist=H.get('fat'), w=2, x=6, y=1, meta_fmt=money(G.get('fat')) if G.get('fat') else None,
       hist_fmt=(money(H.get('fat')) if H.get('fat') else None))
    km(op, opg, 'op-k-ref', 'Reembolsos', intf(M['refunds_n']),
       f"{money(M['refund_val'])} · {pct_of(M['refund_val'], M['fat'])} do fat.", 'arrow-back-up', '#A32D2D', w=2, x=8, y=1)
    km(op, opg, 'op-k-conv', 'Conversão Geral', pctf(M['conv_geral']),
       f"pago {pctf(M['conv_pago'])} · org {pctf(M['conv_org'])}", 'circle-check', '#3B6D11', w=2, x=10, y=1,
       real=M['conv_geral'], meta=G.get('conv'), meta_fmt=(pctf(G.get('conv')) if G.get('conv') else None))
    km(op, opg, 'op-k-ret', 'Retorno Bruto', money(M['retorno']), '', 'database', '#534AB7', w=2, x=6, y=3,
       real=M['retorno'], meta=retorno_meta, hist=retorno_h,
       meta_fmt=(money(retorno_meta) if retorno_meta is not None else None),
       hist_fmt=(money(retorno_h) if retorno_h is not None else None))
    op[-1]['emph'] = True
    op[-1]['info'] = 'Indicador calculado: faturamento total − investimento total. Lucro bruto da campanha, antes de impostos e demais custos.'
    km(op, opg, 'op-k-roi', 'ROI Global', f"{M['roi']:.0f}%", 'retorno líq. / R$1 investido', 'trending-up', '#185FA5', w=2, x=8, y=3,
       real=M['roi'], meta=roi_meta, hist=roi_h,
       meta_fmt=(f"{roi_meta:.0f}%" if roi_meta is not None else None),
       hist_fmt=(f"{roi_h:.0f}%" if roi_h is not None else None))
    op[-1]['emph'] = True
    op[-1]['info'] = 'Indicador calculado: (faturamento total − investimento total) ÷ investimento total — retorno LÍQUIDO por R$1 investido, já descontado o principal (equivale a fat÷invest − 1).'
    km(op, opg, 'op-k-roas', 'ROAS Captação', xf(M['roas']), 'retorno líq. / R$1 de mídia', 'bolt', '#EF9F27', w=2, x=10, y=3,
       real=M['roas'], meta=roas_meta, hist=roas_h, meta_fmt=(xf(roas_meta) if roas_meta is not None else None),
       hist_fmt=(xf(roas_h) if roas_h else None))
    op[-1]['emph'] = True
    op[-1]['info'] = 'Indicador calculado: (faturamento pago − investimento de captação) ÷ investimento de captação — retorno LÍQUIDO por R$1 de mídia, já descontado o investimento (equivale a fat÷invest − 1; 1× = dobrou o dinheiro).'
    opg.cursor_to(5)

    eb(op, opg, 'op-eb-vol', 'INDICADORES DE VOLUME', '8 métricas')
    ks(op, opg, 'op-v-inv', 'Investimento Total', money(M['invest_total']), f"captação {money(M['invest_cpt'])}", 'coin', '#534AB7', real=M['invest_total'], hist=H.get('invest'), invert=True, hist_fmt=(money(H.get('invest')) if H.get('invest') else None))
    ks(op, opg, 'op-v-leads', 'Leads Totais', intf(M['leads_total']), f"pago {pct_of(M['leads_pago'], M['leads_total'])} · org {pct_of(M['leads_org'], M['leads_total'])}", 'users', '#185FA5', real=M['leads_total'], meta=G.get('leads'), hist=H.get('leads'), meta_fmt=(intf(G.get('leads')) if G.get('leads') else None), hist_fmt=(intf(H.get('leads')) if H.get('leads') else None))
    ks(op, opg, 'op-v-cpl', 'CPL', money(M['cpl']), '', 'users', '#185FA5', real=M['cpl'], meta=G.get('cpl'), invert=True, hist=H.get('cpl'), meta_fmt=(money(G.get('cpl')) if G.get('cpl') else None), hist_fmt=(money(H.get('cpl')) if H.get('cpl') else None))
    op[-1]['info'] = 'Indicador calculado: investimento de captação ÷ leads de tráfego (mídia paga). Custo por lead.'
    ks(op, opg, 'op-v-recap', 'Leads Recapturados', intf(M['l_ant'] + M['l_cli']), f"antigos {intf(M['l_ant'])} · clientes {intf(M['l_cli'])}", 'refresh', '#854F0B')
    ks(op, opg, 'op-v-resp', 'Taxa de Resposta', pctf(M['taxa_resp']),
       f"{intf(M['resps_total'])} resp. / {intf(M['leads_total'])} leads", 'message', '#185FA5',
       real=M['taxa_resp'], meta=G.get('taxa_resp'), hist=H.get('taxa_resp'),
       meta_fmt=(pctf(G.get('taxa_resp')) if G.get('taxa_resp') else None),
       hist_fmt=(pctf(H.get('taxa_resp')) if H.get('taxa_resp') else None))
    ks(op, opg, 'op-v-qual', 'Qualificação', pctf(M['qual']), f"{intf(M['mqls_total'])} MQLs / {intf(M['resps_total'])} resp.", 'star', '#854F0B', real=M['qual'], meta=G.get('qual'), hist=H.get('qual'), meta_fmt=(pctf(G.get('qual')) if G.get('qual') else None), hist_fmt=(pctf(H.get('qual')) if H.get('qual') else None))
    ks(op, opg, 'op-v-cpmql', 'CPMQL', money(M['cpmql']), '', 'star', '#854F0B', real=M['cpmql'], meta=G.get('cpmql'), invert=True, hist=H.get('cpmql'), meta_fmt=(money(G.get('cpmql')) if G.get('cpmql') else None), hist_fmt=(money(H.get('cpmql')) if H.get('cpmql') else None))
    op[-1]['info'] = 'Indicador calculado: CPL ÷ taxa de qualificação paga. Custo por lead qualificado (MQL).'
    ks(op, opg, 'op-v-vendas', 'Vendas', intf(M['vendas_total']), f"pago {intf(M['vendas_pago'])} · org {intf(M['vendas_org'])}", 'shopping-cart', '#534AB7', real=M['vendas_total'], meta=mv_meta, hist=H.get('vendas'), meta_fmt=(intf(mv_meta) if mv_meta else None), hist_fmt=(intf(H.get('vendas')) if H.get('vendas') else None))
    # ── Perguntas Estratégicas — logo após os KPIs iniciais ──
    eb(op, opg, 'op-eb-strat', 'PERGUNTAS ESTRATÉGICAS', 'leitura rápida do lançamento')
    op.append({'id': 'op-strat', 'type': 'strat-grid', 'cols': _strat_questions(M, G, H)}); opg.add('op-strat', 'strat-grid', 12, 4)
    # ── Alavancas e Gargalos — abaixo das perguntas (linhas com marcador + ação) ──
    al, ga = calc_alavancas(M, G, H)

    def _ag_html(items, mark, mcls):
        if not items:
            return '—'
        rows = []
        for it in items:
            if ' — ' in it:
                fact, act = it.split(' — ', 1)
                tx = f"<span class='ag-fact'>{fact}</span><span class='ag-act'>{act}</span>"
            else:
                tx = f"<span class='ag-fact'>{it}</span>"
            rows.append(f"<span class='ag-item'><span class='ag-mk {mcls}'>{mark}</span><span class='ag-tx'>{tx}</span></span>")
        return f"<span class='ag-list'>{''.join(rows)}</span>"

    eb(op, opg, 'op-eb-ag', 'ALAVANCAS E GARGALOS', 'o que puxou e o que segurou o resultado')
    fb(op, opg, 'op-alav', '↑ Alavancas', 'g', 'O que puxou o resultado', _ag_html(al, '↑', 'ag-mk-g'), w=6, h=4)
    fb(op, opg, 'op-garg', '↓ Gargalos', 'r', 'O que segurou o resultado', _ag_html(ga, '↓', 'ag-mk-r'), w=6, h=4)
    # ── Pipeline de Conversão (Geral/Pago/Orgânico) — trazido de Canal e Conversão ──
    eb(op, opg, 'op-eb-pipe', 'PIPELINE DE CONVERSÃO', 'taxas do funil vs a base (meta ou histórico), por escopo')
    op.append(_funil('op-fun-ger', 'Geral', M['leads_total'], M['resps_total'], M['mqls_total'], M['vendas_total'],
                     _meta_conv(M['chan']), _meta_rate(M['chan'], 'resp_w'), _meta_rate(M['chan'], 'qual_w'), 'geral')); opg.add('op-fun-ger', 'funnel', 4, 5)
    op.append(_funil('op-fun-pago', 'Pago', M['leads_pago'], M['resps_pago'], M['mqls_pago'], M['vendas_pago'],
                     _meta_conv(pago_ch), _meta_rate(pago_ch, 'resp_w'), _meta_rate(pago_ch, 'qual_w'), 'pago')); opg.add('op-fun-pago', 'funnel', 4, 5)
    op.append(_funil('op-fun-org', 'Orgânico', M['leads_org'], M['resps_org'], M['mqls_org'], M['vendas_org'],
                     _meta_conv(org_ch), _meta_rate(org_ch, 'resp_w'), _meta_rate(org_ch, 'qual_w'), 'org')); opg.add('op-fun-org', 'funnel', 4, 5)
    # ── Funil de Captação (pago) + KPIs do funil ao lado (estilo Tráfego) ──
    eb(op, opg, 'op-eb-cpt', 'FUNIL DE CAPTAÇÃO (PAGO)', 'do investimento ao lead qualificado · taxas vs bench/meta')
    opg.newrow(); _cy = opg.y
    op.append({'id': 'op-funil-cpt', 'type': 'funnel', 'title': 'Funil de Captação (pago)',
               'sub': 'do investimento ao lead qualificado · taxas vs bench', 'baseLabel': 'bench', 'hideLoss': True,
               'steps': [{'label': l, 'value': v, **({'vlabel': vl} if vl else {})} for l, v, vl in _fv],
               'transitions': _ftr}); opg.at('op-funil-cpt', 'funnel', 0, _cy, 6, 8)
    _p2 = lambda x: (f'{x:.2f}%' if x is not None else None)   # CTR em 2 casas
    km(op, opg, 'op-cap-cpm', 'CPM', money(M['cpm']), '', 'database', '#534AB7', w=3, h=2, x=6, y=_cy,
       real=M['cpm'], meta=_cpmb, invert=True, glabel='Bench', meta_fmt=(money(_cpmb) if _cpmb else None))
    op[-1]['info'] = 'Investimento de captação × 1000 ÷ impressões. Bench derivado da meta de CPL × benchs de CTR e clicks→leads.'
    km(op, opg, 'op-cap-ctr', 'CTR', _p2(M['ctr']), '', 'trending-up', '#3B6D11', w=3, h=2, x=9, y=_cy,
       real=M['ctr'], meta=(_ctrb or None), glabel='Bench', meta_fmt=_p2(_ctrb or None))
    op[-1]['info'] = 'Clicks ÷ impressões.'
    km(op, opg, 'op-cap-cpc', 'CPC', money(M['cpc']), '', 'coin', '#185FA5', w=3, h=2, x=6, y=_cy + 2,
       real=M['cpc'], meta=_cpcb, invert=True, glabel='Bench', meta_fmt=(money(_cpcb) if _cpcb else None))
    op[-1]['info'] = 'Investimento de captação ÷ clicks. Bench = CPM-bench ÷ (10 × CTR-bench).'
    km(op, opg, 'op-cap-txpag', 'Taxa de Página', pctf(M['tx_pag']), '', 'target', '#3B6D11', w=3, h=2, x=9, y=_cy + 2,
       real=M['tx_pag'], meta=(_clb or None), glabel='Bench', meta_fmt=(pctf(_clb) if _clb else None))
    op[-1]['info'] = 'Leads de tráfego ÷ clicks. Bench = Connect × Conv. de Página.'
    km(op, opg, 'op-cap-cpl', 'CPL', money(M['cpl']), '', 'users', '#185FA5', w=3, h=2, x=6, y=_cy + 4,
       real=M['cpl'], meta=G.get('cpl'), invert=True, meta_fmt=(money(G.get('cpl')) if G.get('cpl') else None),
       hist=H.get('cpl'), hist_fmt=(money(H.get('cpl')) if H.get('cpl') else None))
    op[-1]['emph'] = True; op[-1]['info'] = 'Investimento de captação ÷ leads de tráfego. Custo por lead.'
    km(op, opg, 'op-cap-txresp', 'Taxa de Resposta', pctf(_trp), '', 'message', '#185FA5', w=3, h=2, x=9, y=_cy + 4,
       real=_trp, meta=G.get('taxa_resp'), meta_fmt=(pctf(G.get('taxa_resp')) if G.get('taxa_resp') else None),
       hist=H.get('taxa_resp'), hist_fmt=(pctf(H.get('taxa_resp')) if H.get('taxa_resp') else None))
    op[-1]['info'] = 'Respostas ÷ leads (mídia paga).'
    km(op, opg, 'op-cap-qual', 'Qualificação', pctf(M['qual_pago']), '', 'circle-check', '#534AB7', w=3, h=2, x=6, y=_cy + 6,
       real=M['qual_pago'], meta=G.get('qual'), meta_fmt=(pctf(G.get('qual')) if G.get('qual') else None),
       hist=H.get('qual'), hist_fmt=(pctf(H.get('qual')) if H.get('qual') else None))
    op[-1]['info'] = 'MQLs ÷ respostas (mídia paga).'
    km(op, opg, 'op-cap-cpmql', 'CPMQL', money(M['cpmql']), '', 'star', '#854F0B', w=3, h=2, x=9, y=_cy + 6,
       real=M['cpmql'], meta=G.get('cpmql'), invert=True, meta_fmt=(money(G.get('cpmql')) if G.get('cpmql') else None),
       hist=H.get('cpmql'), hist_fmt=(money(H.get('cpmql')) if H.get('cpmql') else None))
    op[-1]['emph'] = True; op[-1]['info'] = 'CPL ÷ taxa de qualificação paga. Custo por lead qualificado (MQL).'
    opg.cursor_to(_cy + 8)
    # ── Mapa de Canais — trazido de Canal e Conversão ──
    if len(quad_pts) >= 2:
        eb(op, opg, 'op-eb-quad', 'MAPA DE CANAIS', 'cada ponto é um canal — posição vs o planejado · cor = vendas, tamanho = leads')
        op.append({'id': 'op-quad', 'type': 'quadrant-scatter', 'title': 'Mapa de Canais',
                   'size': '% de leads', 'modes': modes, 'points': quad_pts}); opg.add('op-quad', 'quadrant-scatter', 12, 6)
    # ── Gargalos no Funil (escopo Pago/Orgânico + dimensão) — depois do Mapa de Canais ──
    _op_garg_scopes = []
    if _garg_tabs:
        _op_garg_scopes.append({'label': 'Pago', 'tabs': _garg_tabs})
    if _ogtabs:
        _op_garg_scopes.append({'label': 'Orgânico', 'tabs': _ogtabs})
    if _op_garg_scopes:
        eb(op, opg, 'op-eb-garg-hm', 'GARGALOS NO FUNIL', 'onde cada segmento perde — escopo (pago/orgânico) + dimensão')
        op.append({'id': 'op-garg-hm', 'type': 'heatmap-toggle', 'title': 'Gargalos no Funil', 'scopes': _op_garg_scopes})
        opg.add('op-garg-hm', 'heatmap-toggle', 12, 6)
    # ── Métricas no tempo (combo barras+linha) — por último, depois do Mapa/Gargalos ──
    eb(op, opg, 'op-eb-evo', 'MÉTRICAS NO TEMPO', 'qualquer métrica × métrica da campanha no tempo (barras + linha)')
    op.append({'id': 'op-evo', 'type': 'evolution-picker', 'title': 'Métricas no tempo', 'height': 330,
               'metrics': _pmjson, 'points': M.get('daily_all') or [], 'current': 'fat', 'current2': 'inv', 'combo': True})
    opg.add('op-evo', 'evolution-picker', 12, 6)
    sections['s07'] = {'id': 's07', 'header': {'badge': 'One Pager', 'title': 'One Pager',
                       'sub': 'Visão executiva de 1 tela.'}, 'widgets': op}
    layouts['s07'] = opg.items

    pages = [{'id': 'panorama', 'label': 'Panorama Geral', 'sections': [{'id': 's01', 'label': 'Panorama Geral'}]},
             {'id': 'canal', 'label': 'Canal e Conversão', 'sections': [{'id': 's02', 'label': 'Canal e Conversão'}]},
             {'id': 'trafego', 'label': 'Tráfego Pago', 'sections': [{'id': 's03', 'label': 'Tráfego Pago'}]},
             {'id': 'organico', 'label': 'Orgânico', 'sections': [{'id': 's04', 'label': 'Orgânico'}]},
             {'id': 'analise', 'label': 'Análise 360°', 'sections': [{'id': 's06', 'label': 'Análise 360°'}]},
             {'id': 'onepager', 'label': 'One Pager', 'sections': [{'id': 's07', 'label': 'One Pager'}]}]
    created = config.get('created_at') or datetime.date.today().isoformat()
    # Filtros do FAB (nível-relatório): valores distintos por dimensão, ordenados por leads.
    _rws = M.get('_rows') or []

    def _distinct(keyfn, paid_only=True, cap=60):
        seen = {}
        for r in _rws:
            if paid_only and r.get('_tipo') != 'pago':
                continue
            k = keyfn(r)
            if not k:
                continue
            seen[k] = seen.get(k, 0) + int(calc.fnum(r.get('leads')) or 0)
        return [k for k, _ in sorted(seen.items(), key=lambda kv: -kv[1])][:cap]

    _present = set(r.get('_tipo') for r in _rws)
    _flt = [
        {'key': 'tipo', 'label': 'Tráfego',
         'values': [{'id': t, 'label': lb} for t, lb in [('pago', 'Pago'), ('organico', 'Orgânico')] if t in _present]},
        {'key': 'canal', 'label': 'Canal',
         'values': [{'id': c, 'label': c} for c in _distinct(lambda r: calc.norm_source(r.get('utm_source')), paid_only=False)]},
        {'key': 'temp', 'label': 'Temperatura',
         'values': [{'id': t, 'label': _dfull(t)} for t in _distinct(lambda r: r.get('_temp'))]},
        {'key': 'campanha', 'label': 'Campanha',
         'values': [{'id': c, 'label': c} for c in _distinct(lambda r: r.get('field_campaign_name'))]},
        {'key': 'publico', 'label': 'Público',
         'values': [{'id': p, 'label': p} for p in _distinct(calc.adset_name)]},
        {'key': 'criativo', 'label': 'Criativo',
         'values': [{'id': c, 'label': c} for c in _distinct(calc.ad_name)]},
    ]
    _flt = [f for f in _flt if len(f['values']) > 1]   # dimensão com 1 valor não filtra nada
    data_json = {'meta': {'client': config['client'], 'client_name': config.get('client_name') or config['client'],
                          'campaign_label': config.get('campaign_label') or '',
                          'title': config['title'], 'type': 'dashboard',
                          'theme': 'light', 'created_at': created, 'filters': [],
                          'cover': {'eyebrow': f"{config.get('client_name') or config['client']} · Relatório", 'title': config['title']},
                          'controls': {'kind': 'debriefing-lancamento', 'compare': 'meta',
                                       'pages': [p['id'] for p in pages], 'filters': _flt},
                          'nav': 'sidebar'}, 'pages': pages}
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
        d = (real - meta) / meta * 100  # sinal bruto: + acima da meta, − abaixo
        if abs(d) < 1:
            cls = None
        else:
            good = (d <= 0) if invert else (d >= 0)  # custo: abaixo da meta é bom
            cls = 'c-g' if good else 'c-r'
        delta = {'value': f'{d:+.0f}%', 'cls': cls}
    else:
        delta = '—'
    return [label, cell_real, cell_meta, delta, f(hist)]


def mb_row(label, real, meta, hist, fmt, invert=False):
    """Linha do widget meta-bars. Colunas: indicador · realizado · atingimento (barra
    + diferença % para a meta ao lado) · Δ vs meta (pp para taxas / absoluto para o
    resto) · meta · histórico. O tom de avaliação (verde/vermelho) vem do _dev."""
    from common.fmt import money as _m, pctf as _p, intf as _i

    def f(v):
        if v is None:
            return None
        return _m(v) if fmt == 'money' else (_p(v) if fmt == 'pct' else _i(v))

    def absdiff(d):
        # diferença real − meta: pp para taxas, R$/contagem (com sinal) para o resto.
        if fmt == 'pct':
            return f'{d:+.1f} pp'
        s = '+' if d >= 0 else '-'
        a = abs(d)
        if fmt == 'money':
            return s + (_m(a) if a >= 1000 else 'R$ ' + f'{a:.2f}'.replace('.', ','))
        return s + _i(a)

    row = {'label': label, 'real': f(real), 'meta': f(meta), 'hist': f(hist)}
    if meta:
        pct = round(real / meta * 100, 1)
        row['pct'] = pct
        row['pctLabel'] = f'{pct - 100:+.0f}%'   # diferença % p/ a meta, com sinal (84% → -16%)
        _, tone = _dev(real, meta, invert)
        row['delta'] = {'value': absdiff(real - meta), 'tone': tone}
    return row


def _strat_questions(M, G, H):
    """3 colunas de perguntas estratégicas do One Pager (espelha a fonte)."""
    def chip(text, tone):
        return {'text': text, 'tone': tone}

    def dev(real, meta, invert=False):
        if not meta:
            return None
        d = (real - meta) / meta * 100
        return -d if invert else d

    total_meta_vendas = sum((G.get('meta_vendas_canal') or {}).values()) or G.get('vendas')
    leads_tot = M['leads_total']
    novos_pct = (M['l_novo'] / leads_tot * 100) if leads_tot else 0
    recapt_pct = ((M['l_ant'] + M['l_cli']) / leads_tot * 100) if leads_tot else 0
    vtot = M['vendas_total'] or 1
    org_share = M['vendas_org'] / vtot * 100

    # Resultado e Meta
    df = dev(M['fat'], G.get('fat')); dl = dev(leads_tot, G.get('leads'))
    meta_chip = (chip(f"Fat {df:+.0f}% · leads {dl:+.0f}%", 'pos' if (df or 0) >= 0 and (dl or 0) >= 0 else 'neg')
                 if df is not None or dl is not None else chip('sem meta', 'neutral'))
    dvh = dev(M['vendas_total'], H.get('vendas')); dfh = dev(M['fat'], H.get('fat'))
    hist_chip = (chip(f"Vendas {dvh:+.0f}% · fat {dfh:+.0f}%", 'pos' if (dvh or 0) >= 0 else 'neg')
                 if dvh is not None or dfh is not None else chip('sem hist.', 'neutral'))
    dih = dev(M['invest_cpt'], H.get('invest_cpt'))
    inv_chip = chip(f"invest {dih:+.0f}% vs hist", 'neutral') if dih is not None else chip('sem hist.', 'neutral')
    sust_tone = 'pos' if novos_pct >= 55 else ('neutral' if novos_pct >= 45 else 'neg')
    col1 = {'title': 'Resultado e Meta', 'items': [
        {'q': 'Meta atingida?', 'chip': meta_chip, 'val': money(M['fat'])},
        {'q': 'Superior ao histórico?', 'chip': hist_chip, 'val': ('—' if not H.get('vendas') else f"{intf(H.get('vendas'))} vd hist")},
        {'q': 'Invest proporcional?', 'chip': inv_chip, 'val': money(M['invest_total'])},
        {'q': 'Sustentável?', 'chip': chip(f"{recapt_pct:.0f}% recapt.", sust_tone), 'val': f"{novos_pct:.0f}% leads novos"}]}

    # Captação e Qualidade
    cap_chip = chip(f"{dl:+.0f}%", 'pos' if (dl or 0) >= 0 else 'neg') if dl is not None else chip('sem meta', 'neutral')
    na_tone = 'neutral' if recapt_pct >= 45 else 'pos'
    dq = dev(M['qual'], G.get('qual'))
    qual_chip = (chip(f"{M['qual'] - G['qual']:+.1f}pp", 'pos' if (dq or 0) >= 0 else 'neg')
                 if G.get('qual') else chip(f"{M['qual']:.0f}%", 'neutral'))
    conv_tone = 'pos' if M['conv_geral'] >= 4 else ('neutral' if M['conv_geral'] >= 2.4 else 'neg')
    col2 = {'title': 'Captação e Qualidade', 'items': [
        {'q': 'Meta captação?', 'chip': cap_chip, 'val': f"{intf(leads_tot)} vs {intf(G.get('leads') or 0)}"},
        {'q': 'Novos ou antigos?', 'chip': chip(f"{recapt_pct:.0f}% recapt.", na_tone), 'val': f"{novos_pct:.0f}% novos"},
        {'q': 'Qualidade na meta?', 'chip': qual_chip, 'val': f"{M['qual']:.1f}% qualif." + (f" (meta {G['qual']:.0f}%)" if G.get('qual') else '')},
        {'q': 'Conversão?', 'chip': chip(f"{pctf(M['conv_geral'])}", conv_tone), 'val': f"pago {pctf(M['conv_pago'])} · org {pctf(M['conv_org'])}"}]}

    # Pago vs Orgânico
    dom = 'Orgânico' if org_share >= 50 else 'Pago'
    dcpl = dev(M['cpl'], G.get('cpl'), invert=True)
    cpl_chip = (chip(f"{-dcpl:+.0f}% ({'melhor' if dcpl >= 0 else 'pior'})", 'pos' if dcpl >= 0 else 'neg')
                if dcpl is not None else chip(money(M['cpl']), 'neutral'))
    roas_tone = 'pos' if M['roas'] >= 1 else 'neg'
    # Tráfego ajudou ou prejudicou o retorno bruto? = faturamento pago − investimento de
    # captação (o que a mídia trouxe vs o que custou). Positivo = somou ao retorno; negativo = drenou.
    ret_pago = (M.get('fat_pago') or 0) - (M.get('invest_cpt') or 0)
    traf_chip = chip(f"{'+' if ret_pago >= 0 else '−'}{money(abs(ret_pago))} ({'ajudou' if ret_pago >= 0 else 'prejudicou'})",
                     'pos' if ret_pago >= 0 else 'neg')
    col3 = {'title': 'Pago vs Orgânico', 'items': [
        {'q': 'Quem dominou?', 'chip': chip(f"{dom} {org_share if dom == 'Orgânico' else 100 - org_share:.0f}%", 'pos' if dom == 'Orgânico' else 'neutral'),
         'val': f"{intf(M['vendas_org'])} vd org · conv {pctf(M['conv_org'])}"},
        {'q': 'CPL vs meta?', 'chip': cpl_chip, 'val': money(M['cpl'])},
        {'q': 'ROAS?', 'chip': chip(xf(M['roas']), roas_tone), 'val': "(fat pago − invest) ÷ invest · retorno líq."},
        {'q': 'Tráfego ajudou o retorno?', 'chip': traf_chip, 'val': f"fat pago {money(M.get('fat_pago') or 0)} − invest {money(M.get('invest_cpt') or 0)}"}]}
    return [col1, col2, col3]


def _strat_points(M):
    """Pontos diários para o evolution-picker do One Pager (respeita a janela de captação)."""
    pts = []
    for d in M['daily']:
        pts.append({'name': d['label'], 'vals': {
            'leads': d['l_all'], 'l_pago': d['l_pago'], 'l_org': d['l_org'],
            'vendas': d['v_all'], 'conv': d['c_all']}})
    return pts


def _st(label, value, sub=None, delta=None, tone=None):
    s = {'label': label, 'value': value}
    if sub:
        s['sub'] = sub
    if delta:
        s['delta'] = delta
    if tone:
        s['tone'] = tone
    return s


def _chart(ctype, dataset, x, y, series=None, where=None, **kw):
    bind = {'dataset': dataset, 'x': x, 'y': y}
    if series:
        bind['series'] = series
    if where:
        bind['where'] = where
    c = {'chartType': ctype, 'height': 200, 'bind': bind}
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
                          _st('ROAS Captação', xf(M['roas']), 'retorno líq. / R$1 mídia'),
                          _st('ROI Global', f"{M['roi']:.0f}%", 'retorno líq. / R$1 invest.')],
                'chart': _chart('bar', 'deb_q1', 'indicador', 'v', series='serie',
                                colors=['#AFA9EC', '#534AB7'], height=210)})
    # Q2 Receita e Retorno
    out.append({'q': 'Q2', 'qColor': 'p', 'title': 'Receita, Vendas e Retorno',
                'stats': [_st('Retorno', money(M['retorno']), 'fat − invest.'),
                          _st('Retorno líq. / R$1', f"R$ {M['roi'] / 100:.2f}", 'já descontado o investido'),
                          _st('Invest. captação', pct_of(M['invest_cpt'], M['invest_total']), 'do total'),
                          _st('Recaptação', recap_pct, 'sustentabilidade')],
                'chart': _chart('bar', 'deb_q2', 'indicador', 'v', valueFormat='money', distributed=True,
                                colors=['#3B6D11', '#534AB7', '#185FA5'], height=210)})
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
                          _st('Clientes', pct_of(M['l_cli'], M['leads_total']))],
                'chart': _chart('donut', 'deb_tipos', 'tipo', 'leads', height=210, donutTotal=True, totalLabel='leads')})
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
                          _st('Fat. pago', pct_of(M['fat_pago'], M['fat']), tone='purple')],
                'chart': _chart('donut', 'deb_split_vend', 'escopo', 'vendas', height=210,
                                colors=['#3B6D11', '#534AB7'], donutTotal=True, totalLabel='vendas')})
    # Q7 Captação Orgânica
    org = [c for c in M['chan'] if c['tipo'] == 'organico']
    if org:
        top = max(org, key=lambda c: c['leads']); ol = sum(c['leads'] for c in org)
        conc = (top['leads'] / ol * 100) if ol else 0
        out.append({'q': 'Q7', 'qColor': 'r' if conc > 50 else 'g', 'title': 'Captação Orgânica por Canal',
                    'verdict': {'label': ('⚠ Dependência crítica' if conc > 50 else '✓ Diversificada'),
                                'tone': 'neg' if conc > 50 else 'pos'},
                    'stats': [_st('Canal dominante', str(top['canal'])), _st('Concentração', f'{conc:.0f}%'),
                              _st('Leads orgânicos', intf(ol))],
                    'chart': _chart('bar-horizontal', 'deb_chan', 'canal', 'leads',
                                    where={'tipo': 'organico'}, distributed=True, height=220)})
    # Q8 Mídia Paga
    out.append({'q': 'Q8', 'qColor': 'a', 'title': 'Mídia Paga',
                'stats': [_st('CPL', money(M['cpl']), (f'meta {money(G["cpl"])}' if G.get('cpl') else None),
                              (cmp_pct(M['cpl'], G.get('cpl'), invert=True) if G.get('cpl') else None)),
                          _st('CPMQL', money(M['cpmql'])), _st('CPM', money(M['cpm'])),
                          _st('CTR', pctf(M['ctr'])), _st('Taxa de Página', pctf(M['tx_pag']))],
                'chart': _chart('bar', 'deb_q8', 'metrica', 'v', valueFormat='money', distributed=True,
                                colors=['#534AB7', '#185FA5', '#854F0B'], height=210)})
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
                              _st('Semana mais valiosa', f"S{bw['fpl_snum']}", f"{money(bw['fpl_val'])}/lead")],
                    'chart': _chart('line', 'deb_weekly', 'semana', 'conv', valueFormat='pct', pct=True,
                                    colors=['#534AB7'], height=200)})
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
    # Sinal bruto vs meta (+ acima, − abaixo). invert é mantido por compat mas não
    # inverte mais o sinal — a avaliação (cor) é responsabilidade de quem exibe.
    if not meta:
        return None
    d = (real - meta) / meta * 100
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
    preserve_dataset(out_dir, r['dataset'])   # tabelas q-* dos detalhamentos sobrevivem
    preserve_layout(out_dir, r['layout'])     # disposição dos det-* sobrevive
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
