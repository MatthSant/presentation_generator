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
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # pysrc/ → common
from common import temp as temp_util

# Defaults de classificação (sobrescrevíveis via config).
DEF_PAID = ['facebook', 'meta', 'google', 'fb', 'tiktok']           # substring em utm_source
DEF_CPT = ['-cpt]', 'cadastro-', 'google-search-', 'captacao']      # substring em field_campaign_name
DEF_VND = ['-vnd]', 'venda-', 'vendas-']
# Default em ordem de prioridade (1ª regra que casar vence). Sobrescrevível pelo
# cliente/fallback geral via config['temp_rules'] (ou legado config['temperature']).
DEF_TEMP_RULES = [
    {'contains': ['advantage', '[advantage]'], 'label': 'advantage'},
    {'contains': ['quente', 'hot', 'warm'], 'label': 'quente'},
    {'contains': ['frio', 'cold'], 'label': 'frio'},
    {'contains': ['rmkt', 'remarketing'], 'label': 'remarketing'},
]


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
    trules = (temp_util.normalize_rules(config.get('temp_rules'))
              or temp_util.rules_from_config(config, DEF_TEMP_RULES, key='temperature'))
    for r in rows:
        src = (r.get('utm_source') or '').strip()
        s = src.lower()
        if not src or s in ('null', 'none', 'nan', '-', '–', '—', '(direto)'):
            # sem rastreio de origem → "Não trackeado", contabilizado como orgânico.
            r['utm_source'] = 'Não trackeado'
            r['_tipo'] = 'organico'
        elif any(p in s for p in paid):
            r['_tipo'] = 'pago'
        else:
            r['_tipo'] = 'organico'
        cn = (r.get('field_campaign_name') or '').lower()
        r['_camp'] = ('captacao' if any(p in cn for p in cpt)
                      else 'vendas' if any(p in cn for p in vnd) else 'outro')
        r['_temp'] = temp_util.classify(cn, trules, 'n/c')
    return rows


def _sub(rows, **f):
    out = rows
    for k, v in f.items():
        out = [r for r in out if r.get(k) == v]
    return out


# ── modo-fundo: dimensões do dump + agregação de um recorte arbitrário ────────
# O dump do debriefing é nível-anúncio (mesmas colunas do acompanhamento): além de
# escopo/canal/temperatura/semana, dá pra abrir por criativo/público/campanha. As
# linhas já vêm classificadas (_tipo/_camp/_temp) por classify().

def norm_source(v):
    """utm_source normalizado: vazios/null/'-' viram '(direto)'."""
    s = str(v if v is not None else '').strip()
    return '(direto)' if s.lower() in ('', 'null', 'none', 'nan', '-', '(none)') else s


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


# Conjunto de métricas expostas no modo-fundo (superset dos KPIs do relatório +
# os fatores de mídia p/ a decomposição de CPL/CPMQL + frescor de audiência).
FRAME_METRICS = ['leads', 'vendas', 'conv', 'qual', 'fat', 'invest', 'roas', 'cpl',
                 'cpmql', 'fpl', 'cpm', 'ctr', 'connect', 'conv_pag', 'taxa_resp',
                 'novos', 'antigos', 'pct_novos']
LABELS = {'leads': 'Leads', 'vendas': 'Vendas', 'conv': 'Conversão', 'qual': 'Qualificação',
          'fat': 'Faturamento', 'invest': 'Investimento', 'roas': 'ROAS', 'cpl': 'CPL',
          'cpmql': 'CPMQL', 'fpl': 'Fat/lead', 'cpm': 'CPM', 'ctr': 'CTR',
          'connect': 'Connect Rate', 'conv_pag': 'Conv. de Página', 'taxa_resp': 'Taxa de Resposta',
          'novos': 'Leads novos', 'antigos': 'Leads antigos', 'pct_novos': '% leads novos'}
COST = {'cpl', 'cpmql', 'cpm'}


