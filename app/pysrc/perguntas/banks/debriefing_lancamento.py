"""Banco de perguntas norteadoras do "debriefing de lançamento".

Pontua relevância (0–100) sobre o dataset.json do build_report. Fontes:
  • deb_kpis   — um registro por KPI: value, meta, hist, grupo.
  • deb_chan   — por canal: tipo, leads, vendas, conv, qual, fat.
  • deb_temp   — por temperatura: leads, invest, fat, roas, vendas, conv, qual, meta_vendas.
  • deb_weekly — por semana: leads, vendas, conv, qual, cpl, fpl.

As perguntas refletem as decisões do debriefing: atingiu a meta de vendas, qual
temperatura escalar/pausar, pago × orgânico, qualidade, custo de mídia, concentração
de canal. Relevância ranqueia o que vale aprofundar; o prompt guia o detalhamento.
"""

TYPE = 'debriefing-lancamento'


def detect(dataset):
    return 'deb_kpis' in dataset and 'deb_temp' in dataset


def _f(v):
    if isinstance(v, bool):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _nz(x, ref):
    if x is None or ref <= 0:
        return 0.0
    return max(0.0, min(100.0, x / ref * 100.0))


def _band(r):
    return 'alta' if r >= 66 else ('media' if r >= 40 else 'baixa')


def build_ctx(dataset):
    kpis = {r.get('metric'): r for r in dataset.get('deb_kpis', {}).get('rows', [])}
    chan = dataset.get('deb_chan', {}).get('rows', [])
    temp = dataset.get('deb_temp', {}).get('rows', [])
    weekly = dataset.get('deb_weekly', {}).get('rows', [])
    return {'kpis': kpis, 'chan': chan, 'temp': temp, 'weekly': weekly}


def _dev(ctx, metric, invert=False):
    k = ctx['kpis'].get(metric, {})
    val, meta = _f(k.get('value')), _f(k.get('meta'))
    if val is None or not meta:
        return None, val, meta
    d = (val - meta) / meta * 100
    return (-d if invert else d), val, meta


def q_meta_vendas(ctx):
    d, val, meta = _dev(ctx, 'vendas')
    if d is None:
        return {'relevancia': 0.0, 'justificativa': 'Sem meta de vendas para comparar.', 'kpis': []}
    rel = _nz(abs(d), 25) if d < 0 else _nz(d, 40) * 0.5
    return {'relevancia': round(rel, 1),
            'justificativa': f"{int(val)} vendas vs meta {int(meta)} ({d:+.0f}%).",
            'kpis': [{'label': 'Vendas', 'value': str(int(val))}, {'label': 'Meta', 'value': str(int(meta))},
                     {'label': 'vs meta', 'value': f'{d:+.0f}%'}]}


def q_temperatura(ctx):
    ts = [t for t in ctx['temp'] if _f(t.get('roas')) is not None]
    if not ts:
        return {'relevancia': 0.0, 'justificativa': 'Sem dado de temperatura.', 'kpis': []}
    best = max(ts, key=lambda t: _f(t['roas'])); worst = min(ts, key=lambda t: _f(t['roas']))
    spread = _f(best['roas']) - _f(worst['roas'])
    rel = _nz(spread, 2.0)
    return {'relevancia': round(rel, 1),
            'justificativa': f"{best['temperatura']} ROAS {_f(best['roas']):.2f}× vs {worst['temperatura']} {_f(worst['roas']):.2f}×.",
            'kpis': [{'label': 'Melhor', 'value': f"{best['temperatura']} {_f(best['roas']):.2f}×"},
                     {'label': 'Pior', 'value': f"{worst['temperatura']} {_f(worst['roas']):.2f}×"},
                     {'label': 'Amplitude', 'value': f"{spread:.2f}×"}]}


def q_org_pago(ctx):
    org = [c for c in ctx['chan'] if c.get('tipo') == 'organico']
    pago = [c for c in ctx['chan'] if c.get('tipo') == 'pago']
    vo = sum(_f(c.get('vendas')) or 0 for c in org); vp = sum(_f(c.get('vendas')) or 0 for c in pago)
    tot = vo + vp
    pct_org = (vo / tot * 100) if tot else 0
    rel = _nz(abs(pct_org - 50), 40)
    return {'relevancia': round(rel, 1),
            'justificativa': f"Orgânico fez {pct_org:.0f}% das vendas; pago {100 - pct_org:.0f}%.",
            'kpis': [{'label': 'Vendas orgânico', 'value': f'{pct_org:.0f}%'},
                     {'label': 'Vendas pago', 'value': f'{100 - pct_org:.0f}%'},
                     {'label': 'Total vendas', 'value': str(int(tot))}]}


