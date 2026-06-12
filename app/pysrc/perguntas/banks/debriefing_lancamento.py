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


def _hdev(ctx, metric, invert=False):
    """Δ% vs histórico (lançamento anterior). + = melhor (invert para custos)."""
    k = ctx['kpis'].get(metric, {})
    val, hist = _f(k.get('value')), _f(k.get('hist'))
    if val is None or not hist:
        return None, val, hist
    d = (val - hist) / hist * 100
    return (-d if invert else d), val, hist


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


def q_resultado_geral(ctx):
    dv, vv, _ = _dev(ctx, 'vendas')
    df, _, _ = _dev(ctx, 'fat')
    sinais = [d for d in (dv, df) if d is not None]
    if not sinais:
        return {'relevancia': 20.0, 'justificativa': 'Sem metas para classificar o resultado.', 'kpis': []}
    media = sum(sinais) / len(sinais)
    verdito = 'sucesso' if media >= 5 else ('estável' if media >= -8 else 'deterioração')
    rel = 70.0 if verdito != 'estável' else 45.0
    return {'relevancia': rel,
            'justificativa': f"Resultado geral: {verdito} (vendas {dv:+.0f}% / fat {df:+.0f}% vs meta)."
                             if dv is not None and df is not None
                             else f"Resultado geral: {verdito} ({media:+.0f}% vs meta).",
            'kpis': [{'label': 'Veredito', 'value': verdito},
                     {'label': 'Vendas vs meta', 'value': (f'{dv:+.0f}%' if dv is not None else '—')},
                     {'label': 'Fat. vs meta', 'value': (f'{df:+.0f}%' if df is not None else '—')}]}


def q_meta_captacao(ctx):
    d, val, meta = _dev(ctx, 'leads')
    if d is None:
        return {'relevancia': 0.0, 'justificativa': 'Sem meta de leads para comparar.', 'kpis': []}
    rel = _nz(abs(d), 20) if d < 0 else _nz(d, 30) * 0.4
    return {'relevancia': round(rel, 1),
            'justificativa': f"{int(val)} leads vs meta {int(meta)} ({d:+.0f}%).",
            'kpis': [{'label': 'Leads', 'value': str(int(val))}, {'label': 'Meta', 'value': str(int(meta))},
                     {'label': 'vs meta', 'value': f'{d:+.0f}%'}]}


def q_vs_historico(ctx):
    metas = [('vendas', 'Vendas', False), ('fat', 'Faturamento', False), ('leads', 'Leads', False),
             ('cpl', 'CPL', True), ('roas', 'ROAS', False), ('qual', 'Qualificação', False)]
    deltas = []
    for m, lbl, inv in metas:
        d, val, hist = _hdev(ctx, m, invert=inv)
        if d is not None:
            deltas.append((lbl, d))
    if not deltas:
        return {'na': True, 'relevancia': 0.0, 'justificativa': 'Sem histórico (lançamento anterior) para comparar.', 'kpis': []}
    deltas.sort(key=lambda x: -abs(x[1]))
    rel = _nz(abs(deltas[0][1]), 30)
    txt = '; '.join(f"{lbl} {d:+.0f}%" for lbl, d in deltas[:3])
    return {'relevancia': round(rel, 1),
            'justificativa': f"Principais diferenças vs lançamento anterior: {txt}.",
            'kpis': [{'label': lbl, 'value': f'{d:+.0f}%'} for lbl, d in deltas[:3]]}


def q_split_leads(ctx):
    org = sum(_f(c.get('leads')) or 0 for c in ctx['chan'] if c.get('tipo') == 'organico')
    pago = sum(_f(c.get('leads')) or 0 for c in ctx['chan'] if c.get('tipo') == 'pago')
    tot = org + pago
    if not tot:
        return {'relevancia': 0.0, 'justificativa': 'Sem leads por escopo.', 'kpis': []}
    po = org / tot * 100
    rel = _nz(abs(po - 50), 45)
    return {'relevancia': round(rel, 1),
            'justificativa': f"Composição da captação: {po:.0f}% orgânico, {100 - po:.0f}% pago.",
            'kpis': [{'label': 'Leads orgânico', 'value': f'{po:.0f}%'},
                     {'label': 'Leads pago', 'value': f'{100 - po:.0f}%'},
                     {'label': 'Total leads', 'value': str(int(tot))}]}


