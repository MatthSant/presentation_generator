"""calc — motor do "acompanhamento de lançamento" (tático diário, stdlib pura).

Uma linha do CSV (view VW_V2_inscricoes_res_METRICAS) = utm_source × campanha ×
conteúdo × anúncio × dia, de UM lançamento (`field_conversion`). Pago = invest_total>0.

Eixo = dia da campanha (1 = primeiro dia com leads). Calcula séries diárias, KPIs
macro + tráfego (valor geral e dos últimos 3 dias), tendência (3d vs início), desvio
vs meta com semáforo, split pago/orgânico, temperatura, tipo de lead, criativos do
último dia e dois funis (total + últimos 3 dias). O número só nasce aqui.
"""
import csv
import re

# Métricas de custo (menor é melhor) — direção da tendência e do desvio vs meta.
COST = {'cpl', 'cpmql', 'cpm'}
KPI_MACRO = ['investimento', 'leads', 'cpl', 'taxa_resp', 'taxa_qual', 'cpmql']
KPI_TRAF = ['cpm', 'hook', 'hold', 'ctr', 'connect', 'conv_pag']
LABELS = {
    'investimento': 'Investimento', 'cpl': 'CPL', 'cpmql': 'CPMQL',
    'taxa_resp': 'Taxa de Resposta', 'taxa_qual': 'Taxa de Qualidade', 'conv_pag': 'Conv. de Página',
    'cpm': 'CPM', 'hook': 'Hook Rate', 'hold': 'Hold Rate', 'ctr': 'CTR (Link)', 'connect': 'Connect Rate',
    'leads': 'Leads',
}
FUNNEL_STAGES = [('imp', 'Impressões'), ('clicks', 'Cliques no Link'), ('pageviews', 'Pageviews'),
                 ('leads', 'Leads'), ('respostas_pond', 'Respostas Pesq.'), ('mqls', 'MQLs')]
# Benchmark de migração esperada por transição do funil (i → i+1). O "maior furo"
# é a transição com maior queda RELATIVA ao seu benchmark — não a maior perda
# absoluta (senão Impressões→Cliques, com CTR ~1-2%, venceria sempre).
#   0 imp→clicks  = CTR · 1 clicks→pageviews = Connect · 2 pageviews→leads = Conv. página
#   3 leads→respostas = Taxa de Resposta (meta/histórico) · 4 respostas→mqls = Qualidade (meta/histórico)
FUNNEL_BENCH = {'hook': 30.0, 'hold': 30.0, 'ctr': 1.5, 'connect': 80.0, 'conv_pag': 40.0}
_M = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']


# ── leitura / helpers ────────────────────────────────────────────────────────

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


def pct(a, b):
    a, b = fnum(a), fnum(b)
    return round(a / b * 100, 4) if b > 0 else None


def div(a, b, nd=4):
    a, b = fnum(a), fnum(b)
    return round(a / b, nd) if b > 0 else None


def _date(r):
    return str(r.get('data', '')).strip()[:10]


def _day_label(iso):
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', iso or '')
    return f'{m.group(3)}/{m.group(2)}' if m else (iso or '')


def is_paid(r):
    return fnum(r.get('invest_total')) > 0


# Regra de temperatura: categoria → palavras-chave buscadas no nome da campanha.
# Default; pode ser sobrescrita por config['temperatura'] (setada na criação do dash).
DEFAULT_TEMP = {
    'Quente': ['hot', 'quente'],
    'Morno': ['warm', 'morno'],
    'Frio': ['cold', 'frio', 'gelad'],
}


def temp_rules(config):
    """Normaliza a regra de temperatura do config (keywords em minúsculas)."""
    raw = (config or {}).get('temperatura') or DEFAULT_TEMP
    return {cat: [str(k).lower() for k in (kws or [])] for cat, kws in raw.items()}


def infer_temp(name, rules=None):
    n = str(name or '').lower()
    for cat, kws in (rules or DEFAULT_TEMP).items():
        if any(k and k in n for k in kws):
            return cat
    return 'Indefinido'


