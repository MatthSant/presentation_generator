"""
ltv_calc.py — Funções de apoio para análise de LTV.

Uso: copiar para temp/[nome-da-analise]/ e importar nas análises da skill.
Cada seção do relatório chama as funções deste módulo — não reimplementa lógica.

Depende apenas da stdlib Python (csv, re, datetime, collections).
"""

import csv
import re
from collections import defaultdict
from datetime import datetime, timedelta
from statistics import median


# ─── I/O ──────────────────────────────────────────────────────────────────────

def load_csv(path: str) -> list[dict]:
    """Lê o CSV e retorna lista de dicts (uma linha por transação)."""
    with open(path, encoding='utf-8') as f:
        return list(csv.DictReader(f))


def safe_float(v) -> float | None:
    """Converte string para float, tolerando vírgula como decimal."""
    try:
        return float(str(v).replace(',', '.').strip())
    except (ValueError, TypeError):
        return None


def parse_date(v: str) -> datetime | None:
    """Aceita YYYY-MM-DD (com ou sem hora/timezone) e DD/MM/YYYY."""
    v = v.strip()
    m = re.match(r'(\d{4}-\d{2}-\d{2})', v)
    if m:
        return datetime.strptime(m.group(1), '%Y-%m-%d')
    for fmt in ('%d/%m/%Y', '%d-%m-%Y'):
        try:
            return datetime.strptime(v, fmt)
        except ValueError:
            pass
    return None


# ─── CONSTRUÇÃO DA BASE DE USUÁRIOS ───────────────────────────────────────────

def build_users(rows: list[dict],
                col_user: str = 'user_id',
                col_value: str = 'valor_venda',
                col_date: str = 'data_pedido',
                col_product: str = 'nome_produto',
                col_first_product: str = 'primeiro_produto',
                profile_cols: list[str] | None = None) -> tuple[list[dict], dict]:
    """
    Consolida transações em registros de usuário único.

    Retorna:
        users     — lista de dicts, um por user_id, com campos derivados
        all_txs   — dict {user_id: [{date, value, produto}, ...]} ordenado por data

    Campos derivados em cada user dict:
        uid, ltv, t1, n_tx, recompra, ticket_rcmp,
        safra, data_t1, data_t2, dias_ate_2a,
        slug_entrada (vazio — preencher com norm_produto() após),
        + todos os campos de perfil passados em profile_cols
    """
    profile_cols = profile_cols or []

    # Agrupar transações por usuário
    raw: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        v = safe_float(r.get(col_value, ''))
        if v is None or v <= 0:
            continue  # filtro base: valor_venda > 0
        d = parse_date(r.get(col_date, ''))
        raw[r[col_user]].append({
            'date':    d,
            'value':   v,
            'produto': r.get(col_product, '').strip(),
            'primeiro': r.get(col_first_product, '').strip(),
        })

    # Ordenar por data e construir user dicts
    all_txs: dict[str, list[dict]] = {}
    users: list[dict] = []

    for uid, txs in raw.items():
        txs.sort(key=lambda x: x['date'] or datetime.min)
        all_txs[uid] = txs

        vals   = [t['value'] for t in txs]
        dates  = [t['date']  for t in txs]
        t1     = vals[0]
        ltv    = sum(vals)
        n_tx   = len(vals)
        recomp = n_tx > 1
        rcmp_vals = vals[1:] if recomp else []
        ticket_rcmp = sum(rcmp_vals) / len(rcmp_vals) if rcmp_vals else None
        data_t1 = dates[0]
        data_t2 = dates[1] if recomp else None
        dias_ate_2a = (data_t2 - data_t1).days if (data_t2 and data_t1) else None
        safra = data_t1.year if data_t1 else None

        # Pegar linha de perfil: primeira com mais campos preenchidos
        profile_row = _best_profile_row(raw[uid], rows, uid, col_user, profile_cols)

        u = {
            'uid':         uid,
            'ltv':         ltv,
            't1':          t1,
            'n_tx':        n_tx,
            'recompra':    recomp,
            'ticket_rcmp': ticket_rcmp,
            'safra':       safra,
            'data_t1':     data_t1,
            'data_t2':     data_t2,
            'dias_ate_2a': dias_ate_2a,
            'slug_entrada': '',   # preencher externamente via norm_produto()
        }
        for col in profile_cols:
            u[col] = profile_row.get(col, '').strip() if profile_row else ''

        users.append(u)

    return users, all_txs