def q_temp_mix(ctx):
    ts = [t for t in ctx['temp'] if (_f(t.get('leads')) or 0) > 0]
    if len(ts) < 2:
        return {'relevancia': 0.0, 'justificativa': 'Sem mix de temperatura suficiente.', 'kpis': []}
    tot = sum(_f(t['leads']) or 0 for t in ts)
    top = max(ts, key=lambda t: _f(t['leads']) or 0)
    share = (_f(top['leads']) or 0) / tot * 100 if tot else 0
    rel = _nz(share - 40, 50)
    return {'relevancia': round(rel, 1),
            'justificativa': f"Temperatura dominante: {top['temperatura']} com {share:.0f}% dos leads pagos.",
            'kpis': [{'label': 'Dominante', 'value': str(top['temperatura'])},
                     {'label': 'Participação', 'value': f'{share:.0f}%'},
                     {'label': 'ROAS', 'value': f"{_f(top.get('roas')) or 0:.2f}×"}]}


def q_saturacao(ctx):
    wk = [w for w in ctx['weekly'] if (_f(w.get('leads')) or 0) > 50]
    if len(wk) < 3:
        return {'relevancia': 0.0, 'justificativa': 'Histórico semanal insuficiente para avaliar esgotamento.', 'kpis': []}
    first, last = wk[0], wk[-1]
    cpl0, cpl1 = _f(first.get('cpl')) or 0, _f(last.get('cpl')) or 0
    l0, l1 = _f(first.get('leads')) or 0, _f(last.get('leads')) or 0
    cpl_up = ((cpl1 - cpl0) / cpl0 * 100) if cpl0 else 0
    lead_dn = ((l1 - l0) / l0 * 100) if l0 else 0
    rel = max(_nz(cpl_up, 30) if cpl_up > 0 else 0.0, _nz(-lead_dn, 40) if lead_dn < 0 else 0.0)
    return {'relevancia': round(rel, 1),
            'justificativa': f"Da 1ª à última semana: CPL {cpl_up:+.0f}%, leads/semana {lead_dn:+.0f}% — "
                             f"{'sinais de esgotamento' if (cpl_up > 15 or lead_dn < -25) else 'sem esgotamento claro'}.",
            'kpis': [{'label': 'CPL (1ª→últ.)', 'value': f'{cpl_up:+.0f}%'},
                     {'label': 'Leads/sem.', 'value': f'{lead_dn:+.0f}%'},
                     {'label': 'Semanas', 'value': str(len(wk))}]}


def q_cpmql_driver(ctx):
    dc, cpl, _ = _dev(ctx, 'cpl', invert=True)
    dq, qual, _ = _dev(ctx, 'qual')
    if dc is None and dq is None:
        return {'relevancia': 0.0, 'justificativa': 'Sem metas de CPL/qualificação para decompor o CPMQL.', 'kpis': []}
    # CPMQL = CPL / qualif. Custo alto (dc<0) e qualidade baixa (dq<0) ambos pioram.
    driver = 'taxa de qualidade' if (dq is not None and (dc is None or abs(dq) > abs(dc))) else 'custo por lead (CPL)'
    pior = max([x for x in (-(dc or 0), -(dq or 0))], default=0)
    rel = _nz(pior, 25) if pior > 0 else 10.0
    return {'relevancia': round(rel, 1),
            'justificativa': f"O CPMQL foi puxado principalmente pela {driver} "
                             f"(CPL {dc:+.0f}% vs meta · qualif. {dq:+.0f}% vs meta)."
                             if dc is not None and dq is not None
                             else f"Driver principal do CPMQL: {driver}.",
            'kpis': [{'label': 'Driver', 'value': driver},
                     {'label': 'CPL vs meta', 'value': (f'{dc:+.0f}%' if dc is not None else '—')},
                     {'label': 'Qualif. vs meta', 'value': (f'{dq:+.0f}%' if dq is not None else '—')}]}