def norm_source(v):
    """utm_source normalizado: vazios/null/'-' viram 'Não trackeado'."""
    s = str(v if v is not None else '').strip()
    return 'Não trackeado' if s.lower() in ('', 'null', 'none', 'nan', '-', '(none)') else s


def _coalesce(*vals):
    for v in vals:
        s = str(v if v is not None else '').strip()
        if s and s.lower() not in ('null', 'none', 'nan', '-', '(none)'):
            return s
    return 'Não trackeado'


def ad_name(r):
    """Criativo: field_ad_name (pago) com fallback p/ utm_content (orgânico, onde os
    field_ad_* vêm vazios) — assim o orgânico aparece nomeado, não como 'Não trackeado'."""
    return _coalesce(r.get('field_ad_name'), r.get('utm_content'))


def adset_name(r):
    """Público/conjunto de anúncios (field_adset_name) — conceito pago, sem UTM equivalente."""
    return _coalesce(r.get('field_adset_name'))


def campaign_name(r):
    """Campanha: field_campaign_name com fallback p/ utm_campaign (orgânico)."""
    return _coalesce(r.get('field_campaign_name'), r.get('utm_campaign'))


# ── agregação de um conjunto de linhas ───────────────────────────────────────

# Campos brutos somados num recorte (dia, total, últimos 3 dias, temperatura…).
_RAW = ['leads', 'leads_pago', 'invest', 'imp', 'clicks', 'pageviews', 'leads_traf',
        'mqls', 'respostas', 'novos', 'antigos', 'cli', 'vendas', 'fat', 'views_tot', 'views_50']
_SRC = {'leads': 'leads', 'invest': 'invest_total', 'imp': 'impressoes', 'clicks': 'link_clicks',
        'pageviews': 'pageviews', 'leads_traf': 'leads_trafego', 'mqls': 'leads_mqls',
        'respostas': 'respostas', 'novos': 'leads_novo', 'antigos': 'leads_antigos',
        'cli': 'cliente_inscrito', 'vendas': 'vendas', 'fat': 'faturamento',
        'views_tot': 'views_totais', 'views_50': 'views_50pc'}


def _sum(rows):
    s = {k: 0.0 for k in _RAW}
    for r in rows:
        paid = is_paid(r)
        for k, col in _SRC.items():
            s[k] += fnum(r.get(col))
        if paid:
            s['leads_pago'] += fnum(r.get('leads'))
    return s


def derive(s):
    """Indicadores derivados de um bloco de somas brutas (None onde sem base)."""
    cpl = div(s['invest'], s['leads_pago'])
    tq = pct(s['mqls'], s['respostas'])
    return {
        'leads': round(s['leads']),
        'investimento': round(s['invest'], 2),
        'cpl': cpl,
        'cpmql': (round(cpl * 100 / tq, 4) if (cpl is not None and tq) else None),
        'taxa_resp': pct(s['respostas'], s['leads']),
        'taxa_qual': tq,
        'cpm': div(s['invest'] * 1000, s['imp']),
        'ctr': pct(s['clicks'], s['imp']),
        # sem dados de vídeo (views) → hook/hold ficam None (blocos omitidos no build)
        'hook': pct(s['views_tot'], s['imp']) if s['views_tot'] else None,
        'hold': pct(s['views_50'], s['views_tot']),
        # sem pageviews → connect fica None e a conv. de página vira leads/clicks
        # (≡ connect × conv_página); com pageviews, conv_página = leads/pageviews
        'connect': pct(s['pageviews'], s['clicks']) if s['pageviews'] else None,
        'conv_pag': pct(s['leads_traf'], s['pageviews']) if s['pageviews'] else pct(s['leads_traf'], s['clicks']),
    }


# métricas expostas no modo-fundo (mesmo conjunto do derive)
FRAME_METRICS = ['leads', 'investimento', 'cpl', 'cpmql', 'taxa_resp', 'taxa_qual',
                 'conv_pag', 'cpm', 'ctr', 'hook', 'hold', 'connect']


