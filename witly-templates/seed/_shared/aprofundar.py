#!/usr/bin/env python3
"""aprofundar — coloca um aprofundamento DENTRO do relatório, no design system do app.

uso:
  python aprofundar.py --out saida/ --secao det.json [--tabela q.json ...] [--pergunta "..."] [--layout layout.json]

  det.json    seção no contrato do app: {"id":"det-<slug>", "header":{"badge","title","sub"}, "widgets":[...]}
              (id opcional: derivado da pergunta). Números só via `bind` a uma tabela do dataset.
  q.json      tabela para o dataset: {"name":"q-<id>", "dims":[...], "filters":[], "rows":[{...}]}
              (o shape que o seu script de corte grava; `name` é o nome da tabela).
  --layout    itens {id,x,y,w,h} da seção; sem ele, um empacotamento padrão por tipo.

faz: valida (tipos de widget, binds para tabelas/colunas existentes, prosa sem número solto
que não esteja nas tabelas), grava det-<id>.json, funde as tabelas no dataset.json, registra a
seção na página "Aprofundamentos" do data.json, grava o layout e REGERA o relatorio.html.
Falha listando os erros; nada é gravado se houver erro. Só stdlib.
"""
import argparse
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common.layout import Grid  # noqa: E402
import gerar  # noqa: E402

# Espelho de src/shared/types.ts WIDGET_TYPES (manter em sincronia ao atualizar o app).
WIDGET_TYPES = {
    'kpi', 'chart', 'table', 'heatmap', 'rank-card',
    'find-block', 'find-note', 'highlight', 'ni', 'ni-vertical',
    'label-sec', 'request', 'xs', 'def-step', 'mdef-block', 'grp-list',
    'eyebrow', 'kpi-strip', 'kpi-card', 'metric-toggle', 'heatmap-toggle', 'chart-toggle', 'chart-table',
    'embed', 'link-card', 'scatter-picker', 'evolution-picker', 'qa-card', 'funnel', 'strat-grid',
    'bar-list', 'cri-list', 'meta-bars', 'escopo-cards', 'channel-table', 'bullet-groups', 'quadrant-scatter',
}
BOUND = {'kpi', 'chart', 'table', 'heatmap', 'rank-card', 'chart-table', 'kpi-card'}
DEFAULT_W = {'label-sec': 12, 'find-note': 12, 'xs': 12, 'chart-table': 12, 'eyebrow': 12, 'highlight': 12,
             'chart': 6, 'table': 12, 'request': 6, 'heatmap': 8, 'find-block': 4, 'ni': 4, 'ni-vertical': 4,
             'kpi': 3, 'kpi-card': 3}
DEFAULT_H = {'chart': 4, 'chart-table': 7, 'table': 4, 'heatmap': 5, 'kpi': 2, 'kpi-card': 2, 'find-block': 3,
             'ni': 3, 'ni-vertical': 3, 'highlight': 1, 'find-note': 1, 'eyebrow': 1, 'label-sec': 1}
PROSE_KEYS = ('text', 'detail', 'title', 'sub', 'label', 'value', 'delta', 'meta', 'why', 'action', 'caption')


