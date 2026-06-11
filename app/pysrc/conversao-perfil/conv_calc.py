"""conv_calc — motor de cálculo da skill `conversao-perfil`.

Agrega um dump multidimensional de pesquisa de lançamentos (uma linha por
combinação de dimensões × lançamento × canal) e produz as métricas de conversão
por critério, por canal, ao longo dos lançamentos — além da análise de
codependência entre fatores (qualificador vs. qualificante).

Princípios (ver calc-rules.md):
  • Benchmark = respondentes da pesquisa (linhas com dimensão preenchida),
    NUNCA o total de leads do lançamento.
  • Conversões já em % (ex.: 1.07 == 1,07%). Nunca multiplicar por 100 na view.
  • Lançamentos sempre em ordem cronológica (data extraída do nome).
  • Normalizar nomes de grupos duplicados antes de agregar.

O módulo só calcula e devolve estruturas Python; quem serializa o output do app
(dataset/sXX/layout/data) é o script gerador da análise.
"""
from __future__ import annotations
import csv, re, math, unicodedata, collections
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))  # pysrc/ → common
from common.fmt import fmtP, fmtPabs, fmt_pp  # noqa: F401 (re-export p/ chamadores)

# ── colunas fixas do dump ────────────────────────────────────────────────
COL_LCTO   = 'field_conversion'
COL_CANAL  = 'tipo_trafego'
COL_LEADS  = 'total_leads'
WINDOWS = {              # janela -> coluna de vendas
    'lcto': 'vendas_lancamento',
    '6m':   'vendas_6meses',
    '12m':  'vendas_12meses',
}
FIXED_COLS = {COL_LCTO, COL_CANAL, COL_LEADS, *WINDOWS.values()}

# ── leitura ──────────────────────────────────────────────────────────────

def detect_sep(path: str) -> str:
    with open(path, encoding='utf-8-sig', errors='replace') as f:
        head = f.read(8192)
    return max(',;\t', key=lambda c: head.count(c))

def load_dump(path: str) -> list[dict]:
    sep = detect_sep(path)
    with open(path, encoding='utf-8-sig', errors='replace') as f:
        return list(csv.DictReader(f, delimiter=sep))

def dim_columns(rows: list[dict]) -> list[str]:
    """Colunas de dimensão = tudo que não é fixo. Ordem preservada do header."""
    return [c for c in rows[0].keys() if c not in FIXED_COLS]

def num(v) -> float:
    if v is None: return 0.0
    s = str(v).strip().replace('.', '').replace(',', '.') if re.search(r',\d', str(v)) else str(v).strip()
    try: return float(s)
    except ValueError: return 0.0

# ── ordenação cronológica dos lançamentos ────────────────────────────────
_MONTHS = {'jan':1,'fev':2,'mar':3,'abr':4,'mai':5,'jun':6,
           'jul':7,'ago':8,'set':9,'out':10,'nov':11,'dez':12}

def lcto_sort_key(slug: str):
    """Extrai (ano, mês) do nome do lançamento p/ ordenar cronologicamente."""
    s = slug.lower()
    m = re.search(r'(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?\s*-?\s*(\d{2,4})', s)
    if not m:
        return (9999, 99, slug)
    mes = _MONTHS[m.group(1)]
    ano = int(m.group(2))
    if ano < 100: ano += 2000
    return (ano, mes, slug)

def ordered_lancamentos(rows: list[dict]) -> list[str]:
    uniq = list(dict.fromkeys(r[COL_LCTO] for r in rows))
    return sorted(uniq, key=lcto_sort_key)

# ── normalização de grupos duplicados ────────────────────────────────────

def _norm_key(s: str) -> str:
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    s = s.replace('10 milhoes', '10000000').replace('1 milhao', '1000000')
    s = re.sub(r'[^a-z0-9]', '', s)
    return s

