"""calc — motor do "debriefing de lançamento" (pós-campanha, stdlib pura).

Porta o witly_debriefing_builder.py (pandas) para o app. Uma linha do CSV (view
VW_V2_inscricoes_res) = utm_source × campanha × dia, de UM lançamento
(`field_conversion`). Classifica cada linha em tipo_publico (pago/organico/n.i.),
camp_tipo (captacao/vendas/outro) e temperatura, e calcula o dict M de métricas +
agregados por canal/temperatura/campanha/semana/dia, mais metas (goals) e histórico.

REGRA invest_cpt: investimento de mídia = SOMENTE campanhas de captação. Vendas têm
o investimento excluído de CPL, ROAS, CPMQL, CPM, CTR (o faturamento de vendas fica).
Classificação é por SUBSTRING e configurável (paid_sources, cpt/vnd patterns,
temperature) — caso clássico exige padrões do cliente (ex.: 'cadastro-', 'facebook').
"""
import csv
import re
import datetime

# Defaults de classificação (sobrescrevíveis via config).
DEF_PAID = ['facebook', 'meta', 'google', 'fb', 'tiktok']           # substring em utm_source
DEF_CPT = ['-cpt]', 'cadastro-', 'google-search-', 'captacao']      # substring em field_campaign_name
DEF_VND = ['-vnd]', 'venda-', 'vendas-']
DEF_TEMP = {'remarketing': ['rmkt', 'remarketing'], 'frio': ['frio', 'cold'],
            'quente': ['quente', 'hot', 'warm'], 'advantage': ['advantage', '[advantage]']}
TEMP_ORDER = ['remarketing', 'frio', 'quente', 'advantage']        # último a casar vence


def load_rows(path):
    with open(path, encoding='utf-8-sig', errors='replace') as f:
        head = f.read(8192)
        f.seek(0)
        sep = max(',;\t', key=lambda c: head.count(c))
        return list(csv.DictReader(f, delimiter=sep))


def fnum(v):
    if v is None:
        return 0.0
    s = str(v).strip()
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        try:
            return float(s.replace('.', '').replace(',', '.'))
        except ValueError:
            return 0.0


def soma(rows, col):
    return sum(fnum(r.get(col)) for r in rows)


def pct(a, b):
    a, b = fnum(a), fnum(b)
    return round(a / b * 100, 2) if b > 0 else 0.0


def div(a, b, nd=2):
    a, b = fnum(a), fnum(b)
    return round(a / b, nd) if b > 0 else 0.0


def _date(r):
    return str(r.get('data', '')).strip()[:10]


def _dt(iso):
    try:
        return datetime.date(int(iso[:4]), int(iso[5:7]), int(iso[8:10]))
    except Exception:
        return None


# ── classificação ────────────────────────────────────────────────────────────

def _cfg_list(config, key, default):
    v = (config or {}).get(key)
    if isinstance(v, str):
        return [v]
    if isinstance(v, list) and v:
        return v
    return default


def classify(rows, config=None):
    config = config or {}
    paid = [p.lower() for p in _cfg_list(config, 'paid_sources', DEF_PAID)]
    cpt = [p.lower() for p in _cfg_list(config, 'cpt_pattern', DEF_CPT)]
    vnd = [p.lower() for p in _cfg_list(config, 'vnd_pattern', DEF_VND)]
    temp_map = (config or {}).get('temperature') or DEF_TEMP
    for r in rows:
        src = (r.get('utm_source') or '').strip()
        s = src.lower()
        if not src:
            r['_tipo'] = 'nao_identificado'
        elif any(p in s for p in paid):
            r['_tipo'] = 'pago'
        else:
            r['_tipo'] = 'organico'
        cn = (r.get('field_campaign_name') or '').lower()
        r['_camp'] = ('captacao' if any(p in cn for p in cpt)
                      else 'vendas' if any(p in cn for p in vnd) else 'outro')
        t = 'n/c'
        for k in TEMP_ORDER:
            for pat in temp_map.get(k, []):
                if pat.lower() in cn:
                    t = k
        r['_temp'] = t
    return rows


def _sub(rows, **f):
    out = rows
    for k, v in f.items():
        out = [r for r in out if r.get(k) == v]
    return out


# ── metas (goals) e histórico ─────────────────────────────────────────────────

def _mean_nonzero(vals):
    vals = [v for v in vals if v > 0]
    return round(sum(vals) / len(vals), 4) if vals else 0.0