def q_qualidade(ctx):
    d, val, meta = _dev(ctx, 'qual')
    rel = _nz(abs(d), 25) if (d is not None and d < 0) else 10.0
    return {'relevancia': round(rel, 1),
            'justificativa': f"Qualificação {val:.1f}%" + (f" vs meta {meta:.1f}% ({d:+.0f}%)." if meta else "."),
            'kpis': [{'label': 'Qualificação', 'value': f'{(val or 0):.1f}%'},
                     {'label': 'Meta', 'value': (f'{meta:.1f}%' if meta else '—')},
                     {'label': 'vs meta', 'value': (f'{d:+.0f}%' if d is not None else '—')}]}


def q_custo_midia(ctx):
    dc, cpl, mcpl = _dev(ctx, 'cpl', invert=True)
    dm, cpmql, mcpmql = _dev(ctx, 'cpmql', invert=True)
    rel = max(_nz(-dc, 20) if (dc is not None and dc < 0) else 0.0,
              _nz(-dm, 20) if (dm is not None and dm < 0) else 0.0)
    return {'relevancia': round(rel, 1),
            'justificativa': f"CPL R$ {(cpl or 0):.2f}" + (f" (meta R$ {mcpl:.2f})" if mcpl else "") + f"; CPMQL R$ {(cpmql or 0):.2f}.",
            'kpis': [{'label': 'CPL', 'value': f"R$ {(cpl or 0):.2f}"},
                     {'label': 'CPMQL', 'value': f"R$ {(cpmql or 0):.2f}"},
                     {'label': 'CPL vs meta', 'value': (f'{dc:+.0f}%' if dc is not None else '—')}]}


def q_concentracao(ctx):
    org = [c for c in ctx['chan'] if c.get('tipo') == 'organico']
    if not org:
        return {'relevancia': 0.0, 'justificativa': 'Sem canais orgânicos.', 'kpis': []}
    tot = sum(_f(c.get('leads')) or 0 for c in org)
    top = max(org, key=lambda c: _f(c.get('leads')) or 0)
    conc = ((_f(top.get('leads')) or 0) / tot * 100) if tot else 0
    rel = _nz(conc - 40, 40)
    return {'relevancia': round(rel, 1),
            'justificativa': f"{top.get('canal')} concentra {conc:.0f}% dos leads orgânicos.",
            'kpis': [{'label': 'Canal dominante', 'value': str(top.get('canal'))},
                     {'label': 'Concentração', 'value': f'{conc:.0f}%'},
                     {'label': 'Risco', 'value': ('alto' if conc > 50 else 'ok')}]}


QUESTIONS = [
    {'id': 'db-meta-vendas', 'fn': q_meta_vendas,
     'pergunta': 'A meta de vendas foi atingida? Onde ficou o gap?',
     'prompt': ('Compare as vendas realizadas com a meta total e por canal/temperatura. Identifique onde o '
                'gap se concentrou (canais ou temperaturas abaixo da meta) e o que puxou ou segurou o resultado.')},
    {'id': 'db-temperatura', 'fn': q_temperatura,
     'pergunta': 'Qual temperatura escalar e qual pausar pelo ROAS?',
     'prompt': ('Ordene as temperaturas por ROAS (faturamento pago menos investimento, sobre o investimento). '
                'Aponte quais escalar (ROAS ≥ 1, idealmente ≥ 2) e quais revisar/pausar (ROAS < 1), com invest., '
                'faturamento e conversão de cada.')},
    {'id': 'db-org-pago', 'fn': q_org_pago,
     'pergunta': 'Quem dominou o resultado: pago ou orgânico?',
     'prompt': ('Compare pago vs orgânico em leads, vendas, conversão e faturamento. Avalie a dependência: se o '
                'orgânico carrega as vendas, qual a sustentabilidade; se o pago domina, qual a eficiência (ROAS).')},
    {'id': 'db-qualidade', 'fn': q_qualidade,
     'pergunta': 'A qualidade dos leads ficou no nível esperado?',
     'prompt': ('Avalie a qualificação (MQLs/respostas) geral, do pago e do orgânico, vs a meta. Se abaixo, '
                'relacione com origem/temperatura e o impacto na conversão.')},
    {'id': 'db-custo', 'fn': q_custo_midia,
     'pergunta': 'O custo de mídia (CPL/CPMQL) ficou dentro da meta?',
     'prompt': ('Compare CPL e CPMQL com a meta. Se acima, separe se vem de CPM (leilão) ou de queda de '
                'qualificação (CPMQL = CPL / qualif.) e aponte a alavanca. Use só o invest. de captação.')},
    {'id': 'db-concentracao', 'fn': q_concentracao,
     'pergunta': 'A captação orgânica está concentrada demais num canal?',
     'prompt': ('Avalie a concentração dos leads orgânicos no canal dominante. Acima de 50% é dependência '
                'crítica — avalie o risco e a diversificação.')},
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