def _derive(sub):
    """KPIs derivados de um recorte arbitrário de linhas (None onde não há base).
    Espelha as definições do dict M: investimento = só captação; ROAS/CPL/CPMQL/CPM
    usam mídia paga de captação; qualidade tem versão geral e versão paga (que entra
    no CPMQL). conv_pag/connect/ctr/cpm habilitam a decomposição log do CPL."""
    pago = [r for r in sub if r.get('_tipo') == 'pago']
    cpt = [r for r in sub if r.get('_camp') == 'captacao']
    leads = soma(sub, 'leads')
    vendas = soma(sub, 'vendas')
    fat = soma(sub, 'faturamento')
    fat_pago = soma(pago, 'faturamento')
    invest_cpt = soma(cpt, 'invest_total')
    leads_traf = soma(sub, 'leads_trafego')
    imp = soma(sub, 'impressoes')
    clicks = soma(sub, 'link_clicks')
    pv = soma(sub, 'pageviews')
    mqls_t, resps_t = soma(sub, 'leads_mqls'), soma(sub, 'respostas')
    mqls_p, resps_p = soma(pago, 'leads_mqls'), soma(pago, 'respostas')
    qual_p = pct(mqls_p, resps_p)
    cpl = div(invest_cpt, leads_traf) if invest_cpt > 0 else None
    novos, antigos = soma(sub, 'leads_novo'), soma(sub, 'leads_antigos')
    return {
        'leads': round(leads), 'vendas': round(vendas),
        'fat': round(fat, 2), 'invest': round(invest_cpt, 2),
        'conv': pct(vendas, leads), 'qual': pct(mqls_t, resps_t), 'qual_pago': qual_p,
        'roas': (div(fat_pago - invest_cpt, invest_cpt) if invest_cpt > 0 else None),
        'cpl': cpl,
        'cpmql': (div(cpl * 100, qual_p) if (cpl and qual_p) else None),
        'fpl': div(fat, leads),
        'cpm': (div(invest_cpt * 1000, imp) if imp else None),
        'ctr': (pct(clicks, imp) if imp else None),
        'connect': (pct(pv, clicks) if pv else None),
        'conv_pag': (pct(leads_traf, pv) if pv else (pct(leads_traf, clicks) if clicks else None)),
        'taxa_resp': pct(resps_t, leads),
        'novos': round(novos), 'antigos': round(antigos),
        'pct_novos': pct(novos, novos + antigos),
    }


# ── ponte de faturamento (impacto na receita) ─────────────────────────────────
# Identidade EXATA com fatores IDENTIFICADOS (medíveis, sem suposição):
#   Faturamento = Volume(leads) × Conversão(vendas/leads) × Ticket(fat/vendas).
# NÃO decompomos a conversão em etapas de MQL (taxa_resp/qualif/MQL→venda): o dado NÃO
# mede a conversão de MQL vs não-MQL, então qualif×(vendas/MQL) seria um split NÃO-
# identificado (arbitrário) — atribuir receita à qualificação assume algo que não existe.
# Qualidade/MQL é assunto de CUSTO (CPMQL = CPL/qualif), tratado em decomposicao(cpmql).
REV_FACTORS = [('leads', 'Volume (leads)'), ('conv', 'Conversão (vendas/leads)'),
               ('ticket', 'Ticket médio')]


def rev_factors(rows):
    leads, vend, fat = soma(rows, 'leads'), soma(rows, 'vendas'), soma(rows, 'faturamento')
    return {'leads': leads, 'conv': div(vend, leads, 6), 'ticket': div(fat, vend, 2),
            'fat': fat, 'vendas': vend}


def match(r, f):
    """True se a linha passa pelos filtros de recorte (escopo/temperatura/canal/
    criativo/publico/campanha) — compartilhado por frame_rows e impacto_receita."""
    if f.get('escopo') and _esc(r) != f['escopo']:
        return False
    if f.get('temperatura') and r.get('_temp') != f['temperatura']:
        return False
    if f.get('canal') and norm_source(r.get('utm_source')) != f['canal']:
        return False
    if f.get('criativo') and ad_name(r) != f['criativo']:
        return False
    if f.get('publico') and adset_name(r) != f['publico']:
        return False
    if f.get('campanha') and campaign_name(r) != f['campanha']:
        return False
    if f.get('dia'):
        d = _date(r)
        lbl = (d[8:10] + '/' + d[5:7]) if len(d) >= 10 else d
        if f['dia'] != d and f['dia'] != lbl:      # aceita ISO (YYYY-MM-DD) ou rótulo DD/MM
            return False
    return True


