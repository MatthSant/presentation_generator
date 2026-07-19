"""build_report — gerador do "acompanhamento de lançamento" (3 camadas do app).

`assemble(rows, config, content, opts)` (puro) → {dataset, data, layout, sections}.
`build(csv, config, content, out_dir)` carrega o CSV, chama assemble e grava.

config: { client, title, slug, field_conversion?, data_corte?, data_report?,
          nome_campanha?, metas?{cpl,cpmql,...}, goals_csv?, dict_links?,
          temperatura?{Quente:[kw],Morno:[kw],Frio:[kw]} (regra p/ field_campaign_name) }

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
from common.preserve import preserve, preserve_dataset, preserve_layout
# Builders de seção compartilhados. O kpi-card fica no `kcard()` local: o semáforo
# tático (meta_status 5/15% + flag 3d) tem semântica própria — não é o goalCmp
# avaliativo (±10%) do km() de common.
from common.report import eb, fb

PCT = {'taxa_resp', 'taxa_qual', 'conv_pag', 'hook', 'hold', 'ctr', 'connect', 'taxa_bump'}
INT = {'leads', 'ingressos', 'ingressos_pago', 'ingressos_org', 'bumps'}  # contagem
MULT = {'roas_pago', 'roas_geral'}   # ROAS é MÚLTIPLO (1,49×), não dinheiro nem %
# Métricas de funil/mídia cujo alvo é um BENCHMARK (não uma meta da campanha).
# taxa_bump e conv_pag no pago são benchmarks FIXOS da mecânica (20% e 5%).
BENCH_METRICS = {'hook', 'hold', 'ctr', 'connect', 'conv_pag', 'cpm', 'taxa_bump',
                 'ticket_medio'}   # ticket-bench é derivado do bench de order bump
# Nome da taxa de cada transição do funil (alinhado às 5 transições de FUNNEL_STAGES).
FUNNEL_RATE = ['CTR', 'Connect Rate', 'Conv. de Página', 'Taxa de Resposta', 'Qualidade']
# Ícones limitados ao set do renderer (renderer.ts → ICONS).
ICON = {'leads': ('users', '#7C3AED'), 'investimento': ('coin', '#534AB7'), 'cpl': ('credit-card', '#185FA5'), 'cpmql': ('star', '#854F0B'),
        'taxa_resp': ('arrows-left-right', '#3B6D11'), 'taxa_qual': ('circle-check', '#534AB7'),
        'conv_pag': ('target', '#185FA5'), 'cpm': ('database', '#534AB7'), 'hook': ('bolt', '#EF9F27'),
        'hold': ('trending-up', '#854F0B'), 'ctr': ('trending-up', '#3B6D11'),
        'connect': ('refresh', '#185FA5'),
        # PAGO
        'exposicao': ('coin', '#3B6D11'), 'ingressos': ('users', '#7C3AED'),
        'ingressos_pago': ('credit-card', '#185FA5'), 'ingressos_org': ('users', '#3B6D11'),
        'custo_ing_pago': ('credit-card', '#185FA5'), 'custo_ing_geral': ('credit-card', '#534AB7'),
        'roas_pago': ('bolt', '#3B6D11'), 'roas_geral': ('bolt', '#3B6D11'),
        'receita_ing': ('coin', '#534AB7'), 'receita_bump': ('star', '#854F0B'),
        'taxa_bump': ('star', '#854F0B'), 'bumps': ('star', '#854F0B'),
        'ticket_medio': ('credit-card', '#854F0B'),
        'retorno_pago': ('database', '#3B6D11'), 'retorno_geral': ('database', '#3B6D11')}


# Números de DECISÃO do pago (posição de caixa, ticket): precisam do valor cheio.
# money() abrevia acima de mil (R$ 4.498,77 vira "R$ 4k") — perda de 12% na leitura de
# um saldo. money() é compartilhado por todos os tipos, então não se mexe nele: aqui
# essas métricas usam precisão total.
EXACT_MONEY = {'exposicao', 'retorno_pago', 'retorno_geral', 'ticket_medio'}

# (i) das métricas do PAGO. A diferença entre os pares confunde — ROAS×ROI e CAC×custo
# por ingresso não são a mesma conta em bases diferentes, e ler um pelo outro leva a
# decisão errada. O texto diz a FÓRMULA e o que muda entre eles.
INFO_PAGO = {
    'roas_pago': ('Retorno sobre a mídia contando SÓ a receita que veio de anúncio '
                  '(linhas com investimento) ÷ investimento. Lê-se como múltiplo: 3,00× = '
                  'cada R$ 1 de mídia virou R$ 3 de receita paga. É a eficiência isolada '
                  'da mídia, sem o orgânico ajudando.'),
    'roas_geral': ('Retorno contando TODA a receita — vendas do pago E do orgânico — ÷ '
                   'investimento em mídia. Fica acima do ROAS porque o orgânico entra na '
                   'receita sem custar mídia.'),
    'custo_ing_pago': ('Custo de aquisição: investimento ÷ ingressos vindos de anúncio. '
                       'É a eficiência da mídia, e é ESTE que vai contra a meta — o ticket '
                       'do ingresso define quanto se pode pagar.'),
    'custo_ing_geral': ('Investimento ÷ TODOS os ingressos, inclusive os orgânicos. É o custo '
                        'real da base e fica sempre abaixo do CAC, porque o orgânico dilui.'),
    'taxa_bump': ('Quantos order bumps foram vendidos para cada ingresso. É a alavanca que '
                  'melhora a exposição de caixa SEM custar mídia — cada bump é receita '
                  'incremental. Abaixo do benchmark é dinheiro deixado na mesa.'),
    'ingressos_pago': 'Ingressos vendidos a partir de tráfego pago (linhas com investimento).',
    'ingressos_org': 'Ingressos vendidos sem mídia paga — entram na receita sem custo de aquisição.',
    'ticket_medio': ('Receita total (ingressos + order bumps) ÷ ingressos vendidos. É o teto do '
                     'que se pode pagar para adquirir um ingresso: enquanto o CAC estiver abaixo '
                     'dele, cada venda a mais melhora a exposição de caixa. O bump entra na conta '
                     'porque também paga o tráfego.\n\n'
                     'O bench é o mesmo ticket com o order bump convertendo no benchmark: '
                     'preço do ingresso + (taxa de bump esperada × preço do bump), com os dois '
                     'preços tirados da própria base. A distância até ele é, em reais por '
                     'ingresso, o que o bump está deixando na mesa.'),
    'bumps': 'Quantidade de order bumps vendidos no período.',
    'investimento': 'Total gasto em mídia paga no período. É o denominador de ROAS, ROI e CAC.',
    'receita': ('Receita bruta total: ingressos + order bumps, antes de impostos, reembolso '
                'e taxa do broker. É a maior parcela positiva da exposição de caixa — o (i) '
                'do card de Exposição mostra o extrato completo.'),
    'receita_ing': 'Receita bruta da venda dos ingressos (faturamento_gen), antes de impostos e taxas.',
    'receita_bump': 'Receita bruta dos order bumps (faturamento_bump), antes de impostos e taxas.',
}


def money_exact(v):
    if v is None:
        return '—'
    s = f'{abs(v):,.2f}'.replace(',', '§').replace('.', ',').replace('§', '.')
    return f"{'-' if v < 0 else ''}R$ {s}"


def vfmt(metric, v, pago=False):
    """`pago=True` desabreviatura TODO valor monetário: no lançamento pago os reais são
    a decisão (caixa, ticket, receita), e "R$ 7k" para R$ 6.956,00 além de perder
    precisão contradiz o extrato do (i) da exposição, que lista o valor cheio."""
    if v is None:
        return '—'
    if metric in PCT:
        return pctf(v)
    if metric in MULT:
        return f'{v:.2f}×'.replace('.', ',')
    if metric in INT:
        return intf(v)
    if metric in EXACT_MONEY or pago:
        return money_exact(v)
    return money(v)


def assemble(rows, config, content, opts=None):
    config = config or {}
    B = calc.build(rows, config)
    # MECÂNICA: no lançamento PAGO o lead compra o ingresso — há receita e retorno já
    # na captação, e a decisão do dia vira "estou no verde ou no vermelho?". Troca os
    # KPIs, o funil e o vocabulário (lead → ingresso). Ver docs da spec.
    PAGO = B['pago']
    # Rótulos vêm do calc, não do módulo: alguns dependem do que a base tem
    # (ex.: sem pageviews, "Conv. de Página" vira "Cliques → Ingressos").
    LAB = B['labels']
    # Fecha o modo sobre o formatador: todo vfmt() daqui para baixo já sabe se é pago.
    # globals() porque o `def` abaixo torna `vfmt` local em toda a função.
    _vfmt = globals()['vfmt']

    def vfmt(metric, v):                                  # noqa: F811
        return _vfmt(metric, v, PAGO)
    dataset, sections, layouts = {}, {}, {}

    def add_table(name, dims, rows_):
        dataset[name] = {'dims': list(dims), 'filters': [], 'rows': rows_}

    def trend_delta(metric):
        tr = B['trend'].get(metric)
        if not tr or tr['dir'] == 'neutro':
            return '3d estável', 'neutral'
        arrow = '▲' if tr['dir'] == 'up' else '▼'
        # investimento: variação de gasto não é boa nem ruim → tom neutro
        if metric == 'investimento':
            tone = 'neutral'
        else:
            tone = 'pos' if tr.get('good') else ('neg' if tr.get('good') is False else 'neutral')
        return f"3d {arrow}{tr['pct']:.0f}%", tone

    def trend_badge(metric):
        """Versão verbosa do chip de tendência p/ cabeçalho de gráfico (tem espaço).
        Retorna (None, None) quando estável — gráfico não recebe badge."""
        tr = B['trend'].get(metric)
        if not tr or tr['dir'] == 'neutro':
            return None, None
        arrow = '▲' if tr['dir'] == 'up' else '▼'
        if metric == 'investimento':
            tone = 'neutral'
        else:
            tone = 'pos' if tr.get('good') else ('neg' if tr.get('good') is False else 'neutral')
        return f"{arrow} {tr['pct']:.0f}% nos últimos 3d", tone

    def kpi_sub(metric):
        parts = [f"3d {vfmt(metric, B['d3'].get(metric))}"]
        st = B['meta_status'].get(metric)
        meta = B['meta'].get(metric)
        if st and meta is not None:
            sym = {'ok': '✓', 'warn': '⚠', 'bad': '✕'}[st['cls']]
            parts.append(f"meta {vfmt(metric, meta)} · {st['dev']:+.0f}% {sym}")
        return ' · '.join(parts)

    def kcard(arr, pg, metric, prefix='k', w=2, sub=None):
        wid = f'{prefix}-{metric}'
        ic, color = ICON.get(metric, ('chart-bar', '#534AB7'))
        flag_txt, flag_tone = trend_delta(metric)
        card = {'id': wid, 'type': 'kpi-card', 'tier': 'feature',
                'label': LAB[metric], 'value': vfmt(metric, B['tot'].get(metric)),
                'icon': ic, 'iconColor': color}
        if sub:
            card['sub'] = sub
        if PAGO and INFO_PAGO.get(metric):
            card['info'] = INFO_PAGO[metric]
        if metric == 'cpmql':   # métrica-chave (maior correlação c/ vendas) em destaque roxo
            card['emph'] = True
        # tendência 3d (vs início) — inline ao lado do valor, presente em todas as métricas
        if flag_txt:
            card['flag'] = {'text': flag_txt, 'tone': flag_tone}
        # rodapé de meta + desvio com selo ✓/⚠/✕ (fixo no fim do card)
        st = B['meta_status'].get(metric)
        meta = B['meta'].get(metric)
        if st and meta is not None:
            glabel = 'Meta (proj.)' if metric == 'investimento' else ('Bench' if metric in BENCH_METRICS else 'Meta')
            card['goal'] = {'label': f"{glabel} {vfmt(metric, meta)}", 'delta': f"{st['dev']:+.0f}%", 'status': st['cls']}
        arr.append(card)
        # pg=None: o chamador posiciona à mão (pg.at) — layout 2D que o packer de
        # linha única não expressa, ex.: KPIs em duas linhas ao lado de um gráfico.
        if pg is not None:
            pg.add(wid, 'kpi-card', w, 2)   # w:2 → 6 KPIs numa linha só; h:2 — card compacto (h:4 desperdiçava metade da altura)

    def risk_blocks(arr, pg, risks, prefix):
        for i, r in enumerate(risks):
            impact = RISK_IMPACT.get(r['metric'], '')
            art = 'do benchmark' if r['metric'] in BENCH_METRICS else 'da meta'
            if r['reason'] == 'trend':
                up = r['trend_dir'] == 'up'
                txt = 'Em alta nos últimos 3 dias' if up else 'Em queda nos últimos 3 dias'
                stat = {'value': vfmt(r['metric'], r['value']), 'delta': txt, 'tone': 'warn'}
                # a seta segue a DIREÇÃO do movimento, não o fato de ser risco: um ↗ ao
                # lado de "em queda" faz o leitor duvidar de qual dos dois está certo.
                tag, tagColor = f"{'↗' if up else '↘'} {r['label']}", 'a'
                detail = f"Dentro {art}, mas piorando rápido nos últimos dias. {impact}"
            else:
                sym = '⚠' if r['cls'] == 'warn' else '✕'
                txt = f'Abaixo {art}' if r['meta_dev'] < 0 else f'Acima {art}'   # KPI / custo
                stat = {'value': vfmt(r['metric'], r['value']), 'delta': txt,
                        'tone': 'bad' if r['cls'] == 'bad' else 'warn'}
                tag, tagColor = f"{sym} {r['label']}", ('r' if r['cls'] == 'bad' else 'a')
                detail = impact
            fb(arr, pg, f'{prefix}-risk-{i}', tag, tagColor,
               f"{vfmt(r['metric'], r['value'])}", detail, w=6, h=2, stat=stat)

    def risk_section(arr, pg, risks, prefix, title):
        # eyebrow + cards de risco; quando não há risco, mostra um card de "tudo em
        # linha" em vez de seção vazia.
        if risks:
            eb(arr, pg, f'{prefix}-eb-risk', title, 'KPIs furando a meta ou em piora acelerada', n='!', color='red')
            risk_blocks(arr, pg, risks, prefix)
        else:
            eb(arr, pg, f'{prefix}-eb-risk', title, 'sem alertas no momento', n='✓', color='green')
            fb(arr, pg, f'{prefix}-risk-ok', '✓ Tudo em linha', 'g',
               'Indicadores em linha ou acima do planejado',
               'Nenhum KPI furando a meta nem em piora acelerada nos últimos 3 dias. Manter o ritmo e seguir monitorando.',
               w=12, h=2)

    # ── dataset diário (charts + bind direto no deep mode) ───────────────────
    # inclui TODAS as taxas diárias deriváveis (taxa_resp/conv_pag/ctr) p/ a IA poder
    # plotar a tendência por bind direto, sem precisar de uma consulta; hook/hold/connect
    # só entram quando a base tem vídeo/página (senão ficariam só null).
    _daily = []
    for d in B['days']:
        row = {'dia': d['label'], 'cum': d['cum'], 'leads': d['leads'], 'invest': round(d['sums']['invest'], 2),
               'cpl': d['cpl'], 'cpmql': d['cpmql'], 'taxa_qual': d['taxa_qual'], 'taxa_resp': d['taxa_resp'],
               'conv_pag': d['conv_pag'], 'cpm': d['cpm'], 'ctr': d['ctr']}
        if B['has_views']:
            row['hook'] = d['hook']; row['hold'] = d['hold']
        if B['has_pageviews']:
            row['connect'] = d['connect']
        if PAGO:
            # séries próprias do pago: ingressos (acumulado), a exposição POR DIA
            # (verde/vermelho) e a CUMULATIVA (melhorando ou piorando no tempo).
            row.update({'ingressos': d['ingressos'], 'cum_ing': d['cum_ing'],
                        'expo': d['exposicao'], 'expo_cum': d['expo_cum'],
                        'custo_ing_pago': d['custo_ing_pago'], 'roas_geral': d['roas_geral'],
                        'taxa_bump': d['taxa_bump']})
        _daily.append(row)
    add_table('acom_daily', ['dia'], _daily)
    sp = B['split']
    add_table('acom_origem', ['origem'],
              [{'origem': 'Pago', 'leads': B['tot']['ingressos_pago']},
               {'origem': 'Orgânico', 'leads': B['tot']['ingressos_org']}]
              if PAGO else
              [{'origem': 'Pago', 'leads': sp['leads_pago']},
               {'origem': 'Orgânico', 'leads': sp['leads_org']}])
    # canais orgânicos por utm_source (top 8) — alimenta o breakdown da seção Canais
    add_table('acom_canais', ['canal'], [{'canal': c['source'], 'leads': c['leads']}
                                         for c in B['canais_org'][:8]])
    # temperatura · tráfego pago — também vai pro dataset (não só o widget inline) p/ o
    # deep mode poder cruzar CPL/CPMQL/leads por temperatura (Quente/Morno/Frio)
    if B['temp']:
        add_table('acom_temp', ['temperatura'],
                  [{'temperatura': t, 'leads': v['leads'], 'invest': round(v['invest'], 2),
                    'cpl': v['cpl'], 'cpmql': v['cpmql']}
                   for t, v in B['temp'].items() if v.get('leads')])
    # agregados (não têm widget próprio; alimentam perguntas norteadoras + deep mode)
    add_table('acom_kpis', ['metric'], [
        {'metric': m, 'label': LAB[m], 'grupo': 'macro' if m in calc.KPI_MACRO else 'trafego',
         'value': B['tot'].get(m), 'd3': B['d3'].get(m), 'meta': B['meta'].get(m),
         'dev': (B['meta_status'].get(m) or {}).get('dev'), 'cls': (B['meta_status'].get(m) or {}).get('cls'),
         'trend_dir': B['trend'].get(m, {}).get('dir'), 'trend_pct': B['trend'].get(m, {}).get('pct')}
        for m in dict.fromkeys(calc.KPI_MACRO + B['traf_metrics'])])
    add_table('acom_funnel', ['etapa'], [
        {'etapa': s['label'], 'value': s['value'],
         'migracao': (s.get('trans') or {}).get('migracao'), 'bench': (s.get('trans') or {}).get('bench'),
         'gap': (s.get('trans') or {}).get('gap'), 'maior_furo': bool((s.get('trans') or {}).get('maior_furo'))}
        for s in B['funnel_total']])

    # ════ s01 — Visão Geral ════════════════════════════════════════════════
    pan, pg = [], Grid()
    # No PAGO o "lead" é um INGRESSO comprado — o vocabulário muda na interface toda.
    NOUN = 'ingressos' if PAGO else 'leads'
    eb(pan, pg, 'pan-eb-vg', 'CAPTAÇÃO',
       f"{NOUN} {'vendidos' if PAGO else 'captados'}, origem e atingimento de meta · dia {B['dia_campanha']} · dados até {B['corte_label']}")

    # acumulado (barras, últimas 3 destacadas) + linhas de meta + número-destaque
    mt = B['meta'].get('_ingressos_total' if PAGO else '_leads_total')
    mtd = B['meta'].get('_ingressos_td' if PAGO else '_leads_td')
    leads_tot = B['tot']['ingressos'] if PAGO else B['tot_sums']['leads']
    _labels = B['series']['labels']
    _cum = B['series']['cum']
    # META ACUMULADA DIA A DIA. A meta to-date diz onde a campanha deveria estar NO
    # CORTE; distribuída pelos dias decorridos ela vira o RITMO esperado, e a leitura
    # passa a ser "estou atrás desde quando?" em vez de uma reta que só significa
    # alguma coisa no último ponto. Só quando não há launch_goals (que traz a curva
    # real dia a dia) — aqui a única informação disponível é o total to-date.
    _meta_acum = None
    if mtd and _labels:
        _passo = mtd / len(_labels)
        _meta_acum = [round(_passo * (i + 1), 1) for i in range(len(_labels))]
    cum_chart = {'id': 'pan-cum', 'type': 'chart',
                 'title': 'Ingressos Vendidos · acumulado' if PAGO else 'Total de Leads Captados',
                 'headline': {'value': intf(leads_tot), 'caption': f"acumulado até {B['corte_label']}"},
                 'height': 230, 'categories': _labels}
    if _meta_acum:
        cum_chart.update({
            'chartType': 'mixed', 'colors': ['#534AB7', '#3B6D11'], 'dashLast': True,
            'series': [{'name': 'Acumulado', 'data': _cum, 'type': 'bar'},
                       {'name': f'Meta acumulada ({intf(mtd)} até {B["corte_label"]})',
                        'data': _meta_acum, 'type': 'line'}]})
    else:
        cum_chart.update({
            'chartType': 'bar', 'colors': ['#AFA9EC', '#534AB7'], 'highlightLast': 3,
            'series': [{'name': 'Acumulado', 'data': _cum, 'type': 'bar'}]})
    _plot = [v for v in _cum if isinstance(v, (int, float))] + (_meta_acum or [])
    _pmax = max(_plot) if _plot else 0
    # A meta TOTAL só entra no gráfico quando cabe na mesma escala. No meio da campanha
    # ela costuma ser uma ordem de grandeza acima do realizado — a linha sobe ao topo e
    # esmaga barras e ritmo contra o eixo, custando a leitura que o gráfico existe para
    # dar. O card "148 / 1.500" ao lado já carrega o total sem distorcer nada.
    if mt and _pmax and mt <= _pmax * 2:
        cum_chart['goalLines'] = [{'value': round(mt), 'label': f'Meta total ({intf(mt)})', 'color': '#EF9F27'}]
        _pmax = max(_pmax, mt)
    if _pmax:
        cum_chart['axisMax'] = round(_pmax * 1.06)
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
                    'sub': f'{NOUN} {"vendidos" if PAGO else "captados"} vs meta total da campanha',
                    'delta': f'{at:.1f}%', 'deltaTone': 'emph'})
        hero_lay.append({'id': 'pan-meta-geral', 'type': 'kpi-card', 'x': 5, 'y': ry, 'w': 7, 'h': 1}); ry += 1
    if mtd:
        atd = calc.pct(leads_tot, mtd) or 0
        # Meta To Date = performance vs o esperado p/ hoje → semáforo: ≥95% no rumo (verde),
        # 80–95% atenção (âmbar), <80% abaixo (vermelho). 98,4% deixa de ser âmbar.
        pan.append({'id': 'pan-meta-td', 'type': 'kpi-card', 'tier': 'feature', 'band': True,
                    'label': 'Atingimento · Meta To Date', 'value': f'{intf(leads_tot)} / {intf(mtd)}',
                    'sub': f'{NOUN} {"vendidos" if PAGO else "captados"} vs meta esperada até {B["corte_label"]}',
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

    if PAGO:
        # ── KPIs de RESULTADO — a decisão (escalar ou não) ────────────────────
        # A exposição vem primeiro e em destaque: é a métrica que comanda o dia.
        # Depois os dois recortes de eficiência (tráfego pago × geral), cada um com
        # ROAS (múltiplo) e retorno (reais líquidos) — coisas diferentes, lado a lado.
        eb(pan, pg, 'pan-eb-res', 'KPIS DE RESULTADO',
           'retorno já na captação — quanto a venda de ingressos paga o tráfego antes de abrir o carrinho')
        expo = B['tot'].get('exposicao')
        meta_expo = B['meta'].get('exposicao')
        # A fórmula sozinha não responde "de onde veio esse número". O (i) traz o
        # EXTRATO com o valor de cada parcela — é o que o consultor precisa quando o
        # caixa está no vermelho e ele quer saber qual linha pesou.
        _s = B['tot_sums']
        _linhas = [('Receita de ingressos', _s['fat_gen'], 1), ('Receita de order bumps', _s['fat_bump'], 1),
                   ('Reembolso', _s['refund_gen'] + _s['refund_bump'], -1),
                   ('Imposto sobre a venda', _s['stax_gen'] + _s['stax_bump'], -1),
                   ('Taxa do broker', _s['broker_gen'] + _s['broker_bump'], -1),
                   ('Investimento em mídia', _s['invest'], -1),
                   ('Imposto sobre a mídia', _s['ptax'], -1)]
        _w = max(len(n) for n, _, _ in _linhas)
        _extrato = '\n'.join(f"{'+' if sg > 0 else '−'} {n.ljust(_w)}  {money_exact(v)}"
                             for n, v, sg in _linhas if v)
        ecard = {'id': 'pan-expo', 'type': 'kpi-card', 'tier': 'feature', 'emph': True,
                 'label': LAB['exposicao'], 'value': vfmt('exposicao', expo),
                 'info': (f"{_extrato}\n{'─' * (_w + 16)}\n= {'Exposição de caixa'.ljust(_w)}  "
                          f"{vfmt('exposicao', expo)}\n\nPositivo: o ingresso já pagou o tráfego antes "
                          f"de abrir o carrinho. Negativo: caixa exposto — julgue contra a meta."),
                 'icon': 'coin', 'iconColor': '#3B6D11'}
        if expo is not None:
            ecard['flag'] = {'text': 'caixa positivo' if expo >= 0 else 'caixa exposto',
                             'tone': 'pos' if expo >= 0 else 'neg'}
        if meta_expo is not None and expo is not None:
            # meta de exposição é combinada com o cliente (default 0 = não expor caixa)
            ecard['goal'] = {'label': f"Meta {vfmt('exposicao', meta_expo)}",
                             'delta': ('acima' if expo >= meta_expo else 'abaixo'),
                             'status': 'ok' if expo >= meta_expo else 'bad'}
        pan.append(ecard)
        # Duas linhas com leituras diferentes: em cima o CAIXA em reais (o que sobrou e
        # o que foi gasto para chegar lá), embaixo os quatro múltiplos de eficiência.
        # O investimento sobe para cá porque é o denominador de ROAS, CAC e ROI — sem
        # ele à vista os múltiplos ficam sem escala: 1,49× sobre R$ 4 mil e sobre
        # R$ 400 mil são decisões diferentes.
        pg.add('pan-expo', 'kpi-card', 6, 2)
        # A linha de cima é a conta da exposição na ordem em que ela se forma: o que
        # entrou (receita), o que saiu (investimento) e o que sobrou (exposição, à
        # esquerda e em destaque, porque é a leitura que decide o dia).
        kcard(pan, pg, 'receita', w=3, sub='ingressos + order bumps')
        kcard(pan, pg, 'investimento', w=3, sub='mídia paga no período')
        # Estes quatro não são quatro irmãos: são DOIS pares (retorno × custo) em DOIS
        # recortes (só anúncio × tudo). Lado a lado como iguais, o leitor tem de
        # reconstruir esse pareamento a cada vez — e ler ROAS como se fosse ROI é
        # justamente o erro caro. A fonte resolvia com card dentro de card; aqui o
        # recorte vira um RÓTULO estreito sobre cada par, que é o que ele é: um
        # cabeçalho de subgrupo, não um container. Com o rótulo em cima, o escopo sai
        # do rodapé dos cards — repetido quatro vezes ele só reforçava a impressão de
        # que os quatro eram peças soltas do mesmo tipo.
        for wid, titulo, cap in (
                ('pan-eb-esc-pago', 'TRÁFEGO PAGO', 'só o que veio de anúncio'),
                ('pan-eb-esc-ger', 'PAGO + ORGÂNICO', 'toda a base, orgânico incluído')):
            eb(pan, pg, wid, titulo, cap, w=6, compact=True)
        for m, ret in (('roas_pago', 'retorno_pago'), ('custo_ing_pago', None),
                       ('roas_geral', 'retorno_geral'), ('custo_ing_geral', None)):
            sub = f"retorno líquido {vfmt(ret, B['tot'].get(ret))}" if ret else None
            kcard(pan, pg, m, w=3, sub=sub)

        risk_section(pan, pg, B['risks_macro'], 'pan', 'RISCOS IDENTIFICADOS')

        # ── KPIs INTERMEDIÁRIOS — a explicação (as alavancas do resultado) ─────
        # Duas linhas de três à ESQUERDA (dinheiro em cima, bump e qualidade embaixo) e
        # a origem do ingresso como pizza à DIREITA, ocupando as duas linhas: a
        # proporção pago × orgânico se lê de relance num setor, não em dois números
        # soltos que o olho ainda precisa dividir.
        eb(pan, pg, 'pan-eb-kpi', 'KPIS INTERMEDIÁRIOS',
           'as alavancas por trás do resultado · valor geral · 3 dias · tendência · meta')
        inter_y = pg.y + pg.rowh if pg.x else pg.y
        for i, m in enumerate(calc.KPI_INTER_PAGO):
            wid = f'k-{m}'
            kcard(pan, None, m, w=2)                     # card sem layout automático…
            pg.at(wid, 'kpi-card', (i % 3) * 2, inter_y + (i // 3) * 2, 2, 2)   # …posicionado à mão
        pan.append({'id': 'pan-donut-orig', 'type': 'chart', 'chartType': 'donut',
                    'title': 'Origem do ingresso', 'height': 240,
                    'colors': ['#534AB7', '#97C459'], 'donutTotal': True, 'totalLabel': 'ingressos',
                    'legendValues': True,
                    'bind': {'dataset': 'acom_origem', 'x': 'origem', 'y': 'leads'}})
        pg.at('pan-donut-orig', 'chart', 6, inter_y, 6, 4)
        pg.cursor_to(inter_y + 4)
    else:
        eb(pan, pg, 'pan-eb-kpi', 'KPIS MACRO', '6 indicadores · valor geral · 3 dias · tendência · meta')
        for m in calc.KPI_MACRO:
            kcard(pan, pg, m)

        risk_section(pan, pg, B['risks_macro'], 'pan', 'PRINCIPAIS RISCOS')

    sections['s01'] = {'id': 's01', 'header': {'badge': 'Visão Geral', 'title': B['nome'],
                       'sub': f"Acompanhamento tático · dia {B['dia_campanha']} · emitido {B['report_date'] or '—'}"}, 'widgets': pan}
    layouts['s01'] = pg.items

    # ════ s02 — Evolução Diária ════════════════════════════════════════════
    # (o eyebrow do grupo é o divisor injetado no merge — não duplicar aqui)
    evo, eg = [], Grid()

    def chart_def(title, y, ctype, pct, vf, color='#534AB7', goals=None,
                  names=None, sec=None, secSuffix=None, colors=None, types=None, height=280):
        c = {'chartType': ctype, 'title': title, 'height': height,
             'pct': pct, 'valueFormat': vf, 'bind': {'dataset': 'acom_daily', 'x': 'dia', 'y': y}}
        if colors:
            c['colors'] = colors
        elif ctype == 'bar':
            c['colors'] = ['#AFA9EC', '#534AB7']; c['highlightLast'] = 3   # últimas 3 = roxo forte
        else:
            c['colors'] = [color]
        if names:
            c['seriesNames'] = names
        if types:
            c['seriesTypes'] = types
        if sec is not None:
            c['secondaryAxis'] = sec
            if secSuffix:
                c['secondaryAxisSuffix'] = secSuffix
        if goals:
            gl = [g for g in goals if g.get('value') is not None]
            if gl:
                c['goalLines'] = gl
        return c

    def chart(wid, title, y, ctype, pct, vf, color='#534AB7', w=6, trendkey=None,
              goals=None, names=None, sec=None, secSuffix=None, colors=None, types=None):
        c = dict({'id': wid, 'type': 'chart'},
                 **chart_def(title, y, ctype, pct, vf, color, goals, names, sec, secSuffix,
                             colors, types))
        if trendkey:
            txt, tone = trend_badge(trendkey)
            if txt:
                c['badge'] = {'text': txt, 'tone': tone}
        evo.append(c)
        eg.add(wid, 'chart', w, 4)

    def ctoggle(wid, title, specs, w=6):
        """Um cartão, N séries em ABAS — para métricas que não podem dividir eixo
        (R$ × múltiplo, 28% × 1,6%). Sobrepor achataria a menor contra o eixo."""
        # o rótulo da série vem da ABA: sem título no gráfico, a legenda cairia no nome
        # cru da coluna ("ctr", "custo_ing_pago").
        evo.append({'id': wid, 'type': 'chart-toggle', 'title': title,
                    'tabs': [{'label': lbl,
                              # a barra de abas come altura que o gráfico interno não
                              # desconta sozinho — sem isso o card vaza alguns px
                              'chart': chart_def(None, y, ct, pct, vf, col or '#534AB7', gl,
                                                 names=[lbl], height=248)}
                             for lbl, y, ct, pct, vf, col, gl in specs]})
        eg.add(wid, 'chart-toggle', w, 4)
    if PAGO:
        # A evolução do pago acompanha a MECÂNICA do pago: CPL e CPMQL não existem aqui
        # (viraram CAC), e o que se lê dia a dia é se o caixa está virando.
        #
        # NOVE séries em nove cartões viram mais moldura do que dado numa campanha de
        # poucos dias. Aqui elas cabem em QUATRO, sem perder nenhuma:
        #   • quando as unidades convivem, as séries entram no MESMO gráfico e passam a
        #     se ler juntas (venda × gasto; exposição do dia × acumulada);
        #   • quando não convivem, vão para ABAS — sobrepor CTR de 1,6% com qualidade de
        #     28% achataria a primeira contra o eixo, que é perder o dado de fato.
        _fb, _mexpo = B['fb'], B['meta'].get('exposicao')
        _bt, _bc = _fb.get('taxa_bump'), _fb.get('ctr')
        _mq = B['meta'].get('taxa_qual')
        # 1) O par que responde "vale a pena?": o que entrou e o que saiu, no mesmo dia.
        chart('evo-ing-inv', 'Ingressos × Investimento por dia', ['ingressos', 'invest'],
              'mixed', False, 'int', w=6, trendkey='ingressos',
              names=['Ingressos', 'Investimento (R$)'], sec=[1], secSuffix=' R$',
              colors=['#534AB7', '#EF9F27'], types=['bar', 'line'])
        # 2) Exposição: a barra do dia mostra o fôlego diário, a linha acumulada mostra
        #    a posição — e a leitura que importa é uma CONTRA a outra (um dia ruim
        #    depois de semanas boas não é o mesmo que um dia ruim no vermelho).
        chart('evo-expo', 'Exposição de caixa · por dia e acumulada', ['expo', 'expo_cum'],
              'mixed', False, 'money', w=6, trendkey='exposicao',
              names=['Exposição do dia', 'Acumulada'], types=['bar', 'line'],
              colors=['#97C459', '#3B6D11'],
              goals=[{'value': _mexpo, 'label': 'Ponto de equilíbrio', 'color': '#B3261E'}]
              if _mexpo is not None else None)
        # 3) e 4) Abas: R$ com múltiplo, e três percentuais de escalas distantes.
        ctoggle('evo-efic', 'Custo e retorno por dia', [
            ('CAC', 'custo_ing_pago', 'line', False, 'money', '#185FA5', None),
            ('ROI', 'roas_geral', 'line', False, 'x', '#3B6D11',
             [{'value': 1.0, 'label': 'Equilíbrio 1,00×', 'color': '#B3261E'}]),
        ], w=6)
        ctoggle('evo-taxas', 'Taxas vs. referência', [
            ('Qualidade', 'taxa_qual', 'line', True, 'pct', '#EF9F27',
             [{'value': _mq, 'label': 'Meta'}] if _mq else None),
            ('Order Bump', 'taxa_bump', 'bar', True, 'pct', None,
             [{'value': _bt, 'label': 'Bench', 'color': '#854F0B'}] if _bt else None),
            ('CTR', 'ctr', 'line', True, 'pct', '#534AB7',
             [{'value': _bc, 'label': 'Bench', 'color': '#854F0B'}] if _bc else None),
        ], w=6)
        _sub = ('Ingressos × investimento, exposição de caixa (dia e acumulada), '
                'custo e retorno, e as taxas contra a referência.')
    else:
        chart('evo-leads', 'Leads por dia', 'leads', 'bar', False, 'int', w=6, trendkey='leads')
        chart('evo-invest', 'Investimento por dia (R$)', 'invest', 'bar', False, 'money', w=6, trendkey='investimento')
        chart('evo-cpl', 'CPL por dia (R$)', 'cpl', 'area', False, 'money', '#EF4444', w=4, trendkey='cpl')
        chart('evo-qual', 'Taxa de Qualidade (%)', 'taxa_qual', 'area', True, 'pct', '#EF9F27', w=4, trendkey='taxa_qual')
        chart('evo-cpmql', 'CPMQL por dia (R$)', 'cpmql', 'area', False, 'money', '#EF4444', w=4, trendkey='cpmql')
        _sub = 'Leads, investimento, CPL, qualidade e CPMQL ao longo dos dias.'
    sections['s02'] = {'id': 's02', 'header': {'badge': 'Evolução', 'title': 'Evolução Diária',
                       'sub': _sub}, 'widgets': evo}
    layouts['s02'] = eg.items

    # ════ s03 — Canais & Audiência ═════════════════════════════════════════
    can, cg = [], Grid()
    # Origem do Tráfego (bar-list hierárquico: Pago/Orgânico + canais) + Temperatura
    # (bar-list + cards de CPL médio) — 2 colunas. Widget único 'bar-list'.
    eb(can, cg, 'can-eb-orig', 'ORIGEM E TEMPERATURA', 'distribuição dos leads')
    sp = B['split']; tot_leads = sp['leads_pago'] + sp['leads_org']
    orig_rows = [
        {'label': 'Pago', 'value': intf(sp['leads_pago']), 'pct': calc.pct(sp['leads_pago'], tot_leads) or 0,
         'bar': sp['leads_pago'], 'icon': 'credit-card', 'color': '#7C3AED'},
        {'label': 'Orgânico', 'value': intf(sp['leads_org']), 'pct': calc.pct(sp['leads_org'], tot_leads) or 0,
         'bar': sp['leads_org'], 'icon': 'sprout', 'color': '#A78BFA'},
    ]
    co = B['canais_org']
    for c in co[:5]:
        orig_rows.append({'label': c['source'], 'value': intf(c['leads']), 'pct': c.get('pct') or 0,
                          'bar': c['leads'], 'indent': True, 'color': '#C3A4F7'})
    if co[5:]:   # agrupa os canais além do top 5 num "Outros" final
        ro = sum(c['leads'] for c in co[5:])
        orig_rows.append({'label': 'Outros', 'value': intf(ro), 'pct': calc.pct(ro, sp['leads_org']) or 0,
                          'bar': ro, 'indent': True, 'color': '#C3A4F7'})
    can.append({'id': 'can-orig', 'type': 'bar-list', 'title': 'Origem do Tráfego', 'rows': orig_rows})
    cg.add('can-orig', 'bar-list', 6, 4)
    # temperatura — bar-list (Quente/Morno) + cards de stat com CPL médio em destaque
    if B['temp']:
        TC = {'Quente': '#DC2626', 'Morno': '#EA580C', 'Frio': '#2563EB', 'Indefinido': '#9b98a3'}
        TI = {'Quente': 'flame', 'Morno': 'sun', 'Frio': 'snowflake'}
        TT = {'Quente': 'red', 'Morno': 'orange', 'Frio': 'blue', 'Indefinido': 'purple'}
        temp_items = [(t, v) for t, v in B['temp'].items() if v.get('leads')]
        temp_tot = sum(v['leads'] for _, v in temp_items) or 1
        temp_rows = [{'label': t, 'value': intf(v['leads']), 'pct': calc.pct(v['leads'], temp_tot) or 0,
                      'bar': v['leads'], 'icon': TI.get(t), 'color': TC.get(t, '#7C3AED')} for t, v in temp_items]
        temp_cards = [{'label': t, 'tone': TT.get(t, 'purple'), 'icon': TI.get(t),
                       'stats': [{'label': 'Leads', 'value': intf(v['leads'])},
                                 {'label': 'Invest', 'value': money(v['invest'])},
                                 {'label': 'CPL', 'value': vfmt('cpl', v['cpl'])}],
                       'headline': {'label': 'CPMQL médio', 'value': vfmt('cpmql', v['cpmql'])}} for t, v in temp_items]
        can.append({'id': 'can-temp', 'type': 'bar-list', 'title': 'Temperatura · tráfego pago', 'rows': temp_rows, 'cards': temp_cards})
        cg.add('can-temp', 'bar-list', 6, 4)
    # tipo de lead (6 células como kpi-cards)
    tl = B['tipo_lead']
    eb(can, cg, 'can-eb-tipo', 'TIPO DE LEAD', 'novos, antigos e clientes por origem')
    # barras 100% por categoria, divididas Pago / Orgânico — mostra quem domina cada
    # categoria de lead (novos = pago, clientes = orgânico, etc.)
    leads_base = tl['novos'] + tl['antigos']

    def tl_seg(pago, org, tot):
        pp, po = calc.pct(pago, tot) or 0, calc.pct(org, tot) or 0
        return [{'pct': pp, 'color': '#7C3AED', 'label': f'{pp:.0f}%'},
                {'pct': po, 'color': '#639922', 'label': f'{po:.0f}%'}]
    tl_rows = [
        {'label': 'Leads Novos', 'value': intf(tl['novos']), 'pct': calc.pct(tl['novos'], leads_base),
         'seg': tl_seg(tl['novos_pago'], tl['novos_org'], tl['novos'])},
        {'label': 'Leads Antigos', 'value': intf(tl['antigos']), 'pct': calc.pct(tl['antigos'], leads_base),
         'seg': tl_seg(tl['antigos_pago'], tl['antigos_org'], tl['antigos'])},
        {'label': 'Clientes', 'value': intf(tl['cli_total']), 'pct': calc.pct(tl['cli_total'], leads_base),
         'seg': tl_seg(tl['cli_pago'], tl['cli_org'], tl['cli_total'])},
    ]
    can.append({'id': 'can-tl', 'type': 'bar-list', 'rows': tl_rows,
                'legend': [{'label': 'Pago', 'color': '#7C3AED'}, {'label': 'Orgânico', 'color': '#639922'}]})
    cg.add('can-tl', 'bar-list', 12, 3)
    # criativos do último dia (best/worst)
    cr = B['criativos']
    if cr['best'] or cr['eff']:
        # No PAGO o critério de "melhor criativo" muda: volume de lead não decide nada
        # quando o lead já pagou. O que decide é quanto cada anúncio devolveu do que
        # custou — por isso o par vira melhor × pior EXPOSIÇÃO, e o ROAS aparece na
        # linha sem ordenar (múltiplo alto sobre verba minúscula não move o caixa).
        eb(can, cg, 'can-eb-cri', 'CRIATIVOS',
           (f"melhor e pior exposição de caixa · campanha até {B['corte_label']}" if PAGO
            else f"maior volume e maior qualificação · campanha até {B['corte_label']}"))

        def cri_expo_rows(lst):
            rows = []
            for c in lst:
                nb = c['bumps']
                meta = (f"{money_exact(c['invest'])} invest · CAC {vfmt('custo_ing_pago', c['cpl'])} · "
                        f"ROAS {vfmt('roas_pago', c['roas'])} · {intf(nb)} bump{'' if nb == 1 else 's'}")
                rows.append({'name': c['name'], 'link': c.get('link') or None, 'meta': meta,
                             'stats': [{'value': intf(c['leads']), 'label': 'ingressos'},
                                       {'value': money_exact(c['expo']), 'label': 'exposição',
                                        'tone': 'pos' if c['expo'] >= 0 else 'neg'}]})
            return rows

        def cri_list_rows(lst, eff=False):
            rows = []
            for c in lst:
                if eff:
                    meta = (f"R$ {intf(c['invest'])} invest · CPL {vfmt('cpl', c['cpl'])} · "
                            f"CPMQL {vfmt('cpmql', c['cpmql_proj'])} · {intf(c['respostas'])} resp.")
                    stat2 = {'value': pctf(c['taxa_qual']), 'label': 'qualificação', 'tone': 'pos'}
                else:
                    meta = f"R$ {intf(c['invest'])} invest · CPL {vfmt('cpl', c['cpl'])} · TQ {pctf(c['taxa_qual'])}"
                    stat2 = {'value': vfmt('cpmql', c['cpmql_proj']), 'label': 'CPMQL proj.', 'tone': 'neg'}
                rows.append({'name': c['name'], 'link': c.get('link') or None, 'meta': meta,
                             'stats': [{'value': intf(c['leads']), 'label': 'leads'}, stat2]})
            return rows
        # Escopos do toggle: ATIVO = gastou no último dia com verba (segue no ar);
        # INATIVO = não gastou (pausado/encerrado). O top-3 é rankeado dentro de cada
        # escopo — ver calc._creatives. Escopo vazio não vira aba.
        n = cr.get('n') or {}
        ult = cr.get('ultimo_dia_label') or ''
        SCOPES = [('ativo', 'Ativo'), ('inativo', 'Inativo'), ('todos', 'Todos')]

        def cri_tabs(key, eff=False, expo=False):
            tabs = []
            for sk, slabel in SCOPES:
                lst = ((cr.get('by_scope') or {}).get(sk) or {}).get(key) or []
                if not lst:
                    continue
                rows = cri_expo_rows(lst) if expo else cri_list_rows(lst, eff=eff)
                tabs.append({'label': slabel, 'rows': rows})
            return tabs

        ativo_nota = (f'Ativo = gastou em {ult}, o último dia com verba '
                      f'({n.get("ativo", 0)} de {n.get("todos", 0)} criativos).' if ult else '')
        EXPO_NOTA = ('Exposição por criativo = receita (ingresso + bump) − investimento. '
                     'Aproximação: impostos, reembolso e taxa do broker não têm rateio por '
                     'anúncio e ficam de fora — serve para ordenar, não para fechar caixa.')
        if PAGO:
            for wid, key, title, cap in (
                    ('can-cri-best', 'top_expo', 'Melhor exposição de caixa', ativo_nota),
                    ('can-cri-eff', 'bot_expo', 'Pior exposição de caixa', EXPO_NOTA)):
                tabs = cri_tabs(key, expo=True)
                if tabs:
                    can.append({'id': wid, 'type': 'cri-list', 'title': title,
                                'caption': cap or None, 'tabs': tabs})
                    cg.add(wid, 'cri-list', 6, 4)
        else:
            if cr['best']:
                tabs = cri_tabs('best')
                if tabs:
                    can.append({'id': 'can-cri-best', 'type': 'cri-list', 'title': 'Maior volume',
                                'caption': ativo_nota or None, 'tabs': tabs})
                    cg.add('can-cri-best', 'cri-list', 6, 4)
            if cr['eff']:
                tabs = cri_tabs('eff', eff=True)
                if tabs:
                    can.append({'id': 'can-cri-eff', 'type': 'cri-list', 'title': 'Maior qualificação',
                                'caption': 'Corte: só criativos com ≥ 20 respostas de pesquisa — base mínima para a taxa de qualidade ser confiável.',
                                'tabs': tabs})
                    cg.add('can-cri-eff', 'cri-list', 6, 4)
    sections['s03'] = {'id': 's03', 'header': {'badge': 'Canais', 'title': 'Canais e Audiência',
                       'sub': 'Origem, temperatura, tipo de lead e criativos do último dia.'}, 'widgets': can}
    layouts['s03'] = cg.items

    # ════ s04 — Tráfego Pago ═══════════════════════════════════════════════
    tra, tg = [], Grid()
    eb(tra, tg, 'tra-eb-kpi', 'INDICADORES DE TRÁFEGO PAGO',
       'qualidade da mídia' if PAGO else 'mídia + custo e qualidade do lead pago')
    # mídia (omite hook/hold/connect sem dado) + conversão, em LINHAS UNIFORMES:
    # 12÷(nº da linha) → larguras iguais por linha. Ex.: no fallback (7 cards) vira
    # 4 em cima (w3) + 3 embaixo (w4), em vez de fluir 5+2 com larguras desiguais.
    # No PAGO ficam SÓ as métricas de mídia: CPL/CPMQL não existem (viraram custo por
    # ingresso, já nos KPIs de Resultado) e resposta/qualidade estão nos Intermediários.
    traf = (list(B['traf_metrics']) if PAGO
            else list(dict.fromkeys([*B['traf_metrics'], 'cpl', 'taxa_resp', 'taxa_qual', 'cpmql'])))
    # Métrica sem a coluna na base não vira card: um "—" ocupa o mesmo espaço de um
    # indicador real e obriga a ler o rodapé para descobrir que não é um resultado ruim,
    # é ausência de dado. O que falta na origem é assunto do dicionário, não do painel.
    n = len(traf)
    if n <= 4:
        counts = [n]
    elif n <= 8:
        top = (n + 1) // 2
        counts = [top, n - top]
    else:
        a = (n + 2) // 3
        b = (n - a + 1) // 2
        counts = [a, b, n - a - b]
    i = 0
    for c in counts:
        w = max(2, 12 // c)
        for _ in range(c):
            kcard(tra, tg, traf[i], 'kt', w=w)
            i += 1
    risk_section(tra, tg, B['risks_traf'], 'tra', 'RISCOS DE TRÁFEGO')
    # funis (total + últimos 3 dias) como tabelas — caption reflete as etapas reais
    # (sem Pageviews quando a base não tem o dado)
    eb(tra, tg, 'tra-eb-fun', 'FUNIL DE TRÁFEGO PAGO', ' → '.join(s['label'] for s in B['funnel_total']))

    def funnel_widget(wid, title, sub, stages, w=6):
        # Widget de funil visual: barras degradê por etapa + pills perda/migram por
        # transição + MAIOR FURO (relativo ao benchmark) + dado inválido.
        steps = [dict({'label': s['label'], 'value': s['value']},
                      **({'vlabel': money_exact(s['value'])} if s.get('money') else {}))
                 for s in stages]
        trans = []
        for i in range(len(stages) - 1):
            tr = stages[i].get('trans') or {}
            if tr.get('invalid'):
                trans.append({'invalid': True})
            elif 'nota_cpm' in tr:
                # Investimento → Impressões: o "câmbio" de reais para alcance. Custo
                # MENOR é melhor, então o tom inverte em relação às taxas de passagem.
                cpm, bm, gap = tr.get('nota_cpm'), tr.get('bench'), tr.get('gap')
                txt = f"CPM {vfmt('cpm', cpm)}" if cpm is not None else 'CPM —'
                if bm is not None:
                    txt += f" · bench {vfmt('cpm', bm)}"
                tone = 'neutral' if gap is None else ('neg' if gap > 15 else ('warn' if gap > 0 else 'pos'))
                t = {'note': txt, 'noteTone': tone}
                if tr.get('maior_furo'):
                    t['note'] += ' · MAIOR FURO'
                    t['noteTone'] = 'neg'
                trans.append(t)
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
        wg = {'id': wid, 'type': 'funnel', 'title': title, 'sub': sub, 'steps': steps, 'transitions': trans}
        # Bifurcação: no pago o ingresso segue por DOIS caminhos paralelos a partir da
        # última etapa (vira MQL na pesquisa · compra order bump). Verde no bump porque
        # é receita incremental; roxo no MQL porque é qualificação, não dinheiro.
        fork = (stages[-1].get('fork') if stages else None) or []
        if fork:
            wg['branches'] = [{'label': f['label'], 'value': f['value'], 'migrate': f['migracao'],
                               **({'bench': f['bench'], 'baseLabel': 'bench'} if f.get('bench') else {}),
                               'color': '#0F7A54' if f['key'] == 'bumps_pago' else '#4A3F9E'}
                              for f in fork]
        tra.append(wg)
        tg.add(wid, 'funnel', w, 9 if fork else 7)
    funnel_widget('tra-fun-tot', 'Funil Total da Campanha', f"{B['n_dias']} dias", B['funnel_total'])
    funnel_widget('tra-fun-3d', 'Funil · Últimos 3 dias', 'dias recentes', B['funnel_3d'])
    sections['s04'] = {'id': 's04', 'header': {'badge': 'Tráfego', 'title': 'Indicadores de Tráfego Pago',
                       'sub': f"{', '.join(LAB[m] for m in B['traf_metrics'])} e funil de conversão."}, 'widgets': tra}
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
            dw = {'id': did, 'type': 'eyebrow', 'title': divider, 'divider': True}
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
    data_json = {'meta': {'client': config['client'], 'client_name': config.get('client_name') or config['client'],
                          'campaign_label': config.get('campaign_label') or '',
                          'data_ate': B['corte_label'],   # chip "Dados até DD/MM" na navbar
                          'title': config['title'], 'type': 'dashboard',
                          'theme': 'light', 'created_at': created, 'filters': [],
                          'cover': {'eyebrow': f"{config.get('client_name') or config['client']} · Relatório", 'title': config['title'],
                                    'meta': [f"Dia {B['dia_campanha']} de campanha", f"{intf(B['tot_sums']['leads'])} leads captados"]},
                          # sem meta.controls: o tipo não tem render_view.py nem controls no client
                          'nav': 'sidebar'},
                 'pages': pages}
    return {'dataset': dataset, 'data': data_json,
            'layout': {'sections': layouts, 'updatedAt': f'{created}T00:00:00.000Z'},
            'sections': sections}


RISK_IMPACT = {
    'investimento': 'Pressiona o ROI e aumenta o risco: o resultado passa a depender mais de a conversão vir em linha com o planejado.',
    'leads': 'Entrada de leads desacelerando frente à meta — risco de não formar base suficiente até o fim da captação.',
    'cpm': 'Mídia mais cara para entregar impressões — reduz o alcance possível com o mesmo budget.',
    'cpl': 'Custo de entrada do lead acima do planejado — dificulta atingir as metas de volume com o budget disponível.',
    'cpmql': 'Indicador com maior correlação com vendas — a projeção de retorno está pressionada e a probabilidade de ROI positivo reduzindo.',
    'taxa_resp': 'Amostra insuficiente para o nível de mapeamento da base — dificulta a qualificação e a projeção de conversão.',
    'taxa_qual': 'Base captada pior do que o planejado — pode afetar a conversão, pois o público tem perfil diferente do esperado.',
    'conv_pag': 'Funil com vazamento — leads e investimento perdidos no caminho. Pode ser incongruência criativo × página ou página fraca.',
    'hook': 'Anúncios pouco interessantes — a maioria passa sem parar para assistir. Revisar o criativo de abertura.',
    'hold': 'O anúncio chama atenção mas não sustenta — as pessoas saem antes do convite. Fortalecer o corpo do vídeo.',
    'ctr': 'Baixo interesse no convite do anúncio — incongruência entre anúncio e oferta, ou convite pouco atrativo.',
    'connect': 'Pessoas clicam mas não chegam na página — provável problema de velocidade ou performance técnica da página.',
    # PAGO — o impacto é sempre traduzido para a exposição de caixa, que é a decisão
    # do dia nessa mecânica (escalar ou segurar), não para volume de lead.
    'exposicao': 'Caixa exposto: a venda de ingressos ainda não cobriu o que foi gasto em mídia. Cada dia nesse ritmo aumenta o valor em risco antes de abrir o carrinho.',
    'custo_ing_pago': 'O custo de aquisição do ingresso pressiona a exposição de caixa e come a margem antes mesmo da abertura do carrinho.',
    'custo_ing_geral': 'Mesmo diluído no orgânico o ingresso sai caro — sinal de que o orgânico não está compensando o custo da mídia.',
    'roas_pago': 'O tráfego pago não está se pagando: a receita das linhas com investimento ficou abaixo do que elas custaram.',
    'roas_geral': 'A venda de ingressos ainda não paga o tráfego — abaixo de 1,00× cada real investido aumenta a exposição de caixa.',
    'taxa_bump': 'Order bump convertendo abaixo do benchmark — receita incremental perdida, e é a alavanca que aliviaria a exposição sem custar mídia.',
    'ticket_medio': 'O ticket define o teto do que se pode pagar por ingresso — quando ele cede, o CAC sustentável aperta junto.',
    'ingressos': 'Ritmo de venda de ingressos define se a base se forma até o fim da captação.',
    'receita_ing': 'É a maior parcela positiva da exposição de caixa — quando cede, o caixa sente na hora.',
    'receita_bump': 'Parcela que entra sem custo de mídia — perder aqui é perder margem limpa.',
    'receita': 'Entra direto na exposição de caixa — é o lado positivo da conta que paga o tráfego.',
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
