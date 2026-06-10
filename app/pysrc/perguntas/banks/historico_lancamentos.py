"""Banco de perguntas norteadoras do "histórico de lançamentos".

Cada pergunta pontua a PRÓPRIA relevância (0–100) sobre o dataset.json já
calculado pelo gerador (build_report). Fontes:
  • lc_overview      — escalares por lançamento (invest, leads, vendas, fat_liq,
    conv_ger, qualificacao, taxa_qualidade, conv_mql, mql_pct, reembolso, roas,
    roi, ret, recap) em ordem cronológica.
  • lc_brk_canal/plat/temp — conversão por dimensão e lançamento (métrica padrão
    da geração = conversão).
  • lc_leads_temp    — leads por temperatura e lançamento (volume).
  • lc_media / lc_<m>_temp — mídia paga (cpm, ctr, cpc, cpl, conv_paga, cpa).

As 15 primeiras perguntas vêm do mapeamento do consultor (regra técnica → score,
nota → prompt). hl-prejuizo e hl-best-worst cobrem o diagnóstico (ROAS<1 e
melhor/pior) que as 15 não cobrem. A relevância só ranqueia o que vale
aprofundar; o `prompt` guia o detalhamento (números sempre via bind, nunca
inventados).
"""

TYPE = 'historico-lancamentos'


def detect(dataset):
    return 'lc_overview' in dataset and 'lc_media' in dataset


# ───────────────────────── parsing ─────────────────────────

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


def _std(xs):
    xs = [x for x in xs if x is not None]
    if len(xs) < 2:
        return None
    m = sum(xs) / len(xs)
    return (sum((x - m) ** 2 for x in xs) / len(xs)) ** 0.5


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
    if x is None or ref <= 0:
        return 0.0
    return max(0.0, min(100.0, x / ref * 100.0))


def _band(r):
    return 'alta' if r >= 66 else ('media' if r >= 40 else 'baixa')


def _ppf(v):
    return '—' if v is None else ('%+.1fpp' % v)


def _pctf(v):
    return '—' if v is None else ('%.1f%%' % v)


def _xf(v):
    return '—' if v is None else ('%.2f×' % v)


def _corf(v):
    return '—' if v is None else ('%+.2f' % v)


def build_ctx(dataset):
    ov_rows = dataset.get('lc_overview', {}).get('rows', [])
    L = [r.get('lcto') for r in ov_rows]
    ov = {r.get('lcto'): r for r in ov_rows}

    def dim(table, key):
        out = {}
        for r in dataset.get(table, {}).get('rows', []):
            out.setdefault(r.get('lcto'), {})[r.get(key)] = _f(r.get('valor'))
        return out

    conv_canal = dim('lc_brk_canal', 'canal')
    conv_plat = dim('lc_brk_plat', 'plataforma')
    conv_temp = dim('lc_brk_temp', 'temperatura')

    leads_temp = {}
    for r in dataset.get('lc_leads_temp', {}).get('rows', []):
        leads_temp.setdefault(r.get('lcto'), {})[r.get('temperatura')] = _f(r.get('leads'))

    media = {r.get('lcto'): r for r in dataset.get('lc_media', {}).get('rows', [])}
    media_temp = {}
    for m in ('cpm', 'ctr', 'cpc', 'cpl', 'conv_paga', 'cpa'):
        for r in dataset.get('lc_%s_temp' % m, {}).get('rows', []):
            media_temp.setdefault(r.get('lcto'), {}).setdefault(m, {})[r.get('temperatura')] = _f(r.get('valor'))

    temps = []
    for d in conv_temp.values():
        for t in d:
            if t not in temps:
                temps.append(t)

    return {'L': L, 'ov': ov, 'conv_canal': conv_canal, 'conv_plat': conv_plat,
            'conv_temp': conv_temp, 'leads_temp': leads_temp, 'media': media,
            'media_temp': media_temp, 'temps': temps}


def _ser(ctx, key):
    return [_f(ctx['ov'].get(l, {}).get(key)) for l in ctx['L']]


