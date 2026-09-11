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
FMT_OK = ('money', 'brl', 'pct', 'x', 'int', 'num')
CURVA = {'reta': 'straight', 'suave': 'smooth'}


def _num(v, onde):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError(f'{onde}: o valor tem de ser NÚMERO (o builder formata); recebi {type(v).__name__} {v!r}')
    return v


def _fmt(v, fmt):
    if v is None:
        return '—'
    if fmt == 'num':
        return f'{v:,.1f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    if fmt == 'brl':   # exato: "R$ 2.350,00" — money() abrevia a partir de R$ 1.000 e apaga diferença entre cards vizinhos
        return 'R$ ' + f'{v:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    return fmtval(fmt, v)


def _bind(spec, exige):
    """bind vivo de card/destaque: {'dataset', 'metric' | 'ratio': (num, den), 'mult'?, 'exclude'?: {col: val}, 'where'?}.
    Custo/taxa é razão de somas, nunca soma de linhas; `exclude` tira a linha "Geral"."""
    if not isinstance(spec, dict) or not spec.get('dataset'):
        raise ValueError('bind precisa de dataset')
    cols = []
    if spec.get('ratio'):
        num, den = spec['ratio']; cols += [num, den]
    elif spec.get('metric'):
        cols.append(spec['metric'])
    else:
        raise ValueError('bind precisa de metric (soma) ou ratio (num, den)')
    exige(spec['dataset'], cols)
    b = {'dataset': spec['dataset']}
    if spec.get('exclude'): b['exclude'] = dict(spec['exclude'])
    if spec.get('where'): b['where'] = dict(spec['where'])
    out = {'bind': b}
    if spec.get('ratio'): out['ratio'] = [num, den]
    else: out['metric'] = spec['metric']
    if spec.get('mult'): out['mult'] = spec['mult']
    return out


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

    def destaque(self, text, label='Resposta', color='p', bind=None, vars=None, autoria=None):
        """Callout da resposta. Com `bind` + `vars`, o texto usa {chave} e cada chave é uma soma ou
        razão calculada nas linhas filtradas (o destaque acompanha o filtro):
        vars={'cpl': {'ratio': ('invest', 'leads'), 'fmt': 'money'}}. `autoria='consultor'` = prosa
        do consultor: os números citados são declarados, não checados contra tabela."""
        wid = self._wid('hl')
        w = {'id': wid, 'type': 'highlight', 'text': text, 'label': label, 'color': color}
        if bind and vars:
            if not isinstance(bind, dict) or not bind.get('dataset'):
                raise ValueError('destaque: bind precisa de dataset')
            b = {'dataset': bind['dataset']}
            if bind.get('exclude'): b['exclude'] = dict(bind['exclude'])
            if bind.get('where'): b['where'] = dict(bind['where'])
            vs = {}
            for k, spec in vars.items():
                cols = list(spec['ratio']) if spec.get('ratio') else [spec['metric']]
                self.rel._exige_tabela(bind['dataset'], cols)
                v = {'fmt': spec.get('fmt', 'num')}
                if spec.get('ratio'): v['ratio'] = list(spec['ratio'])
                else: v['metric'] = spec['metric']
                if spec.get('mult'): v['mult'] = spec['mult']
                vs[k] = v
            w['bind'] = b; w['vars'] = vs
        if autoria:
            w['_autoria'] = autoria
        self.widgets.append(w)
        self.grid.add(wid, 'highlight', 12, 1)
        return self

    def nota(self, text, autoria=None):
        wid = self._wid('nt')
        w = {'id': wid, 'type': 'find-note', 'text': text}
        if autoria:
            w['_autoria'] = autoria
        self.widgets.append(w)
        self.grid.add(wid, 'find-note', 12, 1)
        return self

    def seletor(self, filtro, label=None):
        """O filtro do FAB, inline na seção (toggle). `filtro` = id declarado em R.filtro(); a
        opção "todos" volta ao início."""
        if not any(f['id'] == filtro for f in self.rel.filtros):
            raise ValueError(f'seletor: filtro "{filtro}" não declarado (use R.filtro(id, label, ...))')
        wid = self._wid('sel')
        w = {'id': wid, 'type': 'filter-seg', 'filter': filtro}
        if label: w['label'] = label
        self.widgets.append(w)
        self.grid.add(wid, 'filter-seg', 12, 1)
        return self

    def quebra(self):
        self.grid.newrow()
        return self

    # ── números ─────────────────────────────────────────────────────────
    def kpi(self, label, value, fmt='int', sub='', icon=None, color=None, meta=None, hist=None,
            invert=False, w=3, h=2, emph=False, info=None, glabel='Meta', formato=None, bind=None):
        """Card `feature` como nos templates. `meta`/`hist` (números) viram o rodapé Meta × Hist
        com Δ% e semáforo; `invert=True` quando menor é melhor (custo). `formato='exato'` não
        abrevia dinheiro (R$ 2.350,00). `bind={'dataset','ratio'|'metric',...}` faz o card
        RECALCULAR no filtro (o valor passado é o do relatório inteiro)."""
        value = _num(value, f'kpi "{label}"')
        if formato == 'exato' and fmt == 'money':
            fmt = 'brl'
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
        if bind:
            card.update(_bind(bind, self.rel._exige_tabela))
            card['fmt'] = fmt
            if meta:
                card['metaValue'] = meta
            if invert:
                card['invert'] = True
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
    def grafico(self, chart_type, title, dataset, x, y, series=None, fmt=None, w=6, h=4, largo=False,
                curva=None, eixo_x=None, eixo_y=None, rotulos=None, comparar=False, **kw):
        """Gráfico por bind. `curva='reta'|'suave'` (sem isto: reta a partir de 50 pontos);
        `eixo_x`/`eixo_y` = nome dos eixos; `rotulos` = valor dentro da barra (padrão em barras);
        `comparar=True` com y=[a, b] = barra + linha em eixos separados (duas métricas)."""
        self.rel._exige_tabela(dataset, [x] + (y if isinstance(y, list) else [y]) + ([series] if series else []))
        wid = self._wid('c')
        bind = {'dataset': dataset, 'x': x, 'y': y}
        if series:
            bind['series'] = series
        if comparar and isinstance(y, list) and len(y) == 2:
            chart_type = 'mixed'
            kw.setdefault('seriesTypes', ['bar', 'line'])
            kw.setdefault('secondaryAxis', 1)
        c = {'id': wid, 'type': 'chart', 'chartType': chart_type, 'title': title, 'bind': bind}
        if fmt:
            c['valueFormat'] = fmt
        if curva:
            if curva not in CURVA:
                raise ValueError("curva deve ser 'reta' ou 'suave'")
            c['curve'] = CURVA[curva]
        opts = dict(kw.pop('options', {}) or {})
        if eixo_x:
            opts.setdefault('xaxis', {})['title'] = {'text': eixo_x}
        if eixo_y:
            opts.setdefault('yaxis', {})['title'] = {'text': eixo_y}
        if rotulos is None:
            rotulos = chart_type in ('bar', 'bar-horizontal', 'stacked')
        if rotulos:
            c['showLabels'] = True   # o charts.ts formata pelo valueFormat (R$ 8,88 / 54.1%) e pinta branco dentro da barra
            opts.setdefault('plotOptions', {}).setdefault('bar', {})['dataLabels'] = {'position': 'center'}
        if opts:
            c['options'] = opts
        c.update(kw)
        if largo:
            w, h = 12, max(h, 6)
        c['height'] = h * 80 - 60
        self.widgets.append(c)
        self.grid.add(wid, 'chart', w, h)
        return self

    def tabela(self, title, dataset, cols, sub=None, h=None, defs=None, colunas=None, escala=None, ordem=None):
        """Tabela por bind. `colunas={'conv': 'Conversão'}` rotula o cabeçalho; `escala={'conv':
        (6.5, False)}` pinta o fundo em 5 degraus contra o alvo (True = menor é melhor);
        `ordem='desc'` põe o maior/mais recente (1ª coluna) primeiro. Célula pode ser
        {"value": 7.5, "cls": "hmd-pos1", "title": "…"} nas linhas do dataset."""
        self.rel._exige_tabela(dataset, cols)
        wid = self._wid('t')
        t = {'id': wid, 'type': 'table', 'title': title, 'cols': list(cols), 'bind': {'dataset': dataset, 'metrics': list(cols)}}
        if sub: t['sub'] = sub
        if defs: t['defs'] = defs
        if colunas: t['labels'] = dict(colunas)
        if escala:
            t['escala'] = {c: {'alvo': (v[0] if isinstance(v, (tuple, list)) else v), 'menor': bool(v[1]) if isinstance(v, (tuple, list)) and len(v) > 1 else False} for c, v in escala.items()}
        if ordem:
            t['sort'] = {'col': cols[0], 'dir': 'desc' if str(ordem).lower().startswith('d') else 'asc'}
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

    def funil(self, title, etapas, bench=None, fmt='int', compact=False, base_label='meta', w=None, h=None, sub=None, transicao=None):
        """etapas: [(rótulo, valor)] em sequência; bench: taxa de referência (%) por transição.
        `transicao={0: 'msgs por R$', -1: 'R$ por comprador'}`: nessas transições a tag mostra a
        RAZÃO etapa[i+1] ÷ etapa[i] com esse rótulo (custo → volume, volume → receita), não %."""
        vals = [_num(v, f'funil "{title}" etapa {l}') for l, v in etapas]
        razoes = {}
        for i, lab in (transicao or {}).items():
            j = i if i >= 0 else len(vals) - 1 + i
            razoes[j] = lab
        for (l, v) in etapas:
            self._guarda(f'{title} {l}', v)
        steps = [{'label': l, 'value': v, 'vlabel': _fmt(v, fmt)} for l, v in etapas]
        trans, worst, worst_i = [], None, -1
        for i in range(len(vals) - 1):
            if i in razoes:
                r = (vals[i + 1] / vals[i]) if vals[i] else 0.0
                lab = razoes[i]
                txt = _fmt(r, 'brl') if lab.strip().startswith('R$') else f'{r:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
                trans.append({'note': f'{txt} {lab}', 'noteTone': 'neutral'})
                continue
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
    def achado(self, tag, tom, title, detail, w=4, h=3, stat=None, autoria=None):
        """Achado em card (find-block): tag + título + detalhe. tom: ok | warn | bad | p | n.
        `autoria='consultor'`: texto humano — os números citados ficam declarados, sem exigir tabela."""
        fb(self.widgets, self.grid, self._wid('fb'), tag, TAG_COLOR.get(tom, tom), title, detail, w=w, h=h, stat=stat)
        if autoria:
            self.widgets[-1]['_autoria'] = autoria
        return self

    def acao(self, n, title, porque, acionavel, w=4, h=3, vertical=False, autoria=None):
        wid = self._wid('ni')
        w_ = {'id': wid, 'type': 'ni-vertical' if vertical else 'ni', 'n': n, 'title': title, 'why': porque, 'action': acionavel}
        if autoria:
            w_['_autoria'] = autoria
        self.widgets.append(w_)
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
    def __init__(self, client, client_name, title, campaign_label='', kind='analise-livre', pergunta=None, decisao=None, chrome=None):
        """`chrome={'marca': False, 'atalho': False, 'sidebar': 'fechada', 'busca': False, 'cliente': False}`
        esconde partes da sidebar no HTML entregue (o consultor pediu cinco vezes)."""
        self.meta = {'client': client, 'client_name': client_name, 'title': title, 'campaign_label': campaign_label,
                     'pergunta': pergunta, 'decisao': decisao}
        self.kind = kind
        self.chrome = dict(chrome) if chrome else None
        self.dataset, self.paginas, self._secoes, self._numeros = {}, [], {}, []
        self.filtros, self._css, self._js = [], [], []

    # filtros do relatório (o FAB e o seletor inline usam os mesmos)
    def filtro(self, id, label, opcoes=None, todos=None):
        """Declara um filtro: `id` é a coluna (as tabelas que respondem declaram `filters=[id]`);
        `opcoes` = valores (sem elas, vêm da primeira tabela que declara o filtro); `todos` =
        a opção que significa "sem recorte". O gravar() confere opção × valores reais de
        CADA tabela e falha na divergência (rótulo diferente entre tabelas esvaziava gráfico em silêncio)."""
        if any(f['id'] == id for f in self.filtros):
            raise ValueError(f'filtro repetido: {id}')
        self.filtros.append({'id': id, 'label': label, 'options': list(opcoes) if opcoes else None, 'allValue': todos})
        return self

    def css_extra(self, css):
        """CSS injetado no <head> do relatorio.html (sobrevive ao aprofundar.py: fica em data.json)."""
        self._css.append(str(css)); return self

    def js_extra(self, js):
        """JS injetado antes de </body> (idem)."""
        self._js.append(str(js)); return self

    def _valida_filtros(self):
        """Opções × valores reais nas tabelas que declaram o filtro; divergência = build falha."""
        erros, defs = [], []
        for f in self.filtros:
            tabelas = [(n, t) for n, t in self.dataset.items() if f['id'] in (t.get('filters') or [])]
            if not tabelas:
                erros.append(f'filtro "{f["id"]}": nenhuma tabela declara filters=["{f["id"]}"]'); continue
            valores = {}
            for n, t in tabelas:
                vs = {str(r.get(f['id'], '')) for r in t['rows']}
                if f['allValue']:
                    vs.discard(str(f['allValue']))
                valores[n] = vs
            base = set(f['options']) if f['options'] else valores[tabelas[0][0]]
            if f['allValue']:
                base.discard(str(f['allValue']))
            for n, vs in valores.items():
                if vs != base:
                    faltam = sorted(base - vs); sobram = sorted(vs - base)
                    erros.append(f'filtro "{f["id"]}" × tabela "{n}": valores divergem — faltam {faltam or "nada"}; sobram {sobram or "nada"} (rótulo diferente esvazia o gráfico em silêncio)')
            defs.append({'id': f['id'], 'label': f['label'], 'options': sorted(base, key=str), **({'allValue': f['allValue'], 'default': f['allValue']} if f['allValue'] else {})})
        return erros, defs

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
        erros_f, filtros = self._valida_filtros()
        if erros_f:
            raise ValueError('filtros inválidos:\n- ' + '\n- '.join(erros_f))
        meta = {**{k: v for k, v in self.meta.items() if v is not None}, 'type': 'dashboard', 'theme': 'light',
                'created_at': datetime.date.today().isoformat(),
                'cover': {'eyebrow': f'{self.meta["client_name"]} · Relatório', 'title': self.meta['title']},
                'controls': {'kind': self.kind, 'compare': 'meta' if tem_meta else None, 'pages': [p['id'] for p in pages], 'filters': []},
                'filters': filtros,
                'nav': 'sidebar' if len(pages) > 1 else 'topnav'}
        if self.chrome:
            meta['chrome'] = self.chrome
        if self._css or self._js:
            meta['extra'] = {'css': '\n'.join(self._css), 'js': '\n'.join(self._js)}
        data = {'meta': meta, 'pages': pages}
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
            PROSA = ('text', 'detail', 'title', 'sub', 'label', 'why', 'action', 'caption')
            def ger(w):
                g = list(self._GERADOS.get(w.get('type'), ()))
                if w.get('_autoria') == 'consultor':   # texto humano: números declarados, não checados
                    g += [k for k in PROSA if k != 'title' or w.get('type') != 'find-block']
                return g
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