def make_canon(canonical: list[str], alias: dict | None = None):
    """Devolve fn(raw)->grupo canônico. Usa alias explícito, depois _norm_key
    exato, depois prefixo (textos longos com sufixo divergente)."""
    alias = alias or {}
    keys = {c: _norm_key(c) for c in canonical}
    def canon(raw: str) -> str:
        if raw in alias: return alias[raw]
        nk = _norm_key(raw)
        for c, k in keys.items():
            if k == nk: return c
        for c, k in keys.items():
            if nk and (k.startswith(nk[:20]) or nk.startswith(k[:20])): return c
        return raw  # não casou — vira grupo próprio (reportar como anomalia)
    return canon

# ── filtro de canal ───────────────────────────────────────────────────────

def channel_filter(rows: list[dict], canal: str) -> list[dict]:
    if canal in (None, 'Geral'):
        return rows
    return [r for r in rows if r[COL_CANAL] == canal]

def is_respondent(r: dict, dims: list[str]) -> bool:
    return any(r[d].strip() for d in dims)

# ── agregação por critério ─────────────────────────────────────────────────

def _series(by_lcto: dict, lctos: list[str], leads_k='leads', sales_k='v_lcto'):
    """conv % por lançamento (None onde não há leads)."""
    out = []
    for l in lctos:
        cell = by_lcto.get(l)
        if not cell or not cell[leads_k]:
            out.append(None)
        else:
            out.append(cell[sales_k] / cell[leads_k] * 100)
    return out

def agg_criterio(rows, crit_col, dims, lctos, canal, canon=None, window='lcto', long_window='12m'):
    """Agrega um critério para um canal. Devolve estrutura por grupo + benchmarks,
    no mesmo formato consumido pelo gerador (porta de DATA.criterios[cid].canais[canal])."""
    canon = canon or (lambda x: x)
    crows = channel_filter(rows, canal)
    # Benchmark do critério = respondentes DESTE critério (coluna não-nula), conforme
    # a regra "apenas onde dimensão IS NOT NULL". Para critérios de cobertura ~100%
    # coincide com o total de respondentes; para os de cobertura menor (ex.: gênero)
    # isola o efeito dentro de quem respondeu aquela pergunta.
    resp = [r for r in crows if r[crit_col].strip()]
    bench_tot_rows = [r for r in crows if not is_respondent(r, dims)]
    wl, w12 = WINDOWS[window], WINDOWS[long_window]

    # benchmark pesquisa (respondentes) e benchmark total (linhas de dim vazia), por lançamento
    def bench_series(src, sales_col):
        agg = {l: {'leads': 0.0, 'sales': 0.0} for l in lctos}
        for r in src:
            l = r[COL_LCTO]
            if l in agg:
                agg[l]['leads'] += num(r[COL_LEADS]); agg[l]['sales'] += num(r[sales_col])
        return [(agg[l]['sales'] / agg[l]['leads'] * 100) if agg[l]['leads'] else None for l in lctos]

    bench_pesq_lcto = bench_series(resp, wl)
    bench_pesq_12m  = bench_series(resp, w12)
    bench_total_lcto = bench_series(bench_tot_rows, wl)
    bench_total_12m  = bench_series(bench_tot_rows, w12)

    # leads de respondentes por lançamento (denominador de representatividade)
    resp_leads = {l: 0.0 for l in lctos}
    for r in resp:
        if r[COL_LCTO] in resp_leads: resp_leads[r[COL_LCTO]] += num(r[COL_LEADS])

    # por grupo × lançamento
    grp = collections.defaultdict(lambda: collections.defaultdict(lambda: {'leads': 0.0, 'v_lcto': 0.0, 'v_12m': 0.0}))
    for r in resp:
        raw = r[crit_col].strip()
        if not raw: continue
        g = canon(raw); l = r[COL_LCTO]
        if l not in lctos: continue
        cell = grp[g][l]
        cell['leads'] += num(r[COL_LEADS]); cell['v_lcto'] += num(r[wl]); cell['v_12m'] += num(r[w12])

    por_grupo = {}
    for g, by_l in grp.items():
        conv_lcto, conv_12m, diff_lcto, diff_12m, uplift, rep = [], [], [], [], [], []
        leads, vl, v12 = [], [], []
        for i, l in enumerate(lctos):
            cell = by_l.get(l)
            ld = cell['leads'] if cell else 0.0
            leads.append(ld); vl.append(cell['v_lcto'] if cell else 0.0); v12.append(cell['v_12m'] if cell else 0.0)
            cl = (cell['v_lcto'] / ld * 100) if ld else None
            c12 = (cell['v_12m'] / ld * 100) if ld else None
            conv_lcto.append(cl); conv_12m.append(c12)
            b = bench_pesq_lcto[i]; b12 = bench_pesq_12m[i]
            diff_lcto.append(((cl - b) / b * 100) if (cl is not None and b) else None)
            diff_12m.append(((c12 - b12) / b12 * 100) if (c12 is not None and b12) else None)
            uplift.append(((c12 - cl) / cl * 100) if (cl and c12 is not None) else None)
            rep.append((ld / resp_leads[l] * 100) if resp_leads[l] else None)
        wins = sum(1 for d in diff_lcto if d is not None and d > 0)
        n = sum(1 for d in diff_lcto if d is not None)
        por_grupo[g] = {
            'leads': leads, 'vl': vl, 'v12': v12,
            'conv_lcto': conv_lcto, 'conv_12m': conv_12m,
            'diff_lcto': diff_lcto, 'diff_12m': diff_12m, 'uplift_12m': uplift, 'rep': rep,
            'avgConvLcto': avg(conv_lcto), 'avgConv12m': avg(conv_12m),
            'avgDiff_lcto': avg(diff_lcto), 'avgDiff_12m': avg(diff_12m),
            'avgUplift': avg(uplift), 'avgRep': avg(rep), 'wins': wins, 'n': n,
        }
    return {
        'grupos': list(por_grupo.keys()), 'por_grupo': por_grupo,
        'bench_pesq_lcto': bench_pesq_lcto, 'bench_pesq_12m': bench_pesq_12m,
        'bench_total_lcto': bench_total_lcto, 'bench_total_12m': bench_total_12m,
    }

