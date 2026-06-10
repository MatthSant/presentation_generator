"""Banco de perguntas norteadoras da análise de conversão por perfil.

Cada pergunta pontua a PRÓPRIA relevância (0–100) sobre o dataset.json já
calculado. Fontes:
  • crit_<id>_rank  — por grupo (rótulo completo): diff_lcto, diff_12m, rep,
    wins, n, classe — filtrável por `canal`.
  • crit_<id>_diff / crit_<id>_rep — séries por lançamento (rótulo curto
    próprio); usadas só para tendência recente.
  • cod_fatores / cod_assoc — codependência (amplitude, independência, papel,
    associação entre critérios).

`rep` é share DENTRO do critério (soma ~100% por critério) — métricas de volume
são agregadas por critério, nunca somando entre critérios. A relevância ranqueia
o que vale aprofundar; o `prompt` guia o detalhamento quando a pergunta é seguida.

Para adicionar outra análise padrão, crie um módulo irmão com TYPE/detect/
evaluate_all e registre-o em banks/__init__.py.
"""
import re

TYPE = 'conversao-perfil'


def detect(dataset):
    has_rank = any(k.startswith('crit_') and k.endswith('_rank') for k in dataset)
    return has_rank and 'cod_fatores' in dataset


# ───────────────────────── parsing ─────────────────────────

def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _pct(v):
    if v is None:
        return None
    s = str(v).strip().replace('%', '').replace(',', '.')
    if s in ('', '—', '-', '–'):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _norm(s):
    return re.sub(r'[^a-z0-9]', '', str(s).lower())


