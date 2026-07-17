"""calc — motor descritivo da "análise de criativos" (Meta Ads), stdlib pura.

Porta as fórmulas do gerador-fichas-criativos (JS) para o app. Uma linha do CSV =
criativo (field_ad_name) × dia × (campanha/público/temperatura). O dicionário mapeia
field_ad_name -> link do anúncio.

Dois MODOS analíticos (toggle), que mudam quais indicadores aparecem:
  • resultado  — performance de venda: ROAS líquido, conversão, retorno (★ ROAS).
  • captacao   — eficiência de captação: CPL, CPMQL projetado, qualidade (★ CPMQL).

Regras (skill): produto principal = vendas_sale se Σ>0 senão vendas; qualidade =
MQLs/Respostas (não /Leads); CPMQL = CPL/qualRaw (qualRaw = MQLs/Respostas puro);
Hook/Hold só com views_totais>0; criativos sem tráfego = no_data (cinza, fora dos KPIs).
Percentuais em % real; taxa nunca é média — soma brutos e calcula sobre o total.
"""
import csv
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # pysrc/ → common
from common import temp as temp_util

# Benchmark de tráfego por tipo de funil — MESMO registro central do app
# (/api/benchmarks: campos hook/hold/ctr/connect/conv_pag). O config carrega
# `funnel_bench` (escolhido/editado na criação); sem ele, cai no fallback abaixo.
FUNNEL_BENCH = {'hook': 30.0, 'hold': 30.0, 'ctr': 1.5, 'connect': 80.0, 'conv_pag': 40.0}
# nomes do registro central → chaves de métrica de criativo (o que o calc calcula).
_BENCH_MAP = {'hook': 'hook_rate', 'hold': 'hold_rate', 'ctr': 'ctr',
              'connect': 'connect_rate', 'conv_pag': 'conv_pagina'}


def resolve_bench(config):
    """Benchmark do relatório com CHAVES de métrica de criativo. Mescla o
    `funnel_bench` do config (escolhido na criação) sobre o fallback e traduz
    p/ hook_rate/hold_rate/ctr/connect_rate/conv_pagina."""
    fb = dict(FUNNEL_BENCH)
    fb.update((config or {}).get('funnel_bench') or {})
    return {_BENCH_MAP[k]: v for k, v in fb.items() if k in _BENCH_MAP and v is not None}


# Fallback (chaves de criativo) usado como referência quando não há config.
BENCH = resolve_bench(None)

# Catálogo de indicadores: rótulo, formato, modo ('resultado'|'captacao'|'ambos'),
# e se "maior é melhor" (cost=False) — guia os seletores de gráfico e a ordenação.
METRICS = {
    'invest':       {'label': 'Investimento',      'fmt': 'money', 'mode': 'ambos',     'cost': None},
    'leads':        {'label': 'Leads',             'fmt': 'int',   'mode': 'ambos',     'cost': False},
    'vendas':       {'label': 'Vendas',            'fmt': 'int',   'mode': 'resultado', 'cost': False},
    'faturamento':  {'label': 'Faturamento',       'fmt': 'money', 'mode': 'resultado', 'cost': False},
    'retorno':      {'label': 'Retorno bruto',     'fmt': 'money', 'mode': 'resultado', 'cost': False},
    'roas':         {'label': 'ROAS líquido',      'fmt': 'x',     'mode': 'resultado', 'cost': False},
    'conv':         {'label': 'Tx. Conversão',     'fmt': 'pct',   'mode': 'resultado', 'cost': False},
    'cac':          {'label': 'CAC',               'fmt': 'money', 'mode': 'resultado', 'cost': True},
    'mqls':         {'label': 'MQLs',              'fmt': 'int',   'mode': 'ambos',     'cost': False},
    'qualidade':    {'label': 'Qualidade',         'fmt': 'pct',   'mode': 'ambos',     'cost': False},
    'tx_resposta':  {'label': 'Tx. Resposta',      'fmt': 'pct',   'mode': 'captacao',  'cost': False},
    'cpl':          {'label': 'CPL',               'fmt': 'money', 'mode': 'ambos',     'cost': True},
    'cpmql':        {'label': 'CPMQL projetado',   'fmt': 'money', 'mode': 'captacao',  'cost': True},
    'cpm':          {'label': 'CPM',               'fmt': 'money', 'mode': 'captacao',  'cost': True},
    'ctr':          {'label': 'CTR',               'fmt': 'pct',   'mode': 'captacao',  'cost': False},
    'hook_rate':    {'label': 'Hook Rate',         'fmt': 'pct',   'mode': 'ambos',     'cost': False},
    'hold_rate':    {'label': 'Hold Rate',         'fmt': 'pct',   'mode': 'ambos',     'cost': False},
    'connect_rate': {'label': 'Connect Rate',      'fmt': 'pct',   'mode': 'ambos',     'cost': False},
    'conv_pagina':  {'label': 'Conversão de Página', 'fmt': 'pct', 'mode': 'ambos',     'cost': False},
    'videoviews':   {'label': 'Videoviews',        'fmt': 'int',   'mode': 'ambos',     'cost': False},
}


