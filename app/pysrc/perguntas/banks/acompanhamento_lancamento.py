"""Banco de perguntas norteadoras do "acompanhamento de lançamento".

Cada pergunta pontua a PRÓPRIA relevância (0–100) sobre o dataset.json já
calculado pelo build_report. Fontes:
  • acom_kpis   — um registro por KPI (macro + tráfego): value, d3, meta, dev,
    cls (ok/warn/bad), trend_dir, trend_pct, grupo.
  • acom_funnel — etapas do funil de tráfego pago: value, migracao, bench, gap
    (% abaixo do esperado), maior_furo.
  • acom_daily  — séries por dia (leads, invest, cpl, cpmql, taxa_qual, cpm).
  • acom_origem — split de leads pago × orgânico.

As perguntas refletem as decisões TÁTICAS do acompanhamento diário: qual o maior
furo do funil, qual KPI está mais fora da meta, a qualidade está caindo, o custo
está subindo. A relevância ranqueia o que vale aprofundar HOJE; o `prompt` guia o
detalhamento (números sempre via bind, nunca inventados).
"""

TYPE = 'acompanhamento-lancamento'


def detect(dataset):
    return 'acom_kpis' in dataset and 'acom_funnel' in dataset


# ───────────────────────── helpers ─────────────────────────

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


def _pctf(v):
    return '—' if v is None else ('%.1f%%' % v)


def build_ctx(dataset):
    kpis = {r.get('metric'): r for r in dataset.get('acom_kpis', {}).get('rows', [])}
    funnel = dataset.get('acom_funnel', {}).get('rows', [])
    origem = {r.get('origem'): _f(r.get('leads')) for r in dataset.get('acom_origem', {}).get('rows', [])}
    return {'kpis': kpis, 'funnel': funnel, 'origem': origem,
            'daily': dataset.get('acom_daily', {}).get('rows', []),
            'temp': dataset.get('acom_temp', {}).get('rows', []),
            'canais': dataset.get('acom_canais', {}).get('rows', []),
            # MECÂNICA: no lançamento pago o lead compra o ingresso. Metade das
            # perguntas do clássico (CPL, CPMQL, saturação por CPL) não existe ali, e
            # as que decidem — exposição de caixa, ROAS × ROI, CAC vs ticket, order
            # bump — não existem no clássico. A presença da exposição no dataset é o
            # sinal, porque só o motor do pago a calcula.
            'pago': 'exposicao' in kpis}


def _num(ctx, m, k='value'):
    return _f((ctx['kpis'].get(m) or {}).get(k))


def _brl(v):
    if v is None:
        return '—'
    s = f'{abs(v):,.2f}'.replace(',', '§').replace('.', ',').replace('§', '.')
    return f"{'-' if v < 0 else ''}R$ {s}"


def _avg(rows, k):
    vals = [_f(r.get(k)) for r in rows if _f(r.get(k)) is not None]
    return sum(vals) / len(vals) if vals else None


# ───────────────────────── perguntas ─────────────────────────

def q_maior_furo(ctx):
    furo = next((s for s in ctx['funnel'] if s.get('maior_furo')), None)
    if not furo:
        return {'relevancia': 0.0, 'justificativa': 'Nenhuma etapa do funil abaixo do benchmark.', 'kpis': []}
    gap = _f(furo.get('gap')) or 0
    rel = _nz(gap, 60)
    return {'relevancia': round(rel, 1),
            'justificativa': f"{furo.get('etapa')} migra {_pctf(_f(furo.get('migracao')))} (esperado {_pctf(_f(furo.get('bench')))}) — {gap:.0f}% abaixo.",
            'kpis': [{'label': 'Maior furo', 'value': str(furo.get('etapa'))},
                     {'label': 'Migração', 'value': _pctf(_f(furo.get('migracao')))},
                     {'label': 'vs esperado', 'value': f'-{gap:.0f}%'}]}


# Custos: dev>0 = acima da meta = PIOR. Métricas normais: dev<0 = abaixo = pior.
# `_gap` normaliza por direção (>0 = quanto está pior que a meta) p/ comparar os dois.
_COST = {'cpl', 'cpmql', 'cpm'}