def _esc(r):
    t = r.get('_tipo')
    return 'Pago' if t == 'pago' else ('Orgânico' if t == 'organico' else 'Não identificado')


def _keyfn(dim):
    return {'temperatura': lambda r: r.get('_temp'), 'canal': lambda r: norm_source(r.get('utm_source')),
            'criativo': ad_name, 'publico': adset_name, 'campanha': campaign_name,
            'escopo': _esc}.get(dim, _date)


def frame_rows(rows, dim, filtro=None, incluir_geral=False):
    """Agrega o recorte por dimensão p/ o modo-fundo: [{key, m:{métrica:valor}}].

    dim ∈ dia | escopo | canal | temperatura | criativo | publico | campanha.
    `filtro` restringe as linhas ANTES de agrupar (escopo/temperatura/canal/criativo/
    publico/campanha) — habilita cruzamentos como 'ROAS por temperatura SÓ do canal X'.
    `incluir_geral` (partições, não dia) acrescenta a linha 'Geral' com o valor GLOBAL
    CORRETO — _derive(tudo): soma p/ contagens, recálculo ponderado p/ taxas/custos —
    em vez de a IA somar os grupos (taxa nunca se soma)."""
    f = filtro or {}
    sub = [r for r in rows if match(r, f)]
    if dim in ('temperatura', 'publico'):        # conceitos só do pago
        sub = [r for r in sub if r.get('_tipo') == 'pago']
    keyfn = _keyfn(dim)
    fixed = ['Pago', 'Orgânico', 'Não identificado'] if dim == 'escopo' else None

    groups = {}
    for r in sub:
        groups.setdefault(keyfn(r), []).append(r)
    if dim == 'dia':
        keys = sorted(groups)
    elif fixed:
        keys = [k for k in fixed if k in groups]
    else:                                         # partição: mais leads primeiro
        keys = sorted(groups, key=lambda k: -_derive(groups[k])['leads'])

    out = []
    for k in keys:
        d = _derive(groups[k])
        label = (k[8:10] + '/' + k[5:7]) if dim == 'dia' and len(str(k)) >= 10 else str(k)
        out.append({'key': label, 'm': {m: d.get(m) for m in FRAME_METRICS}})
    if incluir_geral and dim != 'dia' and sub:
        g = _derive(sub)
        out.append({'key': 'Geral', 'm': {m: g.get(m) for m in FRAME_METRICS}})
    return out


