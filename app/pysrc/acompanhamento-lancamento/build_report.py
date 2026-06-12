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
from common.preserve import preserve

PCT = {'taxa_resp', 'taxa_qual', 'conv_pag', 'hook', 'hold', 'ctr', 'connect'}
# Nome da taxa de cada transição do funil (alinhado às 5 transições de FUNNEL_STAGES).
FUNNEL_RATE = ['CTR', 'Connect Rate', 'Conv. de Página', 'Taxa de Resposta', 'Qualidade']
# Ícones limitados ao set do renderer (renderer.ts → ICONS).
ICON = {'investimento': ('coin', '#534AB7'), 'cpl': ('users', '#185FA5'), 'cpmql': ('star', '#854F0B'),
        'taxa_resp': ('arrows-left-right', '#3B6D11'), 'taxa_qual': ('circle-check', '#534AB7'),
        'conv_pag': ('target', '#185FA5'), 'cpm': ('database', '#534AB7'), 'hook': ('bolt', '#EF9F27'),
        'hold': ('trending-up', '#854F0B'), 'ctr': ('trending-up', '#3B6D11'),
        'connect': ('refresh', '#185FA5')}


def vfmt(metric, v):
    if v is None:
        return '—'
    return pctf(v) if metric in PCT else money(v)