# ── helpers de métrica ─────────────────────────────────────────────────────

def avg(xs):
    v = [x for x in xs if x is not None]
    return sum(v) / len(v) if v else None

def safe(arr, i):
    return arr[i] if arr and i < len(arr) and arr[i] is not None else None

def classify(wins, n):
    if not n: return ('Crítico', 'crit')
    p = wins / n
    if p == 1:   return ('Consistente', 'cons')
    if p >= 0.7: return ('Positivo', 'pos')
    if p >= 0.4: return ('Variável', 'var')
    if p >= 0.1: return ('Negativo', 'neg')
    return ('Crítico', 'crit')

def diff_class(v):
    if v is None: return 'cn0'
    if v >= 70:   return 'csp'
    if v >= 25:   return 'cp2'
    if v >= 8:    return 'cp'
    if v > -8:    return 'cn0'
    if v > -28:   return 'cn'
    if v > -60:   return 'csn'
    return 'cxn'

def uplift_class(v):
    if v is None or v <= 0: return 'cn0'
    if v >= 80:  return 'cup'
    if v >= 50:  return 'cup2'
    if v >= 25:  return 'cup3'
    return 'cup4'

def trend_cells(pg, canal_data, last2, prev2):
    """(abs, rel, leitura) como objetos {value,cls}. Δ em pp (sem ×100)."""
    last = avg([safe(pg['conv_lcto'], i) for i in last2])
    prev = avg([safe(pg['conv_lcto'], i) for i in prev2])
    absT = relT = None
    if last is not None and prev is not None:
        absT = last - prev
        bl = avg([safe(canal_data['bench_pesq_lcto'], i) for i in last2])
        bp = avg([safe(canal_data['bench_pesq_lcto'], i) for i in prev2])
        if bl is not None and bp is not None:
            relT = absT - (bl - bp)
    def badge(v):
        if v is None: return {'value': '—', 'cls': 'cn0'}
        cls = 'cn0' if abs(v) < 0.05 else ('cp' if v > 0 else 'cn')
        txt = '≈0pp' if abs(v) < 0.05 else (('+' if v > 0.05 else '') + f'{v:.2f}pp')
        return {'value': txt, 'cls': cls}
    if absT is None or relT is None:
        reading = {'value': '—', 'cls': 'cn0'}
    else:
        absUp = absT > 0.05; absNeu = abs(absT) <= 0.05
        relUp = relT > 0.05; relNeu = abs(relT) <= 0.05
        if relUp or relNeu:
            reading = {'value': 'Acelerando', 'cls': 'tr-gg'} if (absUp or absNeu) else {'value': 'Ganhando terreno', 'cls': 'tr-rg'}
        else:
            reading = {'value': 'Perdendo espaço', 'cls': 'tr-gr'} if (absUp or absNeu) else {'value': 'Deteriorando', 'cls': 'tr-rr'}
    return badge(absT), badge(relT), reading