def q_qual_disparidade(ctx):
    chans = [c for c in ctx['chan'] if (_f(c.get('leads')) or 0) >= 100 and _f(c.get('qual')) is not None]
    if len(chans) < 2:
        return {'relevancia': 0.0, 'justificativa': 'Poucos canais com volume para comparar qualidade.', 'kpis': []}
    best = max(chans, key=lambda c: _f(c['qual'])); worst = min(chans, key=lambda c: _f(c['qual']))
    spread = _f(best['qual']) - _f(worst['qual'])
    rel = _nz(spread, 30)
    return {'relevancia': round(rel, 1),
            'justificativa': f"Disparidade de qualidade entre fontes: {best['canal']} {_f(best['qual']):.0f}% "
                             f"vs {worst['canal']} {_f(worst['qual']):.0f}% ({spread:.0f}pp).",
            'kpis': [{'label': 'Melhor', 'value': f"{best['canal']} {_f(best['qual']):.0f}%"},
                     {'label': 'Pior', 'value': f"{worst['canal']} {_f(worst['qual']):.0f}%"},
                     {'label': 'Amplitude', 'value': f'{spread:.0f}pp'}]}


def q_onde_perdemos(ctx):
    dv, val, meta = _dev(ctx, 'vendas')
    piores = []
    for t in ctx['temp']:
        m, v = _f(t.get('meta_vendas')), _f(t.get('vendas')) or 0
        if m:
            piores.append((t['temperatura'], (v - m) / m * 100, v, m))
    abaixo = sorted([p for p in piores if p[1] < 0], key=lambda x: x[1])
    if dv is None and not abaixo:
        return {'relevancia': 0.0, 'justificativa': 'Sem metas para localizar a perda.', 'kpis': []}
    rel = _nz(abs(dv), 25) if (dv is not None and dv < 0) else (_nz(abs(abaixo[0][1]), 30) if abaixo else 10.0)
    pior_txt = f"{abaixo[0][0]} ({abaixo[0][1]:+.0f}%)" if abaixo else '—'
    return {'relevancia': round(rel, 1),
            'justificativa': (f"Gap total de vendas {dv:+.0f}% vs meta" if dv is not None else "Vendas")
                             + f"; maior perda por temperatura: {pior_txt}.",
            'kpis': [{'label': 'Vendas vs meta', 'value': (f'{dv:+.0f}%' if dv is not None else '—')},
                     {'label': 'Pior temperatura', 'value': pior_txt},
                     {'label': 'Faltaram', 'value': (str(int(meta - val)) if (dv is not None and val < meta) else '—')}]}


def q_receita_vs_invest(ctx):
    df, fat, _ = _hdev(ctx, 'fat')
    di, inv, _ = _hdev(ctx, 'invest_cpt')
    if df is None or di is None:
        return {'na': True, 'relevancia': 0.0, 'justificativa': 'Sem histórico para comparar receita × investimento.', 'kpis': []}
    # ganho real = receita cresceu mais (ou caiu menos) que o investimento
    eficiencia = df - di
    rel = _nz(abs(eficiencia), 30)
    leitura = 'ganho real de eficiência' if eficiencia > 3 else ('proporcional' if abs(eficiencia) <= 3 else 'piora de eficiência')
    return {'relevancia': round(rel, 1),
            'justificativa': f"Receita {df:+.0f}% e investimento de captação {di:+.0f}% vs histórico — {leitura}.",
            'kpis': [{'label': 'Receita vs hist', 'value': f'{df:+.0f}%'},
                     {'label': 'Invest vs hist', 'value': f'{di:+.0f}%'},
                     {'label': 'Leitura', 'value': leitura}]}


def q_roas_hist(ctx):
    d, val, hist = _hdev(ctx, 'roas')
    if d is None:
        return {'na': True, 'relevancia': 0.0, 'justificativa': 'Sem ROAS histórico para comparar.', 'kpis': []}
    rel = _nz(abs(d), 25)
    return {'relevancia': round(rel, 1),
            'justificativa': f"ROAS de captação {val:.2f}× vs {hist:.2f}× no histórico ({d:+.0f}%).",
            'kpis': [{'label': 'ROAS atual', 'value': f'{val:.2f}×'},
                     {'label': 'ROAS hist.', 'value': f'{hist:.2f}×'},
                     {'label': 'vs hist', 'value': f'{d:+.0f}%'}]}