def _best_profile_row(txs_user, all_rows, uid, col_user, profile_cols):
    """Retorna a linha do CSV com mais campos de perfil preenchidos para este usuário."""
    if not profile_cols:
        return {}
    candidates = [r for r in all_rows if r.get(col_user) == uid]
    if not candidates:
        return {}
    return max(candidates, key=lambda r: sum(1 for c in profile_cols if r.get(c, '').strip()))


# ─── FILTROS E AGRUPAMENTOS ────────────────────────────────────────────────────

def filter_by(users: list[dict], key: str, values) -> list[dict]:
    """
    Filtra users por valor de um campo.
    values pode ser string, lista ou set.

    Exemplo:
        core_users = filter_by(users, 'slug_entrada', {'AT', 'ABA', 'TP'})
    """
    if isinstance(values, str):
        values = {values}
    else:
        values = set(values)
    return [u for u in users if u.get(key) in values]


def group_by(users: list[dict], key: str, min_n: int = 0) -> dict[str, list[dict]]:
    """
    Agrupa users por valor de um campo.
    Exclui grupos com n < min_n.

    Retorna dict {valor: [user, ...]} ordenado por tamanho desc.
    """
    groups: dict[str, list[dict]] = defaultdict(list)
    for u in users:
        v = u.get(key, '')
        if v:
            groups[v].append(u)
    return {k: v for k, v in
            sorted(groups.items(), key=lambda x: -len(x[1]))
            if len(v) >= min_n}


# ─── MÉTRICAS AGREGADAS ────────────────────────────────────────────────────────

def calc_ltv_metrics(group: list[dict]) -> dict:
    """
    Calcula as 10 métricas padrão para um grupo de usuários.

    Retorna dict com:
        n, ltv_medio, t1_medio, mult, upside_pct,
        tx_recompra, ticket_rcmp, fat_1a, fat_rcmp, fat_total
    """
    n = len(group)
    if n == 0:
        return {}

    ltvs    = [u['ltv'] for u in group]
    t1s     = [u['t1']  for u in group]
    rcmps   = [u['ticket_rcmp'] for u in group if u['ticket_rcmp'] is not None]

    ltv_med = sum(ltvs) / n
    t1_med  = sum(t1s)  / n
    mult    = ltv_med / t1_med if t1_med else 0
    upside  = (ltv_med - t1_med) / t1_med * 100 if t1_med else 0
    tx_rcmp = sum(1 for u in group if u['recompra']) / n * 100
    trcmp   = sum(rcmps) / len(rcmps) if rcmps else 0
    fat_1a  = sum(t1s)
    fat_rcmp = sum(u['ltv'] - u['t1'] for u in group)
    fat_tot = sum(ltvs)

    return {
        'n':           n,
        'ltv_medio':   round(ltv_med, 2),
        't1_medio':    round(t1_med, 2),
        'mult':        round(mult, 3),
        'upside_pct':  round(upside, 1),
        'tx_recompra': round(tx_rcmp, 1),
        'ticket_rcmp': round(trcmp, 2),
        'fat_1a':      fat_1a,
        'fat_rcmp':    fat_rcmp,
        'fat_total':   fat_tot,
    }