def _gap(r):
    dev = _f(r.get('dev')) or 0.0
    return dev if r.get('metric') in _COST else -dev


def _worst_kpi(ctx, grupo):
    cand = [r for r in ctx['kpis'].values() if r.get('grupo') == grupo and r.get('cls') in ('bad', 'warn')
            and _f(r.get('dev')) is not None]
    return max(cand, key=_gap, default=None)   # maior gap direction-aware = pior (custo OU normal)


def q_pior_kpi_macro(ctx):
    w = _worst_kpi(ctx, 'macro')
    if not w:
        return {'relevancia': 0.0, 'justificativa': 'Todos os KPIs macro dentro ou acima da meta.', 'kpis': []}
    dev = _f(w.get('dev')) or 0
    rel = _nz(_gap(w), 25) * (1.0 if w.get('cls') == 'bad' else 0.7)
    return {'relevancia': round(rel, 1),
            'justificativa': f"{w.get('label')} está {dev:+.0f}% vs meta ({w.get('cls')}) — maior desvio (pior que a meta) entre os KPIs macro.",
            'kpis': [{'label': 'KPI', 'value': str(w.get('label'))},
                     {'label': 'Desvio vs meta', 'value': f'{dev:+.0f}%'},
                     {'label': 'Tendência', 'value': f"{w.get('trend_dir')} {_f(w.get('trend_pct')) or 0:.0f}%"}]}


def q_qualidade_caindo(ctx):
    tq = ctx['kpis'].get('taxa_qual', {})
    dev = _f(tq.get('dev'))
    down = tq.get('trend_dir') == 'down'
    rel = max(_nz(abs(dev), 20) if (dev is not None and dev < 0) else 0.0,
              _nz(_f(tq.get('trend_pct')) or 0, 25) if down else 0.0)
    return {'relevancia': round(rel, 1),
            'justificativa': f"Taxa de Qualidade em {_pctf(_f(tq.get('value')))} (meta {_pctf(_f(tq.get('meta')))}), tendência {tq.get('trend_dir')}.",
            'kpis': [{'label': 'Qualidade', 'value': _pctf(_f(tq.get('value')))},
                     {'label': 'vs meta', 'value': (f'{dev:+.0f}%' if dev is not None else '—')},
                     {'label': '3 dias', 'value': _pctf(_f(tq.get('d3')))}]}


def q_custo_subindo(ctx):
    cpl = ctx['kpis'].get('cpl', {})
    cpmql = ctx['kpis'].get('cpmql', {})
    up = cpl.get('trend_dir') == 'up'
    dev = _f(cpl.get('dev'))
    rel = max(_nz(_f(cpl.get('trend_pct')) or 0, 30) if up else 0.0,
              _nz(dev, 20) if (dev is not None and dev > 0) else 0.0)
    return {'relevancia': round(rel, 1),
            'justificativa': f"CPL em R$ {_f(cpl.get('value')) or 0:.2f} (meta R$ {_f(cpl.get('meta')) or 0:.2f}); CPMQL R$ {_f(cpmql.get('value')) or 0:.2f}.",
            'kpis': [{'label': 'CPL', 'value': f"R$ {_f(cpl.get('value')) or 0:.2f}"},
                     {'label': 'CPL 3 dias', 'value': f"R$ {_f(cpl.get('d3')) or 0:.2f}"},
                     {'label': 'Tendência', 'value': f"{cpl.get('trend_dir')} {_f(cpl.get('trend_pct')) or 0:.0f}%"}]}


def q_taxa_resposta(ctx):
    tr = ctx['kpis'].get('taxa_resp', {})
    dev = _f(tr.get('dev'))
    rel = _nz(abs(dev), 20) if (dev is not None and dev < 0) else _nz(_f(tr.get('trend_pct')) or 0, 30) if tr.get('trend_dir') == 'down' else 0.0
    return {'relevancia': round(rel, 1),
            'justificativa': f"Taxa de Resposta em {_pctf(_f(tr.get('value')))} (meta {_pctf(_f(tr.get('meta')))}).",
            'kpis': [{'label': 'Taxa de Resposta', 'value': _pctf(_f(tr.get('value')))},
                     {'label': 'vs meta', 'value': (f'{dev:+.0f}%' if dev is not None else '—')},
                     {'label': '3 dias', 'value': _pctf(_f(tr.get('d3')))}]}