def _avg(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def _band(r):
    return 'alta' if r >= 66 else ('media' if r >= 40 else 'baixa')


def _nz(x, ref):
    return 0.0 if x is None else max(0.0, min(100.0, x / ref * 100.0))


def _fmt(v):
    return '—' if v is None else (('+' if v >= 0 else '') + '%.0f%%' % v)


# ───────────────────────── contexto ─────────────────────────

def build_ctx(dataset):
    crit_ids = sorted({k.split('_', 2)[1] for k in dataset
                       if k.startswith('crit_') and k.endswith('_rank')})

    chans = []
    if crit_ids:
        for r in dataset.get('crit_%s_rank' % crit_ids[0], {}).get('rows', []):
            c = r.get('canal')
            if c and c not in chans:
                chans.append(c)

    flabels = {}
    for r in dataset.get('cod_fatores', {}).get('rows', []):
        f = r.get('Fator', '')
        if f:
            flabels[_norm(f)] = f
    labels = {}
    for cid in crit_ids:
        nc = _norm(cid)
        lab = next((f for nf, f in flabels.items()
                    if nf[:5] == nc[:5] or nf.startswith(nc) or nc.startswith(nf)), None)
        labels[cid] = lab or cid.capitalize()

    rank = {}
    for cid in crit_ids:
        rank[cid] = {}
        for r in dataset.get('crit_%s_rank' % cid, {}).get('rows', []):
            rank[cid].setdefault(r.get('canal'), []).append({
                'grupo': r.get('grupo'),
                'diff_lcto': _f(r.get('diff_lcto')), 'diff_12m': _f(r.get('diff_12m')),
                'rep': _f(r.get('rep')) or 0.0,
                'wins': int(_f(r.get('wins')) or 0), 'n': int(_f(r.get('n')) or 0),
                'classe': r.get('classe'),
            })

    # séries por lançamento (diff e rep compartilham o short label da geração)
    lctos = []
    series = {}   # cid -> canal -> grupo -> {'diff': {lcto: v}, 'rep': {lcto: v}}
    for cid in crit_ids:
        series[cid] = {}
        for r in dataset.get('crit_%s_diff' % cid, {}).get('rows', []):
            l = r.get('lancamento')
            if l and l not in lctos:
                lctos.append(l)
            series[cid].setdefault(r.get('canal'), {}).setdefault(r.get('grupo'), {}) \
                .setdefault('diff', {})[l] = _pct(r.get('valor'))
        for r in dataset.get('crit_%s_rep' % cid, {}).get('rows', []):
            series[cid].setdefault(r.get('canal'), {}).setdefault(r.get('grupo'), {}) \
                .setdefault('rep', {})[r.get('lancamento')] = _pct(r.get('valor'))

    cod = {}
    for r in dataset.get('cod_fatores', {}).get('rows', []):
        cod.setdefault(r.get('canal'), {})[r.get('Fator')] = {
            'amplitude': _pct(r.get('Amplitude')),
            'independ': _pct(r.get('Independ.')),
            'papel': r.get('Papel'),
        }

    assoc = {}
    for r in dataset.get('cod_assoc', {}).get('rows', []):
        v = _pct(r.get('valor'))
        if v is not None and v <= 1.0:
            v *= 100.0
        assoc.setdefault(r.get('canal'), {})[(r.get('fatorA'), r.get('fatorB'))] = v

    return {'crit_ids': crit_ids, 'labels': labels, 'channels': chans,
            'rank': rank, 'series': series, 'lctos': lctos, 'cod': cod, 'assoc': assoc}


def _groups(ctx, cid, canal='Geral'):
    return ctx['rank'].get(cid, {}).get(canal, [])


def _all(ctx, canal='Geral'):
    return [(cid, g) for cid in ctx['crit_ids'] for g in _groups(ctx, cid, canal)]


def _org_channel(ctx):
    return next((c for c in ctx['channels'] if _norm(c).startswith('org')), None)


# ───────────────────────── perguntas ─────────────────────────

def q_consist(ctx):
    num = den = 0.0
    strong = 0
    topd = 0.0
    for _cid, g in _all(ctx):
        d, rep, n = g['diff_lcto'], g['rep'], g['n']
        if d is None or not n:
            continue
        cons = abs(2 * g['wins'] / n - 1)
        num += abs(d) * cons * rep
        den += rep
        if cons >= 0.6 and abs(d) >= 15 and rep >= 5:
            strong += 1
        if abs(d) > abs(topd):
            topd = d
    return {'relevancia': round(_nz(num / den if den else 0.0, 35), 1),
            'justificativa': f'{strong} grupo(s) com padrão forte e consistente vs. benchmark ao longo dos lançamentos.',
            'kpis': [{'label': 'Sinais consistentes', 'value': str(strong)},
                     {'label': 'Maior amplitude', 'value': _fmt(topd)},
                     {'label': 'Critérios', 'value': str(len(ctx['crit_ids']))}]}


def q_proxy(ctx):
    cod = ctx['cod'].get('Geral', {})
    assoc = ctx['assoc'].get('Geral', {})
    best = None
    for fat, info in cod.items():
        ind, amp = info['independ'], info['amplitude'] or 0
        if ind is None:
            continue
        partner, pv = None, 0
        for (a, b), v in assoc.items():
            if a == fat and b != fat and v and v > pv:
                pv, partner = v, b
        strength = (100 - ind) * (amp / 40.0)
        if best is None or strength > best[0]:
            best = (strength, fat, partner, ind)
    if not best:
        return {'relevancia': 0.0, 'kpis': [], 'justificativa': 'Sem dados de codependência.'}
    strength, fat, partner, ind = best
    return {'relevancia': round(_nz(strength, 55), 1),
            'justificativa': f'"{fat}" tem independência {ind:.0f}% — pode ser proxy de "{partner or "—"}".',
            'kpis': [{'label': 'Proxy mais forte', 'value': fat},
                     {'label': 'Independência', 'value': f'{ind:.0f}%'},
                     {'label': 'Explicado por', 'value': partner or '—'}]}


def q_bench_driver(ctx):
    best = None
    for cid in ctx['crit_ids']:
        gs = _groups(ctx, cid)
        if not gs:
            continue
        amp = ctx['cod'].get('Geral', {}).get(ctx['labels'][cid], {}).get('amplitude') or 0
        tg = max(gs, key=lambda g: g['rep'] or 0)
        score = amp * ((tg['rep'] or 0) / 100.0)
        if best is None or score > best[0]:
            best = (score, cid, amp, tg)
    if not best:
        return {'relevancia': 0.0, 'kpis': [], 'justificativa': '—'}
    _score, cid, amp, tg = best
    lab = ctx['labels'][cid]
    return {'relevancia': round(_nz(_score, 20), 1),
            'justificativa': f'"{lab}" concentra representatividade e amplitude — provável motor da média do lançamento.',
            'kpis': [{'label': 'Critério motor', 'value': lab},
                     {'label': 'Amplitude', 'value': _fmt(amp)},
                     {'label': 'Grupo dominante', 'value': f"{tg['rep']:.0f}% rep"}]}


def q_sustain(ctx):
    focar = afastar = 0
    worst_afasta = 0.0
    for cid in ctx['crit_ids']:
        ar = 0.0
        for g in _groups(ctx, cid):
            d, rep = g['diff_lcto'], g['rep']
            if d is None:
                continue
            if d >= 20 and rep >= 3:
                focar += 1
            if d <= -20 and rep >= 10:
                afastar += 1
                ar += rep
        worst_afasta = max(worst_afasta, ar)
    rel = _nz(min(focar, 10) * 4 + min(afastar, 8) * 5, 80)
    return {'relevancia': round(rel, 1),
            'justificativa': f'{focar} grupo(s) de alta conversão para focar e {afastar} de alto volume/baixa conversão para afastar.',
            'kpis': [{'label': 'Para focar', 'value': str(focar)},
                     {'label': 'Para afastar', 'value': str(afastar)},
                     {'label': 'Pior critério (rep parada)', 'value': f'{worst_afasta:.0f}%'}]}


def q_longterm(ctx):
    found = 0
    bestgain = 0.0
    bestg = None
    for cid, g in _all(ctx):
        dl, d12, rep = g['diff_lcto'], g['diff_12m'], g['rep']
        if dl is None or d12 is None or rep < 3:
            continue
        gain = d12 - dl
        if gain >= 8:
            found += 1
            if gain > bestgain:
                bestgain, bestg = gain, (cid, g['grupo'])
    rel = _nz(found * 14 + bestgain * 0.6, 70)
    nm = f"{ctx['labels'][bestg[0]]}: {bestg[1]}" if bestg else '—'
    return {'relevancia': round(rel, 1),
            'justificativa': f'{found} grupo(s) que convertem melhor no longo prazo (12m) do que na janela do lançamento.',
            'kpis': [{'label': 'Conversores tardios', 'value': str(found)},
                     {'label': 'Maior virada', 'value': (f'+{bestgain:.0f}pp' if bestg else '—')},
                     {'label': 'Destaque', 'value': nm}]}


def q_channel(ctx):
    pago = 'Pago' if 'Pago' in ctx['channels'] else None
    org = _org_channel(ctx)
    if not pago or not org:
        return {'relevancia': 0.0,
                'justificativa': 'Esta análise não separa pago e orgânico.',
                'kpis': [{'label': 'Canais', 'value': ' / '.join(ctx['channels']) or '—'}]}
    flips = 0
    for cid in ctx['crit_ids']:
        gp = {g['grupo']: g['diff_lcto'] for g in _groups(ctx, cid, pago)}
        go = {g['grupo']: g['diff_lcto'] for g in _groups(ctx, cid, org)}
        for grp, a in gp.items():
            b = go.get(grp)
            if a is None or b is None:
                continue
            if (a > 10 and b < -10) or (a < -10 and b > 10):
                flips += 1
    return {'relevancia': round(_nz(flips * 14, 70), 1),
            'justificativa': f'{flips} grupo(s) invertem o sinal de conversão entre pago e orgânico.',
            'kpis': [{'label': 'Inversões pago×orgânico', 'value': str(flips)},
                     {'label': 'Canais', 'value': ' / '.join(ctx['channels'])}]}


def q_drag(ctx):
    total = 0
    worst_rep = 0.0
    wc = None
    for cid in ctx['crit_ids']:
        s = 0.0
        for g in _groups(ctx, cid):
            if g['wins'] == 0 and (g['rep'] or 0) >= 10:
                s += g['rep']
                total += 1
        if s > worst_rep:
            worst_rep, wc = s, cid
    lab = ctx['labels'].get(wc, '—') if wc else '—'
    return {'relevancia': round(_nz(worst_rep, 35), 1),
            'justificativa': f'{total} grupo(s) com 0 wins e rep ≥10%; no critério {lab} somam {worst_rep:.0f}% da base parada.',
            'kpis': [{'label': 'Grupos âncora', 'value': str(total)},
                     {'label': 'Pior critério', 'value': lab},
                     {'label': '% base parada', 'value': f'{worst_rep:.0f}%'}]}


def q_recent(ctx):
    lctos = ctx['lctos']
    if len(lctos) < 4:
        return {'relevancia': 0.0,
                'justificativa': 'Poucos lançamentos para medir tendência recente.',
                'kpis': [{'label': 'Lançamentos', 'value': str(len(lctos))}]}
    last2, prev2 = lctos[-2:], lctos[-4:-2]
    num = den = 0.0
    accel = deteri = 0
    for cid in ctx['crit_ids']:
        for _grp, s in ctx['series'].get(cid, {}).get('Geral', {}).items():
            dd, rr = s.get('diff', {}), s.get('rep', {})
            r = _avg([dd.get(l) for l in last2])
            p = _avg([dd.get(l) for l in prev2])
            if r is None or p is None:
                continue
            tr = r - p
            rep = _avg([rr.get(l) for l in last2]) or 0
            num += abs(tr) * rep
            den += rep
            if tr > 5:
                accel += 1
            elif tr < -5:
                deteri += 1
    return {'relevancia': round(_nz(num / den if den else 0.0, 18), 1),
            'justificativa': f'{accel} grupo(s) acelerando e {deteri} deteriorando nos 2 lançamentos mais recentes.',
            'kpis': [{'label': 'Acelerando', 'value': str(accel)},
                     {'label': 'Deteriorando', 'value': str(deteri)},
                     {'label': 'Lançamentos', 'value': str(len(lctos))}]}


def q_combos(ctx):
    demo = {ctx['labels'][cid] for cid in ctx['crit_ids']
            if any(t in _norm(cid) for t in ('idade', 'renda', 'genero'))}
    assoc = ctx['assoc'].get('Geral', {})
    mx, pair = 0.0, None
    for (a, b), v in assoc.items():
        if v and a != b and (a in demo or b in demo) and v > mx:
            mx, pair = v, (a, b)
    return {'relevancia': round(_nz(mx, 50), 1),
            'justificativa': f'Associação de até {mx:.0f}% entre critérios demográficos e outros — cruzamentos podem mudar a leitura.',
            'kpis': [{'label': 'Associação máx.', 'value': f'{mx:.0f}%'},
                     {'label': 'Par', 'value': (' × '.join(pair) if pair else '—')},
                     {'label': 'Custo', 'value': 'cruzamento (pesado)'}]}


def q_demo(ctx):
    demo_ids = [cid for cid in ctx['crit_ids']
                if any(t in _norm(cid) for t in ('idade', 'genero', 'faixa'))]
    cnt = 0
    mx = 0.0
    nm = None
    for cid in demo_ids:
        for g in _groups(ctx, cid):
            d = g['diff_lcto']
            if d is None or (g['rep'] or 0) < 3:
                continue
            if abs(d) >= 25:
                cnt += 1
            if abs(d) > abs(mx):
                mx, nm = d, (cid, g['grupo'])
    rel = _nz(cnt * 16 + abs(mx) * 0.4, 80) if demo_ids else 0.0
    nml = f"{ctx['labels'][nm[0]]}: {nm[1]}" if nm else '—'
    return {'relevancia': round(rel, 1),
            'justificativa': f'{cnt} faixa(s) de idade/gênero (com volume) muito acima ou abaixo da média.',
            'kpis': [{'label': 'Outliers demográficos', 'value': str(cnt)},
                     {'label': 'Maior desvio', 'value': _fmt(mx)},
                     {'label': 'Destaque', 'value': nml}]}


# ───────────────────────── catálogo de perguntas ─────────────────────────

QUESTIONS = [
    dict(id='cp-consist', fn=q_consist,
         pergunta='Quais critérios estão piorando ou melhorando consistentemente e merecem atenção?',
         prompt=('Analise cada grupo em dois eixos independentes: (1) consistência histórica — wins/n e avgDiff '
                 'no total de lançamentos; (2) tendência recente — compare os 2 lançamentos mais recentes contra os '
                 '2 anteriores, em pp, descontando a variação do benchmark no mesmo período. Classifique cada grupo '
                 'em [consistente+acelerando], [consistente+deteriorando], [positivo+acelerando], '
                 '[positivo+deteriorando], [negativo+melhorando] ou [negativo+piorando]. Priorize os grupos de maior '
                 'representatividade em cada categoria e sinalize outliers — lançamentos que quebram o padrão do grupo. '
                 'Liste os grupos e critérios com comportamento claro (subidas/quedas constantes ou conversão '
                 'consistentemente acima/abaixo da média).')),
    dict(id='cp-proxy', fn=q_proxy,
         pergunta='Existe algum comportamento de critério que na verdade é explicado por outro?',
         prompt=('Compare o ranking de grupos por avgDiff_lcto entre os critérios de maior amplitude (ex.: Renda '
                 'Mensal e Patrimônio Investido). Avalie se os grupos de topo de cada critério são o mesmo '
                 'subconjunto de leads (alta renda e alto patrimônio coexistem na mesma pessoa) ou perfis '
                 'genuinamente distintos. Use a correlação de ranking e a codependência (independência / papel '
                 'qualificador vs. qualificante) para concluir qual critério é proxy do outro. Recomende qual '
                 'priorizar para segmentação de mídia paga, considerando qual é mais fácil de capturar antes do '
                 'clique. 3–4 frases de interpretação.')),
    dict(id='cp-bench-driver', fn=q_bench_driver,
         pergunta='Existe algum critério que acaba gerando o benchmark e a média do lançamento?',
         prompt=('Identifique o critério cujo grupo dominante (alta representatividade) e amplitude mais puxam a '
                 'média de conversão do lançamento. Avalie se a média geral é, na prática, ditada por um único '
                 'critério/grupo. Mostre a representatividade e o avgDiff do grupo dominante e explique a implicação '
                 'para a leitura do benchmark.')),
    dict(id='cp-sustain', fn=q_sustain,
         pergunta='Os grupos de alta conversão têm volume suficiente para sustentar uma estratégia de captação?',
         prompt=('Para cada grupo, cruze representatividade de leads, representatividade de vendas e taxa de '
                 'conversão. Classifique: conversão alta + rep. de vendas alta + rep. de leads baixa → FOCAR (dá '
                 'para captar mais desse perfil); rep. de leads alta + rep. de vendas baixa → AFASTAR; conversão alta '
                 'mas rep. de vendas e de leads baixas → não sustenta sozinho. Sinalize grupos onde rep. de leads e '
                 'de vendas se opõem e diga, por grupo, se a ação é focar, afastar ou tratar como core/neutro.')),
    dict(id='cp-longterm', fn=q_longterm,
         pergunta='Quais critérios têm variação significativa no longo prazo e passam a converter bem?',
         prompt=('Identifique grupos com diff_lcto negativo (ou abaixo da média na janela de 60 dias) mas diff_12m '
                 'positivo ou bem menos negativo — quem não compra no calor do lançamento mas converte no longo '
                 'prazo. Para cada um, calcule o uplift_12m médio e compare com a base. Interprete o ciclo de decisão '
                 'desse perfil e recomende uma ação específica (sequência de e-mail pós-lançamento, nurturing ou '
                 'condição de oferta) que poderia acelerar a decisão. Máx. 4 linhas por grupo.')),
    dict(id='cp-channel', fn=q_channel,
         pergunta='Algum grupo que performa mal no pago performa bem no orgânico — ou vice-versa?',
         prompt=('Avalie a conversão absoluta e relativa à média de cada grupo de cada critério, separando pago e '
                 'orgânico. Quando um grupo ficar acima da média no pago e abaixo no orgânico (ou o contrário), '
                 'sinalize, destacando o grupo, o critério e o tamanho da inversão.')),
    dict(id='cp-drag', fn=q_drag,
         pergunta='O quanto grupos de alto volume e baixa conversão estão impactando o resultado do lançamento?',
         prompt=('Identifique os grupos com wins = 0 e avgRep acima de 10%. Para cada um, estime o impacto na '
                 'conversão agregada: quanto o resultado geral melhoraria se o grupo fosse removido (ou convertesse '
                 'na média). Descreva o custo de captação implícito (leads de baixíssima probabilidade que aumentam o '
                 'CPL efetivo) e recomende, por grupo, exclusão de segmentação, qualificação pré-cadastro (pergunta '
                 'de filtro no lead form) ou nurturing de longo prazo.')),
    dict(id='cp-recent', fn=q_recent,
         pergunta='Quais grupos e critérios estão com variação de tendência recente?',
         prompt=('Em ordem cronológica, compare o avgDiff_lcto dos 2 lançamentos mais recentes contra os 2 '
                 'anteriores. Calcule a tendência absoluta (pp) e a relativa (descontando o benchmark). Identifique '
                 '(a) grupos em aceleração; (b) grupos em deterioração — ainda positivos na média histórica mas '
                 'piorando; (c) grupos em recuperação — historicamente negativos com melhora recente. Priorize por '
                 'representatividade e responda em tabela: Critério | Grupo | Tendência | Leitura | Hipótese de causa.')),
    dict(id='cp-combos', fn=q_combos,
         pergunta='Quais faixas de critério mudam de comportamento quando combinadas com outras?',
         prompt=('Isole a conversão individual de cada critério e teste se há cenários em que ele, combinado com '
                 'outro, converte muito acima ou abaixo da média. Faça o teste apenas com os critérios demográficos '
                 'padrão (idade, renda, gênero) cruzando com os campos específicos. Sinalize as combinações '
                 'relevantes. (Atenção ao custo: cruzamentos são pesados.)')),
    dict(id='cp-demo', fn=q_demo,
         pergunta='Existem faixas de idade ou gênero que performam muito acima ou abaixo da média?',
         prompt=('Identifique a conversão média de todos os critérios com resposta de pesquisa e avalie se há faixa '
                 'de idade ou gênero consistentemente acima (mereceria estratégia de tráfego específica) ou '
                 'consistentemente abaixo (mereceria exclusão das campanhas de tráfego).')),
]


def evaluate_all(dataset):
    ctx = build_ctx(dataset)
    out = []
    for q in QUESTIONS:
        r = q['fn'](ctx)
        out.append({
            'id': q['id'], 'pergunta': q['pergunta'],
            'justificativa': r['justificativa'], 'kpis': r['kpis'],
            'relevancia': r['relevancia'], 'nivel': _band(r['relevancia']),
            'deepen': {'sectionId': '', 'blockId': '', 'prompt': q['prompt']},
        })
    out.sort(key=lambda x: x['relevancia'], reverse=True)
    return out