# ── leitura ──────────────────────────────────────────────────────────────────

def load_rows(path):
    with open(path, encoding='utf-8-sig', errors='replace') as f:
        head = f.read(8192); f.seek(0)
        sep = max(',;\t', key=lambda c: head.count(c))
        return list(csv.DictReader(f, delimiter=sep))


def load_dict(path):
    """Dicionário field_ad_name -> link do anúncio (2ª coluna, qualquer nome)."""
    out = {}
    if not path:
        return out
    with open(path, encoding='utf-8-sig', errors='replace') as f:
        r = csv.reader(f)
        rows = list(r)
    if not rows:
        return out
    for row in rows[1:]:
        if len(row) >= 2 and row[0].strip():
            out[row[0].strip()] = (row[1] or '').strip()
    return out


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
    return round(a / b * 100, 4) if b > 0 else None


def div(a, b, nd=4):
    a, b = fnum(a), fnum(b)
    return round(a / b, nd) if b > 0 else None


# ── chave de produto / plataforma ────────────────────────────────────────────

def produto_principal(rows):
    return 'vendas_sale' if soma(rows, 'vendas_sale') > 0 else 'vendas'


def _fat_col(produto):
    return 'faturamento_sale' if produto == 'vendas_sale' else 'faturamento'


def _platform(link):
    l = (link or '').lower()
    if 'facebook.com' in l or 'fb.com' in l:
        return 'Facebook'
    return 'Instagram'


# ── métricas de um recorte (criativo, temperatura, campanha, dia…) ───────────

def metrics(rows, produto):
    """Todos os indicadores de um conjunto de linhas (None onde não há base).

    O número nasce só aqui; build_report serializa. Reusado em todos os recortes."""
    fatcol = _fat_col(produto)
    invest = soma(rows, 'invest_total')
    leads = soma(rows, 'leads')
    mqls = soma(rows, 'leads_mqls')
    resp = soma(rows, 'respostas')
    vendas = soma(rows, produto)
    fat = soma(rows, fatcol)
    imp = soma(rows, 'impressoes')
    clk = soma(rows, 'link_clicks')
    pv = soma(rows, 'pageviews')
    v2s = soma(rows, 'views_2s')
    v50 = soma(rows, 'views_50pc')
    v100 = soma(rows, 'views_100pc')
    vtot = soma(rows, 'views_totais')
    qual_raw = (mqls / resp) if resp > 0 else None
    cpl = div(invest, leads)
    return {
        'invest': round(invest, 2), 'leads': round(leads), 'mqls': round(mqls),
        'respostas': round(resp), 'vendas': round(vendas), 'faturamento': round(fat, 2),
        'impressoes': round(imp), 'clicks': round(clk), 'pageviews': round(pv),
        'views_2s': round(v2s), 'views_50pc': round(v50), 'views_totais': round(vtot),
        # resultado
        'roas': (round(fat / invest - 1, 4) if invest > 0 else None),
        'retorno': round(fat - invest, 2),
        'conv': pct(vendas, leads),
        'cac': div(invest, vendas),
        'qualidade': pct(mqls, resp),
        # captação
        'cpl': cpl,
        'cpmql': (round(cpl / qual_raw, 4) if (cpl is not None and qual_raw) else None),
        'cpm': div(invest * 1000, imp),
        'ctr': pct(clk, imp),
        'tx_resposta': pct(resp, leads),
        # vídeo / página (só com base de vídeo). A cadeia: o NUMERADOR do Hook é o
        # DENOMINADOR do Hold — quem começou a assistir.
        #   Hook = quem começou ÷ quem viu o anúncio
        #   Hold = quem foi até o fim ÷ quem começou
        # "quem começou" deveria ser views_2s, mas o export traz o campo ZERADO (usá-lo
        # apagaria Hook e Hold de todos os criativos), então a base é views_totais.
        # Idem "views95": não há coluna de 95% no export → views_100pc (assistiu até o fim).
        'hook_rate': (pct(vtot, imp) if vtot > 0 else None),
        'hold_rate': (pct(v100, vtot) if vtot > 0 else None),
        'connect_rate': pct(pv, clk),
        'conv_pagina': pct(leads, pv),
        'videoviews': (round(vtot) if vtot > 0 else None),
        'is_video': vtot > 0,
        'has_traffic': (imp > 0 or invest > 0),
    }