def q_pago_organico(ctx):
    p = ctx['origem'].get('Pago') or 0
    o = ctx['origem'].get('Orgânico') or 0
    tot = p + o
    pct_pago = (p / tot * 100) if tot else 0
    conc = max(pct_pago, 100 - pct_pago)
    rel = _nz(conc - 50, 40)   # quanto mais concentrado num canal, mais vale olhar
    return {'relevancia': round(rel, 1),
            'justificativa': f"{pct_pago:.0f}% dos leads vêm do pago e {100 - pct_pago:.0f}% do orgânico.",
            'kpis': [{'label': 'Leads pago', 'value': f'{pct_pago:.0f}%'},
                     {'label': 'Leads orgânico', 'value': f'{100 - pct_pago:.0f}%'},
                     {'label': 'Total', 'value': str(int(tot))}]}


def q_temperatura(ctx):
    ts = [t for t in ctx['temp'] if (_f(t.get('cpl')) or 0) > 0 and (_f(t.get('leads')) or 0) >= 30]
    if len(ts) < 2:
        return {'na': True, 'relevancia': 0.0, 'justificativa': 'Sem temperaturas pagas com volume p/ comparar.', 'kpis': []}
    best = min(ts, key=lambda t: _f(t['cpl']))
    worst = max(ts, key=lambda t: _f(t['cpl']))
    spread = (_f(worst['cpl']) - _f(best['cpl'])) / _f(best['cpl']) * 100 if _f(best['cpl']) else 0
    rel = _nz(spread, 60)
    return {'relevancia': round(rel, 1),
            'justificativa': f"{best['temperatura']} tem CPL R$ {_f(best['cpl']):.2f} vs {worst['temperatura']} R$ {_f(worst['cpl']):.2f} ({spread:.0f}% mais caro) — vale realocar verba.",
            'kpis': [{'label': 'Melhor CPL', 'value': f"{best['temperatura']} R$ {_f(best['cpl']):.2f}"},
                     {'label': 'Pior CPL', 'value': f"{worst['temperatura']} R$ {_f(worst['cpl']):.2f}"},
                     {'label': 'Diferença', 'value': f'{spread:.0f}%'}]}


def q_concentracao_piora(ctx):
    cpl = ctx['kpis'].get('cpl', {})
    up = cpl.get('trend_dir') == 'up'
    tp = _f(cpl.get('trend_pct')) or 0
    dev = _f(cpl.get('dev'))
    rel = _nz(tp, 25) if up else (_nz(dev, 30) if (dev is not None and dev > 0) else 12.0)
    estado = f"subindo {tp:.0f}%" if up else ('acima da meta' if (dev is not None and dev > 0) else 'estável')
    return {'relevancia': round(rel, 1),
            'justificativa': f"CPL {estado} — vale ver se a piora concentra num criativo/público/campanha ou é geral (leilão/sazonalidade).",
            'kpis': [{'label': 'CPL', 'value': f"R$ {_f(cpl.get('value')) or 0:.2f}"},
                     {'label': 'Tendência', 'value': f"{cpl.get('trend_dir')} {tp:.0f}%"},
                     {'label': 'vs meta', 'value': (f'{dev:+.0f}%' if dev is not None else '—')}]}


