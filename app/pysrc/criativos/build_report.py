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
from common.report import eb, apply_goal, dev, hmcls   # eyebrow + motor do rodapé "Bench X · ±%" e do tint das células

# modo -> KPIs Macro (ordem da fonte). ★ = indicador principal do modo.
# Ordem = a do FUNIL (como o debriefing): dinheiro entra → leads → custo do lead →
# qualificação → venda → custo da venda → retorno. ROAS fecha: é o desfecho.
KPIS_RESULTADO = ['invest', 'leads', 'cpl', 'qualidade', 'cpmql', 'vendas', 'conv', 'cac', 'retorno', 'roas']
# Mesma lógica: impressão (CPM) → clique (CTR) → lead → custo do lead → resposta →
# qualificação → CPMQL (o desfecho da captação). Hook/Hold ficam na seção Qualidade.
KPIS_CAPTACAO = ['invest', 'cpm', 'ctr', 'leads', 'cpl', 'tx_resposta', 'qualidade', 'cpmql']
# Dois MODOS analíticos (toggle): trocam quais indicadores aparecem em TUDO.
MODE_KPIS = {'resultado': KPIS_RESULTADO, 'captacao': KPIS_CAPTACAO}
MODE_LABEL = {'resultado': 'Resultado Final', 'captacao': 'Captação em Andamento'}
MODE_SUB = {'resultado': 'performance de venda — ROAS, conversão, retorno (★ ROAS líquido)',
            'captacao': 'eficiência de captação — custo, qualidade, projeção (★ CPMQL projetado)'}
MODE_RANK = {'resultado': ['Criativo', 'Plataforma', 'Investimento', 'Leads', 'Vendas', 'ROAS', 'CPL', 'Hook', 'Hold'],
             'captacao': ['Criativo', 'Plataforma', 'Investimento', 'Leads', 'CPL', 'CPMQL', 'CPM', 'CTR', 'Hook', 'Hold']}
# Colunas das tabelas por dimensão da ficha (temperatura/campanha/público) na ORDEM DO
# FUNIL: dinheiro → impressão → vídeo → clique → página → lead → qualificação → venda →
# retorno. Cada tabela = os KPIs do modo MAIS as métricas de qualidade do criativo (que
# valem nos dois modos, como na seção Qualidade). Derivado de MODE_KPIS: acrescentar um
# KPI ao modo o coloca na tabela sozinho, sem uma segunda lista para esquecer de editar.
BR_ORDER = ['invest', 'cpm', 'hook_rate', 'hold_rate', 'ctr', 'connect_rate', 'conv_pagina',
            'leads', 'cpl', 'tx_resposta', 'qualidade', 'cpmql',
            'vendas', 'conv', 'cac', 'retorno', 'roas']
BR_QUAL = ['cpm', 'hook_rate', 'hold_rate', 'ctr', 'connect_rate', 'conv_pagina']
assert not set(KPIS_RESULTADO + KPIS_CAPTACAO) - set(BR_ORDER), 'BR_ORDER precisa cobrir todo KPI de modo'
MODE_BR = {m: [k for k in BR_ORDER if k in BR_QUAL or k in ks] for m, ks in MODE_KPIS.items()}
# Rótulo curto de cada indicador. Serve a dois consumidores: os aliases da tabela
# `cr_creatives` (vocabulário que o deepen usa em `cols`) e o cabeçalho das colunas do
# heatmap — onde `calc.METRICS[k]['label']` ("Conversão de Página") não cabe na coluna.
SHORT = {'invest': 'Invest.', 'leads': 'Leads', 'vendas': 'Vendas', 'conv': 'Tx.Conv',
         'cac': 'CAC', 'roas': 'ROAS', 'qualidade': 'Qualid.', 'cpl': 'CPL', 'cpm': 'CPM',
         'ctr': 'CTR', 'hook_rate': 'Hook', 'hold_rate': 'Hold', 'conv_pagina': 'Conv.Pág',
         'connect_rate': 'ConnRate', 'tx_resposta': 'Tx.Resp', 'cpmql': 'CPMQL',
         'retorno': 'Retorno', 'videoviews': 'Videoviews'}
