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
from common.preserve import preserve, preserve_dataset


def _pp(v):
    return '—' if v is None else f'{v:+.1f} p.p.'


def _dev(real, meta, invert=False):
    """Δ% bruto vs meta (sinal = direção real: + acima, − abaixo). invert = custo
    (menor é melhor). Avaliação em 3 níveis: verde (na meta ou melhor) · âmbar (desvio
    pequeno, ≤10%) · vermelho (desvio grande) — evita 'tudo vermelho' em desvios baixos."""
    if not meta:
        return None, 'neutral'
    d = (real - meta) / meta * 100
    if abs(d) < 1:
        return d, 'neutral'
    good = (d <= 0) if invert else (d >= 0)  # custo: abaixo da meta é bom
    if good:
        return d, 'pos'
    return d, 'warn' if abs(d) <= 10 else 'neg'


def assemble(rows, config, content, opts=None):
    config = config or {}
    M = calc.build(rows, config)
    G, H = M['goals'], M['hist']
    dataset, sections, layouts = {}, {}, {}

    def add_table(name, dims, rows_):
        dataset[name] = {'dims': list(dims), 'filters': [], 'rows': rows_}

    def _gstatus(tone):
        return 'ok' if tone == 'pos' else ('bad' if tone == 'neg' else 'warn')

    def _goalcmp(real, meta, invert, hist, meta_fmt, hist_fmt):
        """Rodapé de meta toggleável Meta↔Hist (substitui o pill — a base já mostra o
        desvio). None quando não há meta formatada."""
        if real is None or not meta or not meta_fmt:
            return None
        d, tone = _dev(real, meta, invert)
        if d is None:
            return None
        mg = {'label': f'Meta {meta_fmt}', 'delta': f'{d:+.0f}%', 'status': _gstatus(tone)}
        dh, th = _dev(real, hist, invert) if hist else (None, 'neutral')
        if dh is not None and hist_fmt:
            hg = {'label': f'Hist {hist_fmt}', 'delta': f'{dh:+.0f}%', 'status': _gstatus(th)}
        else:
            hg = {'label': 'Hist —', 'delta': '', 'status': 'neutral'}
        return {'meta': mg, 'hist': hg}

    def _apply_goal(card, real, meta, invert, hist, meta_fmt, hist_fmt):
        gc = _goalcmp(real, meta, invert, hist, meta_fmt, hist_fmt)
        if gc:
            card['goalCmp'] = gc
        elif real is not None and hist and hist_fmt:
            # Sem meta (derivados): rodapé estático comparando vs histórico.
            dh, th = _dev(real, hist, invert)
            if dh is not None:
                card['goal'] = {'label': f'Hist {hist_fmt}', 'delta': f'{dh:+.0f}%', 'status': _gstatus(th)}

    def km(arr, pg, wid, label, value, sub, icon, color, real=None, meta=None, invert=False, hist=None, w=4, h=2, meta_fmt=None, hist_fmt=None, x=None, y=None):
        card = {'id': wid, 'type': 'kpi-card', 'tier': 'feature', 'label': label, 'value': value,
                'sub': sub, 'icon': icon, 'iconColor': color}
        _apply_goal(card, real, meta, invert, hist, meta_fmt, hist_fmt)
        arr.append(card)
        if x is not None: pg.at(wid, 'kpi-card', x, y, w, h)
        else: pg.add(wid, 'kpi-card', w, h)

    def ks(arr, pg, wid, label, value, sub, icon, color, w=3, h=2, real=None, meta=None, invert=False, hist=None, meta_fmt=None, hist_fmt=None):
        # mesmo padrão dos KPIs macro: card feature com rodapé "Meta X · ±% ✓" toggleável (sem ícone).
        card = {'id': wid, 'type': 'kpi-card', 'tier': 'feature', 'label': label, 'value': value, 'sub': sub}
        _apply_goal(card, real, meta, invert, hist, meta_fmt, hist_fmt)
        arr.append(card); pg.add(wid, 'kpi-card', w, h)

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
    # ROAS captação usa receita PAGA; a meta de receita (goals) é total → estima a paga
    # pela fração paga realizada e aplica (receita_paga − invest) / invest.
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
    km(pan, pg, 'pan-k-roi', 'ROI Global', f"{M['roi']:.0f}%", '', 'trending-up', '#185FA5', w=2, x=8, y=3,
       real=M['roi'], meta=roi_meta, hist=roi_h,
       meta_fmt=(f"{roi_meta:.0f}%" if roi_meta is not None else None),
       hist_fmt=(f"{roi_h:.0f}%" if roi_h is not None else None))
    pan[-1]['emph'] = True
    pan[-1]['info'] = 'Indicador calculado: (faturamento total − investimento total) ÷ investimento total. Retorno percentual sobre todo o investimento da campanha.'
    km(pan, pg, 'pan-k-roas', 'ROAS Captação', xf(M['roas']), '', 'bolt', '#EF9F27', w=2, x=10, y=3,
       real=M['roas'], meta=roas_meta, hist=roas_h, meta_fmt=(xf(roas_meta) if roas_meta is not None else None),
       hist_fmt=(xf(roas_h) if roas_h else None))
    pan[-1]['emph'] = True
    pan[-1]['info'] = 'Indicador calculado: (faturamento pago − investimento de captação) ÷ investimento de captação. Retorno sobre a mídia de captação.'
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
    esc_cards = []
    for lbl, tone, lp, lv, cv, nv, an, cl, mv in [
        ('Geral', 'purple', M['leads_total'], M['vendas_total'], M['conv_geral'], M['l_novo'], M['l_ant'], M['l_cli'], mvm),
        ('Pago', 'blue', M['leads_pago'], M['vendas_pago'], M['conv_pago'], M['l_novo_p'], M['l_ant_p'], M['l_cli_p'], _mv(pago_ch)),
        ('Orgânico', 'green', M['leads_org'], M['vendas_org'], M['conv_org'], M['l_novo_o'], M['l_ant_o'], M['l_cli_o'], _mv(org_ch))]:
        at = (lv / mv * 100) if mv else None
        chip = ({'text': f'{at:.0f}% da meta', 'tone': ('pos' if at >= 100 else 'warn' if at >= 80 else 'neg')}
                if at is not None else None)
        esc_cards.append({
            'label': lbl, 'tone': tone, 'value': intf(lv), 'unit': 'vendas', 'chip': chip,
            'sub': f'{intf(lp)} leads · {pctf(cv)} conv.',
            'minis': [
                {'label': 'Novos', 'tone': 'purple', 'value': intf(nv), 'pct': pct_of(nv, lp)},
                {'label': 'Antigos', 'tone': 'amber', 'value': intf(an), 'pct': pct_of(an, lp)},
                {'label': 'Clientes', 'tone': 'green', 'value': intf(cl), 'pct': pct_of(cl, lp)},
            ]})
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

    def _funil(wid, title, leads, resps, mqls, vendas, meta_conv, meta_resp, meta_qual):
        vals = [leads, resps, mqls, vendas]
        mig = lambda i: round(vals[i + 1] / vals[i] * 100, 1) if vals[i] else 0.0

        def step(i, bench):
            m = mig(i)
            tr = {'migrate': m, 'loss': round(100 - m, 1)}
            if bench:
                tr['bench'] = round(bench, 1)
                if m < bench:
                    tr['gap'] = round(bench - m, 1)
            return tr
        conv = round(vendas / leads * 100, 1) if leads else 0.0
        trans = [
            step(0, meta_resp),   # leads → respostas vs meta de taxa de resposta
            step(1, meta_qual),   # respostas → MQLs vs meta de qualificação
            # conversão lead→venda + comparação com a meta (sem "perda" de quem sai)
            {'migrate': conv,
             'bench': round(meta_conv, 1) if meta_conv else None,
             'gap': round(meta_conv - conv, 1) if (meta_conv and conv < meta_conv) else None},
        ]
        steps = [{'label': l, 'value': v} for l, v in zip(['Leads', 'Respostas', 'MQLs', 'Vendas'], vals)]
        return {'id': wid, 'type': 'funnel', 'title': title, 'steps': steps, 'transitions': trans}

    org_ch = [c for c in M['chan'] if c['tipo'] != 'pago']
    pago_ch = [c for c in M['chan'] if c['tipo'] == 'pago']
    eb(can, cg, 'can-eb-pipe', 'PIPELINE DE CONVERSÃO', 'taxas do funil vs meta do launch, por escopo')
    can.append(_funil('can-fun-ger', 'Geral', M['leads_total'], M['resps_total'], M['mqls_total'], M['vendas_total'],
                      _meta_conv(M['chan']), _meta_rate(M['chan'], 'resp_w'), _meta_rate(M['chan'], 'qual_w')))
    cg.add('can-fun-ger', 'funnel', 4, 5)
    can.append(_funil('can-fun-org', 'Orgânico', M['leads_org'], M['resps_org'], M['mqls_org'], M['vendas_org'],
                      _meta_conv(org_ch), _meta_rate(org_ch, 'resp_w'), _meta_rate(org_ch, 'qual_w')))
    cg.add('can-fun-org', 'funnel', 4, 5)
    can.append(_funil('can-fun-pago', 'Pago', M['leads_pago'], M['resps_pago'], M['mqls_pago'], M['vendas_pago'],
                      _meta_conv(pago_ch), _meta_rate(pago_ch, 'resp_w'), _meta_rate(pago_ch, 'qual_w')))
    cg.add('can-fun-pago', 'funnel', 4, 5)

    mvc = M['goals'].get('meta_vendas_canal') or {}
    byc = G.get('by_canal') or {}

    # canais vs meta — bullet-bars por desempenho, com toggle local vendas ↔ conversão.
    eb(can, cg, 'can-eb-vs', 'CANAIS vs META', 'realizado vs meta por canal — alterne a métrica')
    blt_ch = []
    for c in M['chan']:
        meta_v = mvc.get(c['canal']) or byc.get(c['canal'], {}).get('meta_vendas')
        ml = byc.get(c['canal'], {}).get('meta_leads')
        if not (meta_v or ml):
            continue
        meta_conv = (meta_v / ml * 100) if (meta_v and ml) else None
        blt_ch.append({'name': c['canal'], 'metrics': {
            'leads': ({'value': c['leads'], 'meta': ml, 'vlabel': intf(c['leads']), 'mlabel': intf(ml)} if ml else None),
            'vendas': ({'value': c['vendas'], 'meta': meta_v, 'vlabel': intf(c['vendas']), 'mlabel': intf(meta_v)} if meta_v else None),
            'conv': ({'value': c['conv'], 'meta': meta_conv, 'vlabel': pctf(c['conv']), 'mlabel': pctf(meta_conv)}
                     if meta_conv else None)}})
    if blt_ch:
        can.append({'id': 'can-vs-blt', 'type': 'bullet-groups', 'title': 'Canais vs Meta',
                    'toggle': [{'key': 'leads', 'label': 'Leads'}, {'key': 'vendas', 'label': 'Vendas'}, {'key': 'conv', 'label': 'Conversão'}],
                    'groups': [{'key': 'acima', 'label': '↑ Acima da meta', 'tone': 'pos'},
                               {'key': 'prox', 'label': '≈ Próximo (±5%)', 'tone': 'warn'},
                               {'key': 'abaixo', 'label': '↓ Abaixo da meta', 'tone': 'neg'}],
                    'channels': blt_ch})

        def _maxbucket(metric):
            g = {'acima': 0, 'prox': 0, 'abaixo': 0}
            for ch in blt_ch:
                e = ch['metrics'].get(metric)
                if not e or not e['meta']:
                    continue
                dv = (e['value'] - e['meta']) / e['meta'] * 100
                g['acima' if dv > 5 else 'prox' if dv >= -5 else 'abaixo'] += 1
            return max(g.values())
        _mr = max(_maxbucket('leads'), _maxbucket('vendas'), _maxbucket('conv'))
        cg.add('can-vs-blt', 'bullet-groups', 12, max(4, 2 + (_mr + 1) // 2 + 1))

    # Mapa 2×2: x = conversão vs meta, y = leads vs meta, cor = vendas vs meta.
    quad_pts = []
    leads_tot = M.get('leads_total') or 0
    for c in M['chan']:
        meta_v = mvc.get(c['canal']) or byc.get(c['canal'], {}).get('meta_vendas')
        ml = byc.get(c['canal'], {}).get('meta_leads')
        if not (meta_v and ml):
            continue
        dx, _tx = _dev(c['conv'], meta_v / ml * 100)
        dy, _ty = _dev(c['leads'], ml)
        dvend, tone = _dev(c['vendas'], meta_v)
        lshare = (c['leads'] / leads_tot * 100) if leads_tot else 0
        quad_pts.append({'name': c['canal'], 'x': round(dx, 1), 'y': round(dy, 1), 'tone': tone,
                         'size': round(lshare, 1),
                         'xlabel': f'conv {dx:+.0f}%', 'ylabel': f'leads {dy:+.0f}%',
                         'vlabel': f'vendas {dvend:+.0f}%', 'slabel': f'{lshare:.0f}% dos leads'})
    if len(quad_pts) >= 2:
        eb(can, cg, 'can-eb-quad', 'MAPA DE CANAIS', 'cada ponto é um canal — posição vs meta, cor = vendas, tamanho = leads')
        can.append({'id': 'can-quad', 'type': 'quadrant-scatter', 'title': 'Mapa de Canais',
                    'axes': {'x': 'Conversão vs meta', 'y': 'Leads vs meta', 'heat': 'Vendas vs meta', 'size': '% de leads'},
                    'quadrants': [{'pos': 'tr', 'label': 'Escala + eficiência'},
                                  {'pos': 'tl', 'label': 'Volume sem conversão'},
                                  {'pos': 'br', 'label': 'Eficiente, falta escala'},
                                  {'pos': 'bl', 'label': 'Abaixo em tudo'}],
                    'points': quad_pts})
        cg.add('can-quad', 'quadrant-scatter', 12, 5)

    # Resultado por canal — duas tabelas (Orgânico · Pago) no widget channel-table.
    ch_cols = [{'label': 'Canal'}, {'label': 'Leads'}, {'label': 'Δ Leads', 'align': 'center'},
               {'label': 'Vendas'}, {'label': 'Meta Vendas'}, {'label': 'Δ Vendas', 'align': 'center'},
               {'label': 'Conv.'}, {'label': 'Δ Conv.', 'align': 'center'}, {'label': 'Qualif.'}, {'label': 'Fat.'}]

    def _dpill(real, base):
        # delta % com a escala de avaliação (verde · âmbar · cinza · vermelho), via _dev.
        if not base:
            return {'value': '–', 'tone': 'muted', 'align': 'center'}
        d, tone = _dev(real, base)
        return {'value': f'{d:+.1f}%', 'pill': True, 'tone': tone, 'align': 'center'}

    def _ch_rows(chans):
        out = []
        for c in chans:
            meta = mvc.get(c['canal']) or byc.get(c['canal'], {}).get('meta_vendas')
            ml = byc.get(c['canal'], {}).get('meta_leads')
            mcell = {'value': intf(meta), 'tone': 'meta'} if meta else {'value': '–', 'tone': 'muted'}
            dlcell = _dpill(c['leads'], ml)
            dcell = _dpill(c['vendas'], meta)
            meta_conv = (meta / ml * 100) if (meta and ml) else None
            dccell = _dpill(c['conv'], meta_conv)
            out.append({'name': c['canal'], 'cells': [
                {'value': intf(c['leads'])}, dlcell, {'value': intf(c['vendas'])}, mcell, dcell,
                {'value': pctf(c['conv'])}, dccell, {'value': pctf(c['qual'])}, {'value': money(c['fat'])}]})
        return out

    org = sorted([c for c in M['chan'] if c['tipo'] != 'pago'], key=lambda c: -c['fat'])
    pago = sorted([c for c in M['chan'] if c['tipo'] == 'pago'], key=lambda c: -c['fat'])
    eb(can, cg, 'can-eb-tbl', 'RESULTADO POR CANAL', 'orgânico e pago, separados')
    if pago:
        can.append({'id': 'can-tbl-pago', 'type': 'channel-table', 'title': 'Pago', 'cols': ch_cols, 'rows': _ch_rows(pago)})
        cg.add('can-tbl-pago', 'channel-table', 12, max(3, len(pago) + 2))
    if org:
        can.append({'id': 'can-tbl-org', 'type': 'channel-table', 'title': 'Orgânico', 'cols': ch_cols, 'rows': _ch_rows(org[:14])})
        cg.add('can-tbl-org', 'channel-table', 12, max(3, min(len(org), 14) + 2))
    sections['s02'] = {'id': 's02', 'header': {'badge': 'Canal', 'title': 'Canal e Conversão',
                       'sub': 'Performance por canal e por escopo (pago × orgânico).'}, 'widgets': can}
    layouts['s02'] = cg.items

    # ════ s03 — Tráfego Pago ════════════════════════════════════════════════
    tra, tg = [], Grid()
    tra.append({'id': 'tra-rule', 'type': 'highlight', 'color': 'p', 'label': 'Regra do invest_cpt',
                'text': f"Investimento de mídia = só campanhas de captação ({money(M['invest_cpt'])}). "
                        f"Invest. de vendas ({money(M['invest_vnd'])}) fica fora de CPL/ROAS/CPMQL/CPM/CTR."}); tg.add('tra-rule', 'highlight', 12, 2)
    eb(tra, tg, 'tra-eb', 'INDICADORES DE MÍDIA', '9 métricas (só captação)')
    ks(tra, tg, 'tra-cpl', 'CPL', money(M['cpl']), f"meta {money(G.get('cpl'))}" if G.get('cpl') else 'invest. cpt / leads tráfego',
       'users', '#185FA5', real=M['cpl'], meta=G.get('cpl'), invert=True)
    ks(tra, tg, 'tra-cpmql', 'CPMQL', money(M['cpmql']), f"meta {money(G.get('cpmql'))}" if G.get('cpmql') else 'CPL / qualif. paga',
       'star', '#854F0B', real=M['cpmql'], meta=G.get('cpmql'), invert=True)
    ks(tra, tg, 'tra-qual', 'Qualificação', pctf(M['qual_pago']), f"meta {pctf(G.get('qual'))}" if G.get('qual') else 'MQLs / respostas (pago)',
       'circle-check', '#534AB7', real=M['qual_pago'], meta=G.get('qual'))
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
          ['Temperatura', 'Leads', 'Invest.', 'CPL', 'CPMQL', 'Fat.', 'ROAS', 'Vendas', 'Conv.', 'Qualif.'],
          [[t['temp'], intf(t['leads']), money(t['inv']), money(t['cpl']), money(t['cpmql']), money(t['fat']),
            {'value': xf(t['roas']), 'cls': 'c-g' if t['roas'] > 1 else 'c-r'}, intf(t['vendas']),
            pctf(t['conv']), pctf(t['qual'])] for t in M['temp']], h=4)
    table(tra, tg, 'tra-roas', 'Melhores Campanhas por ROAS',
          ['Campanha', 'Invest.', 'Fat.', 'ROAS', 'Leads', 'Vendas', 'CPL', 'CPMQL', 'Conv.'],
          [[c['campanha'][:48], money(c['inv']), money(c['fat']),
            {'value': xf(c['roas']), 'cls': 'c-g' if c['roas'] > 1 else 'c-r'}, intf(c['leads']),
            intf(c['vendas']), money(c['cpl']), money(c['cpmql']), pctf(c['conv'])] for c in M['camp_roas'][:12]], h=5)
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
    eb(o, og, 'org-eb', 'RESUMO ORGÂNICO')
    km(o, og, 'org-leads', 'Leads Orgânicos', intf(M['leads_org']),
       f"meta {intf(meta_leads_org)}" if meta_leads_org else f"{pct_of(M['leads_org'], M['leads_total'])} do total",
       'users', '#3B6D11', real=M['leads_org'], meta=meta_leads_org or None)
    km(o, og, 'org-vendas', 'Vendas Orgânicas', intf(M['vendas_org']),
       f"meta {intf(meta_vendas_org)}" if meta_vendas_org else f"{pct_of(M['vendas_org'], M['vendas_total'])} do total",
       'shopping-cart', '#534AB7', real=M['vendas_org'], meta=meta_vendas_org or None)
    km(o, og, 'org-conv', 'Conversão Orgânica', pctf(M['conv_org']), f"{_pp(M['conv_org'] - M['conv_pago'])} vs pago", 'circle-check', '#185FA5')
    # maiores desvios da meta de vendas (canais orgânicos com meta definida)
    desv = []
    for c in org_chan:
        meta = _org_meta(c, 'meta_vendas')
        if meta:
            desv.append((c, (c['vendas'] - meta) / meta * 100, meta))
    if desv:
        desv.sort(key=lambda x: -abs(x[1]))
        eb(o, og, 'org-eb-desv', 'MAIORES DESVIOS DA META', 'vendas realizadas vs meta por canal')
        for i, (c, dv, meta) in enumerate(desv[:6]):
            tone = 'g' if dv >= 0 else 'r'
            fb(o, og, f'org-desv-{i}', f"{c['canal']} · {dv:+.0f}%", tone,
               f"{intf(c['vendas'])} vendas", f"meta {intf(meta)}", w=4, h=2)
    eb(o, og, 'org-eb-d', 'DESTAQUES POR CONVERSÃO', '≥20 leads')
    dest = sorted([c for c in org_chan if c['leads'] >= 20], key=lambda c: -c['conv'])[:5]
    for i, c in enumerate(dest):
        fb(o, og, f'org-d-{i}', c['canal'], 'g', pctf(c['conv']), f"{intf(c['leads'])} leads · {intf(c['vendas'])} vendas", w=4, h=2)
    o.append({'id': 'org-daily', 'type': 'chart', 'chartType': 'bar', 'title': 'Leads orgânicos por dia', 'height': 260,
              'colors': ['#3B6D11'], 'bind': {'dataset': 'deb_daily', 'x': 'data', 'y': 'l_org'}}); og.add('org-daily', 'chart', 12, 4)
    has_meta = bool(meta_vendas_org)
    org_cols = ['Canal', 'Leads', 'Vendas', 'Meta Vd.', 'Δ Meta', 'Conv.', 'Qualif.', 'Faturamento'] if has_meta \
        else ['Canal', 'Leads', 'Vendas', 'Conv.', 'Qualif.', 'Faturamento']
    def org_row(c):
        base = [c['canal'], intf(c['leads']), intf(c['vendas'])]
        if has_meta:
            mv = _org_meta(c, 'meta_vendas')
            dv = (c['vendas'] - mv) / mv * 100 if mv else None
            base += [intf(mv) if mv else '—',
                     {'value': f'{dv:+.0f}%', 'cls': 'c-g' if (dv or 0) >= 0 else 'c-r'} if dv is not None else '—']
        return base + [pctf(c['conv']), pctf(c['qual']), money(c['fat'])]
    table(o, og, 'org-tbl', 'Resultado por Canal Orgânico', org_cols,
          [org_row(c) for c in org_chan[:12]], h=5)
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
          ['Sem.', 'Início', 'Fim', 'Leads', 'LP', 'LO', 'CPL Pago', 'CPMQL', 'Qualif.', 'Vendas', 'Conv.', 'Fat/Lead'],
          [[f"S{w['snum']}", w['ini'], w['fim'], intf(w['leads']), intf(w['leads_pago']), intf(w['leads_org']),
            money(w['cpl']), money(w['cpmql']), pctf(w['qual']), intf(w['vendas']),
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
    op.append({'id': 'op-evo', 'type': 'evolution-picker', 'title': 'Evolução diária', 'height': 280,
               'metrics': [{'id': 'leads', 'label': 'Leads (total)', 'fmt': 'int'},
                           {'id': 'l_pago', 'label': 'Leads pago', 'fmt': 'int'},
                           {'id': 'l_org', 'label': 'Leads orgânico', 'fmt': 'int'},
                           {'id': 'vendas', 'label': 'Vendas', 'fmt': 'int'},
                           {'id': 'conv', 'label': 'Conversão', 'fmt': 'pct'}],
               'points': _strat_points(M), 'current': 'leads'}); opg.add('op-evo', 'evolution-picker', 12, 5)
    eb(op, opg, 'op-eb-strat', 'PERGUNTAS ESTRATÉGICAS', 'leitura rápida do lançamento')
    op.append({'id': 'op-strat', 'type': 'strat-grid', 'cols': _strat_questions(M, G, H)}); opg.add('op-strat', 'strat-grid', 12, 4)
    al, ga = calc_alavancas(M, G, H)
    eb(op, opg, 'op-eb-ag', 'ALAVANCAS E GARGALOS', 'gerados dos dados')
    fb(op, opg, 'op-alav', '↑ Alavancas', 'g', 'O que puxou o resultado', '<br>'.join(f'• {x}' for x in al) or '—', w=6, h=4)
    fb(op, opg, 'op-garg', '↓ Gargalos', 'r', 'O que segurou o resultado', '<br>'.join(f'• {x}' for x in ga) or '—', w=6, h=4)
    sections['s07'] = {'id': 's07', 'header': {'badge': 'One Pager', 'title': 'One Pager',
                       'sub': 'Visão executiva de 1 tela.'}, 'widgets': op}
    layouts['s07'] = opg.items

    pages = [{'id': 'panorama', 'label': 'Panorama Geral', 'sections': [{'id': 's01', 'label': 'Panorama Geral'}]},
             {'id': 'canal', 'label': 'Canal e Conversão', 'sections': [{'id': 's02', 'label': 'Canal e Conversão'}]},
             {'id': 'trafego', 'label': 'Tráfego Pago', 'sections': [{'id': 's03', 'label': 'Tráfego Pago'}]},
             {'id': 'organico', 'label': 'Orgânico', 'sections': [{'id': 's04', 'label': 'Orgânico'}]},
             {'id': 'temporal', 'label': 'Temporal', 'sections': [{'id': 's05', 'label': 'Análise Temporal'}]},
             {'id': 'analise', 'label': 'Análise 360°', 'sections': [{'id': 's06', 'label': 'Análise 360°'}]},
             {'id': 'onepager', 'label': 'One Pager', 'sections': [{'id': 's07', 'label': 'One Pager'}]}]
    created = config.get('created_at') or datetime.date.today().isoformat()
    data_json = {'meta': {'client': config['client'], 'client_name': config.get('client_name') or config['client'],
                          'campaign_label': config.get('campaign_label') or '',
                          'title': config['title'], 'type': 'dashboard',
                          'theme': 'light', 'created_at': created, 'filters': [],
                          'cover': {'eyebrow': f"{config.get('client_name') or config['client']} · Relatório", 'title': config['title']},
                          'controls': {'kind': 'debriefing-lancamento', 'compare': 'meta',
                                       'pages': [p['id'] for p in pages]},
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
    col3 = {'title': 'Pago vs Orgânico', 'items': [
        {'q': 'Quem dominou?', 'chip': chip(f"{dom} {org_share if dom == 'Orgânico' else 100 - org_share:.0f}%", 'pos' if dom == 'Orgânico' else 'neutral'),
         'val': f"{intf(M['vendas_org'])} vd org · conv {pctf(M['conv_org'])}"},
        {'q': 'CPL vs meta?', 'chip': cpl_chip, 'val': money(M['cpl'])},
        {'q': 'ROAS?', 'chip': chip(xf(M['roas']), roas_tone), 'val': f"fat pago / invest cpt"}]}
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
                          _st('ROAS Captação', xf(M['roas'])), _st('ROI Global', f"{M['roi']:.0f}%")],
                'chart': _chart('bar', 'deb_q1', 'indicador', 'v', series='serie',
                                colors=['#AFA9EC', '#534AB7'], height=210)})
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