def cross_dia(rows, dim):
    """Crosstab DIA × dimensão: KPIs derivados por célula (dia, grupo). Habilita UM
    gráfico multi-linha 'métrica por dia, uma linha por grupo' (ex.: CPL por dia por
    temperatura) — em vez de um gráfico por grupo."""
    if dim in ('temperatura', 'publico'):
        rows = [r for r in rows if r.get('_tipo') == 'pago']
    keyfn = _keyfn(dim)
    cells = {}
    for r in rows:
        d = _date(r)
        if not d:
            continue
        cells.setdefault((d, keyfn(r)), []).append(r)
    out = []
    for (d, g) in sorted(cells):
        m = _derive(cells[(d, g)])
        out.append({'dia': d[8:10] + '/' + d[5:7], 'serie': str(g), 'm': {k: m.get(k) for k in FRAME_METRICS}})
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
        c = by_canal.setdefault(src, {'meta_leads': 0.0, 'meta_vendas': 0.0, 'meta_fat': 0.0, 'meta_cpl': [],
                                      'resp_w': 0.0, 'qual_w': 0.0})
        ml = fnum(r.get('meta_leads'))
        c['meta_leads'] += ml
        c['meta_vendas'] += fnum(r.get('meta_vendas'))
        c['meta_fat'] += fnum(r.get('meta_receita'))
        # taxas de resp/qualif ponderadas por meta_leads (p/ meta por escopo no funil).
        c['resp_w'] += fnum(r.get('meta_taxa_resp')) * ml
        c['qual_w'] += fnum(r.get('meta_taxa_qual')) * ml
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
        'taxa_resp': _mean_nonzero([fnum(r.get('meta_taxa_resp')) for r in rows]) * 100 or None,
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
        'mqls_pago': mqls_pago, 'resps_pago': resps_pago, 'mqls_org': mqls_org, 'resps_org': resps_org,
        'taxa_resp': pct(resps_total, leads_total),
        'qual': pct(mqls_total, resps_total), 'qual_pago': qual_pago, 'qual_org': pct(mqls_org, resps_org),
        'conv_geral': pct(vendas_total, leads_total), 'conv_pago': pct(vendas_pago, leads_pago),
        'conv_org': pct(vendas_org, leads_org),
        'cpl': cpl, 'cpmql': (div(cpl * 100, qual_pago) if qual_pago else 0.0),
        'ctr': pct(clicks, impr), 'cpm': div(invest_cpt * 1000, impr), 'cpc': div(invest_cpt, clicks),
        'tx_pag': pct(leads_traf, clicks), 'cac': div(invest_cpt, vendas_pago),
        # funil de captação paga: impressões → clicks → pageviews → leads → MQLs
        'impressoes': int(impr), 'clicks': int(clicks), 'pageviews': int(s('pageviews')),
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
    M['publico'] = _publico(rows)
    M['canal_pago'] = _canal_pago(rows)
    M['criativo_pago'] = _criativo_pago(rows)
    M['camp_roas'] = _camp_roas(rows)
    M['weekly'] = _weekly(rows)
    win = _cpt_window(rows, config)
    M['cpt_window'] = win
    M['daily'] = _daily(rows, win)
    M['daily_traf'] = _daily_traf(rows, win)
    M['daily_org'] = _daily_org(rows, win)
    M['daily_all'] = _daily_all(rows, win)
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
        c = by.setdefault(t, {'temp': t, 'inv': 0.0, 'fat': 0.0, 'leads': 0, 'vendas': 0, 'mqls': 0,
                              'resps': 0, 'impr': 0.0, 'clk': 0.0, 'pv': 0.0})
        if r.get('_camp') == 'captacao':
            c['inv'] += fnum(r.get('invest_total'))
        if r.get('_tipo') == 'pago':
            c['fat'] += fnum(r.get('faturamento')); c['leads'] += int(fnum(r.get('leads')))
            c['vendas'] += int(fnum(r.get('vendas'))); c['mqls'] += int(fnum(r.get('leads_mqls')))
            c['resps'] += int(fnum(r.get('respostas')))
            c['impr'] += fnum(r.get('impressoes')); c['clk'] += fnum(r.get('link_clicks')); c['pv'] += fnum(r.get('pageviews'))
    out = []
    for c in by.values():
        if c['leads'] == 0 and c['inv'] == 0:
            continue
        c['inv'] = round(c['inv'], 2); c['fat'] = round(c['fat'], 2)
        c['roas'] = div(c['fat'] - c['inv'], c['inv']); c['conv'] = pct(c['vendas'], c['leads'])
        c['qual'] = pct(c['mqls'], c['resps']); c['meta_vendas'] = mvt.get(c['temp'], 0)
        c['taxa_resp'] = pct(c['resps'], c['leads'])
        c['cpl'] = div(c['inv'], c['leads'])
        c['cpmql'] = div(c['cpl'] * 100, c['qual']) if c['qual'] else 0.0
        _media_metrics(c)
        out.append(c)
    return sorted(out, key=lambda c: -c['inv'])


def _media_metrics(c):
    """Métricas de mídia derivadas de impressões/clicks/pageviews (in-place)."""
    c['cpm'] = div(c['inv'] * 1000, c['impr']) if c.get('impr') else 0.0
    c['ctr'] = pct(c['clk'], c['impr']) if c.get('impr') else 0.0
    c['connect'] = pct(c['pv'], c['clk']) if c.get('clk') else 0.0
    c['tx_pag'] = pct(c['leads'], c['clk']) if c.get('clk') else 0.0