MODES_OPT = [{'id': 'resultado', 'label': 'Resultado Final'}, {'id': 'captacao', 'label': 'Captação'}]
# Eixos do scatter e métricas da evolução diária (esq, dir) — mudam por modo.
SCATTER_XY = {'resultado': ('invest', 'retorno'), 'captacao': ('invest', 'cpmql')}
DAILY_XY = {'resultado': ('leads', 'retorno'), 'captacao': ('leads', 'cpl')}
STAR = {'roas', 'cpmql'}
ICON = {'invest': 'coin', 'roas': 'bolt', 'retorno': 'database', 'leads': 'users',
        'vendas': 'shopping-cart', 'conv': 'circle-check', 'cac': 'target', 'qualidade': 'star',
        'cpl': 'users', 'cpm': 'database', 'ctr': 'trending-up', 'tx_resposta': 'message',
        'cpmql': 'target'}
# Tooltip (i) de cada indicador — explica em PESSOAS, não em nome de coluna do dump
# ("quem viu metade do vídeo", não "views_50pc"). Substitui a nota de rodapé.
INFO = {
    'invest': 'Quanto foi gasto em mídia paga nestes criativos.',
    'leads': 'Pessoas que deixaram o contato.',
    'vendas': 'Compras concluídas atribuídas a estes criativos.',
    'retorno': 'Faturamento bruto gerado — antes de descontar o investimento.',
    'roas': 'Retorno LÍQUIDO por real investido: o quanto sobrou além do que se gastou. '
            '0 = empatou (o faturamento cobriu exatamente a mídia); 1× = dobrou o dinheiro. '
            'Negativo = a mídia custou mais do que trouxe.',
    'cpl': 'Quanto custou cada pessoa que deixou o contato.',
    'cac': 'Quanto custou cada venda.',
    'conv': 'De cada 100 pessoas que deixaram o contato, quantas compraram.',
    'qualidade': 'Entre quem respondeu a pesquisa, a fatia que tem o perfil de quem compra (lead qualificado).',
    'cpmql': 'Quanto custa, na projeção, cada lead com perfil de comprador — o custo do lead '
             'dividido pela fatia que se qualifica. Sobe quando o lead fica caro OU quando piora o perfil.',
    'cpm': 'Quanto custou para o anúncio aparecer mil vezes. É o preço do leilão de mídia.',
    'ctr': 'De cada 100 pessoas que viram o anúncio, quantas clicaram.',
    'tx_resposta': 'Dos que deixaram o contato, quantos responderam a pesquisa.',
    'hook_rate': 'De quem viu o anúncio, quantos pararam e começaram a assistir. Mede se a abertura prende.',
    'hold_rate': 'De quem começou a assistir, quantos ficaram até o fim. Mede se o vídeo segura.',
    'connect_rate': 'De quem clicou, quantos realmente chegaram a abrir a página. Perda aqui costuma ser '
                    'página lenta ou clique sem intenção.',
    'conv_pagina': 'De quem abriu a página, quantos deixaram o contato. Mede a página, não o anúncio.',
}


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