def load_goals(path, fc, meta_vendas_canal=None, meta_vendas_temp=None):
    try:
        rows = load_rows(path)
    except Exception:
        return None
    rows = [r for r in rows if not fc or r.get('field_conversion') == fc]
    if not rows:
        return None
    by_canal = {}
    for r in rows:
        src = (r.get('utm_source') or '').strip()
        if not src:
            continue
        c = by_canal.setdefault(src, {'meta_leads': 0.0, 'meta_vendas': 0.0, 'meta_cpl': []})
        c['meta_leads'] += fnum(r.get('meta_leads'))
        c['meta_vendas'] += fnum(r.get('meta_vendas'))
        if fnum(r.get('meta_cpl')) > 0:
            c['meta_cpl'].append(fnum(r.get('meta_cpl')))
    for c in by_canal.values():
        c['meta_cpl'] = _mean_nonzero(c['meta_cpl'])
    mvc = dict(meta_vendas_canal or {})
    for src, c in by_canal.items():
        mvc.setdefault(src, c['meta_vendas'])
    meta_vendas = (sum((meta_vendas_canal or {}).values()) + sum((meta_vendas_temp or {}).values())
                   or soma(rows, 'meta_vendas'))
    return {
        'leads': soma(rows, 'meta_leads'),
        'vendas': meta_vendas,
        'fat': soma(rows, 'meta_receita'),
        'invest_cpt': soma(rows, 'meta_valor_invest'),
        'cpl': _mean_nonzero([fnum(r.get('meta_cpl')) for r in rows]),
        'cpmql': _mean_nonzero([fnum(r.get('meta_cpmql')) for r in rows]),
        'conv': _mean_nonzero([fnum(r.get('meta_conversao')) for r in rows]) * 100,
        'qual': _mean_nonzero([fnum(r.get('meta_taxa_qual')) for r in rows]) * 100 or 40.0,
        'by_canal': by_canal,
        'meta_vendas_canal': mvc,
        'meta_vendas_temp': dict(meta_vendas_temp or {}),
    }


# ── métricas (dict M) ──────────────────────────────────────────────────────────

def metrics(rows, config=None, goals=None, hist=None):
    config = config or {}
    pago = _sub(rows, _tipo='pago')
    org = _sub(rows, _tipo='organico')
    cpt = _sub(rows, _camp='captacao')

    def s(col, sub=rows):
        return soma(sub, col)

    fat = s('faturamento')
    fat_sale = s('faturamento_sale')
    fat_pago = s('faturamento', pago)
    fat_org = s('faturamento', org)
    invest_total = s('invest_total')
    invest_cpt = s('invest_total', cpt)
    leads_total = int(s('leads'))
    leads_pago = int(s('leads', pago))
    leads_org = int(s('leads', org))
    leads_traf = s('leads_trafego')
    mqls_total, resps_total = int(s('leads_mqls')), int(s('respostas'))
    mqls_pago, resps_pago = int(s('leads_mqls', pago)), int(s('respostas', pago))
    mqls_org, resps_org = int(s('leads_mqls', org)), int(s('respostas', org))
    vendas_total = int(s('vendas'))
    vendas_pago = int(s('vendas', pago))
    vendas_org = int(s('vendas', org))
    qual_pago = pct(mqls_pago, resps_pago)
    cpl = div(invest_cpt, leads_traf)
    retorno = fat - invest_total
    impr, clicks = s('impressoes'), s('link_clicks')

    M = {
        'fat': round(fat, 2), 'fat_sale': round(fat_sale, 2), 'fat_dsell': round(fat - fat_sale, 2),
        'fat_pago': round(fat_pago, 2), 'fat_org': round(fat_org, 2),
        'retorno': round(retorno, 2), 'roi': pct(retorno, invest_total),
        'roas': div(fat_pago - invest_cpt, invest_cpt),
        'invest_total': round(invest_total, 2), 'invest_cpt': round(invest_cpt, 2),
        'invest_vnd': round(invest_total - invest_cpt, 2),
        'refunds_n': int(s('refunds')), 'refund_val': round(s('refunded_value'), 2),
        'leads_total': leads_total, 'leads_pago': leads_pago, 'leads_org': leads_org,
        'leads_traf': int(leads_traf),
        'l_novo': int(s('leads_novo')), 'l_ant': int(s('leads_antigos')), 'l_cli': int(s('cliente_inscrito')),
        'l_novo_p': int(s('leads_novo', pago)), 'l_ant_p': int(s('leads_antigos', pago)), 'l_cli_p': int(s('cliente_inscrito', pago)),
        'l_novo_o': int(s('leads_novo', org)), 'l_ant_o': int(s('leads_antigos', org)), 'l_cli_o': int(s('cliente_inscrito', org)),
        'vendas_total': vendas_total, 'vendas_pago': vendas_pago, 'vendas_org': vendas_org,
        'vendas_sale': int(s('vendas_sale')),
        'mqls_total': mqls_total, 'resps_total': resps_total,
        'qual': pct(mqls_total, resps_total), 'qual_pago': qual_pago, 'qual_org': pct(mqls_org, resps_org),
        'conv_geral': pct(vendas_total, leads_total), 'conv_pago': pct(vendas_pago, leads_pago),
        'conv_org': pct(vendas_org, leads_org),
        'cpl': cpl, 'cpmql': (div(cpl * 100, qual_pago) if qual_pago else 0.0),
        'ctr': pct(clicks, impr), 'cpm': div(invest_cpt * 1000, impr), 'cpc': div(invest_cpt, clicks),
        'tx_pag': pct(leads_traf, clicks), 'cac': div(invest_cpt, vendas_pago),
    }
    # atingimento vs metas
    G = goals or {}
    total_meta_vendas = sum((G.get('meta_vendas_canal') or {}).values()) or G.get('vendas') or 0
    M['at_leads'] = pct(leads_total, G.get('leads')) if G.get('leads') else None
    M['at_fat'] = pct(fat, G.get('fat')) if G.get('fat') else None
    M['at_vendas'] = pct(vendas_total, total_meta_vendas) if total_meta_vendas else None
    M['goals'] = G
    M['hist'] = hist or {}
    M['chan'] = _chan(rows, config)
    M['temp'] = _temp(rows, G)
    M['camp_roas'] = _camp_roas(rows)
    M['weekly'] = _weekly(rows)
    win = _cpt_window(rows, config)
    M['cpt_window'] = win
    M['daily'] = _daily(rows, win)
    M['best_week'] = _best_week(M['weekly'])
    return M