def _seg_pago(rows, keyfn, namekey, top=None, min_inv=0.0):
    """Agrega o funil pago por uma dimensão (público/canal): mesmas métricas do _temp,
    sem meta. inv só de captação; ordena por leads; top N opcional. `min_inv` descarta
    segmentos com investimento abaixo do piso (ex.: canal sem verba = ruído de UTM)."""
    by = {}
    for r in rows:
        if r.get('_tipo') != 'pago':
            continue
        k = keyfn(r)
        c = by.setdefault(k, {namekey: k, 'inv': 0.0, 'fat': 0.0, 'leads': 0, 'vendas': 0, 'mqls': 0,
                              'resps': 0, 'impr': 0.0, 'clk': 0.0, 'pv': 0.0})
        if r.get('_camp') == 'captacao':
            c['inv'] += fnum(r.get('invest_total'))
        c['fat'] += fnum(r.get('faturamento')); c['leads'] += int(fnum(r.get('leads')))
        c['vendas'] += int(fnum(r.get('vendas'))); c['mqls'] += int(fnum(r.get('leads_mqls')))
        c['resps'] += int(fnum(r.get('respostas')))
        c['impr'] += fnum(r.get('impressoes')); c['clk'] += fnum(r.get('link_clicks')); c['pv'] += fnum(r.get('pageviews'))
    out = []
    for c in by.values():
        if c['inv'] <= min_inv and c['leads'] == 0:
            continue
        if min_inv and c['inv'] <= min_inv:
            continue
        c['inv'] = round(c['inv'], 2); c['fat'] = round(c['fat'], 2)
        c['roas'] = div(c['fat'] - c['inv'], c['inv']); c['conv'] = pct(c['vendas'], c['leads'])
        c['qual'] = pct(c['mqls'], c['resps']); c['taxa_resp'] = pct(c['resps'], c['leads'])
        c['cpl'] = div(c['inv'], c['leads'])
        c['cpmql'] = div(c['cpl'] * 100, c['qual']) if c['qual'] else 0.0
        _media_metrics(c)
        out.append(c)
    out.sort(key=lambda c: -c['leads'])
    return out[:top] if top else out


def _publico(rows, top=6):
    """Funil pago por público (adset), sem meta por público. Top N por leads."""
    return _seg_pago(rows, adset_name, 'publico', top)


def _canal_pago(rows, top=8):
    """Funil pago por canal (utm_source normalizado). Top N por leads; exige verba > 0."""
    return _seg_pago(rows, lambda r: norm_source(r.get('utm_source')), 'canal', top, min_inv=1.0)


def _criativo_pago(rows, top=8):
    """Funil pago por criativo (field_ad_name). Top N por leads."""
    return _seg_pago(rows, ad_name, 'criativo', top)


def _camp_roas(rows):
    by = {}
    for r in rows:
        if r.get('_camp') != 'captacao':
            continue
        c = by.setdefault(r.get('field_campaign_name') or '(vazio)',
                          {'campanha': r.get('field_campaign_name') or '(vazio)', 'inv': 0.0, 'fat': 0.0,
                           'leads': 0, 'vendas': 0, 'mqls': 0, 'resps': 0, 'impr': 0.0, 'clk': 0.0, 'pv': 0.0})
        c['inv'] += fnum(r.get('invest_total')); c['fat'] += fnum(r.get('faturamento'))
        c['leads'] += int(fnum(r.get('leads'))); c['vendas'] += int(fnum(r.get('vendas')))
        c['mqls'] += int(fnum(r.get('leads_mqls'))); c['resps'] += int(fnum(r.get('respostas')))
        c['impr'] += fnum(r.get('impressoes')); c['clk'] += fnum(r.get('link_clicks')); c['pv'] += fnum(r.get('pageviews'))
    out = []
    for c in by.values():
        if c['inv'] <= 0:
            continue
        c['inv'] = round(c['inv'], 2); c['fat'] = round(c['fat'], 2)
        c['roas'] = div(c['fat'] - c['inv'], c['inv']); c['conv'] = pct(c['vendas'], c['leads'])
        c['cpl'] = div(c['inv'], c['leads'])
        c['qual'] = pct(c['mqls'], c['resps']); c['taxa_resp'] = pct(c['resps'], c['leads'])
        c['cpmql'] = div(c['cpl'] * 100, c['qual']) if c['qual'] else 0.0
        _media_metrics(c)
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