def assemble(rows, config, content, opts=None):
    config = config or {}
    B = calc.build(rows, config)
    dataset, sections, layouts = {}, {}, {}

    def add_table(name, dims, rows_):
        dataset[name] = {'dims': list(dims), 'filters': [], 'rows': rows_}

    def trend_delta(metric):
        tr = B['trend'].get(metric)
        if not tr or tr['dir'] == 'neutro':
            return 'estável', 'neutral'
        arrow = '▲' if tr['dir'] == 'up' else '▼'
        tone = 'pos' if tr.get('good') else ('neg' if tr.get('good') is False else 'neutral')
        return f"{arrow} {tr['pct']:.0f}% vs início", tone

    def kpi_sub(metric):
        parts = [f"3d {vfmt(metric, B['d3'].get(metric))}"]
        st = B['meta_status'].get(metric)
        meta = B['meta'].get(metric)
        if st and meta is not None:
            sym = {'ok': '✓', 'warn': '⚠', 'bad': '✕'}[st['cls']]
            parts.append(f"meta {vfmt(metric, meta)} · {st['dev']:+.0f}% {sym}")
        return ' · '.join(parts)

    def kcard(arr, pg, metric):
        ic, color = ICON.get(metric, ('chart-bar', '#534AB7'))
        tr = B['trend'].get(metric, {})
        flag_txt, flag_tone = trend_delta(metric)
        card = {'id': f'k-{metric}', 'type': 'kpi-card', 'tier': 'feature',
                'label': calc.LABELS[metric], 'value': vfmt(metric, B['tot'].get(metric)),
                'icon': ic, 'iconColor': color}
        # valor dos últimos 3 dias (colorido pela direção-de-bom)
        d3v = B['d3'].get(metric)
        if d3v is not None:
            d3 = {'value': vfmt(metric, d3v),
                  'tone': 'pos' if tr.get('good') else ('neg' if tr.get('good') is False else 'neutral')}
            if tr.get('dir') in ('up', 'down'):
                d3['dir'] = tr['dir']
            card['d3'] = d3
        # flag de tendência (vs início)
        if flag_txt:
            card['flag'] = {'text': flag_txt, 'tone': flag_tone}
        # rodapé de meta + desvio com selo ✓/⚠/✕
        st = B['meta_status'].get(metric)
        meta = B['meta'].get(metric)
        if st and meta is not None:
            card['goal'] = {'label': f"meta {vfmt(metric, meta)}", 'delta': f"{st['dev']:+.0f}%", 'status': st['cls']}
        arr.append(card)
        pg.add(f'k-{metric}', 'kpi-card', 4, 4)

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
    pan.append({'id': 'pan-eb-vg', 'type': 'eyebrow', 'title': 'VISÃO GERAL',
                'caption': f"Dia {B['dia_campanha']} de campanha · dados até {B['corte_label']}"})
    pg.add('pan-eb-vg', 'eyebrow', 12, 1)

    # acumulado de leads + linhas de meta (inline para suportar as referências)
    cum_series = [{'name': 'Leads acumulados', 'data': B['series']['cum']}]
    mt = B['meta'].get('_leads_total')
    mtd = B['meta'].get('_leads_td')
    n = len(B['series']['labels'])
    if mt:
        cum_series.append({'name': f'Meta total ({intf(mt)})', 'data': [round(mt)] * n})
    if mtd:
        cum_series.append({'name': f'Meta to date ({intf(mtd)})', 'data': [round(mtd)] * n})
    pan.append({'id': 'pan-cum', 'type': 'chart', 'chartType': 'line', 'title': 'Leads captados (acumulado)',
                'height': 300, 'colors': ['#534AB7', '#EF9F27', '#3B6D11'],
                'categories': B['series']['labels'], 'series': cum_series})
    pg.add('pan-cum', 'chart', 8, 4)

    pan.append({'id': 'pan-donut', 'type': 'chart', 'chartType': 'donut', 'title': 'Pago × Orgânico',
                'height': 300, 'colors': ['#534AB7', '#97C459'],
                'bind': {'dataset': 'acom_origem', 'x': 'origem', 'y': 'leads'}})
    pg.add('pan-donut', 'chart', 4, 4)

    # badges de meta (atingimento) como kpi-card com barra
    leads_tot = B['tot_sums']['leads']
    if mt:
        at = calc.pct(leads_tot, mt) or 0
        pan.append({'id': 'pan-meta-geral', 'type': 'kpi-card', 'tier': 'volume',
                    'label': 'Atingimento · Meta Geral', 'value': f'{intf(leads_tot)} / {intf(mt)}',
                    'sub': f'{at:.1f}% da meta total da campanha', 'icon': 'target', 'iconColor': '#534AB7',
                    'bar': [{'pct': min(at, 100), 'color': '#534AB7'}]})
        pg.add('pan-meta-geral', 'kpi-card', 6, 2)
    if mtd:
        atd = calc.pct(leads_tot, mtd) or 0
        pan.append({'id': 'pan-meta-td', 'type': 'kpi-card', 'tier': 'volume',
                    'label': 'Atingimento · Meta To Date', 'value': f'{intf(leads_tot)} / {intf(mtd)}',
                    'sub': f'{atd:.1f}% da meta esperada até hoje', 'icon': 'circle-check', 'iconColor': '#3B6D11',
                    'bar': [{'pct': min(atd, 100), 'color': '#3B6D11'}]})
        pg.add('pan-meta-td', 'kpi-card', 6, 2)

    pan.append({'id': 'pan-eb-kpi', 'type': 'eyebrow', 'title': 'PRINCIPAIS KPIS', 'caption': '6 indicadores · valor geral · 3 dias · tendência · meta'})
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
    evo, eg = [], Grid()
    evo.append({'id': 'evo-eb', 'type': 'eyebrow', 'title': 'EVOLUÇÃO DIÁRIA', 'caption': 'séries por dia da campanha'})
    eg.add('evo-eb', 'eyebrow', 12, 1)

    def chart(wid, title, y, ctype, pct, vf, color='#534AB7', w=6):
        evo.append({'id': wid, 'type': 'chart', 'chartType': ctype, 'title': title, 'height': 280,
                    'pct': pct, 'valueFormat': vf, 'colors': [color],
                    'bind': {'dataset': 'acom_daily', 'x': 'dia', 'y': y}})
        eg.add(wid, 'chart', w, 4)
    chart('evo-leads', 'Leads por dia', 'leads', 'bar', False, 'int', w=6)
    chart('evo-invest', 'Investimento por dia (R$)', 'invest', 'bar', False, 'money', w=6)
    chart('evo-cpl', 'CPL por dia (R$)', 'cpl', 'line', False, 'money', '#EF4444', w=4)
    chart('evo-qual', 'Taxa de Qualidade (%)', 'taxa_qual', 'line', True, 'pct', '#EF9F27', w=4)
    chart('evo-cpmql', 'CPMQL por dia (R$)', 'cpmql', 'line', False, 'money', '#EF4444', w=4)
    sections['s02'] = {'id': 's02', 'header': {'badge': 'Evolução', 'title': 'Evolução Diária',
                       'sub': 'Leads, investimento, CPL, qualidade e CPMQL ao longo dos dias.'}, 'widgets': evo}
    layouts['s02'] = eg.items

    # ════ s03 — Canais & Audiência ═════════════════════════════════════════
    can, cg = [], Grid()
    # origem (pago × orgânico) — barras (tabela acom_origem criada no topo)
    can.append({'id': 'can-eb-orig', 'type': 'eyebrow', 'title': 'ORIGEM E TEMPERATURA', 'caption': 'distribuição dos leads'})
    cg.add('can-eb-orig', 'eyebrow', 12, 1)
    can.append({'id': 'can-orig', 'type': 'chart', 'chartType': 'bar-horizontal', 'title': 'Leads por origem',
                'height': 200, 'colors': ['#534AB7'], 'distributed': True,
                'bind': {'dataset': 'acom_origem', 'x': 'origem', 'y': 'leads'}})
    cg.add('can-orig', 'chart', 6, 3)
    # temperatura (tabela)
    if B['temp']:
        can.append({'id': 'can-temp', 'type': 'table', 'title': 'Temperatura · tráfego pago',
                    'cols': ['Temperatura', 'Leads', 'Invest.', 'CPL'],
                    'rows': [[t, intf(v['leads']), money(v['invest']), vfmt('cpl', v['cpl'])]
                             for t, v in B['temp'].items()]})
        cg.add('can-temp', 'table', 6, 3)
    # tipo de lead (6 células como kpi-cards)
    tl = B['tipo_lead']
    can.append({'id': 'can-eb-tipo', 'type': 'eyebrow', 'title': 'TIPO DE LEAD', 'caption': 'novos, antigos e clientes por origem'})
    cg.add('can-eb-tipo', 'eyebrow', 12, 1)
    tl_cells = [
        ('Leads Novos', tl['novos'], calc.pct(tl['novos'], tl['novos'] + tl['antigos']), 'do total'),
        ('Leads Antigos', tl['antigos'], calc.pct(tl['antigos'], tl['novos'] + tl['antigos']), 'do total'),
        ('Antigos · Pago', tl['antigos_pago'], calc.pct(tl['antigos_pago'], tl['antigos']), 'dos antigos'),
        ('Antigos · Orgânico', tl['antigos_org'], calc.pct(tl['antigos_org'], tl['antigos']), 'dos antigos'),
        ('Clientes · Pago', tl['cli_pago'], calc.pct(tl['cli_pago'], tl['cli_total']), 'dos clientes'),
        ('Clientes · Orgânico', tl['cli_org'], calc.pct(tl['cli_org'], tl['cli_total']), 'dos clientes'),
    ]
    for i, (lbl, val, p, suf) in enumerate(tl_cells):
        can.append({'id': f'can-tl-{i}', 'type': 'kpi-card', 'tier': 'volume', 'label': lbl,
                    'value': intf(val), 'sub': f'{(p or 0):.1f}% {suf}', 'icon': 'users', 'iconColor': '#534AB7'})
        cg.add(f'can-tl-{i}', 'kpi-card', 4, 2)
    # criativos do último dia (best/worst)
    cr = B['criativos']
    if cr['best'] or cr['worst']:
        can.append({'id': 'can-eb-cri', 'type': 'eyebrow', 'title': 'CRIATIVOS · ÚLTIMO DIA',
                    'caption': f"melhores e piores por CPMQL projetado · {B['cr_dia_label']}"})
        cg.add('can-eb-cri', 'eyebrow', 12, 1)

        def cri_rows(lst):
            return [[c['name'], intf(c['leads']), money(c['invest']), vfmt('cpl', c['cpl']),
                     pctf(c['taxa_qual']), vfmt('cpmql', c['cpmql_proj'])] for c in lst]
        cols = ['Criativo', 'Leads', 'Invest.', 'CPL', 'Tx. Qual', 'CPMQL proj.']
        if cr['best']:
            can.append({'id': 'can-cri-best', 'type': 'table', 'title': '🏆 Maior volume',
                        'cols': cols, 'rows': cri_rows(cr['best'])})
            cg.add('can-cri-best', 'table', 6, 3)
        if cr['worst']:
            can.append({'id': 'can-cri-worst', 'type': 'table', 'title': '⚠️ Maior CPMQL projetado',
                        'cols': cols, 'rows': cri_rows(cr['worst'])})
            cg.add('can-cri-worst', 'table', 6, 3)
    sections['s03'] = {'id': 's03', 'header': {'badge': 'Canais', 'title': 'Canais e Audiência',
                       'sub': 'Origem, temperatura, tipo de lead e criativos do último dia.'}, 'widgets': can}
    layouts['s03'] = cg.items

    # ════ s04 — Tráfego Pago ═══════════════════════════════════════════════
    tra, tg = [], Grid()
    tra.append({'id': 'tra-eb-kpi', 'type': 'eyebrow', 'title': 'INDICADORES DE TRÁFEGO PAGO', 'caption': '6 indicadores de mídia'})
    tg.add('tra-eb-kpi', 'eyebrow', 12, 1)
    for m in calc.KPI_TRAF:
        kcard(tra, tg, m)
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

    # ── páginas + meta ───────────────────────────────────────────────────────
    pages = [{'id': 'visao-geral', 'label': 'Visão Geral', 'sections': [{'id': 's01', 'label': 'Visão Geral'}]},
             {'id': 'evolucao', 'label': 'Evolução', 'sections': [{'id': 's02', 'label': 'Evolução Diária'}]},
             {'id': 'canais', 'label': 'Canais', 'sections': [{'id': 's03', 'label': 'Canais e Audiência'}]},
             {'id': 'trafego', 'label': 'Tráfego', 'sections': [{'id': 's04', 'label': 'Tráfego Pago'}]}]

    created = config.get('created_at') or datetime.date.today().isoformat()
    data_json = {'meta': {'client': config['client'], 'title': config['title'], 'type': 'dashboard',
                          'theme': 'light', 'created_at': created, 'filters': [],
                          'controls': {'kind': 'acompanhamento-lancamento',
                                       'pages': ['visao-geral', 'evolucao', 'canais', 'trafego']}},
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