def _cpt_window(rows, config):
    """Janela de captação (ini, fim) em ISO. Usa config.captacao_inicio/fim quando
    informado; senão deriva do menor/maior dia com captação efetiva (linhas de
    captação com leads > 0). Retorna (None, None) se não houver datas."""
    cfg = config or {}
    ini = (cfg.get('captacao_inicio') or '').strip()[:10] or None
    fim = (cfg.get('captacao_fim') or '').strip()[:10] or None
    if ini and fim:
        return ini, fim
    dates = sorted({d for r in rows
                    if r.get('_camp') == 'captacao' and fnum(r.get('leads')) > 0
                    and (d := _date(r))})
    if not dates:
        dates = sorted({d for r in rows if (d := _date(r))})
    if not dates:
        return ini, fim
    return ini or dates[0], fim or dates[-1]


def _chan(rows, config):
    by = {}
    for r in rows:
        src = (r.get('utm_source') or '(direto)').strip() or '(direto)'
        c = by.setdefault(src, {'canal': src, 'tipo': r.get('_tipo'), 'leads': 0, 'vendas': 0,
                                'fat': 0.0, 'mqls': 0, 'resps': 0, 'l_novo': 0, 'l_ant': 0})
        c['leads'] += int(fnum(r.get('leads'))); c['vendas'] += int(fnum(r.get('vendas')))
        c['fat'] += fnum(r.get('faturamento')); c['mqls'] += int(fnum(r.get('leads_mqls')))
        c['resps'] += int(fnum(r.get('respostas'))); c['l_novo'] += int(fnum(r.get('leads_novo')))
        c['l_ant'] += int(fnum(r.get('leads_antigos')))
    out = []
    for c in by.values():
        c['conv'] = pct(c['vendas'], c['leads']); c['qual'] = pct(c['mqls'], c['resps'])
        c['fat'] = round(c['fat'], 2)
        out.append(c)
    return sorted(out, key=lambda c: -c['vendas'])