def _daily_traf(rows, window=None):
    """Pontos diários da mídia PAGA com todas as métricas de tráfego (p/ o combo no tempo)."""
    ini, fim = window or (None, None)
    by = {}
    for r in rows:
        if r.get('_tipo') != 'pago':
            continue
        d = _date(r)
        if not d or (ini and d < ini) or (fim and d > fim):
            continue
        c = by.setdefault(d, {'inv': 0.0, 'fat': 0.0, 'leads': 0, 'vendas': 0, 'mqls': 0,
                              'resps': 0, 'impr': 0.0, 'clk': 0.0, 'pv': 0.0})
        if r.get('_camp') == 'captacao':
            c['inv'] += fnum(r.get('invest_total'))
        c['fat'] += fnum(r.get('faturamento')); c['leads'] += int(fnum(r.get('leads')))
        c['vendas'] += int(fnum(r.get('vendas'))); c['mqls'] += int(fnum(r.get('leads_mqls')))
        c['resps'] += int(fnum(r.get('respostas')))
        c['impr'] += fnum(r.get('impressoes')); c['clk'] += fnum(r.get('link_clicks')); c['pv'] += fnum(r.get('pageviews'))
    out = []
    for d in sorted(by):
        c = by[d]
        cpl = div(c['inv'], c['leads']); qual = pct(c['mqls'], c['resps'])
        c['cpm'] = div(c['inv'] * 1000, c['impr']) if c['impr'] else 0.0
        c['ctr'] = pct(c['clk'], c['impr']) if c['impr'] else 0.0
        out.append({'name': d[8:10] + '/' + d[5:7], 'vals': {
            'inv': round(c['inv'], 2), 'fat': round(c['fat'], 2), 'retorno': round(c['fat'] - c['inv'], 2),
            'leads': c['leads'], 'vendas': c['vendas'], 'cpl': round(cpl, 2),
            'cpmql': round(div(cpl * 100, qual), 2) if qual else 0.0,
            'cpm': round(c['cpm'], 2), 'ctr': c['ctr'], 'conv': pct(c['vendas'], c['leads']),
            'qual': qual, 'taxa_resp': pct(c['resps'], c['leads']),
            'roas': div(c['fat'] - c['inv'], c['inv'])}})
    # poda a cauda pós-captação: dias finais com investimento desprezível (< 2% do pico)
    # achatam o fim do gráfico em ~0 — corta enquanto sobrar ao menos alguns dias.
    if out:
        thr = max((p['vals'].get('inv') or 0) for p in out) * 0.02
        while len(out) > 3 and (out[-1]['vals'].get('inv') or 0) <= thr:
            out.pop()
    return out


def _daily_all(rows, window=None):
    """Pontos diários da CAMPANHA INTEIRA (pago + orgânico) com as métricas de resultado."""
    ini, fim = window or (None, None)
    by = {}
    for r in rows:
        d = _date(r)
        if not d or (ini and d < ini) or (fim and d > fim):
            continue
        c = by.setdefault(d, {'inv': 0.0, 'fat': 0.0, 'leads': 0, 'lpago': 0, 'vendas': 0, 'mqls': 0, 'resps': 0})
        if r.get('_camp') == 'captacao':
            c['inv'] += fnum(r.get('invest_total'))
        c['fat'] += fnum(r.get('faturamento')); c['leads'] += int(fnum(r.get('leads')))
        if r.get('_tipo') == 'pago':
            c['lpago'] += int(fnum(r.get('leads')))
        c['vendas'] += int(fnum(r.get('vendas'))); c['mqls'] += int(fnum(r.get('leads_mqls'))); c['resps'] += int(fnum(r.get('respostas')))
    out = []
    for d in sorted(by):
        c = by[d]
        out.append({'name': d[8:10] + '/' + d[5:7], 'vals': {
            'leads': c['leads'], 'vendas': c['vendas'], 'fat': round(c['fat'], 2),
            'inv': round(c['inv'], 2), 'retorno': round(c['fat'] - c['inv'], 2),
            'roas': div(c['fat'] - c['inv'], c['inv']), 'cpl': div(c['inv'], c['lpago']),
            'conv': pct(c['vendas'], c['leads']), 'qual': pct(c['mqls'], c['resps']),
            'taxa_resp': pct(c['resps'], c['leads']), 'ticket': div(c['fat'], c['vendas']), 'mqls': c['mqls']}})
    while len(out) > 3 and (out[-1]['vals'].get('leads') or 0) <= 0:
        out.pop()
    return out