def frame_rows(rows, dim, filtro=None, trules=None, incluir_geral=False):
    """Agrega as linhas do corte por dimensão p/ o modo-fundo da IA, devolvendo
    [{key, m:{métrica:valor}}] com os KPIs derivados por grupo.

    dim ∈ dia | temperatura | canal | origem. `filtro` (opcional) restringe as linhas
    ANTES de agrupar — {origem, temperatura, canal} — habilitando cruzamentos como
    'CPL por dia SÓ do tráfego Quente' (dim='dia', filtro={'temperatura':'Quente'}).
    `incluir_geral` (só p/ partição: temperatura/canal/origem) acrescenta a linha
    'Geral' com o valor GLOBAL CORRETO — derive(_sum(tudo)): soma p/ contagens,
    RECÁLCULO PONDERADO (num÷den) p/ taxas — em vez de a IA somar os grupos."""
    trules = trules or {}
    f = filtro or {}

    def keep(r):
        if f.get('origem') and ('Pago' if is_paid(r) else 'Orgânico') != f['origem']:
            return False
        if f.get('temperatura') and infer_temp(r.get('field_campaign_name'), trules) != f['temperatura']:
            return False
        if f.get('canal') and norm_source(r.get('utm_source')) != f['canal']:
            return False
        if f.get('criativo') and ad_name(r) != f['criativo']:
            return False
        if f.get('publico') and adset_name(r) != f['publico']:
            return False
        if f.get('campanha') and campaign_name(r) != f['campanha']:
            return False
        return True

    sub = [r for r in rows if keep(r)]
    if dim == 'temperatura':
        sub = [r for r in sub if is_paid(r)]            # temperatura só existe no pago
        keyfn = lambda r: infer_temp(r.get('field_campaign_name'), trules)
        fixed = None
    elif dim == 'canal':
        keyfn = lambda r: norm_source(r.get('utm_source'))
        fixed = None
    elif dim == 'criativo':                             # pago (field_ad) + orgânico (utm_content)
        keyfn = ad_name
        fixed = None
    elif dim == 'publico':
        sub = [r for r in sub if is_paid(r)]            # público = conjunto de anúncios (só pago)
        keyfn = adset_name
        fixed = None
    elif dim == 'campanha':                             # pago (field_campaign) + orgânico (utm_campaign)
        keyfn = campaign_name
        fixed = None
    elif dim == 'origem':
        keyfn = lambda r: 'Pago' if is_paid(r) else 'Orgânico'
        fixed = ['Pago', 'Orgânico']
    else:                                                # dia (default)
        keyfn = _date
        fixed = None

    groups = {}
    for r in sub:
        groups.setdefault(keyfn(r), []).append(r)
    if dim == 'dia':
        keys = sorted(groups)
    elif fixed:
        keys = [k for k in fixed if k in groups]
    else:                                                # temperatura/canal: mais leads primeiro
        keys = sorted(groups, key=lambda k: -_sum(groups[k])['leads'])

    out = []
    for k in keys:
        d = derive(_sum(groups[k]))
        label = _day_label(k) if dim == 'dia' else str(k)
        out.append({'key': label, 'm': {m: d.get(m) for m in FRAME_METRICS}})
    if incluir_geral and dim != 'dia' and sub:
        g = derive(_sum(sub))
        out.append({'key': 'Geral', 'm': {m: g.get(m) for m in FRAME_METRICS}})
    return out


