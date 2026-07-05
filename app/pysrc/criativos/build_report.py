"""build_report — gerador da "análise de criativos" (3 camadas do app).

`assemble(rows, config, content, opts)` (puro) -> {dataset, data, layout, sections}.
`build(csv, config, content, out_dir)` carrega base + dicionário, chama assemble e grava.

config: { client, title, slug, created_at?, dict_csv? }  (dict_csv: caminho do dicionário
de criativos; opcional — sem ele, fichas ficam sem link de preview).

v1 (este arquivo): página PANORAMA fiel à fonte — KPIs Macro dos dois modos (Resultado
Final / Captação), evolução diária e ranking de criativos. Fichas individuais por criativo
+ sidebar lista-de-criativos + scatter entram no próximo passo (ver SKILL integrar-analise).
"""
import sys, os, json, datetime
_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _here)
sys.path.insert(0, os.path.dirname(_here))   # pysrc/ -> pacote common
import calc
from common.layout import Grid
from common.fmt import money, pctf, xf, intf
from common.report import eb   # builder de eyebrow compartilhado (KPIs ficam no kpi-strip local)

# modo -> KPIs Macro (ordem da fonte). ★ = indicador principal do modo.
KPIS_RESULTADO = ['invest', 'roas', 'retorno', 'leads', 'vendas', 'conv', 'cac', 'qualidade']
KPIS_CAPTACAO = ['invest', 'leads', 'cpl', 'cpm', 'ctr', 'tx_resposta', 'qualidade', 'cpmql']
# Dois MODOS analíticos (toggle): trocam quais indicadores aparecem em TUDO.
MODE_KPIS = {'resultado': KPIS_RESULTADO, 'captacao': KPIS_CAPTACAO}
MODE_LABEL = {'resultado': 'Resultado Final', 'captacao': 'Captação em Andamento'}
MODE_SUB = {'resultado': 'performance de venda — ROAS, conversão, retorno (★ ROAS líquido)',
            'captacao': 'eficiência de captação — custo, qualidade, projeção (★ CPMQL projetado)'}
MODE_RANK = {'resultado': ['Criativo', 'Plataforma', 'Investimento', 'Leads', 'Vendas', 'ROAS', 'CPL', 'Hook', 'Hold'],
             'captacao': ['Criativo', 'Plataforma', 'Investimento', 'Leads', 'CPL', 'CPMQL', 'CPM', 'CTR', 'Hook', 'Hold']}
# Colunas das tabelas da ficha (por campanha/público) por modo — espelham as do HTML
# fonte: além das básicas, qualificação, taxa de resposta, conversão de página, connect
# rate e hook rate (todas já calculadas em calc.metrics()).
MODE_BR = {'resultado': ['Invest.', 'Leads', 'Vendas', 'Tx.Conv', 'CAC', 'ROAS', 'Qualid.'],
           'captacao': ['Invest.', 'Leads', 'CPL', 'CPM', 'CTR', 'Hook', 'Conv.Pág', 'ConnRate', 'Qualid.', 'Tx.Resp', 'CPMQL']}
MODES_OPT = [{'id': 'resultado', 'label': 'Resultado Final'}, {'id': 'captacao', 'label': 'Captação'}]
# Eixos do scatter e métricas da evolução diária (esq, dir) — mudam por modo.
SCATTER_XY = {'resultado': ('invest', 'retorno'), 'captacao': ('invest', 'cpmql')}
DAILY_XY = {'resultado': ('leads', 'retorno'), 'captacao': ('leads', 'cpl')}
STAR = {'roas', 'cpmql'}
ICON = {'invest': 'coin', 'roas': 'bolt', 'retorno': 'database', 'leads': 'users',
        'vendas': 'shopping-cart', 'conv': 'circle-check', 'cac': 'target', 'qualidade': 'star',
        'cpl': 'users', 'cpm': 'database', 'ctr': 'trending-up', 'tx_resposta': 'message',
        'cpmql': 'target'}


def fmtm(key, v):
    """Formata um indicador pelo seu formato declarado em calc.METRICS."""
    if v is None:
        return '—'
    f = calc.METRICS.get(key, {}).get('fmt', 'int')
    if f == 'money':
        return money(v)
    if f == 'pct':
        return pctf(v)
    if f == 'x':
        return xf(v)
    return intf(v)


