"""calc — motor descritivo do "histórico de lançamentos" (stdlib pura).

Porta a lógica de `gerar_dashboard_lancamentos.py` (build_all/build_pm) para o app,
trocando pandas por `csv` e devolvendo estruturas Python (o build_report serializa).

Uma linha do CSV = lançamento × temperatura_lead. Cronologia por `date_start`,
id do lançamento por `field_conversion`. Regras (skill): produto principal =
vendas_sale se Σ>0 senão vendas; custo = invest_total+paidmedia_tax; fat_liquido =
faturamento−refunded_value; ROAS=fat_liq/custo; ROI=(fat_liq−custo−sales_tax−broker)/custo;
conversão=produto/leads; qualificação=leads_mqls/respostas_pesquisa; orgânico não tem
ROAS/ROI/CPx (None, nunca 0); percentuais em % real; nunca média de taxa — soma brutos.
"""
import csv
import re

TEMPS = ['Hot', 'Warm', 'Cold', 'Advantage', 'N/C']
CANAIS = ['Geral', 'Pago', 'Orgânico']
PLATS = ['Meta', 'Google', 'Outros']
METRICS = ['conv', 'leads', 'investimento', 'vendas', 'faturamento',
           'qual', 'taxa_qualidade', 'conv_mql', 'reembolso', 'roas']
_M = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']


# ── leitura ────────────────────────────────────────────────────────────────

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
        return float(s)                       # CSV usa '.' decimal
    except ValueError:
        try:
            return float(s.replace('.', '').replace(',', '.'))  # fallback pt-BR
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


# ── cronologia / rótulos ─────────────────────────────────────────────────────

def _date_key(r):
    return str(r.get('date_start', '')).strip()[:10] or '9999-99-99'


def ordered_events(rows):
    first = {}
    for r in rows:
        fc = r.get('field_conversion', '')
        d = _date_key(r)
        if fc and (fc not in first or d < first[fc]):
            first[fc] = d
    return sorted(first, key=lambda k: (first[k], k))


def event_label(rows, fc):
    ds = next((_date_key(r) for r in rows if r.get('field_conversion') == fc), '')
    m = re.match(r'(\d{4})-(\d{2})', ds)
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
        if 1 <= mo <= 12:
            return f'{_M[mo]}/{str(y)[2:]}'
    return fc


def produto_principal(rows):
    return 'vendas_sale' if soma(rows, 'vendas_sale') > 0 else 'vendas'


# ── filtros ──────────────────────────────────────────────────────────────────

def subset(rows, fc, tipo=None, plataforma=None, temperatura=None):
    out = []
    for r in rows:
        if r.get('field_conversion') != fc:
            continue
        if tipo and r.get('tipo_trafego') != tipo:
            continue
        if plataforma:
            p = r.get('plataforma') or ''
            if plataforma == 'Meta' and 'Meta' not in p:
                continue
            if plataforma == 'Google' and 'Google' not in p:
                continue
            if plataforma == 'Outros' and (not p or 'Meta' in p or 'Google' in p):
                continue
        if temperatura and r.get('temperatura_lead') != temperatura:
            continue
        out.append(r)
    return out


# ── agregados por evento ─────────────────────────────────────────────────────

def _trio(d, produto):
    """Indicadores de um recorte para o toggle do Panorama (None onde sem base).

    Inclui volume (leads/investimento/vendas/faturamento) e taxas — todos
    agregáveis por canal/plataforma/temperatura. Volume = 0 vira None só quando
    o recorte não existe (sem linhas); senão soma real (0 é informativo)."""
    leads = soma(d, 'leads')
    mqls = soma(d, 'leads_mqls')
    fat = soma(d, 'faturamento')
    ref = soma(d, 'refunded_value')
    custo = soma(d, 'invest_total') + soma(d, 'paidmedia_tax')
    vendas = soma(d, produto)
    has = len(d) > 0
    return {
        'leads': round(leads) if has else None,
        'investimento': round(custo, 2) if has else None,
        'vendas': round(vendas) if has else None,
        'faturamento': round(fat - ref, 2) if has else None,
        'conv': pct(vendas, leads),
        'qual': pct(mqls, soma(d, 'respostas_pesquisa')),
        'taxa_qualidade': pct(mqls, leads),
        'conv_mql': pct(soma(d, 'vendas_mql'), mqls),
        'reembolso': pct(ref, fat),
        'roas': div(fat - ref, custo),
    }


