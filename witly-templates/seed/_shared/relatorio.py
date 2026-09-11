#!/usr/bin/env python3
"""relatorio — monta um relatório no design system dos templates, em Python.

É o mesmo esqueleto que o debriefing e o acompanhamento usam (páginas com sidebar, eyebrows,
grade de KPIs `feature` com meta/histórico, funil, série temporal, achados em card, ações),
exposto como builders para uma análise livre. O número entra sempre como NÚMERO (o builder
formata); a prosa só pode citar número que esteja numa tabela do dataset ou num card.

uso mínimo:
    from relatorio import Relatorio
    R = Relatorio(client='cliente', client_name='Cliente', title='Cliente · Pergunta', campaign_label='set/26')
    R.tabela('q-canal', dims=['canal'], rows=[{'canal': 'facebook', 'leads': 120, 'invest': 900.0, 'cpl': 7.5}, ...])
    p = R.pagina('panorama', 'Panorama')
    s = p.secao('s01', badge='Panorama', title='Qual canal tem o menor CPL?', sub='janela: 7 dias')
    s.eyebrow('INDICADORES', 'o que a pergunta precisa')
    s.kpi('CPL', 6.5, fmt='money', sub='200 leads', icon='coin', meta=8.0, invert=True)
    s.grafico('bar', 'CPL por canal', dataset='q-canal', x='canal', y='cpl', fmt='money')
    s.achado('Resposta', 'ok', 'Instagram tem o menor CPL', 'R$ 5,00 contra R$ 7,50 do Facebook (tabela Por canal).')
    R.gravar('saida/')            # valida → 4 camadas + relatorio.html (viewer offline)

Regras de grade (12 colunas, como nos templates): eyebrow 12×1 · kpi 3×2 (ou 2×2 com seis por
linha; banda 6×2) · gráfico 6×4 (largo 12×6) · série temporal 12×6 · funil 4×5 (compacto) ou
6×8 · comparativo meta 12×(n+1) · tabela 12×h · achado 4×3 (ou 6×4) · destaque/nota 12×1 · ação 4×3.
"""
import datetime
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common.layout import Grid  # noqa: E402
from common.fmt import money, pctf, xf, intf, fmtval  # noqa: E402
from common.report import km, eb, fb, dev, gstatus  # noqa: E402

__all__ = ['Relatorio', 'money', 'pctf', 'xf', 'intf', 'fmtval']

TONE = {'ok': 'pos', 'pos': 'pos', 'warn': 'warn', 'bad': 'neg', 'neg': 'neg', 'neutral': 'neutral', 'n': 'neutral'}
TAG_COLOR = {'ok': 'g', 'g': 'g', 'warn': 'a', 'a': 'a', 'bad': 'r', 'r': 'r', 'p': 'p', 'n': 'n', 'neutral': 'n'}
FMT_OK = ('money', 'pct', 'x', 'int', 'num')


def _num(v, onde):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError(f'{onde}: o valor tem de ser NÚMERO (o builder formata); recebi {type(v).__name__} {v!r}')
    return v


def _fmt(v, fmt):
    if v is None:
        return '—'
    if fmt == 'num':
        return f'{v:,.1f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return fmtval(fmt, v)