def assemble(rows, config, content, opts=None):
    opts = opts or {}
    # Classificação de temperatura por ILIKE no nome da campanha (configurada na
    # página de criação). Aplicada antes de qualquer agregação — assim os recortes
    # por temperatura existem mesmo num CSV cru sem a coluna `temperatura_lead`.
    cfg = config or {}
    rules = cfg.get('temp_rules')
    if rules:
        rows = calc.apply_temp_rules(rows, rules, overwrite=bool(cfg.get('temp_overwrite')))
    dic = opts.get('dict') or {}
    mode = opts.get('mode') if opts.get('mode') in MODE_KPIS else 'resultado'
    B = calc.build(rows, dic, opts)   # opts: temp (filtro de temperatura) + min_invest
    creatives = B['creatives']
    valid = B['valid']

    dataset, sections, layouts = {}, {}, {}

    def mny(v):
        return money(v) if v is not None else '—'

    def pcv(v):
        return pctf(v) if v is not None else '—'

    # ── dataset: série diária + ranking (todas as colunas; o modo escolhe quais exibir) ──
    dataset['cr_daily'] = {'dims': ['data'], 'filters': [], 'rows': [
        {'data': d['data'], 'leads': d['m']['leads'], 'invest': d['m']['invest'],
         'vendas': d['m']['vendas']} for d in B['daily']]}
    # Tabela NUMÉRICA por criativo — fonte do banco de perguntas (perguntas/banks/
    # criativos.py) E tabela bindável no detalhamento. Cada métrica entra sob a CHAVE
    # crua (ex.: 'conv') E o rótulo de exibição (ex.: 'Tx.Conv'): o deepen às vezes usa
    # a chave (gráfico: y='conv') e às vezes o rótulo (table cols=['Tx.Conv']); com os
    # dois aliases ambos casam e a tabela não renderiza vazia. Valores numéricos crus
    # (gráficos e o banco precisam de número, não string formatada).
    _CR_LABELS = {'invest': 'Invest.', 'leads': 'Leads', 'vendas': 'Vendas', 'conv': 'Tx.Conv',
                  'cac': 'CAC', 'roas': 'ROAS', 'qualidade': 'Qualid.', 'cpl': 'CPL', 'cpm': 'CPM',
                  'ctr': 'CTR', 'hook_rate': 'Hook', 'hold_rate': 'Hold', 'conv_pagina': 'Conv.Pág',
                  'connect_rate': 'ConnRate', 'tx_resposta': 'Tx.Resp', 'cpmql': 'CPMQL',
                  'retorno': 'Retorno', 'videoviews': 'Videoviews'}

    def _cr_row(c):
        row = {'criativo': c['name'], 'Criativo': c['name'], 'is_video': 1 if c['m']['is_video'] else 0}
        for k, lab in _CR_LABELS.items():
            v = c['m'].get(k)
            row[k] = v
            row[lab] = v
        return row
    dataset['cr_creatives'] = {'dims': ['criativo'], 'filters': [], 'rows': [_cr_row(c) for c in valid]}

    # ── "Criativos por desempenho" = cards clicáveis que abrem a ficha ──
    sid_of = {c['key']: f's{i + 1:02d}' for i, c in enumerate(valid, 1)}   # mesma ordem das fichas
    if mode == 'captacao':
        order = sorted(valid, key=lambda c: (c['m']['cpmql'] is None, c['m']['cpmql'] or 1e18))
        main_k, main_lbl = 'cpmql', 'CPMQL projetado'
        card_metrics = ['invest', 'leads', 'cpl', 'ctr']
        best = min((c['m']['cpmql'] for c in valid if c['m']['cpmql'] is not None), default=None)
    else:
        order = sorted(valid, key=lambda c: (c['m']['roas'] is None, -(c['m']['roas'] or -1e18)))
        main_k, main_lbl = 'roas', 'ROAS líquido'
        card_metrics = ['invest', 'leads', 'vendas', 'conv']
        best = max((c['m']['roas'] for c in valid if c['m']['roas'] is not None), default=None)

    def card_pct(m):
        v = m.get(main_k)
        if v is None or not best:
            return 0
        return max(0, min(100, best / v * 100)) if mode == 'captacao' else max(0, min(100, v / best * 100))

    def card_tone(m):
        if mode == 'captacao':
            return 'p'
        r = m.get('roas')
        return 'n' if r is None else ('g' if r > 0 else 'r')

    rank_cards = []
    for c in order:
        m = c['m']
        tags = [{'label': 'vídeo' if c['is_video'] else 'estático', 'tone': 'b' if c['is_video'] else 'n'}]
        tags += [{'label': t, 'tone': 'a'} for t in c['temps']]
        rank_cards.append({
            'title': c['name'], 'sub': c['platform'], 'tags': tags,
            'metrics': [{'label': calc.METRICS[k]['label'], 'value': fmtm(k, m.get(k))} for k in card_metrics],
            'main': {'label': main_lbl, 'value': fmtm(main_k, m.get(main_k)), 'pct': round(card_pct(m), 1), 'tone': card_tone(m)},
            'gotoPage': 'fichas', 'gotoSection': sid_of[c['key']]})

    # ── s01 Panorama ─────────────────────────────────────────────────────────
    pan, pg = [], Grid()
    total, avg = B['total'], B['avg']

    def kcards(prefix, keys, sub_of=None):
        # KPIs como CARDS individuais (kpi-card feature) — alinhado ao design dos KPIs
        # do debriefing: cada métrica no seu card (label + valor + sub). 4 por linha (w=3).
        for k in keys:
            star = k in STAR
            wid = f'{prefix}-{k}'
            pan.append({'id': wid, 'type': 'kpi-card', 'tier': 'feature',
                        'label': calc.METRICS[k]['label'] + (' ★' if star else ''),
                        'value': fmtm(k, total.get(k)),
                        'sub': sub_of(k) if sub_of else f'méd {fmtm(k, avg.get(k))}'})
            pg.add(wid, 'kpi-card', 3, 2)

    # Modo (Resultado × Captação) e filtros vivem no FAB (nível-relatório), não na página.
    eb(pan, pg, 'cr-eb-kpi', MODE_LABEL[mode].upper(), MODE_SUB[mode])
    kcards('cr-k', MODE_KPIS[mode])

    # Captação: qualidade do criativo (vídeo/página) com comparação ao BENCHMARK
    # (Hook 30% / Hold 25%) ou à MÉDIA do lançamento (CTR/Connect/Conv. de Página).
    if mode == 'captacao':
        eb(pan, pg, 'cr-eb-qual', 'QUALIDADE DO CRIATIVO', 'vídeo e página · comparação com benchmark (↑ acima / ↓ abaixo)')
        qitems = []
        for k in ['hook_rate', 'hold_rate', 'ctr', 'connect_rate', 'conv_pagina']:
            v = total.get(k)
            bench = calc.BENCH.get(k)
            ref = bench if bench is not None else avg.get(k)
            sub = f'benchmark {pctf(bench)}' if bench is not None else f'média {fmtm(k, avg.get(k))}'
            sub_tone = 'neutral'
            if v is not None and ref:
                sub_tone = 'pos' if v >= ref else 'neg'
                sub += ' · ' + ('↑' if v >= ref else '↓')
            qitems.append({'label': calc.METRICS[k]['label'], 'value': fmtm(k, v), 'sub': sub, 'subTone': sub_tone})
        pan.append({'id': 'cr-qual', 'type': 'kpi-strip', 'items': qitems})
        pg.add('cr-qual', 'kpi-strip', 12, 2)

    eb(pan, pg, 'cr-eb-graf', 'GRÁFICOS', 'evolução diária e dispersão dos criativos')

    # Evolução diária DUAL (evolution-picker): dois seletores — esquerda = volume,
    # direita = métrica-chave do modo, no eixo secundário (escalas distintas). Embute
    # as métricas do modo; o consultor troca qualquer um dos dois eixos. Defaults
    # espelham o DAILY_XY original (leads × retorno | leads × cpl).
    left_m, right_m = DAILY_XY[mode]
    evo_keys = [k for k in MODE_KPIS[mode] if any(d['m'].get(k) is not None for d in B['daily'])]
    if left_m not in evo_keys:
        left_m = evo_keys[0] if evo_keys else left_m
    if right_m not in evo_keys:
        right_m = next((k for k in evo_keys if k != left_m), left_m)
    evo_metrics = [{'id': k, 'label': calc.METRICS[k]['label'], 'fmt': calc.METRICS[k]['fmt']} for k in evo_keys]
    evo_points = [{'name': d['data'], 'vals': {k: d['m'].get(k) for k in evo_keys}} for d in B['daily']]
    pan.append({'id': 'cr-evo', 'type': 'evolution-picker', 'title': 'Evolução diária', 'height': 320,
                'metrics': evo_metrics, 'points': evo_points, 'current': left_m, 'current2': right_m})
    pg.add('cr-evo', 'evolution-picker', 6, 5)

    # Dispersão com 2 SELETORES (dropdowns X e Y) — escolhe uma métrica por eixo.
    # Métricas embutidas; o scatter é reconstruído client-side. Nome no hover.
    sm = (['invest', 'retorno', 'roas', 'vendas', 'conv', 'cac', 'leads', 'qualidade'] if mode == 'resultado'
          else ['invest', 'leads', 'cpl', 'cpmql', 'cpm', 'ctr', 'qualidade', 'tx_resposta'])
    pan.append({'id': 'cr-scatter', 'type': 'scatter-picker', 'title': 'Dispersão dos criativos', 'height': 320,
                'metrics': [{'id': k, 'label': calc.METRICS[k]['label'], 'fmt': calc.METRICS[k]['fmt']} for k in sm],
                'points': [{'name': c['name'], 'vals': {k: c['m'].get(k) for k in sm}} for c in valid],
                'x': 'invest', 'y': ('retorno' if mode == 'resultado' else 'cpmql')})
    pg.add('cr-scatter', 'scatter-picker', 6, 5)

    eb(pan, pg, 'cr-eb-rank', 'CRIATIVOS POR DESEMPENHO', f'{len(valid)} criativos · clique no card para abrir a ficha · ordenado por {main_lbl}')
    pan.append({'id': 'cr-rank', 'type': 'link-card', 'cards': rank_cards})
    pg.add('cr-rank', 'link-card', 12, 8)
    pan.append({'id': 'cr-note', 'type': 'find-note',
                'text': 'ROAS líquido = faturamento/investimento − 1. Qualidade = MQLs/respostas. '
                        'CPMQL projetado = CPL ÷ (MQLs/respostas). Hook = views 2s/impressões; Hold = views 50%/2s. '
                        f'Criativos sem tráfego ({len(creatives) - len(valid)}) ficam fora dos totais.'})
    pg.add('cr-note', 'find-note', 12, 1)

    sub = f'{len(valid)} criativos com tráfego · investimento {money(total["invest"])} · {len(B["daily"])} dias'
    sections['s01'] = {'id': 's01', 'header': {'badge': 'Panorama', 'title': 'Panorama de Criativos', 'sub': sub}, 'widgets': pan}
    layouts['s01'] = pg.items

    # ── fichas por criativo (uma seção cada) → página Fichas + sidebar de criativos ──
    MACRO = MODE_KPIS[mode]

    def tone(roas):
        if roas is None:
            return 'n'
        return 'g' if roas > 0 else ('r' if roas < 0 else 'p')

    def br_table(prefix, dimlabel, by_dim, i):
        cols = [dimlabel] + MODE_BR[mode]
        rws = []
        for name, mm in by_dim.items():
            if not mm['has_traffic']:
                continue
            rws.append({dimlabel: name, 'Invest.': mny(mm['invest']), 'Leads': intf(mm['leads']),
                        'Vendas': intf(mm['vendas']), 'CPL': mny(mm['cpl']), 'CPMQL': mny(mm['cpmql']),
                        'CPM': mny(mm['cpm']), 'CTR': pcv(mm['ctr']), 'ROAS': fmtm('roas', mm['roas']),
                        'Tx.Conv': pcv(mm['conv']), 'CAC': mny(mm['cac']), 'Qualid.': pcv(mm['qualidade']),
                        'Hook': pcv(mm['hook_rate']), 'Conv.Pág': pcv(mm['conv_pagina']),
                        'ConnRate': pcv(mm['connect_rate']), 'Tx.Resp': pcv(mm['tx_resposta'])})
        if not rws:
            return None, None
        name = f'cr_{i}_{prefix}'
        dataset[name] = {'dims': [dimlabel], 'filters': [], 'rows': rws}
        return cols, name

    fichas_refs = []
    for i, c in enumerate(valid, 1):
        sid = f's{i + 1:02d}'
        m = c['m']
        fw, fg = [], Grid()
        # Bloco superior (3 colunas da fonte): preview à ESQUERDA (alto) + RESULTADO
        # MACRO à DIREITA num grid 2×4. Coordenadas explícitas — o packer de linha não
        # flui cartões ao lado de um item alto (senão os KPIs caem abaixo do preview).
        # Com link → embed (iframe). Sem link → ainda um widget `embed` (sem url): o
        # renderEmbed mostra um placeholder limpo "Pré-visualização indisponível" em vez
        # de um find-note solto ocupando o slot alto do preview (parecia quebrado).
        if c['link']:
            fw.append({'id': f'{sid}-embed', 'type': 'embed', 'url': c['link'], 'platform': c['platform'],
                       'title': f'{c["name"]} · {c["platform"]}'})
        else:
            fw.append({'id': f'{sid}-embed', 'type': 'embed', 'platform': c['platform'],
                       'title': f'{c["name"]} · {c["platform"]}',
                       'caption': 'Sem link no dicionário — adicione a URL do anúncio para ver o preview.'})
        fg.items.append({'id': f'{sid}-embed', 'type': fw[-1]['type'], 'x': 0, 'y': 0, 'w': 4, 'h': 9})
        fw.append({'id': f'{sid}-eb-macro', 'type': 'eyebrow', 'title': 'RESULTADO MACRO', 'caption': 'consolidado do criativo'})
        fg.items.append({'id': f'{sid}-eb-macro', 'type': 'eyebrow', 'x': 4, 'y': 0, 'w': 8, 'h': 1})
        for j, k in enumerate(MACRO):
            star = k in STAR
            fw.append({'id': f'{sid}-m-{k}', 'type': 'kpi-card', 'tier': 'feature',
                       'label': calc.METRICS[k]['label'] + (' ★' if star else ''),
                       'value': fmtm(k, m.get(k)), 'sub': f'média {fmtm(k, avg.get(k))}',
                       'icon': ICON.get(k, 'chart-bar'), 'iconColor': '#534AB7' if star else '#7F77DD'})
            fg.items.append({'id': f'{sid}-m-{k}', 'type': 'kpi-card',
                             'x': 4 if j % 2 == 0 else 8, 'y': 1 + (j // 2) * 2, 'w': 4, 'h': 2})
        fg.x = 0; fg.y = 9; fg.rowh = 0   # tabelas/gráfico fluem abaixo do bloco superior
        # DADOS DO CRIATIVO — só para vídeo (hook/hold/views só existem com views_totais>0).
        if m.get('is_video'):
            vid_keys = ['videoviews', 'hook_rate', 'hold_rate', 'connect_rate', 'ctr']
            vitems = [{'label': calc.METRICS[k]['label'], 'value': fmtm(k, m.get(k))} for k in vid_keys]
            eb(fw, fg, f'{sid}-eb-vid', 'DADOS DO CRIATIVO', 'retenção do vídeo')
            fw.append({'id': f'{sid}-vid', 'type': 'kpi-strip', 'items': vitems})
            fg.add(f'{sid}-vid', 'kpi-strip', 12, 2)
        for prefix, lbl, by, title in [('temp', 'Temperatura', c['by_temp'], 'Por temperatura'),
                                       ('camp', 'Campanha', c['by_campanha'], 'Por campanha'),
                                       ('pub', 'Público', c['by_publico'], 'Por público')]:
            cols, dsname = br_table(prefix, lbl, by, i)
            if cols:
                eb(fw, fg, f'{sid}-eb-{prefix}', title.upper())
                fw.append({'id': f'{sid}-{prefix}', 'type': 'table', 'title': title, 'cols': cols, 'bind': {'dataset': dsname}})
                fg.add(f'{sid}-{prefix}', 'table', 12, 4)
        if c['daily']:
            dataset[f'cr_{i}_daily'] = {'dims': ['data'], 'filters': [], 'rows': [
                {'data': d['data'], 'leads': d['m']['leads'], 'invest': d['m']['invest']} for d in c['daily']]}
            fkeys = [k for k in MODE_KPIS[mode] if any(d['m'].get(k) is not None for d in c['daily'])]
            fdef = 'leads' if 'leads' in fkeys else (fkeys[0] if fkeys else 'leads')
            fmetrics = [{'id': k, 'label': calc.METRICS[k]['label'], 'fmt': calc.METRICS[k]['fmt']} for k in fkeys]
            fpoints = [{'name': d['data'], 'vals': {k: d['m'].get(k) for k in fkeys}} for d in c['daily']]
            eb(fw, fg, f'{sid}-eb-evo', 'EVOLUÇÃO NO TEMPO', 'escolha a métrica')
            fw.append({'id': f'{sid}-evo', 'type': 'evolution-picker', 'title': 'Evolução diária', 'height': 260,
                       'metrics': fmetrics, 'points': fpoints, 'current': fdef})
            fg.add(f'{sid}-evo', 'evolution-picker', 12, 4)
        vtag = 'vídeo' if c['is_video'] else 'estático'
        sections[sid] = {'id': sid, 'header': {'badge': f'Ficha · {vtag}', 'title': c['name'],
                         'sub': f'{c["platform"]} · ROAS líquido {fmtm("roas", m["roas"])} · investimento {money(m["invest"])}'}, 'widgets': fw}
        layouts[sid] = fg.items
        fichas_refs.append({'id': sid, 'label': c['name'], 'pill': fmtm('roas', m['roas']), 'tone': tone(m['roas']),
                            'inv': m['invest'], 'roas': m['roas'] if m['roas'] is not None else -1e9})

    pages = [{'id': 'panorama', 'label': 'Panorama', 'sections': [{'id': 's01', 'label': 'Panorama'}]},
             {'id': 'fichas', 'label': 'Fichas', 'sections': fichas_refs}]
    created = (config or {}).get('created_at') or datetime.date.today().isoformat()
    data_json = {'meta': {'client': config['client'], 'client_name': config.get('client_name') or config['client'],
                          'campaign_label': config.get('campaign_label') or '', 'report_type': config.get('type') or 'criativos',
                          'title': config['title'], 'type': 'dashboard',
                          'theme': 'light', 'created_at': created, 'filters': [],
                          'cover': {'eyebrow': f"{config.get('client_name') or config['client']} · Relatório", 'title': config['title']},
                          'controls': {'kind': 'criativos', 'pages': ['panorama', 'fichas'],
                                       'mode': mode, 'modes': MODES_OPT, 'temps': B['temps'],
                                       'minInvestPresets': [100, 500, 1000]},
                          'nav': 'sidebar'},
                 'pages': pages}
    return {'dataset': dataset, 'data': data_json,
            'layout': {'sections': layouts, 'updatedAt': f'{created}T00:00:00.000Z'},
            'sections': sections}


def build(csv_path, config, content, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    rows = calc.load_rows(csv_path)
    dict_csv = (config or {}).get('dict_csv')
    dic = calc.load_dict(dict_csv) if dict_csv and os.path.exists(dict_csv) else {}
    r = assemble(rows, config, content, {'dict': dic})
    try:
        from common.preserve import preserve, preserve_dataset
        preserve(out_dir, r['data'], r['sections'])
        preserve_dataset(out_dir, r['dataset'])   # tabelas q-* dos detalhamentos sobrevivem
    except Exception:
        pass
    def dump(name, obj):
        json.dump(obj, open(os.path.join(out_dir, name), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    dump('dataset.json', r['dataset']); dump('data.json', r['data']); dump('layout.json', r['layout'])
    for sid, sec in r['sections'].items():
        dump(f'{sid}.json', sec)
    return {'tables': len(r['dataset']), 'sections': len(r['sections']), 'pages': len(r['data']['pages']), 'out_dir': out_dir}


if __name__ == '__main__':
    if len(sys.argv) < 5:
        print('uso: build_report.py <config.json> <content.json> <csv> <out_dir>'); sys.exit(1)
    cfg, content_path, csv_path, out = sys.argv[1:5]
    config = json.load(open(cfg, encoding='utf-8'))
    content = json.load(open(content_path, encoding='utf-8')) if os.path.exists(content_path) else {}
    print('OK ->', build(csv_path, config, content, out))