def cross_dia(rows, dim, trules=None):
    """Crosstab DIA × dimensão (temperatura|canal|origem): KPIs derivados por célula
    (dia, grupo). Habilita UM gráfico multi-linha 'métrica por dia, uma linha por
    grupo' (ex.: CPL por dia Quente × Morno) — em vez de um gráfico por grupo."""
    trules = trules or {}
    if dim == 'temperatura':
        grpfn = lambda r: infer_temp(r.get('field_campaign_name'), trules) if is_paid(r) else None
    elif dim == 'canal':
        grpfn = lambda r: norm_source(r.get('utm_source'))
    elif dim == 'criativo':
        grpfn = ad_name
    elif dim == 'publico':
        grpfn = lambda r: (adset_name(r) if is_paid(r) else None)
    elif dim == 'campanha':
        grpfn = campaign_name
    elif dim == 'origem':
        grpfn = lambda r: 'Pago' if is_paid(r) else 'Orgânico'
    else:
        return []
    cells = {}
    for r in rows:
        g = grpfn(r)
        if g is None:
            continue
        cells.setdefault((_date(r), g), []).append(r)
    out = []
    for key in sorted(cells, key=lambda k: (k[0], k[1])):
        d = derive(_sum(cells[key]))
        out.append({'dia': _day_label(key[0]), 'serie': key[1], 'm': {m: d.get(m) for m in FRAME_METRICS}})
    return out


# ── tendência / desvio vs meta ───────────────────────────────────────────────

def trend(series, cost=False):
    vals = [v for v in series if isinstance(v, (int, float))]
    if len(vals) < 4:
        return {'dir': 'neutro', 'pct': 0.0, 'good': None}
    last3 = sum(vals[-3:]) / 3
    prior = sum(vals[:-3]) / max(len(vals) - 3, 1)
    if prior == 0:
        return {'dir': 'neutro', 'pct': 0.0, 'good': None}
    p = (last3 - prior) / prior * 100
    if abs(p) < 3:
        return {'dir': 'neutro', 'pct': round(p, 1), 'good': None}
    up = p > 0
    good = (not up) if cost else up
    return {'dir': 'up' if up else 'down', 'good': good, 'pct': round(abs(p), 1)}


def meta_status(val, meta, cost=False):
    if meta is None or val is None or meta == 0:
        return None
    dev = (val - meta) / meta * 100
    # "gap" = quanto está pior que a meta (abaixo p/ KPI normal, acima p/ custo).
    # gap <= 0: bateu/superou → ok (verde). 0–5%: tolerado, mas não bateu → neutral
    # (cinza). 5–15%: warn. >15%: bad. Alerta só a partir de 5%.
    gap = dev if cost else -dev
    cls = 'ok' if gap <= 0 else ('neutral' if gap <= 5 else ('warn' if gap <= 15 else 'bad'))
    return {'dev': round(dev, 1), 'cls': cls}


# ── metas (launch_goals opcional ou manual via config) ───────────────────────

def load_goals(path, field_conversion, corte):
    """Lê launch_goals (1 linha por utm_source por dia) → dict de metas agregadas.
    Total = soma; to-date = soma ≤ corte; KPIs = valor do último dia ≤ corte."""
    try:
        rows = load_rows(path)
    except Exception:
        return {}
    rows = [r for r in rows if not field_conversion or r.get('field_conversion') == field_conversion]

    def dk(r):
        return str(r.get('data', '')).strip()[:10]
    td = [r for r in rows if (not corte or dk(r) <= corte)]
    latest_day = max((dk(r) for r in td), default='')
    latest = [r for r in td if dk(r) == latest_day]

    def col_latest(c):
        vals = [fnum(r.get(c)) for r in latest if str(r.get(c, '')).strip() != '']
        return vals[-1] if vals else None
    return {
        'leads_total': sum(fnum(r.get('meta_leads')) for r in rows) or None,
        'leads_td': sum(fnum(r.get('meta_leads')) for r in td) or None,
        'invest_total': sum(fnum(r.get('meta_valor_invest')) for r in rows) or None,
        'cpl': col_latest('meta_cpl'),
        'cpmql': col_latest('meta_cpmql'),
        'taxa_resp': (col_latest('meta_taxa_resp') or 0) * 100 or None,
        'taxa_qual': (col_latest('meta_taxa_qual') or 0) * 100 or None,
        'conv_pag': (col_latest('meta_conversao') or 0) * 100 or None,
    }