def apply_temp_rules(rows, rules, overwrite=False):
    """Deriva `temperatura_lead` do `field_campaign_name` por ILIKE (substring case-
    insensitive). `rules` = [{'contains': [termo, ...]|str, 'label': <temperatura>}, ...]
    em ordem de prioridade (1º match vence). Para CSVs crus de mídia (sem coluna de
    temperatura limpa) — espelha o CASE WHEN ... LIKE do montador.

    Sem `overwrite`, só classifica linhas cuja temperatura está vazia (preserva o que
    já vier preenchido). Não-casadas viram 'N/C'. Muta in-place e devolve a lista."""
    norm = temp_util.normalize_rules(rules)
    return temp_util.apply(rows, norm, src='field_campaign_name',
                           dst='temperatura_lead', overwrite=overwrite, fallback='N/C')


# Tipo de campanha por ILIKE no nome da campanha — mesmo shape das regras de
# temperatura (escolhido na criação). Sem regras no config, cai neste padrão.
TIPO_RULES_DEFAULT = [{'contains': ['_lead'], 'label': 'Lead'},
                      {'contains': ['_venda'], 'label': 'Venda'}]


def apply_tipo_rules(rows, rules=None):
    """Deriva `tipo_campanha` do `field_campaign_name` por ILIKE (1º match vence),
    igual às regras de temperatura. `rules=None` usa TIPO_RULES_DEFAULT. Sempre
    reclassifica (a coluna não vem do CSV). Não-casadas viram 'N/C'."""
    norm = temp_util.normalize_rules(rules if rules is not None else TIPO_RULES_DEFAULT)
    return temp_util.apply(rows, norm, src='field_campaign_name',
                           dst='tipo_campanha', overwrite=True, fallback='N/C')


def is_ratio(mk):
    """Indicador de RAZÃO/CUSTO (taxa, ×, custo unitário)? Para esses, `avg` é a razão
    AGREGADA — ou seja, IGUAL ao total (média simples de taxa distorce: um criativo de
    R$5 pesaria igual a um de R$50k). Só os ADITIVOS (investimento, leads, vendas…) têm
    média por criativo de verdade. Quem exibe usa isto p/ não mostrar "méd X" ao lado de
    um X idêntico (comparar o número consigo mesmo)."""
    meta = METRICS.get(mk, {})
    return meta.get('fmt') in ('pct', 'x') or meta.get('cost') is True


def _distinct(rows, col):
    seen = []
    for r in rows:
        v = (r.get(col) or '').strip()
        if v and v not in seen:
            seen.append(v)
    return seen


def _date(r):
    return str(r.get('data', '')).strip()[:10]


def _trim_daily(daily):
    """Corta as pontas com investimento zerado: começa no 1º e termina no último
    dia com investimento != 0 (mantém zeros no miolo)."""
    idx = [i for i, d in enumerate(daily) if (d['m'].get('invest') or 0) > 0]
    return daily[idx[0]: idx[-1] + 1] if idx else daily


# ── agregação por criativo ───────────────────────────────────────────────────