def _mser(ctx, key):
    return [_f(ctx['media'].get(l, {}).get(key)) for l in ctx['L']]


# ───────────────────────── perguntas ─────────────────────────

def q_conv_canal(ctx):
    pago = [ctx['conv_canal'].get(l, {}).get('Pago') for l in ctx['L']]
    org = [ctx['conv_canal'].get(l, {}).get('Orgânico') for l in ctx['L']]
    c = _corr(pago, org)
    pv = [x for x in pago if x is not None]
    ov_ = [x for x in org if x is not None]
    p_tr = (pv[-1] - pv[0]) if len(pv) >= 2 else None
    o_tr = (ov_[-1] - ov_[0]) if len(ov_) >= 2 else None
    diverge = abs(p_tr - o_tr) if (p_tr is not None and o_tr is not None) else None
    anti = (1 - c) / 2 * 100 if c is not None else 0.0   # 0 (juntos) … 100 (opostos)
    rel = max(_nz(diverge, 12), _nz(anti, 100) * 0.8)
    return {'relevancia': round(rel, 1),
            'justificativa': f'Pago e orgânico {"divergem" if (c is not None and c < 0.3) else "andam juntos"} (correlação {_corf(c)}); tendência pago {_ppf(p_tr)} × orgânico {_ppf(o_tr)}.',
            'kpis': [{'label': 'Correlação pago×org', 'value': _corf(c)},
                     {'label': 'Tendência pago', 'value': _ppf(p_tr)},
                     {'label': 'Tendência orgânico', 'value': _ppf(o_tr)}]}


def q_qual_conv(ctx):
    qual = _ser(ctx, 'taxa_qualidade')
    conv = _ser(ctx, 'conv_ger')
    c = _corr(qual, conv)
    rel = _nz(abs(c) * 100, 80) if c is not None else 0.0
    return {'relevancia': round(rel, 1),
            'justificativa': f'Taxa de qualidade e conversão {"se movem juntas" if (c or 0) > 0.4 else ("se opõem" if (c or 0) < -0.4 else "têm relação fraca")} (correlação {_corf(c)}).',
            'kpis': [{'label': 'Correlação qualidade×conv', 'value': _corf(c)},
                     {'label': 'Qualidade média', 'value': _pctf(_avg(qual))},
                     {'label': 'Conversão média', 'value': _pctf(_avg(conv))}]}


def q_mql(ctx):
    mqlp = _ser(ctx, 'mql_pct')
    conv = _ser(ctx, 'conv_ger')
    cmql = _ser(ctx, 'conv_mql')
    c = _corr(mqlp, conv)
    sd = _std(mqlp) or 0.0
    rel = _nz((abs(c) * 50 if c is not None else 0) + sd * 4, 70)
    return {'relevancia': round(rel, 1),
            'justificativa': f'Composição MQL varia (±{sd:.1f}pp) e {"acompanha" if (c or 0) > 0.3 else "tem relação fraca com"} a conversão (correlação {_corf(c)}).',
            'kpis': [{'label': '% MQL médio', 'value': _pctf(_avg(mqlp))},
                     {'label': 'Correlação MQL×conv', 'value': _corf(c)},
                     {'label': 'Conv. de MQL média', 'value': _pctf(_avg(cmql))}]}


def q_roas_struct(ctx):
    roas = [x for x in _ser(ctx, 'roas') if x is not None]
    if len(roas) < 3:
        return {'relevancia': 0.0, 'justificativa': 'Poucos lançamentos para julgar estrutura do ROAS.',
                'kpis': [{'label': 'Lançamentos', 'value': str(len(roas))}]}
    m = sum(roas) / len(roas)
    last3 = sum(roas[-3:]) / 3
    dev = (last3 - m) / m * 100 if m else 0.0
    consec = 0
    for v in reversed(roas):
        if (v - m) * dev > 0:
            consec += 1
        else:
            break
    rel = _nz(abs(dev) + consec * 6, 70)
    estado = 'estrutural' if consec >= 3 else ('reversão/oscilação' if consec <= 1 else 'em transição')
    return {'relevancia': round(rel, 1),
            'justificativa': f'Últimos 3 lançamentos {"acima" if dev >= 0 else "abaixo"} da média ({dev:+.0f}%), {consec} consecutivos — movimento {estado}.',
            'kpis': [{'label': 'ROAS médio', 'value': _xf(m)},
                     {'label': 'ROAS últimos 3', 'value': _xf(last3)},
                     {'label': 'Desvio vs. média', 'value': f'{dev:+.0f}%'}]}