# ── proporção da base por classe de conversão (chart-toggle) ───────────────

def repclass_series(canal_data, lctos):
    """Para cada classe (Consistente→Crítico): % de leads da classe por lançamento.
    Usa a classificação wins/N de cada grupo. Devolve (rows, classes_presentes)."""
    ORDER = [('cons', 'Consistente'), ('pos', 'Positivo'), ('var', 'Variável'),
             ('neg', 'Negativo'), ('crit', 'Crítico')]
    gclass = {g: classify(pg['wins'], pg['n'])[1] for g, pg in canal_data['por_grupo'].items()}
    totals = [sum(safe(pg['leads'], i) or 0 for pg in canal_data['por_grupo'].values()) for i in range(len(lctos))]
    present = [cl for cl, _ in ORDER if any(v == cl for v in gclass.values())]
    rows = []
    for cl in present:
        label = dict(ORDER)[cl]
        for i, l in enumerate(lctos):
            cleads = sum(safe(pg['leads'], i) or 0 for g, pg in canal_data['por_grupo'].items() if gclass[g] == cl)
            rows.append({'classe': label, 'lancamento': l, 'valor': round(cleads / totals[i] * 100, 1) if totals[i] else 0})
    return rows, present

# ── codependência entre fatores (qualificador vs qualificante) ─────────────

def _contingency(rows, colA, colB, dims, canal, canonA=None, canonB=None):
    canonA = canonA or (lambda x: x); canonB = canonB or (lambda x: x)
    resp = [r for r in channel_filter(rows, canal) if is_respondent(r, dims)]
    tab = collections.defaultdict(lambda: collections.defaultdict(float))
    for r in resp:
        a, b = r[colA].strip(), r[colB].strip()
        if a and b:
            tab[canonA(a)][canonB(b)] += num(r[COL_LEADS])
    return tab

def cramers_v(rows, colA, colB, dims, canal, canonA=None, canonB=None) -> float:
    """Associação (0–1) entre dois critérios sobre a distribuição de leads."""
    tab = _contingency(rows, colA, colB, dims, canal, canonA, canonB)
    avals = list(tab.keys())
    bvals = sorted({b for row in tab.values() for b in row})
    if len(avals) < 2 or len(bvals) < 2: return 0.0
    grand = sum(sum(row.values()) for row in tab.values())
    if not grand: return 0.0
    rsum = {a: sum(tab[a].values()) for a in avals}
    csum = {b: sum(tab[a].get(b, 0) for a in avals) for b in bvals}
    chi2 = 0.0
    for a in avals:
        for b in bvals:
            exp = rsum[a] * csum[b] / grand
            if exp > 0:
                chi2 += (tab[a].get(b, 0) - exp) ** 2 / exp
    k = min(len(avals), len(bvals)) - 1
    v = math.sqrt(chi2 / (grand * k)) if k > 0 else 0.0
    # correção de viés (Bergsma) limitada a [0,1]
    return max(0.0, min(1.0, v))