def funnel(m, steps_def, bench, wid, title, sub, compact=False):
    """Widget de funil a partir das métricas `m` e das etapas `steps_def`
    [(rótulo, valor, vlabel|None)]. Usado pelo Panorama (consolidado) e pela ficha
    (um criativo) — mesma leitura dos dois lados.

    As taxas de passagem comparam ao BENCHMARK escolhido na criação; a transição
    Investimento→Impressões é CUSTO (CPM), não taxa. Etapa zerada some (dump sem
    pageviews, p.ex.) para o funil não quebrar."""
    fv = [(l, v, vl) for l, v, vl in steps_def if v]
    mig = lambda a, b: round(b / a * 100, 2) if a else 0.0
    tb = {('Impressões', 'Clicks'): bench.get('ctr'),
          ('Clicks', 'Pageviews'): bench.get('connect_rate'),
          ('Pageviews', 'Leads'): bench.get('conv_pagina'),
          # sem pageviews no dump, clicks→leads ≡ connect × conv. de página
          ('Clicks', 'Leads'): ((bench.get('connect_rate') or 0) / 100.0 * (bench.get('conv_pagina') or 0)) or None}
    trs = []
    for i in range(len(fv) - 1):
        frm, to = fv[i][0], fv[i + 1][0]
        if frm == 'Investimento':
            trs.append({'note': f"CPM {fmtm('cpm', m.get('cpm'))}", 'noteTone': 'neutral'})
            continue
        r = mig(fv[i][1], fv[i + 1][1])
        tr = {'migrate': r, 'loss': round(100 - r, 1)}
        b = tb.get((frm, to))
        if b:
            tr['bench'] = round(b, 1)
            if r < b:
                tr['gap'] = round(b - r, 1)
        if frm == 'Impressões':
            tr['decimals'] = 2      # CTR precisa de 2 casas
        trs.append(tr)
    # MAIOR FURO = maior queda RELATIVA ao bench (gap ÷ bench), não a maior perda absoluta.
    wi, wr = None, 0.0
    for i, tr in enumerate(trs):
        if tr.get('gap') and tr.get('bench'):
            rel = tr['gap'] / tr['bench']
            if rel > wr:
                wr, wi = rel, i
    if wi is not None:
        trs[wi]['worst'] = True
    return {'id': wid, 'type': 'funnel', 'title': title, 'sub': sub,
            'baseLabel': 'bench', 'hideLoss': True, **({'compact': True} if compact else {}),
            'steps': [{'label': l, 'value': v, **({'vlabel': vl} if vl else {})} for l, v, vl in fv],
            'transitions': trs}