QUESTIONS = [
    {'id': 'db-resultado-geral', 'fn': q_resultado_geral,
     'pergunta': 'O resultado geral foi sucesso, estável ou deterioração?',
     'prompt': ('Classifique o resultado do lançamento (sucesso / estável / deterioração) combinando vendas e '
                'faturamento vs meta e, se houver, vs o lançamento anterior. Aponte os 2–3 fatores que mais '
                'determinaram essa classificação.')},
    {'id': 'db-meta-captacao', 'fn': q_meta_captacao,
     'pergunta': 'A meta de captação (leads) foi atingida?',
     'prompt': ('Compare os leads captados com a meta total e por canal. Mostre onde a captação superou ou ficou '
                'abaixo da meta e o peso de cada canal no gap.')},
    {'id': 'db-vs-historico', 'fn': q_vs_historico,
     'pergunta': 'Quais as principais diferenças vs o lançamento anterior?',
     'prompt': ('Compare vendas, faturamento, leads, CPL, ROAS e qualificação com o lançamento anterior (histórico). '
                'Destaque as maiores variações — positivas e negativas — e a leitura de cada uma.')},
    {'id': 'db-onde-perdemos', 'fn': q_onde_perdemos,
     'pergunta': 'Onde mais perdemos volume de vendas e receita?',
     'prompt': ('Localize onde o resultado de vendas/receita mais ficou abaixo da meta — por temperatura, por '
                'escopo (pago × orgânico) e, se possível, por canal. Quantifique o quanto cada um deixou de entregar.')},
    {'id': 'db-receita-invest', 'fn': q_receita_vs_invest,
     'pergunta': 'O crescimento da receita foi proporcional ao do investimento? Gerou ganho real?',
     'prompt': ('Compare a variação de receita com a variação do investimento de captação vs o histórico. '
                'Avalie se o aumento (ou corte) de verba gerou ganho REAL de resultado ou só acompanhou o gasto.')},
    {'id': 'db-roas-hist', 'fn': q_roas_hist,
     'pergunta': 'O ROAS de captação foi melhor ou pior que o histórico?',
     'prompt': ('Compare o ROAS de captação (faturamento pago − investimento, sobre o investimento) com o do '
                'lançamento anterior. Aponte o que mudou na eficiência da mídia paga.')},
    {'id': 'db-split-leads', 'fn': q_split_leads,
     'pergunta': 'Qual a composição de leads orgânicos x pagos?',
     'prompt': ('Mostre a divisão da captação entre orgânico e pago (leads). Avalie a dependência de cada fonte e '
                'se a proporção é saudável para a sustentabilidade do próximo lançamento.')},
    {'id': 'db-temp-mix', 'fn': q_temp_mix,
     'pergunta': 'Houve mudança na participação por temperatura do lead pago?',
     'prompt': ('Avalie o mix de temperatura (quente, frio, remarketing, advantage) no lead pago — participação, '
                'ROAS e conversão de cada. Aponte concentração excessiva e onde rebalancear verba.')},
    {'id': 'db-saturacao', 'fn': q_saturacao,
     'pergunta': 'Houve sinais de esgotamento da audiência?',
     'prompt': ('Olhe a evolução semanal de CPL e de leads captados. CPL subindo e/ou volume caindo ao longo das '
                'semanas indicam saturação — avalie o ponto de virada e o impacto na eficiência.')},
    {'id': 'db-cpmql-driver', 'fn': q_cpmql_driver,
     'pergunta': 'O que mais impactou o CPMQL: a taxa de qualidade ou o CPL?',
     'prompt': ('Decomponha o CPMQL (= CPL / taxa de qualificação). Compare CPL vs meta e qualificação vs meta para '
                'isolar qual dos dois puxou mais o custo por lead qualificado e qual alavanca priorizar.')},
    {'id': 'db-qual-disparidade', 'fn': q_qual_disparidade,
     'pergunta': 'A qualidade variou muito entre fontes de tráfego?',
     'prompt': ('Compare a qualificação (MQLs/respostas) entre os canais com volume relevante. Aponte a disparidade '
                'entre a melhor e a pior fonte e o que isso sugere sobre segmentação e criativos.')},
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
        if r.get('na'):   # dado necessário ausente nesta base → descarta a pergunta
            continue
        out.append({
            'id': q['id'], 'pergunta': q['pergunta'],
            'justificativa': r['justificativa'], 'kpis': r['kpis'],
            'relevancia': r['relevancia'], 'nivel': _band(r['relevancia']),
            'deepen': {'sectionId': '', 'blockId': '', 'prompt': q['prompt']},
        })
    out.sort(key=lambda x: x['relevancia'], reverse=True)
    return out
