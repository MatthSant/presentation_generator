"""Banco de perguntas norteadoras da Análise de Criativos (Meta Ads).

As 12 perguntas de aprofundamento do documento-fonte (Notion → seção "Perguntas
de Aprofundamento"), em dois focos: Captação em Andamento e Resultado Final.

Cada pergunta pontua a PRÓPRIA relevância (0–100) sobre `cr_creatives` — a tabela
numérica por criativo já calculada pelo build_report (hook/hold/ctr/cpm/connect/
conversão de página/qualidade/taxa de resposta/cpl/cpmql/cac/roas/retorno…). A
relevância só ranqueia o que vale aprofundar; o `prompt` é o "caminho de resposta"
que guia o detalhamento (números sempre via bind, nunca inventados).
"""

TYPE = 'criativos'

# Benchmarks de anúncio (iguais ao calc.BENCH). O resto usa a média/mediana do conjunto.
BENCH = {'hook_rate': 30.0, 'hold_rate': 25.0}

_KEYS = ['hook_rate', 'hold_rate', 'ctr', 'cpm', 'connect_rate', 'conv_pagina',
         'qualidade', 'tx_resposta', 'cpl', 'cpmql', 'cac', 'roas', 'retorno',
         'leads', 'vendas', 'invest', 'conv', 'videoviews']


def detect(dataset):
    return 'cr_creatives' in dataset


# ───────────────────────── parsing / estatística ─────────────────────────