def _temp(rows, goals):
    mvt = (goals or {}).get('meta_vendas_temp') or {}
    by = {}
    for r in rows:
        t = r.get('_temp')
        c = by.setdefault(t, {'temp': t, 'inv': 0.0, 'fat': 0.0, 'leads': 0, 'vendas': 0, 'mqls': 0, 'resps': 0})
        if r.get('_camp') == 'captacao':
            c['inv'] += fnum(r.get('invest_total'))
        if r.get('_tipo') == 'pago':
            c['fat'] += fnum(r.get('faturamento')); c['leads'] += int(fnum(r.get('leads')))
            c['vendas'] += int(fnum(r.get('vendas'))); c['mqls'] += int(fnum(r.get('leads_mqls')))
            c['resps'] += int(fnum(r.get('respostas')))
    out = []
    for c in by.values():
        if c['leads'] == 0 and c['inv'] == 0:
            continue
        c['inv'] = round(c['inv'], 2); c['fat'] = round(c['fat'], 2)
        c['roas'] = div(c['fat'] - c['inv'], c['inv']); c['conv'] = pct(c['vendas'], c['leads'])
        c['qual'] = pct(c['mqls'], c['resps']); c['meta_vendas'] = mvt.get(c['temp'], 0)
        c['cpl'] = div(c['inv'], c['leads'])
        c['cpmql'] = div(c['cpl'] * 100, c['qual']) if c['qual'] else 0.0
        out.append(c)
    return sorted(out, key=lambda c: -c['inv'])


def _camp_roas(rows):
    by = {}
    for r in rows:
        if r.get('_camp') != 'captacao':
            continue
        c = by.setdefault(r.get('field_campaign_name') or '(vazio)',
                          {'campanha': r.get('field_campaign_name') or '(vazio)', 'inv': 0.0, 'fat': 0.0,
                           'leads': 0, 'vendas': 0, 'mqls': 0, 'resps': 0})
        c['inv'] += fnum(r.get('invest_total')); c['fat'] += fnum(r.get('faturamento'))
        c['leads'] += int(fnum(r.get('leads'))); c['vendas'] += int(fnum(r.get('vendas')))
        c['mqls'] += int(fnum(r.get('leads_mqls'))); c['resps'] += int(fnum(r.get('respostas')))
    out = []
    for c in by.values():
        if c['inv'] <= 0:
            continue
        c['inv'] = round(c['inv'], 2); c['fat'] = round(c['fat'], 2)
        c['roas'] = div(c['fat'] - c['inv'], c['inv']); c['conv'] = pct(c['vendas'], c['leads'])
        c['cpl'] = div(c['inv'], c['leads'])
        c['qual'] = pct(c['mqls'], c['resps'])
        c['cpmql'] = div(c['cpl'] * 100, c['qual']) if c['qual'] else 0.0
        out.append(c)
    return sorted(out, key=lambda c: -c['roas'])