def _daily_org(rows, window=None):
    """Pontos diários dos canais ORGÂNICOS com as métricas de resultado (p/ o combo no tempo)."""
    ini, fim = window or (None, None)
    by = {}
    for r in rows:
        if r.get('_tipo') != 'organico':
            continue
        d = _date(r)
        if not d or (ini and d < ini) or (fim and d > fim):
            continue
        c = by.setdefault(d, {'fat': 0.0, 'leads': 0, 'vendas': 0, 'mqls': 0, 'resps': 0})
        c['fat'] += fnum(r.get('faturamento')); c['leads'] += int(fnum(r.get('leads')))
        c['vendas'] += int(fnum(r.get('vendas'))); c['mqls'] += int(fnum(r.get('leads_mqls')))
        c['resps'] += int(fnum(r.get('respostas')))
    out = []
    for d in sorted(by):
        c = by[d]
        out.append({'name': d[8:10] + '/' + d[5:7], 'vals': {
            'fat': round(c['fat'], 2), 'leads': c['leads'], 'vendas': c['vendas'],
            'conv': pct(c['vendas'], c['leads']), 'qual': pct(c['mqls'], c['resps']),
            'taxa_resp': pct(c['resps'], c['leads']),
            'ticket': div(c['fat'], c['vendas']), 'mqls': c['mqls']}})
    while len(out) > 3 and (out[-1]['vals'].get('leads') or 0) <= 0:
        out.pop()
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
    sub = [r for r in rows if not fc or r.get('field_conversion') == fc]
    # Config defasado: o field_conversion gravado não casa NENHUMA linha do dump
    # (ex.: base retida com fc errado/antigo). Em vez de zerar tudo, auto-detecta
    # o lançamento presente no dump — assim o deep/recompute nunca fica sem dados.
    if fc and not sub:
        fcs = sorted({r.get('field_conversion', '') for r in rows if r.get('field_conversion')})
        fc = fcs[0] if fcs else ''
        sub = [r for r in rows if not fc or r.get('field_conversion') == fc]
    rows = sub
    classify(rows, config)
    goals = None
    if config.get('goals_csv'):
        goals = load_goals(config['goals_csv'], fc, config.get('meta_vendas_canal'), config.get('meta_vendas_temperatura'))
    hist = None
    hist_rows = []
    if config.get('hist_csv'):
        hrows = load_rows(config['hist_csv'])
        # o histórico nunca pode incluir o próprio lançamento atual: senão a coluna
        # "Histórico" só repete o "Realizado". Filtra fora o field_conversion corrente.
        if fc:
            hrows = [r for r in hrows if r.get('field_conversion') != fc]
        if hrows:
            classify(hrows, config)
            hist = _hist_meta(hrows)
            hist_rows = hrows
    M = metrics(rows, config, goals, hist)
    M['field_conversion'] = fc
    M['nome'] = config.get('client_name') or config.get('nome_campanha') or fc
    M['campaign_label'] = config.get('campaign_label') or ''
    # linhas classificadas do lançamento — só p/ o modo-fundo (query_api). build_report
    # lê campos nomeados de M, nunca serializa M inteiro, então não vaza p/ o dataset.
    M['_rows'] = rows
    M['_hist_rows'] = hist_rows   # linhas do lançamento anterior (vazio se sem hist_csv)
    # histórico por canal (leads/vendas/conv do lançamento anterior) p/ o toggle meta↔hist.
    M['chan_hist'] = {c['canal']: c for c in _chan(hist_rows, config)} if hist_rows else {}
    # histórico do funil por escopo (leads→respostas→MQLs→vendas) p/ o toggle nos funis/cards.
    M['hist_funnel'] = _hist_funnel(hist_rows) if hist_rows else {}
    # histórico por TEMPERATURA (eixo estável entre lançamentos) p/ comparar a cauda do Tráfego.
    M['hist_temp'] = _hist_temp(hist_rows) if hist_rows else {}
    # funil pago do lançamento anterior por segmento (temp/canal) p/ o toggle vs Histórico
    # no heatmap de gargalos — mesmas métricas do _seg_pago, indexadas pela chave do segmento.
    M['hist_temp_seg'] = {s['temp']: s for s in _seg_pago(hist_rows, lambda r: r.get('_temp'), 'temp')} if hist_rows else {}
    M['hist_canal_seg'] = {s['canal']: s for s in _seg_pago(hist_rows, lambda r: norm_source(r.get('utm_source')), 'canal')} if hist_rows else {}
    return M