class Secao:
    """Uma seção = uma zona da página, com a própria grade de 12 colunas."""

    def __init__(self, rel, sid, badge, title, sub=None):
        self.rel, self.id = rel, sid
        self.header = {'badge': badge, 'title': title}
        if sub:
            self.header['sub'] = sub
        self.widgets, self.grid, self._n = [], Grid(), 0

    # ── util ────────────────────────────────────────────────────────────
    def _wid(self, prefix):
        self._n += 1
        return f'{self.id}-{prefix}{self._n}'

    def _guarda(self, chave, valor):
        """Todo número que vira card/linha fica na tabela _numeros: a prosa pode citá-lo."""
        self.rel._numeros.append({'chave': chave, 'valor': valor})

    # ── estrutura ───────────────────────────────────────────────────────
    def eyebrow(self, title, caption='', n=None, color=None, info=None):
        eb(self.widgets, self.grid, self._wid('eb'), title, caption, n=n, color=color, info=info)
        return self

    def destaque(self, text, label='Resposta', color='p'):
        wid = self._wid('hl')
        self.widgets.append({'id': wid, 'type': 'highlight', 'text': text, 'label': label, 'color': color})
        self.grid.add(wid, 'highlight', 12, 1)
        return self

    def nota(self, text):
        wid = self._wid('nt')
        self.widgets.append({'id': wid, 'type': 'find-note', 'text': text})
        self.grid.add(wid, 'find-note', 12, 1)
        return self

    def quebra(self):
        self.grid.newrow()
        return self

    # ── números ─────────────────────────────────────────────────────────
    def kpi(self, label, value, fmt='int', sub='', icon=None, color=None, meta=None, hist=None,
            invert=False, w=3, h=2, emph=False, info=None, glabel='Meta'):
        """Card `feature` como nos templates. `meta`/`hist` (números) viram o rodapé Meta × Hist
        com Δ% e semáforo; `invert=True` quando menor é melhor (custo)."""
        value = _num(value, f'kpi "{label}"')
        if fmt not in FMT_OK:
            raise ValueError(f'kpi "{label}": fmt deve ser {"|".join(FMT_OK)}')
        self._guarda(label, value)
        wid = self._wid('k')
        km(self.widgets, self.grid, wid, label, _fmt(value, fmt), sub, icon, color,
           real=value, meta=meta, invert=invert, hist=hist, w=w, h=h,
           meta_fmt=_fmt(meta, fmt) if meta else None, hist_fmt=_fmt(hist, fmt) if hist else None, glabel=glabel)
        card = self.widgets[-1]
        if not icon:
            card.pop('icon', None); card.pop('iconColor', None)
        if emph:
            card['emph'] = True
        if info:
            card['info'] = info
        return self

    def banda(self, label, real, meta, fmt='int', sub='realizado vs meta', w=6, h=2, invert=False):
        """Card de atingimento: "X / meta" + pill com %. Para meta de volume/receita."""
        real = _num(real, f'banda "{label}"'); meta = _num(meta, f'banda "{label}" (meta)')
        self._guarda(label, real); self._guarda(f'{label} meta', meta)
        pct = (real / meta * 100) if meta else None
        d, tone = dev(real, meta, invert)
        wid = self._wid('b')
        self.widgets.append({'id': wid, 'type': 'kpi-card', 'tier': 'feature', 'band': True, 'label': label,
                             'value': f'{_fmt(real, fmt)} / {_fmt(meta, fmt)}', 'sub': sub,
                             'delta': f'{pct:.0f}%' if pct is not None else '—', 'deltaTone': tone})
        self.grid.add(wid, 'kpi-card', w, h)
        return self

    def comparativo(self, linhas, title=None, caption=None):
        """Realizado × meta em barras (meta-bars), como o Panorama do debriefing.
        linhas: [{label, real, meta, fmt?, hist?, invert?}] com números."""
        rows = []
        for ln in linhas:
            real = _num(ln['real'], f'comparativo "{ln["label"]}"'); meta = ln.get('meta')
            fmt = ln.get('fmt', 'int'); inv = bool(ln.get('invert'))
            self._guarda(ln['label'], real)
            if meta:
                self._guarda(f'{ln["label"]} meta', meta)
            d, tone = dev(real, meta, inv) if meta else (None, 'neutral')
            pct = (real / meta * 100) if meta else None
            row = {'label': ln['label'], 'real': _fmt(real, fmt), 'meta': _fmt(meta, fmt) if meta else '—',
                   'hist': _fmt(ln['hist'], fmt) if ln.get('hist') else None,
                   'pct': round(min(pct, 100.0), 1) if pct is not None else 0.0,
                   'pctLabel': f'{pct:.0f}%' if pct is not None else '—',
                   'delta': {'value': f'{d:+.0f}%' if d is not None else '—', 'tone': tone}}
            rows.append(row)
        wid = self._wid('mb')
        w = {'id': wid, 'type': 'meta-bars', 'rows': rows}
        if title: w['title'] = title
        if caption: w['caption'] = caption
        self.widgets.append(w)
        self.grid.add(wid, 'meta-bars', 12, len(rows) + 1)
        return self

    # ── gráficos e tabelas (bind: o número vem do dataset) ──────────────
    def grafico(self, chart_type, title, dataset, x, y, series=None, fmt=None, w=6, h=4, largo=False, **kw):
        self.rel._exige_tabela(dataset, [x] + (y if isinstance(y, list) else [y]) + ([series] if series else []))
        wid = self._wid('c')
        bind = {'dataset': dataset, 'x': x, 'y': y}
        if series:
            bind['series'] = series
        c = {'id': wid, 'type': 'chart', 'chartType': chart_type, 'title': title, 'bind': bind}
        if fmt:
            c['valueFormat'] = fmt
        c.update(kw)
        if largo:
            w, h = 12, max(h, 6)
        c['height'] = h * 80 - 60
        self.widgets.append(c)
        self.grid.add(wid, 'chart', w, h)
        return self

    def tabela(self, title, dataset, cols, sub=None, h=None, defs=None):
        self.rel._exige_tabela(dataset, cols)
        wid = self._wid('t')
        t = {'id': wid, 'type': 'table', 'title': title, 'cols': list(cols), 'bind': {'dataset': dataset, 'metrics': list(cols)}}
        if sub: t['sub'] = sub
        if defs: t['defs'] = defs
        self.widgets.append(t)
        n = len(self.rel.dataset[dataset]['rows'])
        self.grid.add(wid, 'table', 12, h or min(8, max(3, n // 2 + 2)))
        return self

    def evolucao(self, title, dataset, x, metricas, current=None, current2=None, combo=True, h=6):
        """Série temporal com seletor de métrica (evolution-picker), como "Métricas no tempo".
        metricas: [(coluna, rótulo, fmt)] — os pontos vêm das linhas do dataset."""
        cols = [m[0] for m in metricas]
        self.rel._exige_tabela(dataset, [x] + cols)
        rows = self.rel.dataset[dataset]['rows']
        wid = self._wid('ev')
        w = {'id': wid, 'type': 'evolution-picker', 'title': title, 'height': h * 80 - 150,
             'metrics': [{'id': c, 'label': l, 'fmt': f} for c, l, f in metricas],
             'points': [{'name': str(r[x]), 'vals': {c: r.get(c) for c in cols}} for r in rows],
             'current': current or cols[0]}
        if current2:
            w['current2'] = current2
            w['combo'] = bool(combo)
        self.widgets.append(w)
        self.grid.add(wid, 'evolution-picker', 12, h)
        return self

    def funil(self, title, etapas, bench=None, fmt='int', compact=False, base_label='meta', w=None, h=None, sub=None):
        """etapas: [(rótulo, valor)] em sequência; bench: taxa de referência (%) por transição."""
        vals = [_num(v, f'funil "{title}" etapa {l}') for l, v in etapas]
        for (l, v) in etapas:
            self._guarda(f'{title} {l}', v)
        steps = [{'label': l, 'value': v, 'vlabel': _fmt(v, fmt)} for l, v in etapas]
        trans, worst, worst_i = [], None, -1
        for i in range(len(vals) - 1):
            m = round(vals[i + 1] / vals[i] * 100, 1) if vals[i] else 0.0
            t = {'migrate': m, 'loss': round(100 - m, 1)}
            b = bench[i] if bench and i < len(bench) and bench[i] else None
            if b:
                t['bench'] = round(b, 1)
                gap = b - m
                if gap > 0:
                    t['gap'] = round(gap, 1)
                    if worst is None or gap / b > worst:
                        worst, worst_i = gap / b, i
            trans.append(t)
        if worst_i >= 0:
            trans[worst_i]['worst'] = True
        wid = self._wid('f')
        fw = {'id': wid, 'type': 'funnel', 'title': title, 'steps': steps, 'transitions': trans, 'baseLabel': base_label}
        if sub: fw['sub'] = sub
        if compact: fw['compact'] = True
        self.widgets.append(fw)
        self.grid.add(wid, 'funnel', w or (4 if compact else 6), h or (5 if compact else 8))
        return self

    def barras(self, title, linhas, fmt='int', caption=None, w=6, h=None):
        """Lista de barras (bar-list): [(rótulo, valor)] — proporção calculada aqui."""
        vals = [_num(v, f'barras "{title}" {l}') for l, v in linhas]
        mx = max(vals) if vals else 0
        for (l, v) in linhas:
            self._guarda(f'{title} {l}', v)
        wid = self._wid('bl')
        bw = {'id': wid, 'type': 'bar-list', 'title': title,
              'rows': [{'label': l, 'value': _fmt(v, fmt), 'bar': round(v / mx * 100, 1) if mx else 0} for l, v in linhas]}
        if caption: bw['caption'] = caption
        self.widgets.append(bw)
        self.grid.add(wid, 'bar-list', w, h or min(8, len(linhas) // 2 + 2))
        return self

    # ── narrativa ───────────────────────────────────────────────────────
    def achado(self, tag, tom, title, detail, w=4, h=3, stat=None):
        """Achado em card (find-block): tag + título + detalhe. tom: ok | warn | bad | p | n."""
        fb(self.widgets, self.grid, self._wid('fb'), tag, TAG_COLOR.get(tom, tom), title, detail, w=w, h=h, stat=stat)
        return self

    def acao(self, n, title, porque, acionavel, w=4, h=3, vertical=False):
        wid = self._wid('ni')
        self.widgets.append({'id': wid, 'type': 'ni-vertical' if vertical else 'ni', 'n': n, 'title': title, 'why': porque, 'action': acionavel})
        self.grid.add(wid, 'ni', w, h)
        return self

    def to_json(self):
        return {'id': self.id, 'header': self.header, 'widgets': self.widgets}


class Pagina:
    def __init__(self, rel, pid, label):
        self.rel, self.id, self.label, self.secoes = rel, pid, label, []

    def secao(self, sid, badge, title, sub=None):
        if sid in self.rel._secoes:
            raise ValueError(f'seção repetida: {sid}')
        s = Secao(self.rel, sid, badge, title, sub)
        self.rel._secoes[sid] = s
        self.secoes.append(s)
        return s


class Relatorio:
    def __init__(self, client, client_name, title, campaign_label='', kind='analise-livre', pergunta=None, decisao=None):
        self.meta = {'client': client, 'client_name': client_name, 'title': title, 'campaign_label': campaign_label,
                     'pergunta': pergunta, 'decisao': decisao}
        self.kind = kind
        self.dataset, self.paginas, self._secoes, self._numeros = {}, [], {}, []

    # dataset
    def tabela(self, name, dims, rows, filters=None):
        if not isinstance(rows, list) or not rows:
            raise ValueError(f'tabela {name}: rows precisa ser lista não vazia')
        for r in rows:
            for k, v in r.items():
                if isinstance(v, str) and k not in dims:
                    continue   # rótulos de dimensão são texto; o resto deveria ser número
        self.dataset[name] = {'dims': list(dims), 'filters': list(filters or []), 'rows': rows}
        return self

    def _exige_tabela(self, name, cols):
        if name not in self.dataset:
            raise ValueError(f'tabela "{name}" não existe no dataset (tem: {", ".join(sorted(self.dataset)) or "nenhuma"})')
        rows = self.dataset[name]['rows']
        have = set(rows[0].keys()) if rows else set(self.dataset[name]['dims'])
        for c in cols:
            if c not in have:
                raise ValueError(f'tabela "{name}": coluna "{c}" não existe (tem: {", ".join(sorted(have))})')

    def pagina(self, pid, label):
        p = Pagina(self, pid, label)
        self.paginas.append(p)
        return p

    # saída
    def montar(self):
        if not self.paginas or not self._secoes:
            raise ValueError('relatório sem páginas/seções')
        ds = dict(self.dataset)
        if self._numeros:
            # a prosa pode citar o que está num card; k/M abreviados também
            rows = []
            for n in self._numeros:
                rows.append({'chave': n['chave'], 'valor': n['valor']})
                if isinstance(n['valor'], (int, float)) and abs(n['valor']) >= 1000:
                    rows.append({'chave': n['chave'] + ' (k)', 'valor': round(n['valor'] / 1000, 1)})
                if isinstance(n['valor'], (int, float)) and abs(n['valor']) >= 1e6:
                    rows.append({'chave': n['chave'] + ' (M)', 'valor': round(n['valor'] / 1e6, 1)})
            ds['_numeros'] = {'dims': ['chave'], 'filters': [], 'rows': rows}
        pages = [{'id': p.id, 'label': p.label, 'sections': [{'id': s.id, 'label': s.header['title']} for s in p.secoes]} for p in self.paginas]
        tem_meta = any(w.get('goalCmp') or w.get('band') for s in self._secoes.values() for w in s.widgets)
        data = {'meta': {**{k: v for k, v in self.meta.items() if v is not None}, 'type': 'dashboard', 'theme': 'light',
                         'created_at': datetime.date.today().isoformat(),
                         'cover': {'eyebrow': f'{self.meta["client_name"]} · Relatório', 'title': self.meta['title']},
                         'controls': {'kind': self.kind, 'compare': 'meta' if tem_meta else None, 'pages': [p['id'] for p in pages], 'filters': []},
                         'nav': 'sidebar' if len(pages) > 1 else 'topnav'},
                'pages': pages}
        layout = {'sections': {sid: s.grid.items for sid, s in self._secoes.items()}}
        return {'dataset': ds, 'data': data, 'layout': layout, 'sections': {sid: s.to_json() for sid, s in self._secoes.items()}}

    # campos que o PRÓPRIO builder formata a partir de números (não são prosa do agente)
    _GERADOS = {'kpi-card': ('value', 'delta', 'goalCmp', 'goal'), 'meta-bars': ('rows',), 'funnel': ('steps', 'transitions'),
                'bar-list': ('rows',), 'evolution-picker': ('points', 'metrics')}

    def validar(self, r=None):
        """Mesmo validador dos aprofundamentos (tipos, binds, número solto na prosa). A prosa
        que o agente escreveu (sub, text, detail, title, why, action) só pode citar número que
        esteja numa tabela ou num card; o que o builder formatou não é checado de novo."""
        import aprofundar
        r = r or self.montar()
        erros = []
        for sid, s in r['sections'].items():
            ger = lambda w: self._GERADOS.get(w.get('type'), ())
            # `value` fica vazio (não some): o validador exige bind OU dado inline no kpi-card
            limpo = {**s, 'widgets': [{k: ('' if k == 'value' else v) for k, v in w.items() if k == 'value' or k not in ger(w)} for w in s['widgets']]}
            for e in aprofundar.validate(limpo, r['dataset'], {}):
                erros.append(f'{sid}: {e}')
        return erros

    def gravar(self, out_dir):
        r = self.montar()
        erros = self.validar(r)
        if erros:
            raise SystemExit('relatório inválido:\n- ' + '\n- '.join(erros))
        os.makedirs(out_dir, exist_ok=True)
        def wj(name, obj):
            with open(os.path.join(out_dir, name), 'w', encoding='utf-8') as f:
                json.dump(obj, f, ensure_ascii=False, indent=2)
        wj('dataset.json', r['dataset']); wj('data.json', r['data']); wj('layout.json', r['layout'])
        for sid, s in r['sections'].items():
            wj(f'{sid}.json', s)
        import gerar
        html = gerar.render_html(out_dir, self.meta['title'])
        return {'ok': True, 'paginas': [p['id'] for p in r['data']['pages']], 'secoes': sorted(r['sections']),
                'tabelas': sorted(self.dataset), 'html': html}