def _f(v):
    if isinstance(v, bool):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _avg(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def _med(xs):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


def _corr(xs, ys):
    pairs = [(a, b) for a, b in zip(xs, ys) if a is not None and b is not None]
    n = len(pairs)
    if n < 3:
        return None
    mx = sum(p[0] for p in pairs) / n
    my = sum(p[1] for p in pairs) / n
    cov = sum((p[0] - mx) * (p[1] - my) for p in pairs)
    vx = sum((p[0] - mx) ** 2 for p in pairs)
    vy = sum((p[1] - my) ** 2 for p in pairs)
    if vx <= 0 or vy <= 0:
        return None
    return cov / (vx ** 0.5 * vy ** 0.5)


def _nz(x, ref):
    """Normaliza uma magnitude para 0–100 (satura em ref)."""
    if x is None or ref in (None, 0):
        return 0.0
    return max(0.0, min(100.0, abs(x) / ref * 100))


def _pctf(v):
    return '—' if v is None else f'{v:.1f}%'


def _xf(v):
    return '—' if v is None else f'{v:.2f}×'


def _money(v):
    return '—' if v is None else f'R$ {v:.2f}'


def build_ctx(dataset):
    rows = dataset.get('cr_creatives', {}).get('rows', [])
    cre = []
    for r in rows:
        c = {k: _f(r.get(k)) for k in _KEYS}
        c['name'] = r.get('criativo')
        c['is_video'] = bool(r.get('is_video'))
        cre.append(c)
    col = lambda k: [c[k] for c in cre]
    avg = {k: _avg(col(k)) for k in _KEYS}
    med = {k: _med(col(k)) for k in _KEYS}
    return {'cre': cre, 'n': len(cre), 'avg': avg, 'med': med, 'col': col}


# ───────────────────────── perguntas — Captação ─────────────────────────

_FUNIL = ['hold_rate', 'ctr', 'conv_pagina', 'qualidade']


def q_hook_funil(ctx):
    med = ctx['med']
    cre = [c for c in ctx['cre'] if c['hook_rate'] is not None]
    flagged = [c for c in cre
               if (c['hook_rate'] or 0) >= (med['hook_rate'] or 0)
               and any(c[k] is not None and med[k] is not None and c[k] < med[k] for k in _FUNIL)]
    n, tot = len(flagged), max(1, len(cre))
    return {'relevancia': round(min(100, n / tot * 150), 1),
            'justificativa': f'{n} criativo(s) com hook acima da média mas que perdem em hold/CTR/conversão de página ou qualidade.',
            'kpis': [{'label': 'Sinalizados', 'value': str(n)},
                     {'label': 'Hook médio', 'value': _pctf(ctx['avg']['hook_rate'])},
                     {'label': 'Hold médio', 'value': _pctf(ctx['avg']['hold_rate'])}]}


def q_corr_qualif(ctx):
    q = ctx['col']('qualidade')
    best, blab = 0.0, '—'
    for k, lab in [('hook_rate', 'Hook'), ('hold_rate', 'Hold'), ('ctr', 'CTR'), ('cpm', 'CPM')]:
        c = _corr(ctx['col'](k), q)
        if c is not None and abs(c) > abs(best):
            best, blab = c, lab
    return {'relevancia': round(_nz(best, 0.6), 1),
            'justificativa': f'Entre os indicadores até o clique, {blab} é o que mais se relaciona com a qualificação (correlação {best:+.2f}).' if blab != '—' else 'Poucos criativos para medir relação com a qualificação.',
            'kpis': [{'label': 'Mais ligado à qualidade', 'value': blab},
                     {'label': 'Correlação', 'value': f'{best:+.2f}' if blab != '—' else '—'}]}


def q_oportunidade(ctx):
    avg = ctx['avg']
    gaps = []
    for k, lab, bench in [('hook_rate', 'Hook', BENCH['hook_rate']), ('hold_rate', 'Hold', BENCH['hold_rate']),
                          ('ctr', 'CTR', avg['ctr']), ('conv_pagina', 'Conversão de página', avg['conv_pagina'])]:
        v, ref = avg[k], bench
        if v is not None and ref:
            gaps.append((((ref - v) / ref) * 100, lab, v, ref))
    gaps.sort(reverse=True)
    if not gaps:
        return {'relevancia': 0.0, 'justificativa': 'Sem indicadores de funil suficientes.', 'kpis': []}
    g, lab, v, ref = gaps[0]
    return {'relevancia': round(max(0, min(100, g * 1.6)), 1),
            'justificativa': f'{lab} é o indicador mais distante da referência ({g:+.0f}%) — a maior oportunidade de melhoria.',
            'kpis': [{'label': 'Maior oportunidade', 'value': lab},
                     {'label': 'Gap vs. referência', 'value': f'{g:+.0f}%'}]}


def q_externo(ctx):
    a = ctx['avg']
    cpm_out = [c for c in ctx['cre'] if c['cpm'] is not None and a['cpm'] and c['cpm'] > 1.5 * a['cpm']]
    con_out = [c for c in ctx['cre'] if c['connect_rate'] is not None and a['connect_rate'] and c['connect_rate'] < 0.6 * a['connect_rate']]
    n = len(cpm_out) + len(con_out)
    return {'relevancia': round(min(100, n * 22), 1),
            'justificativa': f'{len(cpm_out)} criativo(s) com CPM muito acima e {len(con_out)} com Connect Rate muito abaixo da média — possíveis fatores externos.',
            'kpis': [{'label': 'CPM fora', 'value': str(len(cpm_out))},
                     {'label': 'Connect baixo', 'value': str(len(con_out))}]}


def q_temp_segment_capt(ctx):
    return {'relevancia': 52.0,
            'justificativa': 'Vale checar criativos que rendem bem numa temperatura e mal em outra (veiculação segmentada).',
            'kpis': [{'label': 'Criativos', 'value': str(ctx['n'])}]}


# ───────────────────────── perguntas — Resultado Final ─────────────────────────

def q_capt_vs_retorno(ctx):
    c1 = _corr([(-x if x is not None else None) for x in ctx['col']('cpmql')], ctx['col']('roas'))
    c2 = _corr(ctx['col']('qualidade'), ctx['col']('roas'))
    best = max([abs(x) for x in (c1, c2) if x is not None] or [0])
    return {'relevancia': round(_nz(best, 0.6), 1),
            'justificativa': f'Relação entre indicadores de captação (CPMQL/qualidade) e ROAS: correlação até {best:.2f}.',
            'kpis': [{'label': 'Qualidade×ROAS', 'value': f'{c2:+.2f}' if c2 is not None else '—'},
                     {'label': 'ROAS médio', 'value': _xf(ctx['avg']['roas'])}]}


def q_temp_roas(ctx):
    return {'relevancia': 56.0,
            'justificativa': 'Vale comparar o ROAS dos criativos por temperatura buscando distanciamentos claros (segmentar no próximo lançamento).',
            'kpis': [{'label': 'ROAS médio', 'value': _xf(ctx['avg']['roas'])}]}


def q_indicador_prejudicou(ctx):
    a = ctx['avg']
    refs = {'hook_rate': BENCH['hook_rate'], 'hold_rate': BENCH['hold_rate'],
            'ctr': a['ctr'], 'conv_pagina': a['conv_pagina'], 'connect_rate': a['connect_rate']}
    labs = {'hook_rate': 'Hook', 'hold_rate': 'Hold', 'ctr': 'CTR', 'conv_pagina': 'Conversão de página', 'connect_rate': 'Connect Rate'}
    gaps = [(((ref - a[k]) / ref) * 100, labs[k]) for k, ref in refs.items() if a[k] is not None and ref]
    gaps.sort(reverse=True)
    if not gaps:
        return {'relevancia': 0.0, 'justificativa': 'Sem indicadores intermediários suficientes.', 'kpis': []}
    g, lab = gaps[0]
    return {'relevancia': round(max(0, min(100, g * 1.5)), 1),
            'justificativa': f'{lab} é o indicador intermediário mais abaixo da referência ({g:+.0f}%) — provável maior freio do retorno.',
            'kpis': [{'label': 'Maior freio', 'value': lab}, {'label': 'Gap', 'value': f'{g:+.0f}%'}]}


def q_saturacao(ctx):
    return {'relevancia': 58.0,
            'justificativa': 'Vale checar saturação: criativos cujo retorno/ROAS diário vira negativo e se mantém ao longo da captação.',
            'kpis': [{'label': 'Criativos', 'value': str(ctx['n'])}]}


def q_oportunidade_benchmark(ctx):
    a = ctx['avg']
    below = 0
    for k, ref in [('hook_rate', BENCH['hook_rate']), ('hold_rate', BENCH['hold_rate']),
                   ('ctr', a['ctr']), ('connect_rate', a['connect_rate']), ('conv_pagina', a['conv_pagina'])]:
        if a[k] is not None and ref and a[k] < ref:
            below += 1
    return {'relevancia': round(min(100, below * 24), 1),
            'justificativa': f'{below} de 5 indicadores de anúncio abaixo da referência — oportunidade composta de melhoria.',
            'kpis': [{'label': 'Abaixo do benchmark', 'value': f'{below}/5'}]}


def _disp(ctx, keys, top=True):
    cre = [c for c in ctx['cre'] if c['roas'] is not None and (c['leads'] or 0) >= 50]
    cre.sort(key=lambda c: c['roas'], reverse=top)
    sub = cre[:max(3, len(cre) // 3)]
    # dispersão média (quanto os melhores/piores se parecem): menor desvio => padrão claro
    spreads = []
    for k in keys:
        xs = [c[k] for c in sub if c[k] is not None]
        if len(xs) >= 2 and _avg(xs):
            spreads.append((max(xs) - min(xs)) / abs(_avg(xs)))
    return sub, (_avg(spreads) or 1.0)


def q_comum_melhores(ctx):
    sub, spread = _disp(ctx, ['hook_rate', 'hold_rate', 'ctr', 'connect_rate', 'qualidade'], top=True)
    rel = round(max(0, min(100, (1 - min(spread, 1)) * 100)), 1) if sub else 0.0
    return {'relevancia': rel,
            'justificativa': f'{len(sub)} criativo(s) de topo (ROAS, ≥50 leads) — {"padrão consistente" if spread < 0.5 else "padrão difuso"} entre os indicadores.',
            'kpis': [{'label': 'Top criativos', 'value': str(len(sub))},
                     {'label': 'ROAS médio (topo)', 'value': _xf(_avg([c['roas'] for c in sub]))}]}


def q_comum_piores(ctx):
    sub, spread = _disp(ctx, ['hook_rate', 'hold_rate', 'ctr', 'connect_rate', 'qualidade'], top=False)
    rel = round(max(0, min(100, (1 - min(spread, 1)) * 90)), 1) if sub else 0.0
    return {'relevancia': rel,
            'justificativa': f'{len(sub)} criativo(s) de baixo retorno — padrão comum a investigar frente aos melhores.',
            'kpis': [{'label': 'Piores criativos', 'value': str(len(sub))},
                     {'label': 'ROAS médio (base)', 'value': _xf(_avg([c['roas'] for c in sub]))}]}


# ───────────────────────── registry ─────────────────────────

QUESTIONS = [
    # Foco em Captação em Andamento
    dict(id='cr-hook-funil', fn=q_hook_funil,
         pergunta='Tenho criativos com bom hook rate que perdem performance nos demais indicadores do funil?',
         prompt=('Identifique os criativos com hook rate acima da média/benchmark mas que ficam ABAIXO da média '
                 'ou do benchmark em hold rate, CTR, conversão de página ou qualidade. Sinalize claramente em qual '
                 'indicador cada um perde performance dentro do funil e onde há perda de resultado.')),
    dict(id='cr-corr-qualif', fn=q_corr_qualif,
         pergunta='Há relação entre hook rate, hold rate, CTR e CPM com a qualificação do lead?',
         prompt=('Rode correlações entre os indicadores até o clique (CPM, CTR, hook rate, hold rate) e a '
                 'qualificação (qualidade). Diga, em linguagem do cliente, qual indicador mais influencia o lead '
                 'chegar qualificado.')),
    dict(id='cr-oportunidade', fn=q_oportunidade,
         pergunta='Onde está a minha maior oportunidade em criativos — Hook, Hold, CTR ou conversão de página?',
         prompt=('Compare hook rate, hold rate, CTR e conversão de página com o benchmark e a média. Aponte qual '
                 'indicador está mais distante e, por isso, representa a maior oportunidade de melhoria.')),
    dict(id='cr-externo', fn=q_externo,
         pergunta='Existem questões externas afetando algum criativo (CPM muito acima ou Connect Rate muito abaixo)?',
         prompt=('Avalie criativo a criativo e em níveis agregados (temperatura, público, campanha) se CPM ou '
                 'Connect Rate destoam muito da média de forma negativa. Sinalize quais estão fora e quanto, '
                 'frente à média — é uma visão de ajuste diferente da otimização de tráfego.')),
    dict(id='cr-temp-segment', fn=q_temp_segment_capt,
         pergunta='Existem criativos que funcionam numa temperatura e não em outra e deveriam ser segmentados?',
         prompt=('Compare os indicadores de cada criativo por temperatura (hook, hold, CTR, CPM, conversão de '
                 'página, taxa de resposta, qualidade, CPL e CPMQL — sendo CPMQL o principal). Identifique '
                 'criativos que performam muito melhor numa temperatura e deveriam ter veiculação segmentada.')),
    # Foco em Resultado Final
    dict(id='cr-capt-retorno', fn=q_capt_vs_retorno,
         pergunta='Os melhores criativos em captação foram os de maior retorno bruto e relativo?',
         prompt=('Cruze os melhores indicadores de captação (CPL, CPMQL, qualidade) com ROAS, retorno bruto e '
                 'taxa de conversão — inclusive correlação. Diga, em linguagem do cliente, quais indicadores '
                 'melhor preveem conversão e retorno.')),
    dict(id='cr-temp-roas', fn=q_temp_roas,
         pergunta='Há criativos com retorno bem diferente por temperatura que deveriam ser segmentados?',
         prompt=('Compare o ROAS dos criativos por temperatura buscando distanciamentos claros (positivo numa, '
                 'negativo noutra; ou 2× maior/menor). Aponte quais deveriam ter veiculação segmentada por '
                 'temperatura no próximo lançamento.')),
    dict(id='cr-indicador-freio', fn=q_indicador_prejudicou,
         pergunta='Qual foi o indicador intermediário que mais prejudicou o meu retorno?',
         prompt=('Entre os indicadores de anúncio (hook rate, hold rate, CTR, conversão de página, connect rate), '
                 'identifique qual está mais distante do benchmark e, por consequência, mais afetou o retorno '
                 'gerado na campanha.')),
    dict(id='cr-saturacao', fn=q_saturacao,
         pergunta='Existiu algum criativo que saturou durante a captação? Se sim, por quê?',
         prompt=('Para cada criativo, olhe retorno bruto e ROAS por dia. Se viram negativos e se mantêm, é '
                 'saturação. Nos saturados, veja qual indicador (hook, hold, CTR, connect, conversão de página) '
                 'mais caiu entre o início e o fim da veiculação e sinalize com um exemplo concreto.')),
    dict(id='cr-oportunidade-bench', fn=q_oportunidade_benchmark,
         pergunta='Tenho oportunidades claras de melhorar o resultado com base nos indicadores vs. benchmark?',
         prompt=('Avalie o composto dos indicadores de anúncio (hold, CTR, connect rate, conversão de página) '
                 'frente ao benchmark; quantifique o quanto está abaixo e calcule o impacto total da melhoria '
                 'sobre o investimento e o resultado já gerado.')),
    dict(id='cr-comum-melhores', fn=q_comum_melhores,
         pergunta='O que existe em comum aos melhores criativos?',
         prompt=('Entre os criativos de maior retorno bruto/ROAS com volume mínimo (≥50 leads), identifique o '
                 'padrão comum — hook, hold, CTR, connect rate, qualidade, taxa de resposta, conversão, CPL e '
                 'CPMQL acima ou abaixo da média.')),
    dict(id='cr-comum-piores', fn=q_comum_piores,
         pergunta='O que existe em comum aos piores criativos?',
         prompt=('Entre os piores criativos (menor retorno/ROAS), identifique o padrão comum nos mesmos '
                 'indicadores e o que os separa dos melhores.')),
]


def _band(r):
    return 'alta' if r >= 66 else ('media' if r >= 40 else 'baixa')


def evaluate_all(dataset):
    ctx = build_ctx(dataset)
    out = []
    for q in QUESTIONS:
        try:
            r = q['fn'](ctx)
        except Exception:
            r = {'relevancia': 40.0, 'justificativa': '', 'kpis': []}
        out.append({
            'id': q['id'], 'pergunta': q['pergunta'],
            'justificativa': r.get('justificativa', ''), 'kpis': r.get('kpis', []),
            'relevancia': r.get('relevancia', 0.0), 'nivel': _band(r.get('relevancia', 0.0)),
            'deepen': {'sectionId': '', 'blockId': '', 'prompt': q['prompt']},
        })
    out.sort(key=lambda x: x['relevancia'], reverse=True)
    return out