# ── build principal ──────────────────────────────────────────────────────────

def build(rows, config=None):
    config = config or {}
    fc = config.get('field_conversion')
    if not fc:
        fcs = sorted({r.get('field_conversion', '') for r in rows if r.get('field_conversion')})
        fc = fcs[0] if fcs else ''
    sub = [r for r in rows if not fc or r.get('field_conversion') == fc]
    # Config defasado: o field_conversion gravado não casa nenhuma linha do dump
    # (base retida com fc errado/antigo) → auto-detecta o lançamento presente em vez
    # de zerar tudo (senão o deep/recompute fica sem dados).
    if fc and not sub:
        fcs = sorted({r.get('field_conversion', '') for r in rows if r.get('field_conversion')})
        fc = fcs[0] if fcs else ''
        sub = [r for r in rows if not fc or r.get('field_conversion') == fc]
    rows = sub

    all_dates = sorted({_date(r) for r in rows if _date(r)})
    corte = config.get('data_corte') or (all_dates[-1] if all_dates else '')
    by_date = {}
    for r in rows:
        d = _date(r)
        if d and d <= corte:
            by_date.setdefault(d, []).append(r)
    dates = sorted(by_date)
    # dia 1 = primeiro dia com leads
    first_leads = next((d for d in dates if _sum(by_date[d])['leads'] > 0), dates[0] if dates else '')
    days = []
    cum = 0
    for d in dates:
        s = _sum(by_date[d])
        cum += s['leads']
        dd = derive(s)
        dd.update({'date': d, 'label': _day_label(d), 'sums': s,
                   'leads': round(s['leads']), 'cum': round(cum),
                   'leads_pago': round(s['leads_pago']), 'leads_org': round(s['leads'] - s['leads_pago'])})
        days.append(dd)
    # só dias dentro da campanha (>= primeiro dia com leads)
    days = [d for d in days if d['date'] >= first_leads]
    n_dias = len(days)
    dia_campanha = n_dias

    rows_corte = [r for d in dates for r in by_date[d]]
    tot_sums = _sum(rows_corte)
    tot = derive(tot_sums)
    # disponibilidade de dados de mídia/página na base. Sem vídeo (views) → omite
    # hook/hold; sem pageviews → omite connect e a conv. de página vira leads/clicks.
    has_views = tot_sums['views_tot'] > 0
    has_pageviews = tot_sums['pageviews'] > 0
    traf_metrics = [m for m in KPI_TRAF
                    if not (m in ('hook', 'hold') and not has_views)
                    and not (m == 'connect' and not has_pageviews)]
    last3 = days[-3:]
    d3_sums = _sum([r for d in last3 for r in by_date[d['date']]])
    d3 = derive(d3_sums)

    def serie(k):
        return [d.get(k) for d in days]
    series = {
        'labels': [d['label'] for d in days],
        'cum': [d['cum'] for d in days], 'leads': [d['leads'] for d in days],
        'invest': [round(d['sums']['invest'], 2) for d in days],
        'cpl': serie('cpl'), 'cpmql': serie('cpmql'), 'taxa_qual': serie('taxa_qual'),
        'cpm': serie('cpm'),
    }
    trends = {m: trend(serie(m), m in COST) for m in set(KPI_MACRO + KPI_TRAF) if m != 'investimento'}
    trends['investimento'] = trend([round(d['sums']['invest'], 2) for d in days])
    trends['leads'] = trend([d['leads'] for d in days])

    # metas (launch_goals tem prioridade; senão manual via config['metas'])
    metas = dict(config.get('metas') or {})
    if config.get('goals_csv'):
        g = load_goals(config['goals_csv'], fc, corte)
        for k in ('cpl', 'cpmql', 'taxa_resp', 'taxa_qual', 'conv_pag'):
            if g.get(k) is not None:
                metas.setdefault(k, g[k])
        metas.setdefault('_leads_total', g.get('leads_total'))
        metas.setdefault('_leads_td', g.get('leads_td'))
        metas.setdefault('_invest_total', g.get('invest_total'))
    # benchmarks de tráfego (hook/hold/ctr/connect/conv. página) também viram a
    # meta-padrão dos KPIs correspondentes — o semáforo usa o mesmo referencial do funil.
    # config['funnel_bench'] sobrescreve; senão cai no FUNNEL_BENCH (fallback).
    fb = dict(FUNNEL_BENCH)
    fb.update(config.get('funnel_bench') or {})
    # sem pageviews, conv. de página = leads/clicks ≡ connect × conv_página → o
    # benchmark é o produto dos dois (ex.: 80% × 40% = 32%).
    if not has_pageviews:
        fb['conv_pag'] = round(fb['connect'] * fb['conv_pag'] / 100, 1)
    for k in ('hook', 'hold', 'ctr', 'connect', 'conv_pag'):
        if fb.get(k) is not None:
            metas.setdefault(k, fb[k])
    if not has_pageviews:
        metas['conv_pag'] = fb['conv_pag']   # leads/clicks usa o bench combinado, não a meta de página
    # leads (KPI macro) usa a meta to-date como referência do semáforo
    metas.setdefault('leads', metas.get('_leads_td'))
    # investimento não tem meta direta — projeta o esperado pela meta de CPL × leads pagos
    mc = metas.get('cpl')
    if mc is not None and tot_sums['leads_pago']:
        metas.setdefault('investimento', round(mc * tot_sums['leads_pago'], 2))
    mstatus = {m: meta_status(tot.get(m), metas.get(m), m in COST) for m in set(KPI_MACRO + KPI_TRAF)}
    # investimento: gastar abaixo do projetado é bom → semáforo de custo
    if metas.get('investimento') is not None:
        mstatus['investimento'] = meta_status(tot.get('investimento'), metas['investimento'], cost=True)

    # split pago/orgânico
    lp, lo = tot_sums['leads_pago'], tot_sums['leads'] - tot_sums['leads_pago']
    split = {'leads_pago': round(lp), 'leads_org': round(lo),
             'pct_pago': pct(lp, lp + lo), 'pct_org': pct(lo, lp + lo)}

    # temperatura (só pago) — regra de classificação vem do config (ou default)
    trules = temp_rules(config)
    temp = {}
    for t in list(trules.keys()) + ['Indefinido']:
        sub = [r for r in rows_corte if is_paid(r) and infer_temp(r.get('field_campaign_name'), trules) == t]
        if not sub:
            continue
        ss = _sum(sub)
        cpl = div(ss['invest'], ss['leads_pago'])
        tq = pct(ss['mqls'], ss['respostas'])
        cpmql = round(cpl * 100 / tq, 4) if (cpl is not None and tq) else None
        temp[t] = {'leads': round(ss['leads']), 'invest': round(ss['invest'], 2),
                   'cpl': cpl, 'cpmql': cpmql}

    # tipo de lead
    def ssum(sub, k):
        return round(sum(fnum(r.get(_SRC[k])) for r in sub))
    paid_rows = [r for r in rows_corte if is_paid(r)]
    org_rows = [r for r in rows_corte if not is_paid(r)]
    tipo_lead = {
        'novos': round(tot_sums['novos']), 'antigos': round(tot_sums['antigos']),
        'novos_pago': ssum(paid_rows, 'novos'), 'novos_org': ssum(org_rows, 'novos'),
        'antigos_pago': ssum(paid_rows, 'antigos'), 'antigos_org': ssum(org_rows, 'antigos'),
        'cli_pago': ssum(paid_rows, 'cli'), 'cli_org': ssum(org_rows, 'cli'),
        'cli_total': round(tot_sums['cli']),
    }

    # canais orgânicos (por utm_source) — vazios/null/'-' viram "Não trackeado"
    org_by = {}
    for r in org_rows:
        org_by.setdefault(norm_source(r.get('utm_source')), 0.0)
        org_by[norm_source(r.get('utm_source'))] += fnum(r.get('leads'))
    canais_org = sorted(({'source': k, 'leads': round(v), 'pct': pct(v, lo)} for k, v in org_by.items() if v > 0),
                        key=lambda x: -x['leads'])

    # criativos da CAMPANHA (agregados por anúncio, ≤ corte) — a data é só a marcação
    # do report, não um filtro de um único dia. Link vem da coluna link_criativo.
    crdia = next((d for d in reversed(dates) if any(is_paid(r) and fnum(r.get('leads_trafego')) > 0 for r in by_date[d])), '')
    creatives = _creatives(paid_rows, config.get('dict_links') or {})

    # benchmark de migração por transição (fb já montado acima) — os dois últimos
    # saem da meta de taxa_resp/taxa_qual (ou histórico, quando houver). Sem pageviews,
    # a etapa Pageviews sai do funil e Cliques→Leads usa o bench combinado (fb['conv_pag']).
    if has_pageviews:
        fstages = FUNNEL_STAGES
        bench = [fb['ctr'], fb['connect'], fb['conv_pag'], metas.get('taxa_resp'), metas.get('taxa_qual')]
    else:
        fstages = [st for st in FUNNEL_STAGES if st[0] != 'pageviews']
        bench = [fb['ctr'], fb['conv_pag'], metas.get('taxa_resp'), metas.get('taxa_qual')]
    funnel_total = _funnel(rows_corte, bench, fstages)
    funnel_3d = _funnel([r for d in last3 for r in by_date[d['date']]], bench, fstages)

    risks_macro = _risks(KPI_MACRO, tot, mstatus, trends)
    risks_traf = _risks(traf_metrics, tot, mstatus, trends)

    return {
        'field_conversion': fc, 'nome': config.get('nome_campanha') or fc,
        'corte': corte, 'corte_label': _day_label(corte),
        'report_date': config.get('data_report') or '', 'dia_campanha': dia_campanha, 'n_dias': n_dias,
        'days': days, 'series': series, 'tot': tot, 'd3': d3, 'tot_sums': tot_sums,
        'traf_metrics': traf_metrics, 'has_pageviews': has_pageviews, 'has_views': has_views,
        'rows_corte': rows_corte, 'trules': trules,   # modo-fundo: agrega por dimensão/filtro sob demanda
        'trend': trends, 'meta': metas, 'meta_status': mstatus,
        'split': split, 'temp': temp, 'tipo_lead': tipo_lead, 'canais_org': canais_org,
        'criativos': creatives, 'cr_dia': crdia, 'cr_dia_label': _day_label(crdia),
        'funnel_total': funnel_total, 'funnel_3d': funnel_3d,
        'risks_macro': risks_macro, 'risks_traf': risks_traf,
    }


