"""report — builders de card/seção compartilhados pelos geradores.

Fonte canônica do **card de KPI rico** (tier `feature` com rodapé Meta×Histórico
toggleável via `goalCmp`) + o motor de comparação (`dev`/`goalcmp`/`apply_goal`).
Extraído do debriefing-lancamento sem alteração de comportamento (output byte-idêntico);
adotado pelos demais tipos para padronizar os KPIs.

Convenção: os builders recebem `(arr, pg, …)` — `arr` é a lista de widgets da seção e
`pg` é o `common.layout.Grid`. Não capturam estado: são funções puras de módulo.
"""


def dev(real, meta, invert=False):
    """Δ% bruto vs meta (sinal = direção real: + acima, − abaixo). invert = custo
    (menor é melhor). Avaliação em 3 níveis: verde (na meta ou melhor) · âmbar (desvio
    pequeno, ≤10%) · vermelho (desvio grande) — evita 'tudo vermelho' em desvios baixos."""
    if not meta:
        return None, 'neutral'
    d = (real - meta) / meta * 100
    if abs(d) < 1:
        return d, 'neutral'
    good = (d <= 0) if invert else (d >= 0)  # custo: abaixo da meta é bom
    if good:
        return d, 'pos'
    return d, 'warn' if abs(d) <= 10 else 'neg'


def gstatus(tone):
    return 'ok' if tone == 'pos' else ('bad' if tone == 'neg' else 'warn')


def hmcls(d, tone):
    """Classe de tint de uma célula de heatmap a partir do `dev()`. Tint calmo: perto
    da referência (warn, ≤10%) fica neutro p/ a tabela não virar sopa de cor; o tom
    forte só entra em desvio grande (≥15% p/ bom, >25% p/ ruim)."""
    if d is None or tone in ('neutral', 'warn'):
        return 'hmd-neu'
    if tone == 'pos':
        return 'hmd-pos2' if abs(d) >= 15 else 'hmd-pos1'
    return 'hmd-neg2' if abs(d) > 25 else 'hmd-neg1'


def goalcmp(real, meta, invert, hist, meta_fmt, hist_fmt, glabel='Meta'):
    """Rodapé de meta toggleável Meta↔Hist (substitui o pill — a base já mostra o
    desvio). glabel = 'Meta' ou 'Bench'. None quando não há meta formatada."""
    if real is None or not meta or not meta_fmt:
        return None
    d, tone = dev(real, meta, invert)
    if d is None:
        return None
    mg = {'label': f'{glabel} {meta_fmt}', 'delta': f'{d:+.0f}%', 'status': gstatus(tone)}
    dh, th = dev(real, hist, invert) if hist else (None, 'neutral')
    if dh is not None and hist_fmt:
        hg = {'label': f'Hist {hist_fmt}', 'delta': f'{dh:+.0f}%', 'status': gstatus(th)}
    else:
        hg = {'label': 'Hist —', 'delta': '', 'status': 'neutral'}
    return {'meta': mg, 'hist': hg}


def apply_goal(card, real, meta, invert, hist, meta_fmt, hist_fmt, glabel='Meta'):
    gc = goalcmp(real, meta, invert, hist, meta_fmt, hist_fmt, glabel)
    if gc:
        card['goalCmp'] = gc
    elif real is not None and hist and hist_fmt:
        # Sem meta (derivados): rodapé estático comparando vs histórico.
        dh, th = dev(real, hist, invert)
        if dh is not None:
            card['goal'] = {'label': f'Hist {hist_fmt}', 'delta': f'{dh:+.0f}%', 'status': gstatus(th)}


def km(arr, pg, wid, label, value, sub, icon, color, real=None, meta=None, invert=False, hist=None, w=4, h=2, meta_fmt=None, hist_fmt=None, x=None, y=None, glabel='Meta'):
    card = {'id': wid, 'type': 'kpi-card', 'tier': 'feature', 'label': label, 'value': value,
            'sub': sub, 'icon': icon, 'iconColor': color}
    apply_goal(card, real, meta, invert, hist, meta_fmt, hist_fmt, glabel)
    arr.append(card)
    if x is not None: pg.at(wid, 'kpi-card', x, y, w, h)
    else: pg.add(wid, 'kpi-card', w, h)


def ks(arr, pg, wid, label, value, sub, icon, color, w=3, h=2, real=None, meta=None, invert=False, hist=None, meta_fmt=None, hist_fmt=None):
    # mesmo padrão dos KPIs macro: card feature com rodapé "Meta X · ±% ✓" toggleável (sem ícone).
    card = {'id': wid, 'type': 'kpi-card', 'tier': 'feature', 'label': label, 'value': value, 'sub': sub}
    apply_goal(card, real, meta, invert, hist, meta_fmt, hist_fmt)
    arr.append(card); pg.add(wid, 'kpi-card', w, h)


def eb(arr, pg, wid, title, caption='', n=None, color=None, info=None, w=12, compact=False):
    """`w`/`compact` servem ao rótulo de SUBGRUPO: um eyebrow estreito sobre um par de
    cards diz a que recorte eles pertencem sem aninhar card dentro de card. Defaults
    preservam o eyebrow de seção (largura cheia, margem normal)."""
    b = {'id': wid, 'type': 'eyebrow', 'title': title, 'caption': caption}
    if n:
        b['n'] = n
    if color:
        b['color'] = color
    if info:
        b['info'] = info
    if compact:
        b['compact'] = True
    arr.append(b); pg.add(wid, 'eyebrow', w, 1)


def fb(arr, pg, wid, tag, tagColor, title, detail, w=4, h=3, stat=None, x=None, y=None):
    b = {'id': wid, 'type': 'find-block', 'card': True, 'tag': tag, 'tagColor': tagColor,
         'title': title}
    if stat:                    # linha de métrica estruturada (valor + chip de desvio)
        b['stat'] = stat
    b['detail'] = detail
    arr.append(b)
    if x is not None: pg.at(wid, 'find-block', x, y, w, h)
    else: pg.add(wid, 'find-block', w, h)


def table(arr, pg, wid, title, cols, rows_, w=12, h=4):
    arr.append({'id': wid, 'type': 'table', 'title': title, 'cols': cols, 'rows': rows_})
    pg.add(wid, 'table', w, h)