def _slug(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode()
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower()
    return s[:40] or 'aprofundamento'


def _norm_num(s):
    """"R$ 1.536,50" → 1536.50 · "53.6%" → 53.6 · "1.536" → 1536 · "5,36" → 5.36.
    Ponto é milhar quando há vírgula ou quando fecha um grupo de 3 dígitos; senão é decimal
    (os formatadores do kit escrevem percentuais com ponto: pctf → "53.6%")."""
    s = re.sub(r'[^\d.,]', '', s)
    if ',' in s and '.' in s:
        return s.replace('.', '').replace(',', '.')
    if ',' in s:
        return s.replace(',', '.')
    if '.' in s:
        head, tail = s.rsplit('.', 1)
        if head and len(tail) == 3:
            return s.replace('.', '')
    return s


def _numbers_in(text):
    """Números 'de dado' na prosa: com vírgula/ponto decimal, %, R$ ou ≥ 3 dígitos."""
    out = set()
    for m in re.finditer(r'R\$\s?[\d.]+,?\d*|\d+[.,]\d+\s?%?|\d{3,}', text or ''):
        out.add(_norm_num(m.group(0)))
    return {x for x in out if x and x not in ('2024', '2025', '2026', '2027')}


def _table_numbers(tables):
    out = set()
    for t in tables.values():
        for r in t.get('rows', []):
            for v in r.values():
                if isinstance(v, (int, float)):
                    s = f'{v:.4f}'.rstrip('0').rstrip('.')
                    out.add(s); out.add(f'{v:.1f}'); out.add(f'{v:.0f}'); out.add(f'{round(v, 2)}')
    return out


def validate(section, dataset, new_tables):
    errs = []
    if not isinstance(section, dict) or not isinstance(section.get('widgets'), list) or not section['widgets']:
        return ['seção precisa de `widgets` (lista não vazia)']
    h = section.get('header') or {}
    if not h.get('title'):
        errs.append('header.title obrigatório (a pergunta do aprofundamento)')
    all_tables = dict(dataset); all_tables.update(new_tables)
    ids = set()
    for i, w in enumerate(section['widgets']):
        t = w.get('type'); wid = w.get('id')
        if t not in WIDGET_TYPES:
            errs.append(f'widget[{i}]: type "{t}" não existe no design system'); continue
        if not wid or wid in ids:
            errs.append(f'widget[{i}] ({t}): `id` ausente ou repetido')
        ids.add(wid)
        binds = []
        if w.get('bind'):
            binds.append(w['bind'])
        for tab in w.get('tabs') or []:
            if isinstance(tab, dict):
                if tab.get('bind'): binds.append(tab['bind'])
                if isinstance(tab.get('chart'), dict) and tab['chart'].get('bind'): binds.append(tab['chart']['bind'])
        if t in BOUND and not binds and not (w.get('rows') or w.get('series') or w.get('value') is not None):
            errs.append(f'widget {wid} ({t}): sem `bind` nem dado inline — número tem de vir de uma tabela do dataset')
        for b in binds:
            name = b.get('dataset')
            if name not in all_tables:
                errs.append(f'widget {wid}: bind.dataset "{name}" não existe (tabelas: {", ".join(sorted(all_tables)) or "nenhuma"})'); continue
            rows = all_tables[name].get('rows') or []
            cols = set(rows[0].keys()) if rows else set(all_tables[name].get('dims') or [])
            for k in ('x', 'series'):
                if b.get(k) and b[k] not in cols:
                    errs.append(f'widget {wid}: bind.{k}="{b[k]}" não é coluna de {name} ({", ".join(sorted(cols))})')
            ys = b.get('y'); ys = ys if isinstance(ys, list) else ([ys] if ys else [])
            for y in ys + list(b.get('metrics') or []):
                if y not in cols:
                    errs.append(f'widget {wid}: bind coluna "{y}" não existe em {name}')
        # prosa: número solto que não está em nenhuma tabela
        prose = ' '.join(str(w.get(k) or '') for k in PROSE_KEYS)
        if isinstance(w.get('stat'), dict):
            prose += ' ' + ' '.join(str(v) for v in w['stat'].values())
        loose = _numbers_in(prose)
        if loose:
            known = _table_numbers(all_tables)
            bad = [x for x in loose if x not in known and x.rstrip('0').rstrip('.') not in known]
            if bad:
                errs.append(f'widget {wid} ({t}): número na prosa que não está em nenhuma tabela do dataset: {", ".join(sorted(bad))} — calcule em Python, grave como tabela e cite-a')
    return errs


def default_layout(section):
    g = Grid()
    for w in section['widgets']:
        t = w['type']
        g.add(w['id'], t, DEFAULT_W.get(t, 6), DEFAULT_H.get(t, 3))
    return g.items


def aprofundar(out_dir, section, tables, pergunta=None, layout=None):
    def rj(name):
        with open(os.path.join(out_dir, name), encoding='utf-8') as f:
            return json.load(f)
    dataset = rj('dataset.json'); data = rj('data.json'); lay = rj('layout.json')
    new_tables = {}
    for t in tables:
        name = t.get('name')
        if not name or not isinstance(t.get('rows'), list):
            raise SystemExit('tabela precisa de `name` e `rows`')
        new_tables[name] = {'dims': t.get('dims') or [], 'filters': t.get('filters') or [], 'rows': t['rows']}
    title = (section.get('header') or {}).get('title') or pergunta or ''
    if pergunta and not (section.get('header') or {}).get('title'):
        section.setdefault('header', {})['title'] = pergunta
    section.setdefault('header', {}).setdefault('badge', 'Aprofundamento')
    sid = section.get('id') or f'det-{_slug(title)}'
    if not sid.startswith('det-'):
        sid = 'det-' + sid
    section['id'] = sid
    errs = validate(section, dataset, new_tables)
    if errs:
        return {'ok': False, 'erros': errs}

    dataset.update(new_tables)
    pages = data.setdefault('pages', [])
    det = next((p for p in pages if p.get('id') == 'detalhamentos'), None)
    if not det:
        det = {'id': 'detalhamentos', 'label': 'Aprofundamentos', 'sections': []}
        # antes de "perguntas" se existir; senão no fim
        idx = next((i for i, p in enumerate(pages) if p.get('id') == 'perguntas'), len(pages))
        pages.insert(idx, det)
    det['sections'] = [s for s in det['sections'] if s.get('id') != sid]
    label = title if len(title) <= 40 else title[:39] + '…'
    det['sections'].append({'id': sid, 'label': label, 'title': title})
    lay.setdefault('sections', {})[sid] = layout or default_layout(section)

    def wj(name, obj):
        with open(os.path.join(out_dir, name), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
    wj('dataset.json', dataset); wj('data.json', data); wj('layout.json', lay); wj(f'{sid}.json', section)
    html = gerar.render_html(out_dir, (data.get('meta') or {}).get('title') or 'Relatório')
    return {'ok': True, 'secao': sid, 'tabelas': sorted(new_tables), 'html': html}


def main(argv=None):
    ap = argparse.ArgumentParser(description='adiciona um aprofundamento ao relatório (design system do app) e regera o HTML')
    ap.add_argument('--out', required=True)
    ap.add_argument('--secao', required=True)
    ap.add_argument('--tabela', action='append', default=[])
    ap.add_argument('--pergunta')
    ap.add_argument('--layout')
    a = ap.parse_args(argv)
    with open(a.secao, encoding='utf-8') as f:
        section = json.load(f)
    tables = []
    for p in a.tabela:
        with open(p, encoding='utf-8') as f:
            t = json.load(f)
        # aceita também o envelope {status, table:{dims,rows}, summary} com o nome no arquivo
        if 'table' in t and 'rows' not in t:
            t = {'name': t.get('name') or os.path.splitext(os.path.basename(p))[0], **t['table']}
        if 'name' not in t:
            t['name'] = os.path.splitext(os.path.basename(p))[0]
        tables.append(t)
    layout = None
    if a.layout:
        with open(a.layout, encoding='utf-8') as f:
            layout = json.load(f)
    r = aprofundar(a.out, section, tables, a.pergunta, layout)
    sys.stdout.buffer.write((json.dumps(r, ensure_ascii=False) + '\n').encode('utf-8'))
    return 0 if r['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
