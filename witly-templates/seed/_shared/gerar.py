#!/usr/bin/env python3
"""gerar — gera o relatório de QUALQUER template do Grimório a partir do CSV do Delfos, sem servidor.

uso:
  python gerar.py --config config.json --csv dump.csv --out saida/
                  [--goals goals.csv] [--dict dict.csv] [--hist hist.csv] [--content content.json]
                  [--opts '{"mode":"captacao"}']
  python gerar.py --out saida/ --rerender          # só regera o relatorio.html das camadas em --out

saída (em --out):
  dataset.json · data.json · layout.json · sXX.json   (as 4 camadas do relatório, iguais às do app)
  numeros.json                                        (o que o motor calculou — números só daqui)
  relatorio.html                                      (standalone: viewer + JSON embutidos, abre offline)

Este arquivo é o MESMO em todos os kits (seed/_shared): lê o manifest.json do kit para saber
o motor (`engine`) e os auxiliares obrigatórios (`required_files`), e chama o contrato do
app: `build_report.build(csv, config, content, out)` ou, com --opts,
`build_report.assemble(rows, config, content, opts)` (snapshot do recorte). Só stdlib.
"""
import argparse
import glob
import importlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

VIEWER_DIRS = [os.path.join(HERE, 'viewer'), os.path.join(KIT, 'viewer')]
DEFAULT_CONTENT = {
    'insights': {
        'header': {'badge': 'Insights', 'title': 'Insights Estratégicos', 'sub': 'Análise descritiva gerada — insights autorais ainda pendentes.'},
        'zones': [],
        'method': 'Os insights e detalhamentos autorais ainda não foram gerados para esta análise.',
    },
    'detalhamentos': {},
}
AUX = {'goals': 'goals_csv', 'dict': 'dict_csv', 'hist': 'hist_csv'}