def _weighted_spread(rows, fator, dims, canal, lctos, canon=None, within=None, within_val=None, within_canon=None):
    """Dispersão (desvio-padrão ponderado por leads) da conversão entre os grupos
    do `fator`, opcionalmente restrita a um nível de `within`. Mede a força do
    sinal de conversão do fator."""
    canon = canon or (lambda x: x)
    wcanon = within_canon or (lambda x: x)
    resp = [r for r in channel_filter(rows, canal) if is_respondent(r, dims)]
    if within is not None:
        resp = [r for r in resp if wcanon(r[within].strip()) == within_val]
    agg = collections.defaultdict(lambda: {'leads': 0.0, 'sales': 0.0})
    for r in resp:
        g = canon(r[fator].strip())
        if not g: continue
        agg[g]['leads'] += num(r[COL_LEADS]); agg[g]['sales'] += num(r[WINDOWS['lcto']])
    convs, weights = [], []
    for g, c in agg.items():
        if c['leads']:
            convs.append(c['sales'] / c['leads'] * 100); weights.append(c['leads'])
    tot = sum(weights)
    if tot == 0 or len(convs) < 2: return 0.0, tot
    mean = sum(c * w for c, w in zip(convs, weights)) / tot
    var = sum(w * (c - mean) ** 2 for c, w in zip(convs, weights)) / tot
    return math.sqrt(var), tot

def controlled_survival(rows, fator, controle, dims, canal, lctos, canonF=None, canonC=None) -> float:
    """Quanto do sinal do `fator` sobrevive ao controlar por `controle`.
    1.0 = sinal próprio intacto (qualificador); ~0 = sinal explicado pelo controle
    (qualificante / proxy). = spread_controlado_ponderado / spread_bruto."""
    canonC = canonC or (lambda x: x)
    raw_spread, _ = _weighted_spread(rows, fator, dims, canal, lctos, canon=canonF)
    if raw_spread == 0: return 1.0
    resp = [r for r in channel_filter(rows, canal) if is_respondent(r, dims)]
    levels = collections.Counter(canonC(r[controle].strip()) for r in resp if r[controle].strip())
    num_, den_ = 0.0, 0.0
    for lvl, _cnt in levels.items():
        sp, w = _weighted_spread(rows, fator, dims, canal, lctos, canon=canonF,
                                 within=controle, within_val=lvl, within_canon=canonC)
        num_ += sp * w; den_ += w
    ctrl_spread = (num_ / den_) if den_ else 0.0
    return max(0.0, min(1.0, ctrl_spread / raw_spread))

def relevancia(canal_data):
    """Amplitude do efeito do critério na conversão: desvio médio absoluto do diff
    vs. benchmark entre os grupos, **ponderado pela representatividade** (avgRep).
    Em % vs. benchmark. Mede o quanto o fator de fato move a conversão considerando
    o tamanho de cada grupo — alto significa que conhecer o fator muda muito o
    resultado; baixo significa impacto marginal mesmo que estatisticamente distinto.
    Independência (codependência) sem relevância não prioriza nada."""
    pairs = [(pg.get('avgDiff_lcto'), pg.get('avgRep')) for pg in canal_data['por_grupo'].values()]
    pairs = [(d, w) for d, w in pairs if d is not None and w]
    W = sum(w for _, w in pairs)
    if not W:
        return 0.0
    return sum(abs(d) * w for d, w in pairs) / W

