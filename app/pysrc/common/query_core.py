"""query_core — núcleo GENÉRICO do modo-fundo (consultas sob demanda).

Toda função aqui opera sobre um FRAME uniforme, independente do tipo de análise:

    frame = {
      'axis':       str,                      # dimensão-linha (vira a 1ª coluna): 'criativo'|'lcto'|'grupo'
      'rows':       [{'key': str, 'm': {metric_id: float|None}}],
      'labels':     {metric_id: str},         # rótulo legível (cabeçalho da coluna)
      'cost':       {metric_id: bool},        # True = menor é melhor (ranking)
      'rank_extra': [metric_id],              # colunas extras no ranking (opcional)
    }

Cada TIPO fornece só um `build_frame(ctx, args) -> frame` (CSV → entidades×métricas)
e suas funções específicas. Adicionar uma consulta genérica nova = editar SÓ este
arquivo: todos os tipos passam a tê-la, sem reimplementar por tipo.
"""


def rnd(v, d=2):
    return round(v, d) if isinstance(v, (int, float)) else None


def ok(rows, dims, summary):
    return {'status': 'ok', 'table': {'dims': dims, 'filters': [], 'rows': rows}, 'summary': summary}


def nao_disp(motivo):
    return {'status': 'nao_disponivel', 'motivo': motivo}


def pearson(xs, ys):
    pts = [(a, b) for a, b in zip(xs, ys) if isinstance(a, (int, float)) and isinstance(b, (int, float))]
    n = len(pts)
    if n < 3:
        return None, n
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    cov = sum((p[0] - mx) * (p[1] - my) for p in pts)
    vx = sum((p[0] - mx) ** 2 for p in pts)
    vy = sum((p[1] - my) ** 2 for p in pts)
    if vx <= 0 or vy <= 0:
        return None, n
    return cov / (vx ** 0.5 * vy ** 0.5), n


def _plural(axis):
    return axis if axis.endswith('s') else axis + 's'


def series(frame, a):
    """VÁRIAS métricas por entidade numa tabela só (metrica_x, metrica_y, opcional metrica_z)."""
    L = frame['labels']
    ms = list(dict.fromkeys(m for m in (a.get('metrica_x'), a.get('metrica_y'), a.get('metrica_z')) if m in L))
    if len(ms) < 2:
        return nao_disp('informe ao menos metrica_x e metrica_y (e opcional metrica_z)')
    ax = frame['axis']
    rows = [{ax: e['key'], **{L[m]: rnd(e['m'].get(m)) for m in ms}} for e in frame['rows']]
    if not rows:
        return nao_disp('sem dados')
    return ok(rows, [ax], f'{", ".join(L[m] for m in ms)} por {ax} ({len(rows)} {_plural(ax)}).')


def tabela(frame, a):
    """Tabela COMPLETA do eixo: TODAS as métricas como colunas, uma linha por
    entidade. Use quando quiser uma visão geral por grupo sem escolher métricas —
    qualquer coluna que você cite na table vai existir (evita coluna inexistente)."""
    L = frame['labels']
    ax = frame['axis']
    rows = [{ax: e['key'], **{L[m]: rnd(e['m'].get(m)) for m in L}} for e in frame['rows']]
    if not rows:
        return nao_disp('sem dados')
    return ok(rows, [ax], f'Todas as métricas por {ax} ({len(rows)} {_plural(ax)}).')


def series_long(frame, a):
    """Mesmo eixo, VÁRIAS métricas como SÉRIES (formato longo) — habilita gráfico
    multi-linha / barra agrupada (bind series='serie'). Use só quando as métricas
    compartilham escala comparável (ex.: leads pago × leads orgânico); para escalas
    diferentes (ex.: CPL × leads) prefira `series` em colunas."""
    L = frame['labels']
    ms = list(dict.fromkeys(m for m in (a.get('metrica_x'), a.get('metrica_y'), a.get('metrica_z')) if m in L))
    if len(ms) < 2:
        return nao_disp('informe ao menos metrica_x e metrica_y (e opcional metrica_z)')
    ax = frame['axis']
    rows = []
    for e in frame['rows']:
        for m in ms:
            v = rnd(e['m'].get(m))
            if v is not None:
                rows.append({ax: e['key'], 'serie': L[m], 'valor': v})
    if len(rows) < 2:
        return nao_disp('sem dados suficientes')
    return ok(rows, [ax, 'serie'],
              f'{", ".join(L[m] for m in ms)} por {ax} (séries longas — bind series="serie", y="valor").')


def correlacao(frame, a):
    """Correlação de Pearson entre duas métricas ao longo das entidades."""
    L = frame['labels']
    mx, my = a.get('metrica_x'), a.get('metrica_y')
    if mx not in L or my not in L:
        return nao_disp('metrica_x/metrica_y inválida ou ausente')
    r, n = pearson([e['m'].get(mx) for e in frame['rows']], [e['m'].get(my) for e in frame['rows']])
    if r is None:
        return nao_disp(f'poucas entidades com ambas as métricas (n={n})')
    ax = frame['axis']
    rows = [{ax: e['key'], L[mx]: rnd(e['m'].get(mx)), L[my]: rnd(e['m'].get(my))}
            for e in frame['rows'] if e['m'].get(mx) is not None and e['m'].get(my) is not None]
    return ok(rows, [ax], f'Correlação {L[mx]} × {L[my]} = {r:+.2f} entre {n} {_plural(ax)}.')