def manifest():
    try:
        with open(os.path.join(KIT, 'manifest.json'), encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def _engine():
    """Módulos do motor deste kit: build_report (obrigatório) e calc (calc.py ou conv_calc.py)."""
    build_report = importlib.import_module('build_report')
    calc = None
    for name in ('calc', 'conv_calc'):
        try:
            calc = importlib.import_module(name)
            break
        except ImportError:
            continue
    return calc, build_report


def load_rows(calc, csv_path):
    for fn in ('load_rows', 'load_dump'):
        if calc is not None and hasattr(calc, fn):
            return getattr(calc, fn)(csv_path)
    import csv
    with open(csv_path, encoding='utf-8-sig', errors='replace') as f:
        head = f.read(8192); f.seek(0)
        sep = max(',;\t', key=lambda c: head.count(c))
        return list(csv.DictReader(f, delimiter=sep))


def _viewer_dir():
    for d in VIEWER_DIRS:
        if os.path.exists(os.path.join(d, 'shell.html')):
            return d
    return None


def _jsonable(obj):
    if isinstance(obj, dict):
        return {str(k): _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_jsonable(v) for v in (sorted(obj, key=str) if isinstance(obj, set) else obj)]
    if isinstance(obj, float) and obj != obj:
        return None
    if isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    return str(obj)


def recorte(rows, config, opts):
    """Aplica opts['filters'] como o app faz (render_view._filter do motor, se existir).
    Seleção vazia volta ao completo, igual ao render_view."""
    f = (opts or {}).get('filters') or {}
    if not f:
        return rows
    try:
        rv = importlib.import_module('render_view')
    except ImportError:
        return rows
    flt = getattr(rv, '_filter', None)
    if not flt:
        return rows
    import inspect
    n = len(inspect.signature(flt).parameters)
    out = flt(rows, f, config) if n >= 3 else flt(rows, f)
    return out or rows


def _numeros_por_criativo(calc, rows, config, opts):
    """Motor de criativos: build(rows, dic, opts). Reproduz a preparação do assemble
    (temperatura + tipo de campanha) e devolve só agregados: totais, médias, série
    diária e as métricas de cada criativo válido (nome do anúncio não é dado pessoal)."""
    cfg = config or {}
    if cfg.get('temp_rules'):
        rows = calc.apply_temp_rules(rows, cfg['temp_rules'], overwrite=bool(cfg.get('temp_overwrite')))
    rows = calc.apply_tipo_rules(rows, cfg.get('tipo_rules'))
    tipo = (cfg.get('tipo_campanha') or '').strip()
    if tipo:
        rows = [r for r in rows if (r.get('tipo_campanha') or '').strip() == tipo]
    o = {k: v for k, v in (opts or {}).items() if k in ('temp', 'min_invest')}
    B = calc.build(rows, {}, o)
    return {
        'produto': B.get('produto'), 'tipo_campanha': tipo or None, 'recorte': o or None,
        'total': B.get('total'), 'avg': B.get('avg'), 'daily': B.get('daily'),
        'temps': B.get('temps'), 'campanhas': B.get('campanhas'), 'publicos': B.get('publicos'),
        'bench': calc.resolve_bench(cfg) if hasattr(calc, 'resolve_bench') else B.get('bench'),
        'n_criativos': len(B.get('creatives') or []), 'n_validos': len(B.get('valid') or []),
        'criativos': [{'name': c['name'], 'is_video': c['is_video'], 'temps': c['temps'], 'm': c['m'],
                       'by_temp': {t: v for t, v in (c.get('by_temp') or {}).items()}}
                      for c in (B.get('valid') or [])],
    }


def _numeros_por_lancamento(calc, rows, opts):
    """Motor de histórico: build_series(rows, only=labels) → um bloco por lançamento
    (overview + mídia paga), na ordem cronológica."""
    S = calc.build_series(rows, only=(opts or {}).get('launches'))
    return {
        'produto': S.get('produto'), 'recorte': {'launches': (opts or {}).get('launches')} if (opts or {}).get('launches') else None,
        'all_labels': S.get('all_labels'),
        'lancamentos': [{'field_conversion': fc, 'label': S['labels'][fc], 'ov': S['ov'][fc], 'media': S['media'][fc]}
                        for fc in S['events']],
    }


def _numeros_por_criterio(cc, rows, config):
    """Motor de conversão por perfil (conv_calc): por critério × canal, o resumo de cada
    grupo (conversão média, diff vs benchmark, uplift, representatividade, wins/n),
    os benchmarks por lançamento, a relevância do critério e a codependência."""
    dims = cc.dim_columns(rows)
    lctos = cc.ordered_lancamentos(rows)
    canais = config.get('channels') or ['Geral', 'Pago', 'Orgânico']
    crit = config.get('criterios') or []
    window, long_w = config.get('window', 'lcto'), config.get('long_window', '12m')
    canon = {c['id']: cc.make_canon(c.get('order') or [], c.get('aliases') or None) for c in crit}
    keep = ('avgConvLcto', 'avgConv12m', 'avgDiff_lcto', 'avgDiff_12m', 'avgUplift', 'avgRep', 'wins', 'n')
    out = {'lancamentos': lctos, 'canais': canais, 'window': window, 'long_window': long_w, 'criterios': {}, 'codependencia': {}}
    for c in crit:
        blk = {'label': c.get('label'), 'col': c['col'], 'canais': {}}
        for ch in canais:
            cd = cc.agg_criterio(rows, c['col'], dims, lctos, ch, canon=canon[c['id']], window=window, long_window=long_w)
            blk['canais'][ch] = {
                'relevancia': round(cc.relevancia(cd), 2),
                'bench_pesq_lcto': cd['bench_pesq_lcto'], 'bench_pesq_12m': cd['bench_pesq_12m'],
                'bench_total_lcto': cd['bench_total_lcto'],
                'grupos': {g: {**{k: pg.get(k) for k in keep}, 'conv_lcto': pg['conv_lcto'], 'diff_lcto': pg['diff_lcto'], 'leads': pg['leads']}
                           for g, pg in cd['por_grupo'].items()},
            }
        out['criterios'][c['id']] = blk
    spec = [{'id': c['id'], 'label': c.get('label'), 'col': c['col'], 'canon': canon[c['id']]} for c in crit]
    if len(spec) >= 2:
        for ch in canais:
            cod = cc.codependencia(rows, spec, dims, ch, lctos)
            out['codependencia'][ch] = {'ids': cod['ids'], 'matrix': cod['matrix'], 'fatores': cod['fatores']}
    return out


def numeros(calc, rows, config, out_dir, opts=None):
    """Resumo numérico: o `build(rows, config)` do calc (sem linhas cruas / chaves privadas)
    ou, se o motor não expõe um, um sumário das tabelas do dataset."""
    if calc is not None and hasattr(calc, 'agg_criterio') and hasattr(calc, 'codependencia'):
        try:
            return _jsonable(_numeros_por_criterio(calc, rows, config))
        except Exception as e:
            sys.stderr.write(f'aviso: agg_criterio não gerou resumo ({e})\n')
    if calc is not None and not hasattr(calc, 'build') and hasattr(calc, 'build_series'):
        try:
            return _jsonable(_numeros_por_lancamento(calc, rows, opts))
        except Exception as e:
            sys.stderr.write(f'aviso: build_series não gerou resumo ({e})\n')
    if calc is not None and hasattr(calc, 'build'):
        try:
            import inspect
            params = list(inspect.signature(calc.build).parameters)
            if len(params) >= 2 and params[1] == 'dic':
                return _jsonable(_numeros_por_criativo(calc, rows, config, opts))
            r = calc.build(rows, config)
            if isinstance(r, dict):
                return _jsonable({k: v for k, v in r.items() if not str(k).startswith('_') and k not in ('rows_corte', 'rows')})
        except Exception as e:  # motor sem resumo compatível: cai no sumário genérico
            sys.stderr.write(f'aviso: calc.build não gerou resumo ({e}); numeros.json vira sumário do dataset\n')
    with open(os.path.join(out_dir, 'dataset.json'), encoding='utf-8') as f:
        ds = json.load(f)
    return {'tabelas': {k: {'dims': v.get('dims'), 'linhas': len(v.get('rows') or []), 'colunas': sorted((v.get('rows') or [{}])[0].keys())} for k, v in ds.items()}}


MAX_VALORES_FILTRO = 30


def _rows_como_render_view(calc, rows):
    """O render_view do app prepara as linhas antes de filtrar (ex.: merge das colunas
    de tráfego no acompanhamento). Espelha isso quando o motor expõe a função."""
    fn = getattr(calc, 'merge_traf_columns', None)
    return fn(rows) if fn else rows


def _snapshot(r):
    return {'dataset': r['dataset'], 'sections': r['sections'], 'layout': r['layout'],
            'pages': (r.get('data') or {}).get('pages')}


def _gravar_variantes(out_dir, out):
    if not out:
        return None
    with open(os.path.join(out_dir, 'variantes.json'), 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False)
    return {k: len(v['items']) for k, v in out.items()}


MAX_SNAPSHOTS = 300


def _dim_accessors(calc, rv, keys, rows, config):
    """key → função(linha) → valor, exatamente como o render_view._filter compara.
    Acompanhamento expõe DIMS; debriefing usa classify() + helpers do calc."""
    acc = {}
    dims = getattr(rv, 'DIMS', None)
    if isinstance(dims, dict):
        for k in keys:
            if k in dims:
                acc[k] = dims[k]
    faltam = [k for k in keys if k not in acc]
    if faltam and hasattr(calc, 'classify'):
        calc.classify(rows, config)
        deb = {
            'tipo': lambda r: r.get('_tipo'),
            'canal': lambda r: calc.norm_source(r.get('utm_source')),
            'temp': lambda r: (r.get('_temp') or ''),
            'campanha': lambda r: (r.get('field_campaign_name') or ''),
            'publico': lambda r: calc.adset_name(r),
            'criativo': lambda r: calc.ad_name(r),
        }
        for k in faltam:
            if k in deb:
                acc[k] = deb[k]
    return acc


def _variantes_cascata(calc, build_report, rows, config, content, out_dir, opts, filtros, flt, rv):
    """Filtros em cascata e combináveis, offline. As dimensões formam uma hierarquia na
    ordem em que o relatório as declara (ex.: origem → canal → público → campanha → criativo).
    Pré-calcula um snapshot para cada valor isolado e para cada caminho de prefixo que
    existe nos dados; o viewer resolve qualquer seleção pelo CONJUNTO de tuplas que ela
    casa (duas seleções com o mesmo conjunto usam o mesmo snapshot) e desabilita o que
    não tem snapshot. `tuples` são combinações de utm/campanha (agregadas), não linhas."""
    import inspect
    keys = [f['key'] for f in filtros]
    acc = _dim_accessors(calc, rv, keys, rows, config)
    keys = [k for k in keys if k in acc]
    if not keys:
        return None
    labels = {f['key']: (f.get('label') or f['key']) for f in filtros}
    vlabels = {f['key']: {str(v.get('id') if isinstance(v, dict) else v): (v.get('label') if isinstance(v, dict) else str(v))
                          for v in (f.get('values') or [])} for f in filtros}
    n = len(inspect.signature(flt).parameters)
    base = _rows_como_render_view(calc, rows)
    tup_index, tuples = {}, []
    for r in base:
        t = tuple('' if acc[k](r) is None else str(acc[k](r)) for k in keys)
        if t not in tup_index:
            tup_index[t] = len(tuples); tuples.append(t)
    todos = set(range(len(tuples)))
    pos = {k: i for i, k in enumerate(keys)}

    def casa(sel):
        return {i for i, t in enumerate(tuples) if all(t[pos[k]] == v for k, v in sel.items())}

    candidatos = []
    for k in keys:
        vals = sorted({t[pos[k]] for t in tuples})[:MAX_VALORES_FILTRO]
        candidatos += [{k: v} for v in vals]
    for depth in range(2, len(keys) + 1):
        vistos = set()
        for t in tuples:
            pref = t[:depth]
            if pref in vistos:
                continue
            vistos.add(pref); candidatos.append(dict(zip(keys[:depth], pref)))

    snaps, por_conjunto = [], {}
    for sel in candidatos:
        m = casa(sel)
        if not m or m == todos:
            continue
        chave = ','.join(map(str, sorted(m)))
        if chave in por_conjunto:
            por_conjunto[chave]['sels'].append(sel); continue
        if len(snaps) >= MAX_SNAPSHOTS:
            break
        f = {k: [v] for k, v in sel.items()}
        sub = flt(base, f, config) if n >= 3 else flt(base, f)
        if not sub:
            continue
        o = dict(opts or {}); o['filters'] = f
        try:
            r = build_report.assemble(sub, dict(config), content, o)
        except Exception as e:
            sys.stderr.write(f'aviso: recorte {sel} ignorado ({e})\n')
            continue
        snap = {'sels': [sel], 'tuples': sorted(m), **_snapshot(r)}
        por_conjunto[chave] = snap; snaps.append(snap)
    if not snaps:
        return None
    out = {'kind': 'cascade',
           'dims': [{'key': k, 'label': labels.get(k, k)} for k in keys],
           'tuples': [list(t) for t in tuples],
           'labels': {k: vlabels.get(k, {}) for k in keys},
           'snaps': snaps}
    with open(os.path.join(out_dir, 'variantes.json'), 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False)
    return {'snapshots': len(snaps), 'dims': keys, 'combinacoes': len(tuples)}


def _variantes_por_opts(calc, build_report, rows, config, content, out_dir, opts, ctr):
    """Motores cujo controle do app é um recompute por `opts` (não por filtro de linhas):
    criativos (mode / temp / min_invest) e histórico (metric / launches). Um snapshot por
    opção; lançamentos viram "sem <lançamento>" (tira um ponto da série)."""
    dims = []
    if ctr.get('modes'):
        dims.append(('mode', 'Modo', [(m['id'], m.get('label') or m['id'], {'mode': m['id']}) for m in ctr['modes']]))
    if ctr.get('temps'):
        dims.append(('temp', 'Temperatura', [(t, t, {'temp': t}) for t in ctr['temps']]))
    if ctr.get('minInvestPresets'):
        dims.append(('min_invest', 'Investimento mínimo', [(str(v), f'≥ R$ {v}', {'min_invest': v}) for v in ctr['minInvestPresets']]))
    if ctr.get('metrics'):
        dims.append(('metric', 'Indicador', [(m['id'], m.get('label') or m['id'], {'metric': m['id']}) for m in ctr['metrics']]))
    if ctr.get('launches') and len(ctr['launches']) > 2:
        L = ctr['launches']
        dims.append(('launches', 'Lançamentos', [(f'sem:{l}', f'sem {l}', {'launches': [x for x in L if x != l]}) for l in L]))
    if not dims:
        return None
    base_opts = {k: v for k, v in (opts or {}).items() if k != 'filters'}
    if config.get('dict_csv') and hasattr(calc, 'load_dict') and 'dict' not in base_opts and os.path.exists(config['dict_csv']):
        base_opts['dict'] = calc.load_dict(config['dict_csv'])
    out = {}
    for key, label, values in dims:
        items, vals = {}, []
        for vid, vlabel, o in values[:MAX_VALORES_FILTRO]:
            try:
                r = build_report.assemble(rows, dict(config), content, dict(base_opts, **o))
            except Exception as e:
                sys.stderr.write(f'aviso: opção {key}={vid} ignorada ({e})\n')
                continue
            items[vid] = _snapshot(r); vals.append({'id': vid, 'label': vlabel})
        if items:
            out[key] = {'label': label, 'values': vals, 'items': items}
    return _gravar_variantes(out_dir, out)


def variantes(calc, build_report, rows, config, content, out_dir, opts=None):
    """Filtros do relatório offline: o app recalcula no servidor (render_view._filter +
    assemble); aqui pré-calculamos UM snapshot por valor de cada dimensão declarada em
    data.json → meta.controls.filters (exceto intervalos de data). O viewer troca
    dataset/sections/layout ao selecionar. Um filtro por vez (sem combinação)."""
    try:
        rv = importlib.import_module('render_view')
    except ImportError:
        rv = None
    flt = getattr(rv, '_filter', None) if rv else None
    with open(os.path.join(out_dir, 'data.json'), encoding='utf-8') as f:
        data = json.load(f)
    ctr = (data.get('meta') or {}).get('controls') or {}
    filtros = ctr.get('filters') or []
    filtros = [f for f in filtros if f.get('kind') != 'range' and f.get('key') and f.get('values')]
    out = {}
    if not filtros or not flt:
        return _variantes_por_opts(calc, build_report, rows, config, content, out_dir, opts, ctr)
    return _variantes_cascata(calc, build_report, rows, config, content, out_dir, opts, filtros, flt, rv)


def render_html(out_dir, title):
    vd = _viewer_dir()
    if not vd:
        return None
    def rd(name):
        with open(os.path.join(vd, name), encoding='utf-8') as f:
            return f.read()
    def rj(name):
        with open(os.path.join(out_dir, name), encoding='utf-8') as f:
            return json.load(f)
    sections = {}
    for p in sorted(glob.glob(os.path.join(out_dir, '*.json'))):
        base = os.path.basename(p)
        if base in ('dataset.json', 'data.json', 'layout.json', 'numeros.json', 'perguntas.json', 'config.json', 'content.json', 'variantes.json'):
            continue
        try:
            sec = rj(base)
        except Exception:
            continue
        if isinstance(sec, dict) and sec.get('id') and 'widgets' in sec:
            sections[sec['id']] = sec
    report = {'data': rj('data.json'), 'dataset': rj('dataset.json'), 'sections': sections, 'layout': rj('layout.json')}
    vpath = os.path.join(out_dir, 'variantes.json')
    if os.path.exists(vpath):
        with open(vpath, encoding='utf-8') as f:
            raw = f.read()
        if len(raw) > 300_000:
            import gzip, base64
            report['variants_gz'] = base64.b64encode(gzip.compress(raw.encode('utf-8'), 9)).decode('ascii')
        else:
            report['variants'] = json.loads(raw)
    safe = lambda s: s.replace('</script', '<\\/script')   # noqa: E731
    html = (rd('shell.html')
            .replace('{{TITLE}}', title.replace('<', '&lt;'))
            .replace('{{VIEWER_CSS}}', rd('viewer.css'))
            .replace('{{REPORT_JSON}}', safe(json.dumps(report, ensure_ascii=False)))
            .replace('{{VIEWER_JS}}', safe(rd('viewer.js'))))
    path = os.path.join(out_dir, 'relatorio.html')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(html)
    return path


def _write_layers(out_dir, r):
    def dump(name, obj):
        with open(os.path.join(out_dir, name), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
    dump('dataset.json', r['dataset']); dump('data.json', r['data']); dump('layout.json', r['layout'])
    for sid, sec in r['sections'].items():
        dump(f'{sid}.json', sec)
    return {'tables': len(r['dataset']), 'sections': len(r['sections']), 'pages': len(r['data']['pages'])}


def gerar(config_path, csv_path, out_dir, aux=None, content_path=None, opts=None):
    m = manifest()
    with open(config_path, encoding='utf-8') as f:
        config = json.load(f)
    if m.get('engine') and not config.get('type'):
        config['type'] = m['engine']
    aux = aux or {}
    faltam = [k for k in (m.get('required_files') or []) if not aux.get(k)]
    if faltam:
        raise SystemExit(f"este template exige os arquivos auxiliares: {', '.join(faltam)} (passe --{faltam[0]} …). Veja a tarefa de contexto correspondente.")
    for k, v in aux.items():
        if v:
            config[AUX[k]] = v
    content = DEFAULT_CONTENT
    if content_path:
        with open(content_path, encoding='utf-8') as f:
            content = json.load(f)
    os.makedirs(out_dir, exist_ok=True)

    calc, build_report = _engine()
    rows = load_rows(calc, csv_path)
    if opts:
        rows = recorte(rows, config, opts)
        if config.get('dict_csv') and hasattr(calc, 'load_dict') and 'dict' not in opts and os.path.exists(config['dict_csv']):
            opts = dict(opts, dict=calc.load_dict(config['dict_csv']))   # como o render_view do app
        r = build_report.assemble(rows, dict(config), content, opts)
        summ = _write_layers(out_dir, r)
    else:
        summ = build_report.build(csv_path, dict(config), content, out_dir)
    if config.get('dict_csv') and not config.get('dict_links') and hasattr(build_report, '_load_dict_links'):
        config['dict_links'] = build_report._load_dict_links(config['dict_csv'])
    vf = None
    if not (opts or {}).get('_sem_filtros'):
        try:
            vf = variantes(calc, build_report, rows, config, content, out_dir, {k: v for k, v in (opts or {}).items() if k != 'filters'})
        except Exception as e:
            sys.stderr.write(f'aviso: filtros offline não gerados ({e})\n')
    nums = numeros(calc, rows, config, out_dir, opts)
    with open(os.path.join(out_dir, 'numeros.json'), 'w', encoding='utf-8') as f:
        json.dump(nums, f, ensure_ascii=False, indent=2)
    html = render_html(out_dir, config.get('title') or config.get('client_name') or 'Relatório')
    return {'out_dir': out_dir, 'secoes': summ['sections'], 'tabelas': summ['tables'], 'paginas': summ.get('pages'),
            'html': html, 'opts': opts or None, 'filtros': vf}


def main(argv=None):
    ap = argparse.ArgumentParser(description='gera o relatório do template (4 camadas + numeros.json + relatorio.html)')
    ap.add_argument('--config'); ap.add_argument('--csv'); ap.add_argument('--out', required=True)
    ap.add_argument('--goals'); ap.add_argument('--dict'); ap.add_argument('--hist'); ap.add_argument('--content')
    ap.add_argument('--sem-filtros', action='store_true', help='não pré-calcula os filtros do relatório (HTML menor; recortes só por --opts)')
    ap.add_argument('--opts', help='JSON de recorte passado ao assemble (snapshot), ex.: \'{"mode":"captacao"}\'')
    ap.add_argument('--rerender', action='store_true')
    a = ap.parse_args(argv)
    if a.rerender:
        with open(os.path.join(a.out, 'data.json'), encoding='utf-8') as f:
            title = (json.load(f).get('meta') or {}).get('title') or 'Relatório'
        r = {'out_dir': a.out, 'html': render_html(a.out, title)}
    else:
        if not a.config or not a.csv:
            ap.error('--config e --csv são obrigatórios (ou use --rerender)')
        opts = json.loads(a.opts) if a.opts else None
        if a.sem_filtros:
            opts = dict(opts or {}, _sem_filtros=True)
        r = gerar(a.config, a.csv, a.out, {'goals': a.goals, 'dict': a.dict, 'hist': a.hist}, a.content, opts)
    sys.stdout.buffer.write((json.dumps(r, ensure_ascii=False) + '\n').encode('utf-8'))
    if not r.get('html'):
        sys.stderr.write('aviso: pasta viewer/ não encontrada — relatorio.html não foi gerado (as camadas estão em --out)\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
