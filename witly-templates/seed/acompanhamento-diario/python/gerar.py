#!/usr/bin/env python3
"""gerar — gera o acompanhamento diário a partir do CSV do Delfos, sem servidor.

uso:
  python gerar.py --config config.json --csv dump.csv --out saida/ [--goals goals.csv] [--dict dict.csv]

saída (em --out):
  dataset.json · data.json · layout.json · sXX.json   (as 4 camadas do relatório)
  numeros.json                                        (o que o calc.py calculou — números só daqui)
  relatorio.html                                      (standalone: viewer + JSON embutidos, abre offline)

Só stdlib. O número nasce no calc.py; este arquivo só orquestra e empacota.
"""
import argparse
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.stdout.reconfigure(encoding='utf-8', errors='replace') if hasattr(sys.stdout, 'reconfigure') else None

import calc  # noqa: E402
import build_report  # noqa: E402

VIEWER_DIRS = [os.path.join(HERE, 'viewer'), os.path.join(HERE, '..', 'viewer')]
DEFAULT_CONTENT = {
    'insights': {
        'header': {'badge': 'Insights', 'title': 'Insights Estratégicos', 'sub': 'Análise descritiva gerada — insights autorais ainda pendentes.'},
        'zones': [],
        'method': 'Os insights e detalhamentos autorais ainda não foram gerados para esta análise.',
    },
    'detalhamentos': {},
}


def _viewer_dir():
    for d in VIEWER_DIRS:
        if os.path.exists(os.path.join(d, 'shell.html')):
            return d
    return None


def _jsonable(obj):
    """calc.build devolve sets/tuplas em alguns campos; JSON não. Normaliza recursivamente."""
    if isinstance(obj, dict):
        return {str(k): _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_jsonable(v) for v in (sorted(obj, key=str) if isinstance(obj, set) else obj)]
    if isinstance(obj, float) and obj != obj:   # NaN
        return None
    return obj


def numeros(rows, config):
    """Resumo numérico do calc (sem as linhas cruas): é o que o agente lê para escrever."""
    r = calc.build(rows, config)
    drop = {'rows_corte'}
    return _jsonable({k: v for k, v in r.items() if k not in drop})


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
        if base in ('dataset.json', 'data.json', 'layout.json', 'numeros.json'):
            continue
        sec = rj(base)
        if isinstance(sec, dict) and sec.get('id') and 'widgets' in sec:
            sections[sec['id']] = sec
    report = {'data': rj('data.json'), 'dataset': rj('dataset.json'), 'sections': sections, 'layout': rj('layout.json')}
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


def gerar(config_path, csv_path, out_dir, goals=None, dict_csv=None):
    with open(config_path, encoding='utf-8') as f:
        config = json.load(f)
    config.setdefault('type', 'acompanhamento-lancamento')
    if goals:
        config['goals_csv'] = goals
    if dict_csv:
        config['dict_csv'] = dict_csv
    os.makedirs(out_dir, exist_ok=True)

    summ = build_report.build(csv_path, dict(config), DEFAULT_CONTENT, out_dir)
    rows = calc.load_rows(csv_path)
    if config.get('dict_csv') and not config.get('dict_links'):
        config['dict_links'] = build_report._load_dict_links(config['dict_csv'])
    nums = numeros(rows, config)
    with open(os.path.join(out_dir, 'numeros.json'), 'w', encoding='utf-8') as f:
        json.dump(nums, f, ensure_ascii=False, indent=2)
    html = render_html(out_dir, config.get('title') or config.get('client_name') or 'Relatório')
    return {'out_dir': out_dir, 'secoes': summ['sections'], 'tabelas': summ['tables'],
            'html': html, 'corte': nums.get('corte'), 'dia_campanha': nums.get('dia_campanha')}


def main(argv=None):
    ap = argparse.ArgumentParser(description='gera o acompanhamento diário (4 camadas + numeros.json + relatorio.html)')
    ap.add_argument('--config', required=True)
    ap.add_argument('--csv', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--goals')
    ap.add_argument('--dict')
    a = ap.parse_args(argv)
    r = gerar(a.config, a.csv, a.out, a.goals, a.dict)
    sys.stdout.buffer.write((json.dumps(r, ensure_ascii=False) + '\n').encode('utf-8'))
    if not r['html']:
        sys.stderr.write('aviso: pasta viewer/ não encontrada — relatorio.html não foi gerado (as 4 camadas e numeros.json estão em --out)\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