_MES = {'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
        'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12}


def q_sazonal(ctx):
    by_mes = {}
    for l in ctx['L']:
        mes = str(l).split('/')[0].strip().lower()
        r = _f(ctx['ov'].get(l, {}).get('roas'))
        if mes in _MES and r is not None:
            by_mes.setdefault(mes, []).append(r)
    if not by_mes:
        return {'relevancia': 0.0, 'justificativa': 'Sem datas para agrupar por mês.', 'kpis': []}
    means = {m: sum(v) / len(v) for m, v in by_mes.items()}
    repetem = sum(1 for v in by_mes.values() if len(v) >= 2)
    amp = max(means.values()) - min(means.values()) if len(means) > 1 else 0.0
    best = max(means, key=means.get)
    rel = _nz(amp * 30, 60) * (1.0 if repetem else 0.4)   # sem mês repetido = hipótese
    return {'relevancia': round(rel, 1),
            'justificativa': f'{len(means)} meses distintos, {repetem} com ≥2 lançamentos; melhor mês: {best} ({_xf(means[best])} ROAS).'
                             + ('' if repetem else ' Amostra pequena — hipótese, não padrão.'),
            'kpis': [{'label': 'Melhor mês', 'value': best},
                     {'label': 'Amplitude ROAS', 'value': _xf(amp)},
                     {'label': 'Meses recorrentes', 'value': str(repetem)}]}


def q_escala(ctx):
    inv = _ser(ctx, 'invest')
    fat = _ser(ctx, 'fat_liq')
    inef = tot = 0
    gaps = []
    for i in range(1, len(ctx['L'])):
        a0, a1, f0, f1 = inv[i - 1], inv[i], fat[i - 1], fat[i]
        if None in (a0, a1, f0, f1) or a0 <= 0 or f0 <= 0:
            continue
        di = (a1 - a0) / a0 * 100
        df = (f1 - f0) / f0 * 100
        tot += 1
        gaps.append(df - di)
        if df < di:
            inef += 1
    avg_gap = _avg(gaps)
    rel = _nz((inef / tot * 100 if tot else 0) * 0.6 + abs(avg_gap or 0), 70)
    marginal = 'decrescente' if (avg_gap is not None and avg_gap < 0) else 'crescente'
    return {'relevancia': round(rel, 1),
            'justificativa': f'{inef}/{tot} transições com faturamento crescendo menos que o investimento — retorno marginal {marginal}.',
            'kpis': [{'label': 'Transições ineficientes', 'value': f'{inef}/{tot}'},
                     {'label': 'Gap médio fat−inv', 'value': _ppf(avg_gap)},
                     {'label': 'Retorno marginal', 'value': marginal}]}


def q_temp_vol_conv(ctx):
    rows = []
    for t in ctx['temps']:
        conv = _avg([ctx['conv_temp'].get(l, {}).get(t) for l in ctx['L']])
        leads = _avg([ctx['leads_temp'].get(l, {}).get(t) for l in ctx['L']])
        if conv is not None or leads is not None:
            rows.append((t, conv or 0, leads or 0))
    if not rows:
        return {'relevancia': 0.0, 'justificativa': 'Sem dados por temperatura.', 'kpis': []}
    mc = _avg([r[1] for r in rows]) or 0
    ml = _avg([r[2] for r in rows]) or 0
    ideal = [r for r in rows if r[1] >= mc and r[2] >= ml]
    oport = [r for r in rows if r[1] < mc and r[2] >= ml]   # alto volume, baixa conv
    best = max(rows, key=lambda r: r[1])
    spread = max(r[1] for r in rows) - min(r[1] for r in rows)
    rel = _nz(spread * 4 + len(oport) * 12, 70)
    return {'relevancia': round(rel, 1),
            'justificativa': f'Melhor conversão: {best[0]} ({_pctf(best[1])}); {len(oport)} temperatura(s) de alto volume e baixa conversão (oportunidade).',
            'kpis': [{'label': 'Melhor temperatura', 'value': f'{best[0]} · {_pctf(best[1])}'},
                     {'label': 'Alto vol. / baixa conv.', 'value': (', '.join(r[0] for r in oport) or '—')},
                     {'label': 'Amplitude conv.', 'value': _ppf(spread)}]}


def q_recap_conv(ctx):
    recap = _ser(ctx, 'recap')
    conv = _ser(ctx, 'conv_ger')
    if not any(x for x in recap):
        return {'relevancia': 0.0, 'justificativa': 'Sem recaptura registrada na série.',
                'kpis': [{'label': 'Recaptura total', 'value': '0'}]}
    c = _corr(recap, conv)
    rel = _nz(abs(c) * 100, 75) if c is not None else 0.0
    recap_avg = _avg([x for x in recap if x is not None]) or 0
    return {'relevancia': round(rel, 1),
            'justificativa': f'Recaptura {"puxa" if (c or 0) > 0.3 else ("derruba" if (c or 0) < -0.3 else "não move")} a conversão (correlação {_corf(c)}).',
            'kpis': [{'label': 'Correlação recap×conv', 'value': _corf(c)},
                     {'label': 'Recaptura média', 'value': str(int(recap_avg))},
                     {'label': 'Conversão média', 'value': _pctf(_avg(conv))}]}


def q_recap_canal(ctx):
    recap = [x for x in _ser(ctx, 'recap') if x is not None]
    total = sum(recap)
    rel = _nz(20 if total > 0 else 0, 100)   # dado por canal indisponível no CSV
    return {'relevancia': round(rel, 1),
            'justificativa': 'Recaptura não está segmentada por tipo de tráfego no CSV padrão — comparação pago×orgânico requer enriquecer o dado.',
            'kpis': [{'label': 'Recaptura total', 'value': str(int(total))},
                     {'label': 'Segmentação por canal', 'value': 'indisponível'}]}


def q_cpl_decomp(ctx):
    cpl = _mser(ctx, 'cpl')
    cpm = _mser(ctx, 'cpm')
    ctr = _mser(ctx, 'ctr')
    m = _avg(cpl)
    rng = (max(x for x in cpl if x is not None) - min(x for x in cpl if x is not None)) if any(x is not None for x in cpl) else 0
    var = (rng / m * 100) if m else 0
    c_cpm = _corr(cpl, cpm)
    c_ctr = _corr(cpl, [(-x if x is not None else None) for x in ctr])
    driver = 'CPM (custo de atenção)' if (c_cpm or 0) >= (c_ctr or 0) else 'CTR (relevância do criativo)'
    rel = _nz(var, 60)
    return {'relevancia': round(rel, 1),
            'justificativa': f'CPL varia {var:.0f}% na série; movimento mais explicado por {driver}.',
            'kpis': [{'label': 'CPL médio', 'value': ('—' if m is None else f'R$ {m:.2f}')},
                     {'label': 'Variação CPL', 'value': f'{var:.0f}%'},
                     {'label': 'Driver provável', 'value': driver}]}


def q_cpa_decomp(ctx):
    cpa = _mser(ctx, 'cpa')
    cpl = _mser(ctx, 'cpl')
    conv = _mser(ctx, 'conv_paga')
    m = _avg(cpa)
    rng = (max(x for x in cpa if x is not None) - min(x for x in cpa if x is not None)) if any(x is not None for x in cpa) else 0
    var = (rng / m * 100) if m else 0
    c_cpl = _corr(cpa, cpl)
    c_conv = _corr(cpa, [(-x if x is not None else None) for x in conv])
    driver = 'CPL (mídia cara)' if (c_cpl or 0) >= (c_conv or 0) else 'conversão (funil pós-clique)'
    rel = _nz(var, 60)
    return {'relevancia': round(rel, 1),
            'justificativa': f'CPA varia {var:.0f}%; mais explicado por {driver}.',
            'kpis': [{'label': 'CPA médio', 'value': ('—' if m is None else f'R$ {m:.2f}')},
                     {'label': 'Variação CPA', 'value': f'{var:.0f}%'},
                     {'label': 'Driver provável', 'value': driver}]}


def _cpm_recent(ctx):
    cpm = [x for x in _mser(ctx, 'cpm') if x is not None]
    if len(cpm) < 3:
        return None, None, None
    hist = sum(cpm[:-2]) / len(cpm[:-2]) if len(cpm) > 2 else sum(cpm) / len(cpm)
    recent = sum(cpm[-2:]) / 2
    return hist, recent, (recent - hist) / hist * 100 if hist else 0.0


def q_cpm_compensa(ctx):
    hist, recent, dev = _cpm_recent(ctx)
    if hist is None:
        return {'relevancia': 0.0, 'justificativa': 'Poucos lançamentos para avaliar o CPM recente.', 'kpis': []}
    piora = max(dev, 0)
    rel = _nz(piora, 25)
    comp = piora   # CPL ~ CPM/(CTR×conv); manter CPL exige compensar ~o mesmo % no conjunto CTR×conv
    return {'relevancia': round(rel, 1),
            'justificativa': (f'CPM recente {dev:+.0f}% vs. histórico — para segurar o CPL é preciso ganhar ~{comp:.0f}% em CTR×conversão de página.'
                              if dev > 0 else f'CPM recente {dev:+.0f}% (não piorou) — sem pressão de compensação.'),
            'kpis': [{'label': 'CPM histórico', 'value': f'R$ {hist:.2f}'},
                     {'label': 'CPM recente', 'value': f'R$ {recent:.2f}'},
                     {'label': 'Compensar em CTR×conv', 'value': (f'~{comp:.0f}%' if dev > 0 else '—')}]}


def q_cpm_leads(ctx):
    hist, recent, dev = _cpm_recent(ctx)
    if hist is None:
        return {'relevancia': 0.0, 'justificativa': 'Poucos lançamentos para avaliar o CPM recente.', 'kpis': []}
    melhora = max(-dev, 0)
    rel = _nz(melhora, 25)
    return {'relevancia': round(rel, 1),
            'justificativa': (f'CPM recente {dev:+.0f}% vs. histórico — mantidas CTR e conversão de página, dá para esperar ~{melhora:.0f}% mais leads pelo mesmo budget.'
                              if dev < 0 else f'CPM recente {dev:+.0f}% (não melhorou) — sem ganho de leads esperado por essa via.'),
            'kpis': [{'label': 'CPM histórico', 'value': f'R$ {hist:.2f}'},
                     {'label': 'CPM recente', 'value': f'R$ {recent:.2f}'},
                     {'label': 'Leads adicionais', 'value': (f'~{melhora:.0f}%' if dev < 0 else '—')}]}


def q_reembolso(ctx):
    reemb = _ser(ctx, 'reembolso')
    m = _avg(reemb)
    vals = [x for x in reemb if x is not None]
    recent = _avg(vals[-2:]) if len(vals) >= 2 else None
    tend = (recent - m) if (recent is not None and m is not None) else None
    rel = _nz(max((m or 0) - 5, 0) * 8 + max(tend or 0, 0) * 6, 70)
    return {'relevancia': round(rel, 1),
            'justificativa': f'Reembolso médio {_pctf(m)} (benchmark 5%); tendência recente {_ppf(tend)}. Quebra por origem/plataforma/temperatura/MQL no detalhamento.',
            'kpis': [{'label': 'Reembolso médio', 'value': _pctf(m)},
                     {'label': 'vs. benchmark 5%', 'value': _ppf((m - 5) if m is not None else None)},
                     {'label': 'Tendência recente', 'value': _ppf(tend)}]}


def q_org_pago_temp(ctx):
    org = [ctx['conv_canal'].get(l, {}).get('Orgânico') for l in ctx['L']]
    best_t, best_c = None, None
    for t in ctx['temps']:
        ct = [ctx['conv_temp'].get(l, {}).get(t) for l in ctx['L']]
        c = _corr(org, ct)
        if c is not None and (best_c is None or abs(c) > abs(best_c)):
            best_c, best_t = c, t
    rel = _nz(abs(best_c) * 100, 75) if best_c is not None else 0.0
    return {'relevancia': round(rel, 1),
            'justificativa': f'Conversão do orgânico {"acopla" if (best_c or 0) > 0.3 else "se descola"} da conversão por temperatura — mais forte em {best_t or "—"} (correlação {_corf(best_c)}).',
            'kpis': [{'label': 'Temperatura mais acoplada', 'value': best_t or '—'},
                     {'label': 'Correlação org×temp', 'value': _corf(best_c)},
                     {'label': 'Temperaturas avaliadas', 'value': str(len(ctx['temps']))}]}


def q_prejuizo(ctx):
    roas = [(l, _f(ctx['ov'].get(l, {}).get('roas'))) for l in ctx['L']]
    loss = [(l, r) for l, r in roas if r is not None and r < 1.0]
    worst = min((r for _, r in roas if r is not None), default=None)
    worst_l = next((l for l, r in roas if r == worst), None) if worst is not None else None
    rel = _nz(len(loss) * 28 + (max(1 - worst, 0) * 40 if worst is not None else 0), 80)
    return {'relevancia': round(rel, 1),
            'justificativa': (f'{len(loss)} lançamento(s) operaram no prejuízo (ROAS < 1×); pior: {worst_l} ({_xf(worst)}).'
                              if loss else 'Nenhum lançamento operou no prejuízo (todos ROAS ≥ 1×).'),
            'kpis': [{'label': 'Lançamentos no prejuízo', 'value': str(len(loss))},
                     {'label': 'Pior ROAS', 'value': _xf(worst)},
                     {'label': 'Lançamento', 'value': worst_l or '—'}]}


def q_best_worst(ctx):
    roas = [(l, _f(ctx['ov'].get(l, {}).get('roas'))) for l in ctx['L'] if _f(ctx['ov'].get(l, {}).get('roas')) is not None]
    if len(roas) < 2:
        return {'relevancia': 0.0, 'justificativa': 'Série curta demais para comparar lançamentos.', 'kpis': []}
    best = max(roas, key=lambda x: x[1])
    worst = min(roas, key=lambda x: x[1])
    m = _avg([r for _, r in roas]) or 1
    amp = (best[1] - worst[1]) / m * 100
    rel = _nz(amp, 120)
    return {'relevancia': round(rel, 1),
            'justificativa': f'Melhor: {best[0]} ({_xf(best[1])}); pior: {worst[0]} ({_xf(worst[1])}) — amplitude de {amp:.0f}% sobre a média.',
            'kpis': [{'label': 'Melhor lançamento', 'value': f'{best[0]} · {_xf(best[1])}'},
                     {'label': 'Pior lançamento', 'value': f'{worst[0]} · {_xf(worst[1])}'},
                     {'label': 'Amplitude', 'value': f'{amp:.0f}%'}]}


# ───────────────────────── catálogo ─────────────────────────

QUESTIONS = [
    dict(id='hl-conv-canal', fn=q_conv_canal,
         pergunta='A variação de conversão acontece no mesmo padrão em orgânico e pago?',
         prompt=('Compare a variação percentual de conversão de cada origem (orgânico e pago) ao longo dos '
                 'lançamentos e avalie se alguma se destaca em relação à outra (ex.: orgânico subindo enquanto o '
                 'pago cai). Quantifique a divergência e diga em quais lançamentos os caminhos se separam.')),
    dict(id='hl-qual-conv', fn=q_qual_conv,
         pergunta='O quanto a taxa de qualidade está afetando os resultados de conversão?',
         prompt=('Avalie se quando a qualidade (geral ou de fontes específicas) cai ou sobe, a conversão faz um '
                 'movimento similar. Use a correlação ao longo da série e destaque os lançamentos onde qualidade e '
                 'conversão se moveram juntas ou se descolaram.')),
    dict(id='hl-mql', fn=q_mql,
         pergunta='A conversão cai mais forte em Não-MQLs e sobe mais forte em MQLs?',
         prompt=('Calcule a razão conv_mql / conv_nao_mql por evento. Se a razão for consistentemente acima de 2×, '
                 'o critério de qualificação é bom preditor de compra. Se for abaixo de 1.5×, a separação '
                 'MQL/não-MQL pode não estar calibrada para esse produto. Mostre a evolução dessa razão ao longo da '
                 'série e compare a variação percentual de conversão de cada grupo.')),
    dict(id='hl-roas-struct', fn=q_roas_struct,
         pergunta='O ROAS está em variação estrutural (queda/subida) ou está oscilando?',
         prompt=('Compare o ROAS dos últimos 3 eventos com a média histórica. Classifique como queda estrutural '
                 '(3+ eventos consecutivos abaixo da média), reversão (evento isolado abaixo seguido de '
                 'recuperação) ou compressão de escala (queda coincide com aumento de budget). Faça a mesma lógica '
                 'para o caso de o ROAS estar subindo. Mostre os números.')),
    dict(id='hl-sazonal', fn=q_sazonal,
         pergunta='Existe padrão sazonal de resultado por período do ano?',
         prompt=('Agrupe os eventos por mês de realização e calcule o ROAS médio por mês. Identifique se algum mês '
                 'consistentemente performa acima ou abaixo da média. Sinalize se a amostra é pequena demais para '
                 'conclusão (menos de 2 eventos no mesmo mês = hipótese, não padrão).')),
    dict(id='hl-escala', fn=q_escala,
         pergunta='O crescimento de faturamento acompanha o crescimento de investimento?',
         prompt=('Calcule a variação percentual de investimento e de faturamento líquido entre cada par de eventos '
                 'consecutivos. Mostre onde o faturamento cresceu mais que o investimento (escala eficiente) e onde '
                 'não acompanhou (escala ineficiente). Conclua se a série tem retorno marginal crescente ou '
                 'decrescente.')),
    dict(id='hl-temp-vol-conv', fn=q_temp_vol_conv,
         pergunta='Qual temperatura de lead tem a melhor relação entre volume e conversão?',
         prompt=('Para cada temperatura (Hot/Warm/Cold/Advantage/N/C), calcule a média de conversão e o volume '
                 'médio de leads ao longo da série. Classifique cada uma em: Alto volume + Alta conv (ideal), Alto '
                 'volume + Baixa conv (oportunidade), Baixo volume + Alta conv (limitado), Baixo volume + Baixa '
                 'conv (ineficiente). Recomende onde concentrar esforço.')),
    dict(id='hl-recap-conv', fn=q_recap_conv,
         pergunta='A recaptura está afetando a conversão ou os dois são independentes?',
         prompt=('Avalie a recaptura (leads antigos) evento a evento. Identifique se, quando a recaptura cresce, a '
                 'conversão também cresce (leads recorrentes convertem mais), cai (base saturada) ou não há '
                 'correlação. Considere os dados absolutos e também relativos à conversão geral. Conclua se a '
                 'recaptura é um ativo ou um sinal de teto de base que pede mudança de estratégia.')),
    dict(id='hl-recap-canal', fn=q_recap_canal,
         pergunta='A fonte de tráfego da recaptura afeta o desempenho? Vale recapturar via pago?',
         prompt=('Avalie a conversão dos leads antigos quebrada por tipo de tráfego: leads antigos convertem melhor '
                 'ou pior que os novos, no orgânico e no pago? Para valer no pago, precisam converter melhor que os '
                 'novos (você paga de novo por eles). Mostre a comparação por tipo de tráfego e a variação entre '
                 'eles. Obs.: requer a recaptura segmentada por canal no CSV.')),
    dict(id='hl-cpl-decomp', fn=q_cpl_decomp,
         pergunta='O CPL está subindo/caindo por piora/melhora de CPM ou de CTR?',
         prompt=('CPL = CPM / (CTR × 10). Decomponha a variação de CPL em cada evento: quanto veio de CPM mais caro '
                 '(custo de atenção) versus CTR mais baixo (relevância do criativo). CPM subiu e CTR manteve = '
                 'leilão/mercado; CTR caiu = criativo ou audiência saturada. Faça a mesma leitura para quedas de '
                 'CPL (CPM menor / CTR maior).')),
    dict(id='hl-cpa-decomp', fn=q_cpa_decomp,
         pergunta='O CPA é mais explicado pelo CPL ou pela conversão?',
         prompt=('CPA = CPL / Taxa de Conversão. Para os eventos com CPA acima da média, identifique se o problema '
                 'foi CPL alto (mídia cara) ou conversão baixa (funil fraco). CPL normal e conversão caindo = '
                 'problema pós-clique (landing, oferta, aquecimento). CPL subindo e conversão mantida = aquisição '
                 'de leads.')),
    dict(id='hl-cpm-compensa', fn=q_cpm_compensa,
         pergunta='Se o CPM está piorando, quanto preciso compensar em CTR e conversão de página?',
         prompt=('Se o CPM dos últimos 2 eventos estiver maior que a série histórica, calcule quanto é preciso '
                 'melhorar no conjunto CTR × conversão de página para que o custo por lead não seja afetado.')),
    dict(id='hl-cpm-leads', fn=q_cpm_leads,
         pergunta='Se o CPM está melhorando, quanto posso esperar de crescimento de leads?',
         prompt=('Se o CPM dos últimos 2 eventos estiver menor que a série histórica, calcule quantos leads a mais '
                 'dá para esperar, mantendo CTR e conversão de página constantes.')),
    dict(id='hl-reembolso', fn=q_reembolso,
         pergunta='O quanto os reembolsos drenam o funil? Varia por origem, plataforma, temperatura ou MQL?',
         prompt=('Avalie a taxa de reembolso por cada um desses critérios (origem, plataforma, temperatura, MQL) e '
                 'mostre onde está pior. Use benchmark mínimo de 5% para comparar. Avalie também a variação dos '
                 'últimos lançamentos vs. a série e conclua os principais vilões.')),
    dict(id='hl-org-pago-temp', fn=q_org_pago_temp,
         pergunta='A conversão do orgânico se correlaciona com a do pago por temperatura (quente, morno, frio)?',
         prompt=('Use a conversão do orgânico como referência e a conversão do pago quebrada por temperatura. '
                 'Avalie se há correlação entre a variação do orgânico e a do pago em cada temperatura: se o '
                 'orgânico sobe/cai, o pago acompanha? Em quais temperaturas isso é relevante?')),
    dict(id='hl-prejuizo', fn=q_prejuizo,
         pergunta='Algum lançamento operou no prejuízo (ROAS abaixo de 1×)?',
         prompt=('Liste os lançamentos com ROAS < 1× (faturamento líquido não cobriu o custo de mídia). Para cada '
                 'um, mostre ROAS e investimento e recomende revisar mix de temperatura, CPL e oferta antes de '
                 'reinvestir no formato.')),
    dict(id='hl-best-worst', fn=q_best_worst,
         pergunta='Qual o melhor e o pior lançamento da série, e o que os separa?',
         prompt=('Identifique o lançamento de maior e o de menor ROAS da série. Compare investimento, CPL, '
                 'conversão, qualificação e mix de temperatura entre os dois para isolar os fatores que explicam a '
                 'diferença e o que replicar do melhor.')),
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
