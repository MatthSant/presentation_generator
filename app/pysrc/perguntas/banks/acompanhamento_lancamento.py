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
            'canais': dataset.get('acom_canais', {}).get('rows', [])}


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


QUESTIONS = [
    {'id': 'ac-funil-furo', 'fn': q_maior_furo,
     'pergunta': 'Onde está o maior furo do funil de tráfego pago?',
     'prompt': ('Identifique a transição do funil com maior queda relativa ao benchmark esperado '
                '(CTR 1%, Connect 80%, Conv. de Página 40%, Taxa de Resposta e Qualidade vs meta). '
                'Mostre a etapa, a migração realizada vs a esperada e o tamanho do furo. Aponte a causa '
                'provável e a ação para recuperar essa etapa específica — não a maior perda absoluta.')},
    {'id': 'ac-pior-kpi', 'fn': q_pior_kpi_macro,
     'pergunta': 'Qual KPI macro está mais fora da meta e como recuperar?',
     'prompt': ('Liste os KPIs macro (CPL, CPMQL, Taxa de Resposta, Taxa de Qualidade, Conv. de Página) '
                'ordenados pelo desvio vs meta. Para o de maior desvio negativo, explique o impacto no '
                'resultado da campanha e a ação recomendada, considerando também a tendência dos últimos 3 dias.')},
    {'id': 'ac-qualidade', 'fn': q_qualidade_caindo,
     'pergunta': 'A qualidade da base captada está caindo?',
     'prompt': ('Avalie a Taxa de Qualidade (MQLs/respostas) ao longo dos dias e nos últimos 3 dias vs o '
                'início e vs a meta. Se estiver caindo, relacione com origem (pago/orgânico) ou criativos e '
                'aponte se o público recente tem perfil diferente do esperado.')},
    {'id': 'ac-custo', 'fn': q_custo_subindo,
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
     'prompt': ('Compare o volume de leads de pago vs orgânico. Avalie o risco de concentração: se o pago '
                'domina, há dependência de budget; se o orgânico domina, avalie sustentabilidade. Aponte a ação.')},
    {'id': 'ac-temperatura', 'fn': q_temperatura,
     'pergunta': 'Qual temperatura escalar e qual frear pelo CPL/qualidade?',
     'prompt': ('Ordene as temperaturas do tráfego pago por CPL e CPMQL (dimensao=temperatura), olhando também '
                'a taxa de qualidade de cada. Aponte qual escalar (CPL baixo com qualidade ok) e qual frear/revisar '
                '(CPL alto ou qualidade ruim). Se útil, veja a evolução por dia com cruzar_dia (CPL por dia × '
                'temperatura). Recomende a realocação de verba.')},
    {'id': 'ac-concentra', 'fn': q_concentracao_piora,
     'pergunta': 'A piora do CPL está concentrada num criativo/público ou é geral?',
     'prompt': ('Use onde_concentra (metrica=cpl) para descobrir se a alta do custo se concentra num criativo, '
                'público, campanha ou canal específico, ou se é AMPLA/uniforme (causa geral: leilão/sazonalidade). '
                'Reporte os itens pausados/novos. Se for concentrado, recomende pausar/ajustar o item; se for geral, '
                'trate como mídia/estrutural — não culpe um criativo isolado.')},
    {'id': 'ac-saturacao', 'fn': q_saturacao,
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