def _hist_temp(rows):
    """Lançamento anterior agregado por temperatura (pago) → roas/conv/qual/cpl/vendas/leads."""
    by = {}
    for r in rows:
        if r.get('_tipo') != 'pago':
            continue
        t = r.get('_temp')
        c = by.setdefault(t, {'inv': 0.0, 'fat': 0.0, 'leads': 0, 'vendas': 0, 'mqls': 0, 'resps': 0})
        if r.get('_camp') == 'captacao':
            c['inv'] += fnum(r.get('invest_total'))
        c['fat'] += fnum(r.get('faturamento')); c['leads'] += int(fnum(r.get('leads')))
        c['vendas'] += int(fnum(r.get('vendas'))); c['mqls'] += int(fnum(r.get('leads_mqls')))
        c['resps'] += int(fnum(r.get('respostas')))
    out = {}
    for t, c in by.items():
        out[t] = {'roas': div(c['fat'] - c['inv'], c['inv']), 'conv': pct(c['vendas'], c['leads']),
                  'qual': pct(c['mqls'], c['resps']), 'cpl': div(c['inv'], c['leads']),
                  'vendas': c['vendas'], 'leads': c['leads']}
    return out


def _hist_funnel(rows):
    def tot(sub):
        return {'leads': int(soma(sub, 'leads')), 'resps': int(soma(sub, 'respostas')),
                'mqls': int(soma(sub, 'leads_mqls')), 'vendas': int(soma(sub, 'vendas'))}
    pago = [r for r in rows if r.get('_tipo') == 'pago']
    org = [r for r in rows if r.get('_tipo') != 'pago']
    return {'geral': tot(rows), 'pago': tot(pago), 'org': tot(org)}


def _hist_meta(rows):
    pago = _sub(rows, _tipo='pago')
    cpt = _sub(rows, _camp='captacao')
    inv_cpt = soma(cpt, 'invest_total')
    leads_traf = soma(rows, 'leads_trafego')
    mqls_p, resps_p = soma(pago, 'leads_mqls'), soma(pago, 'respostas')
    qual = pct(mqls_p, resps_p)
    cpl = div(inv_cpt, leads_traf)
    fat = soma(rows, 'faturamento'); fat_pago = soma(pago, 'faturamento')
    # métricas de captação (mídia paga) do lançamento anterior — p/ o toggle histórico.
    impr, clicks = soma(rows, 'impressoes'), soma(rows, 'link_clicks')
    leads_pago = soma(pago, 'leads')
    return {'fat': round(fat, 2), 'leads': int(soma(rows, 'leads')), 'vendas': int(soma(rows, 'vendas')),
            'invest': round(soma(rows, 'invest_total'), 2), 'invest_cpt': round(inv_cpt, 2),
            'cpl': cpl, 'qual': qual, 'cpmql': (div(cpl * 100, qual) if qual else 0.0),
            'roas': div(fat_pago - inv_cpt, inv_cpt),
            'cpm': (div(inv_cpt * 1000, impr) if impr else None),
            'ctr': (pct(clicks, impr) if impr else None), 'cpc': div(inv_cpt, clicks),
            'tx_pag': (pct(leads_traf, clicks) if clicks else None),
            'taxa_resp': (pct(resps_p, leads_pago) if leads_pago else None)}