def trend(frame, a):
    """Uma métrica ao longo do eixo (drop de vazios) + leitura ESTRUTURAL no summary
    (início→fim, tendência de alta/queda/estável e volatilidade via CV) — para
    'está em variação estrutural ou oscilando?' sem o modelo inventar coluna derivada."""
    L = frame['labels']
    m = a.get('metrica')
    if m not in L:
        return nao_disp(f"métrica '{m}' inválida")
    ax = frame['axis']
    seq = [(e['key'], e['m'].get(m)) for e in frame['rows']]
    seq = [(k, v) for k, v in seq if isinstance(v, (int, float))]
    if len(seq) < 2:
        return nao_disp('série insuficiente')
    vals = [v for _, v in seq]
    first, last = vals[0], vals[-1]
    mean = sum(vals) / len(vals)
    # coluna pronta de desvio vs média da série (o "vs média" que o modelo costuma querer)
    rows = [{ax: k, L[m]: rnd(v), 'vs média %': (rnd((v - mean) / abs(mean) * 100, 1) if mean else None)}
            for k, v in seq]
    cv = ((sum((v - mean) ** 2 for v in vals) / len(vals)) ** 0.5 / abs(mean)) if mean else 0.0
    delta = (last - first) / abs(first) * 100 if first else None
    direc = 'alta' if last > first * 1.05 else ('queda' if last < first * 0.95 else 'estável')
    vol = 'baixa — variação estrutural' if cv < 0.15 else ('moderada' if cv < 0.4 else 'alta — oscila bastante')
    s = (f'{L[m]} por {ax} ({len(rows)} {_plural(ax)}). De {rnd(first)} a {rnd(last)}'
         + (f' ({delta:+.0f}%)' if delta is not None else '')
         + f'; tendência de {direc}, volatilidade {vol} (CV={cv:.2f}).')
    return ok(rows, [ax], s)


def ranking(frame, a):
    """Entidades ordenadas por uma métrica (respeita direção de custo), com colunas principais."""
    L = frame['labels']
    m = a.get('metrica')
    if m not in L:
        return nao_disp(f"métrica '{m}' inválida")
    cost = frame.get('cost', {}).get(m, False)
    ents = sorted((e for e in frame['rows'] if e['m'].get(m) is not None),
                  key=lambda e: e['m'][m], reverse=not cost)
    cols = list(dict.fromkeys([m, *frame.get('rank_extra', [])]))
    ax = frame['axis']
    rows = [{ax: e['key'], **{L[k]: rnd(e['m'].get(k)) for k in cols if k in L}} for e in ents]
    if not rows:
        return nao_disp('sem entidades com essa métrica')
    return ok(rows, [ax], f'{len(rows)} {_plural(ax)} ordenados por {L[m]} ({"menor" if cost else "maior"} melhor).')


def variacao(frame, a):
    """Δ% período-a-período (transições consecutivas) de 1–3 métricas, lado a lado —
    para 'como X variou entre lançamentos' e comparar crescimento de duas métricas
    (ex.: investimento × faturamento) na mesma tabela de transições."""
    L = frame['labels']
    ms = [m for m in (a.get('metrica_x') or a.get('metrica'), a.get('metrica_y'), a.get('metrica_z')) if m]
    if not ms:
        return nao_disp('informe metrica_x (e opcional metrica_y/metrica_z)')
    for m in ms:
        if m not in L:
            return nao_disp(f"métrica '{m}' inválida")
    keys = [e['key'] for e in frame['rows']]
    vmap = {e['key']: e['m'] for e in frame['rows']}
    if len(keys) < 2:
        return nao_disp('série insuficiente para variação (mín. 2 períodos)')
    rows = []
    for i in range(1, len(keys)):
        prev, cur = keys[i - 1], keys[i]
        row = {'transição': f'{prev}→{cur}'}
        for m in ms:
            a0, a1 = vmap[prev].get(m), vmap[cur].get(m)
            row[f'Δ% {L[m]}'] = (rnd((a1 - a0) / abs(a0) * 100, 1)
                                 if isinstance(a0, (int, float)) and isinstance(a1, (int, float)) and a0 else None)
        rows.append(row)
    return ok(rows, ['transição'], f'Variação % período-a-período: {", ".join(L[m] for m in ms)} ({len(rows)} transições).')


GENERIC = {'series': series, 'series_long': series_long, 'tabela': tabela,
           'correlacao': correlacao, 'trend': trend, 'ranking': ranking, 'variacao': variacao}


def run(build_frame, extra, ctx, fn, a):
    """Roteia uma chamada: função genérica → build_frame(ctx,a) + GENERIC[fn];
    função específica → extra[fn](ctx,a). `build_frame` pode devolver um dict de
    status (nao_disponivel) se os args não permitirem montar o frame."""
    a = a or {}
    if fn in GENERIC:
        frame = build_frame(ctx, a)
        if isinstance(frame, dict) and frame.get('status'):
            return frame
        return GENERIC[fn](frame, a)
    h = extra.get(fn)
    if not h:
        return nao_disp(f"função '{fn}' não existe no catálogo")
    return h(ctx, a)