def _overview(rows, fc, produto):
    d = subset(rows, fc)
    dp = subset(rows, fc, tipo='Pago')
    do = subset(rows, fc, tipo='Orgânico')

    invest = soma(d, 'invest_total') + soma(d, 'paidmedia_tax')
    faturamento = soma(d, 'faturamento')
    refunded = soma(d, 'refunded_value')
    fat_liq = faturamento - refunded
    sales_tax = soma(d, 'sales_tax')
    broker = soma(d, 'broker_fee')
    leads = soma(d, 'leads')
    mqls = soma(d, 'leads_mqls')
    resp = soma(d, 'respostas_pesquisa')
    vendas = soma(d, produto)
    ret = fat_liq - invest - sales_tax - broker

    # quebras conv/qual/reembolso por canal / plataforma / temperatura (toggle de métrica)
    by = {
        'canal': {'Geral': _trio(d, produto), 'Pago': _trio(dp, produto), 'Orgânico': _trio(do, produto)},
        'plataforma': {pl: _trio(subset(rows, fc, tipo='Pago', plataforma=pl), produto) for pl in PLATS},
        'temp': {t: _trio(subset(rows, fc, temperatura=t), produto) for t in TEMPS},
    }

    return {
        'invest': round(invest, 2), 'faturamento': round(faturamento, 2),
        'refunded': round(refunded, 2), 'fat_liq': round(fat_liq, 2),
        'sales_tax': round(sales_tax, 2), 'broker': round(broker, 2),
        'leads': round(leads), 'mqls': round(mqls), 'resp': round(resp),
        'vendas': round(vendas), 'ret': round(ret, 2),
        'roas': div(fat_liq, invest), 'roi': div(ret, invest),
        'conv_ger': pct(vendas, leads),
        'qualificacao': pct(mqls, resp),                       # MQL / respostas
        'taxa_qualidade': pct(mqls, leads),                    # MQL / leads
        'conv_mql': pct(soma(d, 'vendas_mql'), mqls),          # vendas de MQL / MQL
        'reembolso': pct(refunded, faturamento),
        'by': by,
        'leads_antigos': round(soma(d, 'leads_antigos')),
        # "recapturados" = leads antigos reengajados (coluna recap_antigos)
        'recap': round(soma(d, 'recap_antigos')),
        'recap_pago': round(soma(dp, 'recap_antigos')), 'recap_org': round(soma(do, 'recap_antigos')),
        'vendas_raw': round(soma(d, 'vendas')),
        'vendas_mql': round(soma(d, 'vendas_mql')), 'vendas_nao_mql': round(soma(d, 'vendas_nao_mql')),
        'refunds_qty': round(soma(d, 'refunds')),
        'l_pago': round(soma(dp, 'leads')), 'l_org': round(soma(do, 'leads')),
    }


_MEDIA_METRICS = ['cpm', 'ctr', 'cpc', 'cpl', 'conv_paga', 'cpa']


def _media_block(rows_paid, produto):
    invest = soma(rows_paid, 'invest_total') + soma(rows_paid, 'paidmedia_tax')
    imp = soma(rows_paid, 'impressoes')
    clicks = soma(rows_paid, 'link_clicks')
    leads_p = soma(rows_paid, 'leads')
    vendas_p = soma(rows_paid, produto)
    return {
        'invest': round(invest, 2), 'imp': round(imp), 'clicks': round(clicks),
        'leads_p': round(leads_p), 'vendas_p': round(vendas_p),
        'fat_liq_p': round(soma(rows_paid, 'faturamento') - soma(rows_paid, 'refunded_value'), 2),
        'cpm': div(invest * 1000, imp), 'ctr': pct(clicks, imp),
        'cpc': div(invest, clicks), 'cpl': div(invest, leads_p),
        'conv_paga': pct(vendas_p, leads_p), 'cpa': div(invest, vendas_p),
    }


def _media(rows, fc, produto):
    blk = _media_block(subset(rows, fc, tipo='Pago'), produto)
    blk['temp'] = {t: _media_block(subset(rows, fc, tipo='Pago', temperatura=t), produto) for t in TEMPS}
    return blk


def build_series(rows, only=None):
    """Agrega por lançamento. `only` (lista de labels) restringe aos selecionados."""
    produto = produto_principal(rows)
    events = ordered_events(rows)
    labels = {fc: event_label(rows, fc) for fc in events}
    if only:
        keep = set(only)
        events = [fc for fc in events if labels[fc] in keep]
    return {
        'produto': produto,
        'events': events,
        'labels': {fc: labels[fc] for fc in events},
        'all_labels': [labels[fc] for fc in ordered_events(rows)],
        'ov': {fc: _overview(rows, fc, produto) for fc in events},
        'media': {fc: _media(rows, fc, produto) for fc in events},
    }