def codependencia(rows, criterios, dims, canal='Geral', lctos=None):
    """criterios: lista de dicts {id, label, col, canon?}. Devolve:
       { 'assoc': {(a,b): V}, 'matrix': [[...]], 'ids':[...], 'labels':{},
         'fatores': {id: {survival_min, explicado_por, papel}} }."""
    ids = [c['id'] for c in criterios]
    canonf = {c['id']: (c.get('canon') or (lambda x: x)) for c in criterios}
    col = {c['id']: c['col'] for c in criterios}
    labels = {c['id']: c['label'] for c in criterios}

    # PREP uma vez por canal: linhas-respondente com leads/sales (float) e o valor
    # canônico de cada critério pré-computado. Evita re-filtrar/re-parsear 62k linhas
    # a cada chamada — equivalente ao caminho lento (cramers_v/controlled_survival),
    # porém ordens de magnitude mais rápido.
    wl = WINDOWS['lcto']
    prep = []
    for r in channel_filter(rows, canal):
        if not is_respondent(r, dims):
            continue
        vals = {}
        for cid in ids:
            raw = r[col[cid]].strip()
            vals[cid] = canonf[cid](raw) if raw else None
        prep.append((num(r[COL_LEADS]), num(r[wl]), vals))

    def cramers(a, b):
        tab = collections.defaultdict(lambda: collections.defaultdict(float))
        for leads, _s, vals in prep:
            va, vb = vals[a], vals[b]
            if va and vb:
                tab[va][vb] += leads
        avals = list(tab.keys()); bvals = sorted({x for row in tab.values() for x in row})
        if len(avals) < 2 or len(bvals) < 2: return 0.0
        grand = sum(sum(row.values()) for row in tab.values())
        if not grand: return 0.0
        rsum = {x: sum(tab[x].values()) for x in avals}
        csum = {y: sum(tab[x].get(y, 0) for x in avals) for y in bvals}
        chi2 = 0.0
        for x in avals:
            for y in bvals:
                exp = rsum[x] * csum[y] / grand
                if exp > 0: chi2 += (tab[x].get(y, 0) - exp) ** 2 / exp
        k = min(len(avals), len(bvals)) - 1
        return max(0.0, min(1.0, math.sqrt(chi2 / (grand * k)) if k > 0 else 0.0))

    def _spread_from(groups):
        convs, w = [], []
        for _g, (l, s) in groups.items():
            if l: convs.append(s / l * 100); w.append(l)
        tot = sum(w)
        if tot == 0 or len(convs) < 2: return 0.0, tot
        mean = sum(c * ww for c, ww in zip(convs, w)) / tot
        var = sum(ww * (c - mean) ** 2 for c, ww in zip(convs, w)) / tot
        return math.sqrt(var), tot

    def raw_spread(fator):
        agg = {}
        for leads, sales, vals in prep:
            g = vals[fator]
            if not g: continue
            d = agg.get(g)
            if d is None: agg[g] = d = [0.0, 0.0]
            d[0] += leads; d[1] += sales
        return _spread_from(agg)[0]

    def survival(fator, controle):
        raw = raw_spread(fator)
        if raw == 0: return 1.0
        byL = {}                       # nível do controle -> {grupo: [leads, sales]}
        for leads, sales, vals in prep:
            g = vals[fator]; lv = vals[controle]
            if not g or not lv: continue
            d = byL.get(lv)
            if d is None: byL[lv] = d = {}
            a = d.get(g)
            if a is None: d[g] = a = [0.0, 0.0]
            a[0] += leads; a[1] += sales
        numr = denr = 0.0
        for groups in byL.values():
            sp, tot = _spread_from(groups)
            numr += sp * tot; denr += tot
        ctrl = (numr / denr) if denr else 0.0
        return max(0.0, min(1.0, ctrl / raw))

    assoc = {}
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            v = cramers(a, b); assoc[(a, b)] = v; assoc[(b, a)] = v
    matrix = [[1.0 if a == b else round(assoc.get((a, b), 0.0), 3) for b in ids] for a in ids]
    fatores = {}
    for a in ids:
        worst = (1.0, None)
        for b in ids:
            if a == b: continue
            s = survival(a, b)
            if s < worst[0]: worst = (s, b)
        surv, by = worst
        fatores[a] = {'survival_min': round(surv, 3), 'explicado_por': by,
                      'papel': 'qualificador' if surv >= 0.5 else 'qualificante',
                      'assoc_max': round(max((assoc.get((a, b), 0) for b in ids if b != a), default=0), 3)}
    return {'ids': ids, 'labels': labels, 'assoc': assoc, 'matrix': matrix, 'fatores': fatores}

# ── formatação ───────────────────────────────────────────────────────────
# fmtP / fmtPabs / fmt_pp agora vivem em common.fmt (re-exportados no topo).