def seg_table(users: list[dict], key: str,
              min_n: int = 10, norm_fn=None) -> list[dict]:
    """
    Tabela de segmentação por dimensão de perfil.
    Usa norm_fn(valor) para normalizar o campo antes de agrupar (opcional).
    Retorna lista de dicts com label + 10 métricas, ordenada por n desc.

    Exemplo:
        tabela = seg_table(users, 'escolaridade', min_n=50, norm_fn=norm_escolaridade)
    """
    groups: dict[str, list[dict]] = defaultdict(list)
    for u in users:
        v = u.get(key, '').strip()
        if norm_fn:
            v = norm_fn(v)
        if v:
            groups[v].append(u)

    rows = []
    for label, grp in groups.items():
        if len(grp) < min_n:
            continue
        m = calc_ltv_metrics(grp)
        m['label'] = label
        rows.append(m)

    rows.sort(key=lambda r: -r['n'])
    return rows


# ─── ANÁLISE TEMPORAL ─────────────────────────────────────────────────────────

JANELAS_PADRAO = [30, 90, 180, 365, 9999]
JANELAS_LABELS = ['30d', '90d', '180d', '1a', '1a+']


def ltv_progressao(users: list[dict], all_txs: dict,
                   janelas: list[int] = None) -> list[float]:
    """
    LTV médio acumulado em cada janela de dias desde a T1.

    Retorna lista de floats, um por janela (mesma ordem de `janelas`).
    Exclui usuários sem data T1 válida.
    """
    janelas = janelas or JANELAS_PADRAO
    acum: dict[int, list[float]] = {w: [] for w in janelas}

    for u in users:
        t0 = u['data_t1']
        if not t0:
            continue
        txs = all_txs.get(u['uid'], [])
        for w in janelas:
            cutoff = t0 + timedelta(days=w)
            total = sum(t['value'] for t in txs
                        if t['date'] and t['date'] <= cutoff)
            acum[w].append(total)

    return [round(sum(v) / len(v), 2) if v else 0.0 for v in acum.values()]


def dist_janela_recompra(users: list[dict],
                         janelas: list[tuple] = None) -> dict[str, float]:
    """
    Distribuição de recompradores por janela de dias até a 2ª compra.

    janelas: lista de (min_dias, max_dias, label)
    Retorna dict {label: % de recompradores} — soma 100%.
    """
    janelas = janelas or [
        (0,   30,  '≤30d'),
        (31,  90,  '31–90d'),
        (91,  180, '91–180d'),
        (181, 365, '181–365d'),
        (366, 9999,'>365d'),
    ]
    recompradores = [u for u in users if u['recompra'] and u['dias_ate_2a'] is not None]
    n = len(recompradores)
    if n == 0:
        return {lbl: 0.0 for _, _, lbl in janelas}

    counts = defaultdict(int)
    for u in recompradores:
        d = u['dias_ate_2a']
        for lo, hi, lbl in janelas:
            if lo <= d <= hi:
                counts[lbl] += 1
                break

    return {lbl: round(counts[lbl] / n * 100, 1) for _, _, lbl in janelas}


def mediana_retorno(users: list[dict]) -> float | None:
    """Mediana de dias até a 2ª compra, apenas para recompradores com data válida."""
    vals = [u['dias_ate_2a'] for u in users
            if u['recompra'] and u['dias_ate_2a'] is not None]
    return round(median(vals), 1) if vals else None


# ─── RECOMPRA — DESTINO DA 2ª COMPRA ─────────────────────────────────────────

def recompra_destinos(users: list[dict], all_txs: dict,
                      norm_fn=None, top_n: int = 7) -> list[dict]:
    """
    Top destinos da 2ª compra para um grupo de usuários.

    norm_fn: função para normalizar o nome do produto (opcional)
    Retorna lista de dicts {label, n, pct_base, ticket_medio, receita},
    ordenada por n desc. Cauda agrupada em "Outros" se > top_n destinos.
    """
    n_total = len(users)
    counter: dict[str, dict] = defaultdict(lambda: {'n': 0, 'rev': 0.0})

    for u in users:
        txs = all_txs.get(u['uid'], [])
        if len(txs) < 2:
            continue
        produto_t2 = txs[1]['produto']
        label = norm_fn(produto_t2) if norm_fn else produto_t2[:50]
        counter[label]['n']   += 1
        counter[label]['rev'] += txs[1]['value']

    sorted_items = sorted(counter.items(), key=lambda x: -x[1]['n'])

    result = []
    outros_n, outros_rev = 0, 0.0
    for i, (label, d) in enumerate(sorted_items):
        ticket = d['rev'] / d['n'] if d['n'] else 0
        if i < top_n:
            result.append({
                'label':        label,
                'n':            d['n'],
                'pct_base':     round(d['n'] / n_total * 100, 1),
                'ticket_medio': round(ticket, 2),
                'receita':      d['rev'],
            })
        else:
            outros_n   += d['n']
            outros_rev += d['rev']

    if outros_n:
        result.append({
            'label':        'Outros',
            'n':            outros_n,
            'pct_base':     round(outros_n / n_total * 100, 1),
            'ticket_medio': round(outros_rev / outros_n, 2),
            'receita':      outros_rev,
        })

    return result