def _creatives(day_rows, links):
    by_ad = {}
    for r in day_rows:
        if not is_paid(r):
            continue
        ad = (r.get('field_ad_name') or '').strip()
        if not ad:
            continue
        a = by_ad.setdefault(ad, {'name': ad, 'invest': 0.0, 'leads_traf': 0.0, 'mqls': 0.0, 'respostas': 0.0, 'link': None})
        a['invest'] += fnum(r.get('invest_total'))
        a['leads_traf'] += fnum(r.get('leads_trafego'))
        a['mqls'] += fnum(r.get('leads_mqls'))
        a['respostas'] += fnum(r.get('respostas'))
        if not a['link']:
            lk = (r.get('link_criativo') or '').strip()
            if lk:
                a['link'] = lk
    out = []
    for a in by_ad.values():
        if a['leads_traf'] <= 0:
            continue
        cpl = div(a['invest'], a['leads_traf'])
        tq = pct(a['mqls'], a['respostas'])
        out.append({'name': a['name'], 'link': a['link'] or links.get(a['name']),
                    'invest': round(a['invest'], 2), 'leads': round(a['leads_traf']),
                    'respostas': round(a['respostas']), 'cpl': cpl, 'taxa_qual': tq,
                    'cpmql_proj': (round(cpl * 100 / tq, 2) if (cpl is not None and tq) else None)})
    best = sorted(out, key=lambda c: -c['leads'])[:3]
    # maior qualificação (taxa de qualidade) — só com base estatística mínima (≥20
    # respostas), senão um criativo com pouquíssima pesquisa "ganha" por ruído.
    eff = sorted([c for c in out if c['taxa_qual'] is not None and c['respostas'] >= 20],
                 key=lambda c: -c['taxa_qual'])[:3]
    return {'best': best, 'eff': eff}