def _weekly(rows):
    dated = [(_dt(_date(r)), r) for r in rows if _dt(_date(r))]
    if not dated:
        return []
    start = min((d for d, r in dated if fnum(r.get('leads')) > 5), default=min(d for d, _ in dated))
    by = {}
    for d, r in dated:
        sn = max(1, (d - start).days // 7 + 1)
        w = by.setdefault(sn, {'snum': sn, 'leads': 0, 'vendas': 0, 'fat': 0.0, 'mqls': 0, 'resps': 0,
                               'mqls_p': 0, 'resps_p': 0, 'inv_cpt': 0.0, 'leads_traf': 0.0,
                               'leads_pago': 0, 'leads_org': 0, 'dates': []})
        w['dates'].append(d)
        w['leads'] += int(fnum(r.get('leads'))); w['vendas'] += int(fnum(r.get('vendas')))
        w['fat'] += fnum(r.get('faturamento')); w['mqls'] += int(fnum(r.get('leads_mqls')))
        w['resps'] += int(fnum(r.get('respostas'))); w['leads_traf'] += fnum(r.get('leads_trafego'))
        if r.get('_camp') == 'captacao':
            w['inv_cpt'] += fnum(r.get('invest_total'))
        if r.get('_tipo') == 'pago':
            w['leads_pago'] += int(fnum(r.get('leads')))
            w['mqls_p'] += int(fnum(r.get('leads_mqls'))); w['resps_p'] += int(fnum(r.get('respostas')))
        elif r.get('_tipo') == 'organico':
            w['leads_org'] += int(fnum(r.get('leads')))
    out = []
    for sn in sorted(by):
        w = by[sn]
        ds = sorted(w.pop('dates'))
        w['ini'] = ds[0].strftime('%d/%m'); w['fim'] = ds[-1].strftime('%d/%m')
        w['conv'] = pct(w['vendas'], w['leads']); w['qual'] = pct(w['mqls'], w['resps'])
        w['fpl'] = div(w['fat'], w['leads']); w['cpl'] = div(w['inv_cpt'], w['leads_traf'])
        qpag = pct(w['mqls_p'], w['resps_p'])
        w['cpmql'] = div(w['cpl'] * 100, qpag) if qpag else 0.0
        w['fat'] = round(w['fat'], 2); w['inv_cpt'] = round(w['inv_cpt'], 2)
        out.append(w)
    return out


def _daily(rows, window=None):
    ini, fim = window or (None, None)
    by = {}
    for r in rows:
        d = _date(r)
        if not d:
            continue
        if (ini and d < ini) or (fim and d > fim):
            continue
        c = by.setdefault(d, {'data': d, 'l_all': 0, 'l_pago': 0, 'l_org': 0, 'v_all': 0,
                              'mqls': 0, 'resps': 0, 'mqls_p': 0, 'resps_p': 0, 'mqls_o': 0, 'resps_o': 0})
        c['l_all'] += int(fnum(r.get('leads'))); c['v_all'] += int(fnum(r.get('vendas')))
        c['mqls'] += int(fnum(r.get('leads_mqls'))); c['resps'] += int(fnum(r.get('respostas')))
        if r.get('_tipo') == 'pago':
            c['l_pago'] += int(fnum(r.get('leads'))); c['mqls_p'] += int(fnum(r.get('leads_mqls'))); c['resps_p'] += int(fnum(r.get('respostas')))
        elif r.get('_tipo') == 'organico':
            c['l_org'] += int(fnum(r.get('leads'))); c['mqls_o'] += int(fnum(r.get('leads_mqls'))); c['resps_o'] += int(fnum(r.get('respostas')))
    out = []
    for d in sorted(by):
        c = by[d]
        c['label'] = d[8:10] + '/' + d[5:7]
        c['q_pago'] = pct(c['mqls_p'], c['resps_p']); c['q_org'] = pct(c['mqls_o'], c['resps_o'])
        c['c_all'] = pct(c['v_all'], c['l_all'])
        out.append(c)
    return out


def _best_week(weekly):
    if not weekly:
        return {}
    max_leads = max((w['leads'] for w in weekly), default=0)
    thr = max(100, 0.15 * max_leads)
    elig = [w for w in weekly if w['leads'] >= thr]
    conv = max(elig, key=lambda w: w['conv'], default=None)
    fpl = max(weekly, key=lambda w: w['fpl'], default=None)
    return {'conv_snum': conv['snum'] if conv else None, 'conv_val': conv['conv'] if conv else None,
            'fpl_snum': fpl['snum'] if fpl else None, 'fpl_val': fpl['fpl'] if fpl else None}


def build(rows, config=None):
    config = config or {}
    fc = config.get('field_conversion')
    if not fc:
        fcs = sorted({r.get('field_conversion', '') for r in rows if r.get('field_conversion')})
        fc = fcs[0] if fcs else ''
    rows = [r for r in rows if not fc or r.get('field_conversion') == fc]
    classify(rows, config)
    goals = None
    if config.get('goals_csv'):
        goals = load_goals(config['goals_csv'], fc, config.get('meta_vendas_canal'), config.get('meta_vendas_temperatura'))
    hist = None
    if config.get('hist_csv'):
        hrows = load_rows(config['hist_csv'])
        # o histórico nunca pode incluir o próprio lançamento atual: senão a coluna
        # "Histórico" só repete o "Realizado". Filtra fora o field_conversion corrente.
        if fc:
            hrows = [r for r in hrows if r.get('field_conversion') != fc]
        if hrows:
            classify(hrows, config)
            hist = _hist_meta(hrows)
    M = metrics(rows, config, goals, hist)
    M['field_conversion'] = fc
    M['nome'] = config.get('client_name') or config.get('nome_campanha') or fc
    M['campaign_label'] = config.get('campaign_label') or ''
    return M


def _hist_meta(rows):
    pago = _sub(rows, _tipo='pago')
    cpt = _sub(rows, _camp='captacao')
    inv_cpt = soma(cpt, 'invest_total')
    leads_traf = soma(rows, 'leads_trafego')
    mqls_p, resps_p = soma(pago, 'leads_mqls'), soma(pago, 'respostas')
    qual = pct(mqls_p, resps_p)
    cpl = div(inv_cpt, leads_traf)
    fat = soma(rows, 'faturamento'); fat_pago = soma(pago, 'faturamento')
    return {'fat': round(fat, 2), 'leads': int(soma(rows, 'leads')), 'vendas': int(soma(rows, 'vendas')),
            'invest': round(soma(rows, 'invest_total'), 2), 'invest_cpt': round(inv_cpt, 2),
            'cpl': cpl, 'qual': qual, 'cpmql': (div(cpl * 100, qual) if qual else 0.0),
            'roas': div(fat_pago - inv_cpt, inv_cpt)}