# ─── COORTE / SAFRA ───────────────────────────────────────────────────────────

def ltv_por_safra(users: list[dict], all_txs: dict,
                  janelas: list[int] = None) -> dict[int, dict]:
    """
    LTV médio acumulado por safra (ano da T1) × janela temporal.

    Retorna dict {safra: {n, ltv_por_janela: [float], tx_recompra, mult}}
    """
    janelas = janelas or JANELAS_PADRAO

    safras: dict[int, list[dict]] = defaultdict(list)
    for u in users:
        if u['safra']:
            safras[u['safra']].append(u)

    result = {}
    for safra, grp in sorted(safras.items()):
        prog = ltv_progressao(grp, all_txs, janelas)
        m    = calc_ltv_metrics(grp)
        result[safra] = {
            'n':              m['n'],
            'ltv_por_janela': prog,
            'tx_recompra':    m['tx_recompra'],
            'mult':           m['mult'],
        }
    return result


# ─── FATURAMENTO ANUAL ────────────────────────────────────────────────────────

def faturamento_anual(rows: list[dict],
                      col_user: str = 'user_id',
                      col_value: str = 'valor_venda',
                      col_date: str = 'data_pedido',
                      col_primeira: str = 'data_primeira_compra') -> dict[int, dict]:
    """
    Faturamento por ano separado em nova aquisição vs recompra.

    Retorna dict {ano: {fat_nova, fat_rcmp, fat_total, ticket_medio, n_novos}}
    """
    result: dict[int, dict] = defaultdict(lambda: {
        'fat_nova': 0.0, 'fat_rcmp': 0.0, 'fat_total': 0.0,
        'n_transacoes': 0, 'soma_tickets': 0.0, 'n_novos': 0
    })

    for r in rows:
        v = safe_float(r.get(col_value, ''))
        if v is None or v <= 0:
            continue
        d = parse_date(r.get(col_date, ''))
        if not d:
            continue
        ano = d.year

        d_first = parse_date(r.get(col_primeira, ''))
        is_nova = (d_first and abs((d - d_first).days) <= 1)

        result[ano]['fat_total']    += v
        result[ano]['n_transacoes'] += 1
        result[ano]['soma_tickets'] += v
        if is_nova:
            result[ano]['fat_nova'] += v
            result[ano]['n_novos']  += 1
        else:
            result[ano]['fat_rcmp'] += v

    for ano, d in result.items():
        n = d['n_transacoes']
        d['ticket_medio'] = round(d['soma_tickets'] / n, 2) if n else 0
        del d['soma_tickets'], d['n_transacoes']

    return dict(sorted(result.items()))


# ─── UTILITÁRIOS DE FORMATAÇÃO ────────────────────────────────────────────────

def fmt_brl(v: float) -> str:
    """Formata valor em reais: R$ 1,23M / R$ 456k / R$ 789."""
    if v >= 1_000_000:
        return f'R$ {v / 1_000_000:.2f}M'
    if v >= 1_000:
        return f'R$ {v / 1_000:.0f}k'
    return f'R$ {v:.0f}'


def fmt_pct(v: float, decimals: int = 1) -> str:
    return f'{v:.{decimals}f}%'