def _funnel(rows, bench=None, stages=None):
    """Funil de tráfego pago. `bench` = lista de migração esperada por transição
    (i→i+1). O maior furo é a transição com maior queda RELATIVA ao seu benchmark
    (`gap = (bench − migração)/bench`), não a maior perda absoluta. `stages` permite
    omitir etapas sem dado (ex.: Pageviews ausente)."""
    stage_defs = stages or FUNNEL_STAGES
    bench = bench or [None] * (len(stage_defs) - 1)
    s = _sum(rows)
    leads_total = s['leads'] or 0
    resp_pond = s['respostas'] * (s['leads_pago'] / leads_total) if leads_total else 0
    vals = {'imp': s['imp'], 'clicks': s['clicks'], 'pageviews': s['pageviews'],
            'leads': s['leads_pago'], 'respostas_pond': resp_pond, 'mqls': s['mqls']}
    stages = [{'key': k, 'label': lbl, 'value': round(vals[k])} for k, lbl in stage_defs]
    gaps = []
    for i in range(len(stages) - 1):
        cur, nxt = stages[i]['value'], stages[i + 1]['value']
        if cur <= 0:
            stages[i]['trans'] = None
            continue
        if nxt > cur:
            stages[i]['trans'] = {'invalid': True}
            continue
        mig = round(nxt / cur * 100, 1)
        t = {'perda': round((1 - nxt / cur) * 100, 1), 'migracao': mig}
        b = bench[i] if i < len(bench) else None
        if b:
            t['bench'] = round(b, 1)
            t['gap'] = round((b - mig) / b * 100, 1)   # % abaixo do esperado (furo relativo)
            if t['gap'] > 0:
                gaps.append((i, t['gap']))
        stages[i]['trans'] = t
    if gaps:                                            # maior furo = maior queda vs benchmark
        stages[max(gaps, key=lambda x: x[1])[0]]['trans']['maior_furo'] = True
    return stages