def q_saturacao(ctx):
    d = [r for r in ctx['daily'] if _f(r.get('leads')) is not None]
    if len(d) < 6:
        return {'na': True, 'relevancia': 0.0, 'justificativa': 'Série diária curta p/ avaliar saturação.', 'kpis': []}
    n = max(2, len(d) // 3)
    l0, l1 = _avg(d[:n], 'leads'), _avg(d[-n:], 'leads')
    c0, c1 = _avg(d[:n], 'cpl'), _avg(d[-n:], 'cpl')
    lead_dn = ((l1 - l0) / l0 * 100) if (l0 and l1 is not None) else 0
    cpl_up = ((c1 - c0) / c0 * 100) if (c0 and c1 is not None) else 0
    # Saturação = custo subindo COM volume NÃO crescendo. Se os leads/dia estão subindo,
    # CPL mais alto é diminishing return de ESCALA, não esgotamento — não é a pergunta aqui.
    crescendo = lead_dn > 10
    sat = (not crescendo) and (cpl_up > 15 or lead_dn < -25)
    if crescendo:
        rel = 0.0
        leitura = f'escalando (leads/dia +{lead_dn:.0f}%) — alta de CPL é custo de escala, não saturação'
    else:
        rel = max(_nz(cpl_up, 30) if cpl_up > 0 else 0.0, _nz(-lead_dn, 40) if lead_dn < 0 else 0.0)
        leitura = 'sinais de saturação' if sat else 'sem saturação clara'
    return {'relevancia': round(rel, 1),
            'justificativa': f"Do início ao fim: CPL {cpl_up:+.0f}%, leads/dia {lead_dn:+.0f}% — {leitura}.",
            'kpis': [{'label': 'CPL (ini→fim)', 'value': f'{cpl_up:+.0f}%'},
                     {'label': 'Leads/dia', 'value': f'{lead_dn:+.0f}%'},
                     {'label': 'Dias', 'value': str(len(d))}]}


def q_canal_organico(ctx):
    ch = [c for c in ctx['canais'] if (_f(c.get('leads')) or 0) > 0]
    if len(ch) < 2:
        return {'na': True, 'relevancia': 0.0, 'justificativa': 'Sem canais orgânicos suficientes p/ avaliar concentração.', 'kpis': []}
    tot = sum(_f(c['leads']) or 0 for c in ch)
    top = max(ch, key=lambda c: _f(c['leads']) or 0)
    share = (_f(top['leads']) or 0) / tot * 100 if tot else 0
    rel = _nz(share - 40, 40)
    return {'relevancia': round(rel, 1),
            'justificativa': f"{top['canal']} concentra {share:.0f}% dos leads orgânicos.",
            'kpis': [{'label': 'Canal dominante', 'value': str(top['canal'])},
                     {'label': 'Concentração', 'value': f'{share:.0f}%'},
                     {'label': 'Risco', 'value': ('alto' if share > 50 else 'ok')}]}


# ─────────────────── perguntas do LANÇAMENTO PAGO ───────────────────
# Só entram quando o lead compra o ingresso: aqui a campanha tem caixa DURANTE a
# captação, e a decisão do dia deixa de ser "quanto custa o lead" para ser "estou no
# verde, e o que muda isso hoje".

def q_exposicao(ctx):
    if not ctx['pago']:
        return {'na': True}
    e = ctx['kpis'].get('exposicao') or {}
    v = _f(e.get('value'))
    if v is None:
        return {'na': True}
    inv = _num(ctx, 'investimento') or 0
    # A urgência está em quão PERTO do zero a posição está, não em quão grande ela é:
    # negativa é máxima, e uma margem de 1% sobre o investido é quase tão urgente
    # quanto, porque um dia ruim a vira. Margem folgada é que não pede atenção hoje.
    margem = (v / inv * 100) if inv else 0
    rel = 100.0 if v < 0 else _nz(20 - margem, 20)
    return {'relevancia': round(rel, 1),
            'justificativa': (f"Exposição de caixa em {_brl(v)} sobre {_brl(inv)} investidos "
                              f"(margem de {margem:.1f}%) — "
                              + ('CAIXA NEGATIVO: cada dia no mesmo ritmo aumenta o valor em risco.' if v < 0
                                 else ('margem no fio: um dia fraco vira a posição.' if margem < 5
                                       else 'o ingresso já cobre o tráfego com folga.'))),
            'kpis': [{'label': 'Exposição', 'value': _brl(v)},
                     {'label': 'Investido', 'value': _brl(inv)},
                     {'label': 'Margem', 'value': f'{margem:.1f}%'}]}


def q_roas_vs_roi(ctx):
    if not ctx['pago']:
        return {'na': True}
    roas, roi = _num(ctx, 'roas_pago'), _num(ctx, 'roas_geral')
    if roas is None or roi is None:
        return {'na': True}
    # O caso que importa: o GERAL se paga mas o PAGO não — o orgânico está bancando a
    # mídia, e o relatório "no verde" esconde tráfego pago no vermelho.
    carregando = roi >= 1.0 and roas < 1.0
    rel = 100.0 if carregando else (_nz(1.0 - roas, 0.5) * 100 if roas < 1.0 else _nz(roi - roas, 1.0))
    return {'relevancia': round(min(rel, 100.0), 1),
            'justificativa': (f"ROAS {roas:.2f}× (só anúncio) vs ROI {roi:.2f}× (com orgânico). "
                              + ('O orgânico está bancando a mídia: o resultado geral fecha, mas o tráfego pago não se paga.'
                                 if carregando else 'A diferença entre os dois é o que o orgânico acrescenta.')),
            'kpis': [{'label': 'ROAS (pago)', 'value': f'{roas:.2f}×'},
                     {'label': 'ROI (geral)', 'value': f'{roi:.2f}×'},
                     {'label': 'Orgânico banca?', 'value': ('sim' if carregando else 'não')}]}


def q_cac_ticket(ctx):
    if not ctx['pago']:
        return {'na': True}
    cac, tk = _num(ctx, 'custo_ing_pago'), _num(ctx, 'ticket_medio')
    if cac is None or tk is None or tk <= 0:
        return {'na': True}
    # Folga = quanto do ticket sobra depois de pagar a aquisição. Negativa: cada
    # ingresso vendido pelo pago sai no prejuízo antes de qualquer dedução.
    folga = (tk - cac) / tk * 100
    rel = 100.0 if folga < 0 else _nz(60 - folga, 60)
    return {'relevancia': round(rel, 1),
            'justificativa': (f"CAC {_brl(cac)} contra ticket médio {_brl(tk)} — sobra {folga:.0f}% do ticket. "
                              + ('NEGATIVO: o ingresso vendido pelo pago nasce no prejuízo.' if folga < 0
                                 else 'É essa folga que paga imposto, taxa e o resto da operação.')),
            'kpis': [{'label': 'CAC', 'value': _brl(cac)},
                     {'label': 'Ticket médio', 'value': _brl(tk)},
                     {'label': 'Folga', 'value': f'{folga:.0f}%'}]}


def q_order_bump(ctx):
    if not ctx['pago']:
        return {'na': True}
    tb = ctx['kpis'].get('taxa_bump') or {}
    v, meta = _f(tb.get('value')), _f(tb.get('meta'))
    if v is None or not meta:
        return {'na': True}
    gap = (meta - v) / meta * 100
    tk, tkm = _num(ctx, 'ticket_medio'), _f((ctx['kpis'].get('ticket_medio') or {}).get('meta'))
    perda = (tkm - tk) if (tk is not None and tkm is not None) else None
    rel = _nz(gap, 50)
    return {'relevancia': round(rel, 1),
            'justificativa': (f"Taxa de order bump {_pctf(v)} contra benchmark {_pctf(meta)}"
                              + (f" — {_brl(perda)} por ingresso deixados na mesa." if perda and perda > 0
                                 else '. É receita incremental que não custa mídia.')),
            'kpis': [{'label': 'Taxa de bump', 'value': _pctf(v)},
                     {'label': 'Benchmark', 'value': _pctf(meta)},
                     {'label': 'Por ingresso', 'value': (_brl(perda) if perda and perda > 0 else '—')}]}


def q_cpm_bench(ctx):
    cpm = ctx['kpis'].get('cpm') or {}
    v, meta = _f(cpm.get('value')), _f(cpm.get('meta'))
    if v is None or not meta:
        return {'na': True}
    dev = (v - meta) / meta * 100
    rel = _nz(dev, 30) if dev > 0 else 0.0
    return {'relevancia': round(rel, 1),
            'justificativa': (f"CPM {_brl(v)} contra o bench de {_brl(meta)} ({dev:+.0f}%). O bench sai do custo-alvo "
                              f"por conversão percorrendo o funil ao contrário — acima dele, a mídia encareceu o "
                              f"suficiente para pressionar o custo de aquisição."),
            'kpis': [{'label': 'CPM', 'value': _brl(v)},
                     {'label': 'Bench', 'value': _brl(meta)},
                     {'label': 'Desvio', 'value': f'{dev:+.0f}%'}]}


def q_temp_exposicao(ctx):
    if not ctx['pago']:
        return {'na': True}
    ts = [t for t in ctx['temp'] if _f(t.get('exposicao')) is not None and (_f(t.get('ingressos')) or 0) >= 10]
    if len(ts) < 2:
        return {'na': True}
    best = max(ts, key=lambda t: _f(t['exposicao']))
    worst = min(ts, key=lambda t: _f(t['exposicao']))
    ev, wv = _f(best['exposicao']), _f(worst['exposicao'])
    inv = sum(_f(t.get('invest')) or 0 for t in ts)
    rel = _nz(abs(wv) / inv * 100, 30) if (wv < 0 and inv) else _nz((ev - wv) / max(abs(ev), 1) * 100, 100)
    # a leitura muda conforme QUANTAS queimam: com todas no vermelho não há verba a
    # realocar entre elas, o problema é a mídia inteira.
    leitura = ('nenhuma delas devolve caixa hoje — não é caso de realocar entre temperaturas, '
               'é a eficiência da mídia como um todo' if ev < 0
               else ('a verba está dividida entre uma que paga e outra que queima' if wv < 0
                     else 'as duas devolvem caixa; a diferença diz onde a próxima verba rende mais'))
    return {'relevancia': round(min(rel, 100.0), 1),
            'justificativa': (f"{best['temperatura']} {_brl(ev)} de exposição e {worst['temperatura']} "
                              f"{_brl(wv)} — {leitura}."),
            'kpis': [{'label': 'Melhor', 'value': f"{best['temperatura']} {_brl(ev)}"},
                     {'label': 'Pior', 'value': f"{worst['temperatura']} {_brl(wv)}"},
                     {'label': 'Invest total', 'value': _brl(inv)}]}


def q_ritmo_ingressos(ctx):
    if not ctx['pago']:
        return {'na': True}
    ing = ctx['kpis'].get('ingressos') or {}
    v, meta = _f(ing.get('value')), _f(ing.get('meta'))
    if v is None or not meta:
        return {'na': True}
    dev = (v - meta) / meta * 100
    rel = _nz(-dev, 30) if dev < 0 else 0.0
    return {'relevancia': round(rel, 1),
            'justificativa': (f"{v:.0f} ingressos contra {meta:.0f} esperados até o corte ({dev:+.0f}%). "
                              f"O ritmo diário diz se a diferença está aumentando ou fechando."),
            'kpis': [{'label': 'Ingressos', 'value': f'{v:.0f}'},
                     {'label': 'Meta to date', 'value': f'{meta:.0f}'},
                     {'label': 'vs meta', 'value': f'{dev:+.0f}%'}]}


# ─────── perguntas do CLÁSSICO que não existem no pago (CPL/CPMQL) ───────

def _so_classico(fn):
    def wrap(ctx):
        return {'na': True} if ctx['pago'] else fn(ctx)
    return wrap


QUESTIONS = [
    # PAGO
    {'id': 'ac-expo', 'fn': q_exposicao,
     'pergunta': 'A campanha está no verde ou expondo caixa?',
     'prompt': ('Avalie a exposição de caixa (receita de ingresso + order bump, menos reembolso, impostos, '
                'taxa de broker, investimento e imposto de mídia) contra o investido e contra a meta. '
                'Use a evolução diária e a acumulada: diga se a posição está melhorando ou piorando e em que '
                'dia virou. Se negativa, quantifique quanto por dia está sendo adicionado ao risco e qual '
                'alavanca (CAC, order bump, volume) fecha a conta mais rápido.')},
    {'id': 'ac-roas-roi', 'fn': q_roas_vs_roi,
     'pergunta': 'O tráfego pago se paga sozinho ou o orgânico está carregando?',
     'prompt': ('Compare ROAS (receita SÓ das linhas com investimento ÷ investimento) com ROI (receita TOTAL ÷ '
                'investimento). Se o ROI passa de 1,00× e o ROAS não, o orgânico está bancando a mídia — explique '
                'o risco: o resultado agregado esconde tráfego pago no vermelho, e escalar verba piora. '
                'Quantifique quanto do retorno vem de venda orgânica e recomende a decisão sobre a verba.')},
    {'id': 'ac-cac-ticket', 'fn': q_cac_ticket,
     'pergunta': 'O CAC cabe no ticket médio?',
     'prompt': ('Compare o CAC (investimento ÷ ingressos vindos de anúncio) com o ticket médio (receita total ÷ '
                'ingressos, com o order bump dentro). A folga entre os dois é o que sobra por ingresso para pagar '
                'imposto, taxa e operação. Avalie a tendência do CAC nos últimos dias e diga se a folga está '
                'encolhendo. Se o CAC passou do ticket, aponte onde ele se concentra (criativo, público, canal).')},
    {'id': 'ac-bump', 'fn': q_order_bump,
     'pergunta': 'Quanto o order bump está deixando na mesa?',
     'prompt': ('Compare a taxa de order bump com o benchmark e traduza a diferença em reais POR INGRESSO '
                '(ticket realizado vs ticket com o bump no benchmark). É a alavanca que melhora a exposição de '
                'caixa sem custar mídia. Veja a evolução diária da taxa e se algum recorte (criativo, público, '
                'temperatura) converte bump melhor que os demais.')},
    {'id': 'ac-cpm-bench', 'fn': q_cpm_bench,
     'pergunta': 'A mídia encareceu a ponto de pressionar o custo de aquisição?',
     'prompt': ('Compare o CPM com o benchmark derivado (custo-alvo por conversão × CTR × conversão esperada). '
                'Acima dele, cada mil impressões custa mais do que o plano suporta. Separe se a alta é de leilão '
                '(CPM sobe com CTR estável) ou de criativo (CTR caindo). Use a evolução diária e recomende a ação.')},
    {'id': 'ac-temp-expo', 'fn': q_temp_exposicao,
     'pergunta': 'Qual temperatura devolve caixa e qual queima?',
     'prompt': ('Ordene as temperaturas do tráfego pago por exposição de caixa (dimensao=temperatura), olhando '
                'também CAC e taxa de qualidade de cada uma. Aponte qual escalar e qual frear, e quanto de verba '
                'está hoje na que queima caixa. Recomende a realocação com o número.')},
    {'id': 'ac-ritmo-ing', 'fn': q_ritmo_ingressos,
     'pergunta': 'O ritmo de venda de ingressos fecha a meta?',
     'prompt': ('Compare os ingressos vendidos com a meta to-date e o ritmo diário necessário para fechar a meta '
                'total no prazo. Use a série acumulada: diga se a distância para o plano está aumentando ou '
                'fechando e desde quando. Separe quanto vem de pago e quanto de orgânico.')},
    # COMUNS às duas mecânicas
    {'id': 'ac-funil-furo', 'fn': q_maior_furo,
     'pergunta': 'Onde está o maior furo do funil de tráfego pago?',
     'prompt': ('Identifique a transição do funil com maior queda relativa ao SEU benchmark (não a maior perda '
                'absoluta). No lançamento pago o funil abre em Investimento → Impressões, cuja "taxa" é o CPM '
                'contra o bench derivado, segue por CTR e clique→ingresso, e BIFURCA no fim: do ingresso saem '
                'MQLs (qualidade da base) e order bumps (receita incremental), que dividem o mesmo denominador '
                'e não somam 100%. '
                'Mostre a etapa, a migração realizada vs a esperada e o tamanho do furo. Aponte a causa '
                'provável e a ação para recuperar essa etapa específica — não a maior perda absoluta.')},
    {'id': 'ac-pior-kpi', 'fn': q_pior_kpi_macro,
     'pergunta': 'Qual KPI macro está mais fora da meta e como recuperar?',
     'prompt': ('Liste os KPIs macro do relatório ordenados pelo desvio vs meta — no lançamento pago são '
                'exposição de caixa, CAC, ROI, taxa de order bump, qualidade e ingressos; no clássico, CPL, '
                'CPMQL, taxa de resposta, qualidade e conv. de página. Para o de maior desvio negativo, explique o impacto no '
                'resultado da campanha e a ação recomendada, considerando também a tendência dos últimos 3 dias.')},
    {'id': 'ac-qualidade', 'fn': q_qualidade_caindo,
     'pergunta': 'A qualidade da base captada está caindo?',
     'prompt': ('Avalie a Taxa de Qualidade (MQLs ÷ RESPOSTAS da pesquisa — quem não respondeu não entra no denominador) ao longo dos dias e nos últimos 3 dias vs o '
                'início e vs a meta. Se estiver caindo, relacione com origem (pago/orgânico) ou criativos e '
                'aponte se o público recente tem perfil diferente do esperado.')},
    {'id': 'ac-custo', 'fn': _so_classico(q_custo_subindo),
     'pergunta': 'O custo (CPL/CPMQL) está subindo ao longo da campanha?',
     'prompt': ('Avalie a evolução diária de CPL e CPMQL e compare os últimos 3 dias com o início e com a '
                'meta. Se o custo está subindo, separe se vem de CPM (leilão/mídia) ou de queda de qualificação '
                '(CPMQL = CPL / taxa de qualidade) e recomende a alavanca.')},
    {'id': 'ac-resposta', 'fn': q_taxa_resposta,
     'pergunta': 'A taxa de resposta da pesquisa está suficiente?',
     'prompt': ('Avalie a Taxa de Resposta vs a meta e a tendência. Se baixa, explique o risco para a '
                'qualificação e a projeção de conversão (amostra insuficiente para mapear a base) e a ação.')},
    {'id': 'ac-pago-org', 'fn': q_pago_organico,
     'pergunta': 'A captação está concentrada em pago ou orgânico?',
     'prompt': ('Compare o volume de pago vs orgânico (no lançamento pago são INGRESSOS vendidos). Avalie o risco de concentração: se o pago '
                'domina, há dependência de budget; se o orgânico domina, avalie sustentabilidade. Aponte a ação.')},
    {'id': 'ac-temperatura', 'fn': q_temperatura,
     'pergunta': 'Qual temperatura escalar e qual frear pelo CPL/qualidade?',
     'prompt': ('Ordene as temperaturas do tráfego pago por CPL e CPMQL (dimensao=temperatura), olhando também '
                'a taxa de qualidade de cada. Aponte qual escalar (CPL baixo com qualidade ok) e qual frear/revisar '
                '(CPL alto ou qualidade ruim). Se útil, veja a evolução por dia com cruzar_dia (CPL por dia × '
                'temperatura). Recomende a realocação de verba.')},
    {'id': 'ac-concentra', 'fn': _so_classico(q_concentracao_piora),
     'pergunta': 'A piora do CPL está concentrada num criativo/público ou é geral?',
     'prompt': ('Use onde_concentra (metrica=cpl) para descobrir se a alta do custo se concentra num criativo, '
                'público, campanha ou canal específico, ou se é AMPLA/uniforme (causa geral: leilão/sazonalidade). '
                'Reporte os itens pausados/novos. Se for concentrado, recomende pausar/ajustar o item; se for geral, '
                'trate como mídia/estrutural — não culpe um criativo isolado.')},
    {'id': 'ac-saturacao', 'fn': _so_classico(q_saturacao),
     'pergunta': 'Há sinais de saturação da audiência (custo subindo e volume caindo)?',
     'prompt': ('Olhe a evolução diária de CPL e de leads/dia (trend dimensao=dia, ou cruzar_dia). CPL subindo E '
                'leads/dia caindo ao longo da campanha indicam saturação. Identifique o ponto de virada e recomende '
                'a ação (renovar criativo, ampliar/abrir público, ajustar verba). Distinga saturação de variação de fim de semana.')},
    {'id': 'ac-canal-org', 'fn': q_canal_organico,
     'pergunta': 'A captação orgânica depende demais de um canal?',
     'prompt': ('Avalie a concentração dos leads orgânicos no canal dominante (dimensao=canal, recorte de orgânico). '
                'Acima de 50% num único canal é dependência crítica — avalie o risco e a diversificação. Compare também '
                'a qualidade entre os canais orgânicos, se houver volume.')},
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