def assemble(rows, config, content, opts=None):
    opts = opts or {}
    # Classificação de temperatura por ILIKE no nome da campanha (configurada na
    # página de criação). Aplicada antes de qualquer agregação — assim os recortes
    # por temperatura existem mesmo num CSV cru sem a coluna `temperatura_lead`.
    cfg = config or {}
    rules = cfg.get('temp_rules')
    if rules:
        rows = calc.apply_temp_rules(rows, rules, overwrite=bool(cfg.get('temp_overwrite')))
    # TIPO DE CAMPANHA — escolhido na CRIAÇÃO (obrigatório nas análises novas): as regras
    # derivam `tipo_campanha` do nome da campanha (ILIKE) e a análise cobre SÓ o tipo
    # selecionado. Filtra aqui, antes de qualquer agregação, então tudo (KPIs, fichas,
    # dataset do deepen) já nasce recortado. Análises antigas (sem `tipo_campanha` no
    # config) seguem sem filtro.
    rows = calc.apply_tipo_rules(rows, cfg.get('tipo_rules'))
    sel_tipo = (cfg.get('tipo_campanha') or '').strip()
    if sel_tipo:
        rows = [r for r in rows if (r.get('tipo_campanha') or '').strip() == sel_tipo]
    dic = opts.get('dict') or {}
    mode = opts.get('mode') if opts.get('mode') in MODE_KPIS else 'resultado'
    bench = calc.resolve_bench(cfg)   # {hook_rate/hold_rate/ctr/connect_rate/conv_pagina: valor}
    B = calc.build(rows, dic, opts)   # opts: temp (filtro de temperatura) + min_invest
    creatives = B['creatives']
    valid = B['valid']

    dataset, sections, layouts = {}, {}, {}

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

    def _cr_row(c):
        row = {'criativo': c['name'], 'Criativo': c['name'], 'is_video': 1 if c['m']['is_video'] else 0}
        for k, lab in SHORT.items():
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
            # valores CRUS p/ o seletor de ordenação (as métricas acima são strings)
            'sort': {'invest': m.get('invest'), 'roas': m.get('roas'), 'retorno': m.get('retorno'),
                     'cpmql': m.get('cpmql')},
            'gotoPage': 'fichas', 'gotoSection': sid_of[c['key']]})

    # ── s01 Panorama ─────────────────────────────────────────────────────────
    pan, pg = [], Grid()
    total = B['total']

    def bench_sub(k, v):
        # Rodapé comparando `v` ao BENCHMARK da métrica (↑ acima / ↓ abaixo, custo
        # invertido). Sem benchmark → None (o chamador cai na média). subTone colore.
        b = bench.get(k)
        if b is None:
            return None
        cost = calc.METRICS.get(k, {}).get('cost') is True
        ok = None if v is None else ((v <= b) if cost else (v >= b))
        return {'sub': f'bench {fmtm(k, b)}' + ('' if ok is None else (' · ↑' if ok else ' · ↓')),
                'subTone': 'neutral' if ok is None else ('pos' if ok else 'neg')}

    def kcard(wid, k, v):
        # Card de KPI no padrão do debriefing: label + valor + rodapé "Bench X · ±%"
        # (apply_goal, mesmo motor). Só as métricas de CRIATIVO têm benchmark no app;
        # as demais ficam SEM referência — "méd" aqui seria o número comparado consigo
        # mesmo nas razões (avg = total, ver calc.is_ratio) e ruído nas aditivas.
        card = {'id': wid, 'type': 'kpi-card', 'tier': 'feature',
                'label': calc.METRICS[k]['label'] + (' ★' if k in STAR else ''), 'value': fmtm(k, v),
                'icon': ICON.get(k, 'chart-bar'), 'iconColor': '#534AB7' if k in STAR else '#7F77DD'}
        if INFO.get(k):
            card['info'] = INFO[k]   # (i) no card — substitui a nota de rodapé
        if bench.get(k) is not None:
            apply_goal(card, v, bench.get(k), calc.METRICS.get(k, {}).get('cost') is True,
                       None, fmtm(k, bench.get(k)), None, 'Bench')
        if k in STAR:
            card['emph'] = True
        return card

    # KPIs Macro: cards à ESQUERDA (2 por linha) + FUNIL à direita — mesmo bloco do
    # debriefing ("Indicadores de Captura"), espelhado. Coords manuais: o packer de
    # linha não flui cards ao lado de um item alto.
    eb(pan, pg, 'cr-eb-kpi', MODE_LABEL[mode].upper(), MODE_SUB[mode])
    for j, k in enumerate(MODE_KPIS[mode]):
        wid = f'cr-k-{k}'
        pan.append(kcard(wid, k, total.get(k)))
        pg.at(wid, 'kpi-card', 0 if j % 2 == 0 else 3, 1 + (j // 2) * 2, 3, 2)

    # Funil à direita. RESULTADO: vai até a VENDA, sem as etapas de qualificação
    # (respostas/MQLs). CAPTAÇÃO: termina no lead qualificado.
    steps_def = ([('Investimento', total.get('invest'), money(total.get('invest') or 0)),
                  ('Impressões', total.get('impressoes'), None), ('Clicks', total.get('clicks'), None),
                  ('Pageviews', total.get('pageviews'), None), ('Leads', total.get('leads'), None)]
                 + ([('Vendas', total.get('vendas'), None)] if mode == 'resultado'
                    else [('Respostas', total.get('respostas'), None), ('MQLs', total.get('mqls'), None)]))
    fsub = ('do investimento à venda · taxas vs bench' if mode == 'resultado'
            else 'do investimento ao lead qualificado · taxas vs bench')
    pan.append(funnel(total, steps_def, bench, 'cr-funil', 'Funil', fsub))
    # Funil acompanha a ALTURA da coluna de cards (2 por linha) — senão fica curto ao
    # lado dela (captação tem 10 KPIs = 5 linhas; resultado, 8 = 4).
    kpi_rows = (len(MODE_KPIS[mode]) + 1) // 2
    pg.at('cr-funil', 'funnel', 6, 1, 6, kpi_rows * 2)
    pg.x = 0; pg.y = 1 + kpi_rows * 2; pg.rowh = 0   # volta ao fluxo abaixo do bloco

    # Qualidade do criativo (vídeo/página) — as 5 métricas de criativo, todas com
    # benchmark (escolhido na criação). Vale nos DOIS modos: a qualidade do anúncio
    # explica o resultado tanto quanto a captação. Cards no mesmo padrão dos KPIs macro;
    # como TODAS têm bench, o rodapé "Bench X · ±%" aparece em cada uma.
    eb(pan, pg, 'cr-eb-qual', 'QUALIDADE DO CRIATIVO', 'custo, vídeo e página · realizado vs benchmark')
    # Ordem do funil: custo da impressão (CPM) → retenção do vídeo → clique → página.
    # CPM não tem benchmark no app (o registro só tem as 5 taxas), então fica sem pill.
    for k in ['cpm', 'hook_rate', 'hold_rate', 'ctr', 'connect_rate', 'conv_pagina']:
        wid = f'cr-q-{k}'
        pan.append(kcard(wid, k, total.get(k)))
        pg.add(wid, 'kpi-card', 2, 2)   # 6 na linha (fecha as 12 colunas)

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
    # ranked: os cards saem ordenados por `main` (ROAS/CPMQL) → o card numera 1..n e a
    # barra passa a significar "distância até o 1º". A 1ª chave de ordenação é a que
    # eles já chegam ordenados (o indicador do modo).
    sort_keys = ([{'key': 'roas', 'label': 'ROAS'}] if mode == 'resultado'
                 else [{'key': 'cpmql', 'label': 'CPMQL', 'asc': True}])   # custo: menor é melhor
    sort_keys += [{'key': 'invest', 'label': 'Investimento'}, {'key': 'retorno', 'label': 'Retorno'},
                  {'key': 'name', 'label': 'A-Z', 'asc': True}]
    pan.append({'id': 'cr-rank', 'type': 'link-card', 'ranked': True,
                'sortKeys': sort_keys, 'cards': rank_cards})
    pg.add('cr-rank', 'link-card', 12, 8)

    # As fórmulas saíram da nota de rodapé e viraram o (i) de cada KPI (em linguagem de
    # pessoas). O que a nota tinha de ESCOPO — quem ficou de fora dos totais — não é
    # fórmula e sobe para o cabeçalho, junto do recorte de tipo.
    sub = f'{len(valid)} criativos com tráfego · investimento {money(total["invest"])} · {len(B["daily"])} dias'
    sem_trafego = len(creatives) - len(valid)
    if sem_trafego:
        sub += f' · {sem_trafego} sem tráfego, fora dos totais'
    if sel_tipo:
        sub += f' · campanhas de {sel_tipo}'
    sections['s01'] = {'id': 's01', 'header': {'badge': 'Panorama', 'title': 'Panorama de Criativos', 'sub': sub}, 'widgets': pan}
    layouts['s01'] = pg.items

    # ── fichas por criativo (uma seção cada) → página Fichas + sidebar de criativos ──
    MACRO = MODE_KPIS[mode]

    def tone(roas):
        if roas is None:
            return 'n'
        return 'g' if roas > 0 else ('r' if roas < 0 else 'p')

    def br_tab(prefix, dimlabel, by_dim, i):
        """Uma aba do heatmap da ficha — mesmo widget do "Gargalos no Funil" do
        debriefing: uma célula por métrica, na ordem do funil.

        Tint só onde EXISTE referência: benchmark de criativo (as de qualidade) ou sinal
        (retorno/ROAS líquido, breakeven em 0). O resto fica neutro — colorir sem
        referência seria inventar julgamento. O anel marca o maior furo da linha.
        Coluna vazia em todos os segmentos (hook/hold num estático) não entra."""
        segs = [(n, mm) for n, mm in by_dim.items() if mm['has_traffic']]
        keys = [k for k in MODE_BR[mode] if any(mm.get(k) is not None for _, mm in segs)]
        if not segs or not keys:
            return None

        def hrow(name, mm, ref=False):
            full = name or '—'
            row, worst_i, worst_d = [], None, 0.0
            for k in keys:
                v, b = mm.get(k), bench.get(k)
                val = fmtm(k, v)
                cls, ttl = 'hmd-neu', f'{calc.METRICS[k]["label"]}: {val}'   # tooltip: nome por extenso
                if b and v is not None:
                    d, tone = dev(v, b, calc.METRICS[k].get('cost') is True)
                    cls = hmcls(d, tone)
                    ttl += f' · bench {fmtm(k, b)}' + (f' ({d:+.0f}%)' if d is not None else '')
                    if tone in ('warn', 'neg') and d is not None and abs(d) > worst_d:
                        worst_d, worst_i = abs(d), len(row)
                elif k in ('retorno', 'roas') and v is not None:
                    cls = 'hmd-pos1' if v > 0 else ('hmd-neg1' if v < 0 else 'hmd-neu')
                    ttl += ' · acima de 0 = sobrou dinheiro'
                cell = {'seg': full, 'segLabel': full if len(full) <= 30 else full[:29].rstrip() + '…',
                        'etapa': SHORT[k], 'val': val, 'cls': cls, 'title': ttl}
                if ref:
                    # A régua não é julgada: sem tint e sem anel, ou o olho a lê como
                    # mais um segmento em vez da base de comparação.
                    cell.update({'cls': 'hmd-neu', 'rowCls': 'hm-ref',
                                 'title': f'{calc.METRICS[k]["label"]}: {val} · consolidado de todos os criativos'})
                row.append(cell)
            if worst_i is not None and not ref:
                row[worst_i]['cls'] += ' hm-worst'
                row[worst_i]['title'] += ' · maior furo'
            return row

        cells = []
        for name, mm in segs:
            cells.extend(hrow(name, mm))
        # Régua: o consolidado de TODOS os criativos da análise. Nas ADITIVAS (invest,
        # leads, vendas) é a soma — dá p/ ver que fatia este recorte representa. Nas
        # RAZÕES (CPM, CTR, ROAS…) `total` já é a razão agregada ponderada por volume,
        # que é a leitura certa de "o CPM da campanha". Vai por último, como rodapé.
        cells.extend(hrow('Total da campanha', total, ref=True))
        dsname = f'cr_{i}_{prefix}'
        dataset[dsname] = {'dims': ['seg', 'etapa'], 'filters': [], 'rows': cells}
        return {'label': dimlabel, 'sub': 'etapa do funil e qualidade · verde acima do benchmark, vermelho abaixo',
                'bind': {'dataset': dsname}, 'rowKey': 'seg', 'rowLabelKey': 'segLabel',
                'rowTitleKey': 'seg', 'rowClsKey': 'rowCls', 'colKey': 'etapa', 'valKey': 'val',
                'clsKey': 'cls', 'titleKey': 'title'}

    # Altura do preview na ficha, em linhas de grade. O bloco de cima (preview |
    # métricas + funil) tem de caber numa dobra — ver a modal de referência.
    # O preview cruza TODAS as linhas do bloco (eyebrow + métricas + eyebrow + funil).
    # Se cruzar MENOS, o navegador espalha a altura dele só pelas linhas que ele toca e
    # o excesso vai inteiro p/ os cards de métrica — com embed real (~570px) eles iam de
    # 75px para 106px de puro vazio. Cruzando o bloco todo, a sobra se dilui.
    BLOCK_H = 1 + ((len(MODE_KPIS[mode]) + 3) // 4) + 1 + 4
    PREV_H = BLOCK_H
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
        # O bloco inteiro — preview + métricas + funil — tem de caber numa dobra, como
        # na modal de referência. w4 mantém a conta do grid (as 8 restantes = 4 métricas).
        fg.items.append({'id': f'{sid}-embed', 'type': fw[-1]['type'], 'x': 0, 'y': 0, 'w': 4, 'h': PREV_H})
        # MÉTRICAS — compactas, 4 por linha. Eram 2 por linha (w=4) e esticavam para
        # preencher a altura do preview, com metade do card vazio.
        fw.append({'id': f'{sid}-eb-macro', 'type': 'eyebrow', 'title': 'MÉTRICAS', 'caption': 'consolidado do criativo', 'compact': True})
        fg.items.append({'id': f'{sid}-eb-macro', 'type': 'eyebrow', 'x': 4, 'y': 0, 'w': 8, 'h': 1})
        for j, k in enumerate(MACRO):
            star = k in STAR
            # Card ENXUTO (label + valor), como na referência: sem ícone e sem "média" —
            # são 10 deles numa dobra dividida com o preview e o funil. A comparação com
            # o lançamento continua no Panorama e nas tabelas abaixo.
            card = {'id': f'{sid}-m-{k}', 'type': 'kpi-card', 'tier': 'feature', 'compact': True,
                    'label': calc.METRICS[k]['label'] + (' ★' if star else ''),
                    'value': fmtm(k, m.get(k))}
            if INFO.get(k):
                card['info'] = INFO[k]
            if star:
                card['emph'] = True
            fw.append(card)
            # h=1 (não 2): o card enxuto tem ~66px de altura natural e a linha de grade
            # aqui vale ~61px. Com h=2 ele ESTICAVA p/ 122px e empurrava o funil p/ fora
            # da dobra — metade do card era vazio.
            fg.items.append({'id': f'{sid}-m-{k}', 'type': 'kpi-card',
                             'x': 4 + (j % 4) * 2, 'y': 1 + (j // 4), 'w': 2, 'h': 1})
        y_fun = 1 + ((len(MACRO) + 3) // 4)

        # O mesmo funil do Panorama, no recorte deste criativo — e com o MESMO desfecho
        # por modo: resultado termina na venda; captação, no lead qualificado (a venda
        # ainda nem existe numa captação em andamento). Começa na impressão — o
        # investimento do criativo já está nas métricas ao lado.
        fw.append({'id': f'{sid}-eb-fun', 'type': 'eyebrow',
                   'title': 'CAMINHO ATÉ A VENDA' if mode == 'resultado' else 'CAMINHO ATÉ O LEAD QUALIFICADO',
                   'caption': 'etapa a etapa · taxas vs benchmark', 'compact': True})
        fg.items.append({'id': f'{sid}-eb-fun', 'type': 'eyebrow', 'x': 4, 'y': y_fun, 'w': 8, 'h': 1})
        fsteps = ([('Impressões', m.get('impressoes'), None), ('Clicks', m.get('clicks'), None),
                   ('Pageviews', m.get('pageviews'), None), ('Leads', m.get('leads'), None)]
                  + ([('Vendas', m.get('vendas'), None)] if mode == 'resultado'
                     else [('Respostas', m.get('respostas'), None), ('MQLs', m.get('mqls'), None)]))
        fw.append(funnel(m, fsteps, bench, f'{sid}-fun', None, None, compact=True))
        fg.items.append({'id': f'{sid}-fun', 'type': 'funnel', 'x': 4, 'y': y_fun + 1, 'w': 8, 'h': 4})
        # Abaixo do MAIS ALTO entre o preview e a coluna da direita.
        fg.x = 0; fg.y = max(PREV_H, y_fun + 5); fg.rowh = 0
        # QUALIDADE DO CRIATIVO — as mesmas 5 métricas do Panorama, aqui no recorte
        # deste criativo e comparadas ao benchmark. Antes só existia um strip de vídeo
        # ("Dados do criativo"), que sumia nos estáticos e não comparava com nada.
        # Hook/Hold só têm sentido com vídeo (views_totais>0) — nos estáticos saem.
        qkeys = ['cpm', 'ctr', 'connect_rate', 'conv_pagina']
        if m.get('is_video'):
            qkeys = ['cpm', 'hook_rate', 'hold_rate', 'ctr', 'connect_rate', 'conv_pagina']
        eb(fw, fg, f'{sid}-eb-qual', 'QUALIDADE DO CRIATIVO',
           ('custo, vídeo e página · vs benchmark' if m.get('is_video') else 'custo e página · vs benchmark'))
        # Largura derivada da CONTAGEM: 6 métricas (vídeo) → w2; 4 (estático, sem
        # hook/hold) → w3. Fixar w2 deixava o estático com 4 colunas vazias à direita.
        qw = 12 // len(qkeys)
        for k in qkeys:
            wid = f'{sid}-q-{k}'
            card = kcard(wid, k, m.get(k))
            card['compact'] = True
            fw.append(card)
            fg.add(wid, 'kpi-card', qw, 2)
        # EVOLUÇÃO antes do recorte por dimensão: lida a qualidade do criativo, a
        # pergunta seguinte é "como ele se comportou ao longo do tempo?" — o corte por
        # temperatura/campanha/público é o detalhe que vem depois.
        if c['daily']:
            dataset[f'cr_{i}_daily'] = {'dims': ['data'], 'filters': [], 'rows': [
                {'data': d['data'], 'leads': d['m']['leads'], 'invest': d['m']['invest']} for d in c['daily']]}
            fkeys = [k for k in MODE_KPIS[mode] if any(d['m'].get(k) is not None for d in c['daily'])]
            fdef = 'leads' if 'leads' in fkeys else (fkeys[0] if fkeys else 'leads')
            fmetrics = [{'id': k, 'label': calc.METRICS[k]['label'], 'fmt': calc.METRICS[k]['fmt']} for k in fkeys]
            fpoints = [{'name': d['data'], 'vals': {k: d['m'].get(k) for k in fkeys}} for d in c['daily']]
            eb(fw, fg, f'{sid}-eb-evo', 'EVOLUÇÃO NO TEMPO', 'duas métricas · escalas independentes')
            # DUAL sem combo: 2º seletor plota uma segunda métrica no eixo da direita,
            # as duas em LINHA. Sem isso não dava p/ ver leads e investimento no mesmo
            # dia, que é a leitura que interessa. (`combo` aqui viraria a 1ª em barras.)
            evo = {'id': f'{sid}-evo', 'type': 'evolution-picker', 'title': 'Evolução diária', 'height': 260,
                   'metrics': fmetrics, 'points': fpoints, 'current': fdef}
            snd = next((k for k in ('invest', 'cpl', 'cpmql') if k in fkeys and k != fdef), None)
            if snd:
                evo['current2'] = snd
            fw.append(evo)
            fg.add(f'{sid}-evo', 'evolution-picker', 12, 4)
        # ONDE ESTE CRIATIVO RODOU — um heatmap com toggle de dimensão, no lugar das 3
        # tabelas empilhadas: mesma leitura da fonte, um terço da altura e a comparação
        # com o benchmark visível na célula (a tabela crua não comparava com nada).
        # Canal primeiro (como no debriefing): é o recorte mais grosso — o mesmo criativo
        # pode rodar em meta-ads e google-ads, e o custo/qualidade muda por leilão.
        brt = [t for t in [br_tab('canal', 'Canal', c['by_canal'], i),
                           br_tab('temp', 'Temperatura', c['by_temp'], i),
                           br_tab('camp', 'Campanha', c['by_campanha'], i),
                           br_tab('pub', 'Público', c['by_publico'], i)] if t]
        if brt:
            eb(fw, fg, f'{sid}-eb-br', 'ONDE ESTE CRIATIVO RODOU', 'troque a dimensão',
               info=('Cor das métricas de qualidade (CPM · Hook · Hold · CTR · Connect · Conversão de '
                     'Página): desvio vs o benchmark da análise — verde = melhor, vermelho = pior, '
                     'neutro = perto do benchmark (±10%). O anel marca a pior métrica de cada linha. '
                     'Retorno e ROAS líquido: verde = sobrou dinheiro, vermelho = a mídia custou mais '
                     'do que trouxe. As demais colunas são contexto — sem benchmark no app, sem cor. '
                     'A última linha é o consolidado de TODOS os criativos da análise — soma nas '
                     'aditivas (investimento, leads, vendas), razão ponderada nas taxas e custos.'))
            # Sem `title`: o card mostra a aba ativa ("Temperatura"), que diz o que o
            # eyebrow acima não diz. Com título fixo os dois repetiam a mesma frase.
            fw.append({'id': f'{sid}-br', 'type': 'heatmap-toggle', 'tabs': brt})
            fg.add(f'{sid}-br', 'heatmap-toggle', 12, 6)
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
        from common.preserve import preserve, preserve_dataset, preserve_layout, prune_sections
        # Antes de gravar: some com os sXX.json que esta geração não produz mais (a
        # análise encolhe quando o recorte de tipo entra ou o CSV traz menos criativos).
        # Sem isto sobram fichas órfãs apontando p/ datasets mortos.
        prune_sections(out_dir, r['sections'])
        preserve(out_dir, r['data'], r['sections'])
        preserve_dataset(out_dir, r['dataset'])   # tabelas q-* dos detalhamentos sobrevivem
        preserve_layout(out_dir, r['layout'])     # disposição dos det-* sobrevive
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