TREND_RISK_PCT = 15   # piora mínima (em 3d, na direção ruim) p/ virar risco de tendência


def _risks(metrics, tot, mstatus, trends, top=2):
    cand = []
    for m in metrics:
        st = mstatus.get(m)
        tr = trends.get(m) or {}
        if st and st['cls'] in ('bad', 'warn'):
            # risco de nível: já está furando a meta
            cand.append({'metric': m, 'label': LABELS[m], 'value': tot.get(m),
                         'meta_dev': st['dev'], 'cls': st['cls'], 'reason': 'meta',
                         'trend_pct': tr.get('pct'), 'trend_dir': tr.get('dir')})
        elif m != 'investimento' and tr.get('good') is False and (tr.get('pct') or 0) >= TREND_RISK_PCT:
            # risco de tendência: dentro da meta, mas piorando rápido
            cand.append({'metric': m, 'label': LABELS[m], 'value': tot.get(m),
                         'meta_dev': st['dev'] if st else None, 'cls': 'warn', 'reason': 'trend',
                         'trend_pct': tr.get('pct'), 'trend_dir': tr.get('dir')})
    # meta primeiro (pior desvio), depois tendência (maior piora)
    cand.sort(key=lambda r: (0 if r['reason'] == 'meta' else 1,
                             r['meta_dev'] if r['reason'] == 'meta' else -(r['trend_pct'] or 0)))
    return cand[:top]