def build(rows, dic=None, opts=None):
    """Agrega por criativo (field_ad_name). Devolve criativos + dimensões + médias.

    opts = { temp?: <temperatura ativa | None>, min_invest?: <float> } só afeta os
    AGREGADOS globais (totais/médias/série) — cada criativo carrega seus próprios
    recortes para a ficha. Filtros reativos finos ficam no render_view. O TIPO DE
    CAMPANHA não entra aqui: é escolhido na criação e filtrado no assemble."""
    opts = opts or {}
    dic = dic or {}
    produto = produto_principal(rows)
    temps = _distinct(rows, 'temperatura_lead')   # todas (para as opções do filtro)
    # Filtro de TEMPERATURA (recompute): restringe as linhas à temperatura ativa antes
    # de agregar — assim todas as métricas refletem o recorte.
    sel_temp = opts.get('temp')
    if sel_temp:
        rows = [r for r in rows if (r.get('temperatura_lead') or '').strip() == sel_temp]

    keys = []
    for r in rows:
        k = (r.get('field_ad_name') or '').strip()
        if k and k not in keys:
            keys.append(k)

    creatives = []
    for k in keys:
        crows = [r for r in rows if (r.get('field_ad_name') or '').strip() == k]
        m = metrics(crows, produto)
        link = dic.get(k, '')
        crt = {
            'key': k, 'name': k, 'link': link, 'platform': _platform(link),
            'is_video': m['is_video'], 'no_data': not m['has_traffic'],
            'temps': _distinct(crows, 'temperatura_lead'),
            'm': m,
            # CANAL = utm_source (meta-ads, google-ads…). `platform` acima é outra coisa:
            # sai do link do anúncio (facebook.com → Facebook) e é fixa por criativo — não
            # serve de recorte. O mesmo criativo pode rodar em mais de um canal.
            'by_canal': {s: metrics([r for r in crows if (r.get('utm_source') or '').strip() == s], produto) for s in _distinct(crows, 'utm_source')},
            'by_temp': {t: metrics([r for r in crows if (r.get('temperatura_lead') or '').strip() == t], produto) for t in _distinct(crows, 'temperatura_lead')},
            'by_campanha': {c: metrics([r for r in crows if (r.get('field_campaign_name') or '').strip() == c], produto) for c in _distinct(crows, 'field_campaign_name')},
            'by_publico': {a: metrics([r for r in crows if (r.get('field_adset_name') or '').strip() == a], produto) for a in _distinct(crows, 'field_adset_name')},
            'daily': _trim_daily([{'data': d, 'm': metrics([r for r in crows if _date(r) == d], produto)}
                                  for d in sorted({_date(r) for r in crows if _date(r)})]),
        }
        creatives.append(crt)

    # criativos com tráfego (e acima do investimento mínimo) entram nos totais/médias
    try:
        min_invest = float(opts.get('min_invest') or 0)
    except (TypeError, ValueError):
        min_invest = 0.0
    valid = [c for c in creatives if not c['no_data'] and c['m']['invest'] >= min_invest]
    total = metrics([r for r in rows
                     if (r.get('field_ad_name') or '').strip() in {c['key'] for c in valid}], produto)
    # média do lançamento por indicador (referência na ficha).
    # Métricas de RAZÃO/CUSTO (CPL, CPM, CAC, ROAS, conversão, taxas) → a referência é a
    # razão AGREGADA (ponderada por volume = o total). A média simples das razões por
    # criativo distorce — um criativo de R$5 pesa igual a um de R$50k — e produzia as
    # "médias aleatórias". Métricas ADITIVAS (investimento, leads, vendas…) → média por
    # criativo (total ÷ nº de criativos válidos), que é o que se espera de uma "média".
    n_valid = len(valid)
    avg = {}
    for mk in METRICS:
        if is_ratio(mk):
            avg[mk] = total.get(mk)
        else:
            v = total.get(mk)
            avg[mk] = round(v / n_valid, 4) if (v is not None and n_valid) else None

    # série diária global (todos os criativos válidos)
    days = sorted({_date(r) for r in rows if _date(r)})
    valid_keys = {c['key'] for c in valid}
    daily = _trim_daily([{'data': d, 'm': metrics([r for r in rows
              if _date(r) == d and (r.get('field_ad_name') or '').strip() in valid_keys], produto)}
             for d in days])

    return {
        'produto': produto,
        'creatives': creatives,
        'valid': valid,
        'temps': temps,
        'campanhas': _distinct(rows, 'field_campaign_name'),
        'publicos': _distinct(rows, 'field_adset_name'),
        'total': total, 'avg': avg, 'daily': daily,
        'bench': BENCH,
    }
