#!/usr/bin/env python3
"""montar — gera um relatório LIVRE no design system a partir de uma pasta relatorio/.

uso:
  python montar.py --relatorio relatorio/ --out saida/

relatorio/
  meta.json      {"client","client_name","title","pergunta"?,"decisao"?}
  paginas.json   [{"id","label","sections":[{"id","label"}]}]   (opcional: uma página com todas as seções)
  dataset.json   {"nome-da-tabela": {"dims":[...], "filters":[], "rows":[{...}]}}  ← os NÚMEROS (saída do seu calc_livre.py)
  sNN.json       seções no contrato do app: {"id","header":{"badge","title","sub"?},"widgets":[...]}
  layout.json    (opcional) {"sections": {"sNN": [{id,x,y,w,h}]}}

faz: valida cada seção (tipos de widget do design system, binds para tabelas/colunas existentes,
prosa sem número que não esteja em alguma tabela), monta data.json/layout.json, copia o dataset e
REGERA o relatorio.html com o viewer offline. Com erro, lista tudo e não grava nada. Só stdlib.
"""
import argparse
import glob
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import aprofundar  # noqa: E402  (validate + default_layout)
import gerar  # noqa: E402       (render_html)


def _rj(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def montar(rel_dir, out_dir):
    meta_p = os.path.join(rel_dir, 'meta.json')
    ds_p = os.path.join(rel_dir, 'dataset.json')
    if not os.path.exists(meta_p):
        raise SystemExit('relatorio/meta.json ausente (client, client_name, title)')
    if not os.path.exists(ds_p):
        raise SystemExit('relatorio/dataset.json ausente: os números vêm daqui (gere com o seu calc_livre.py)')
    meta = _rj(meta_p)
    dataset = _rj(ds_p)
    for k in ('client', 'title'):
        if not meta.get(k):
            raise SystemExit(f'meta.json: "{k}" obrigatório')
    if not isinstance(dataset, dict) or not dataset:
        raise SystemExit('dataset.json precisa de ao menos uma tabela {"nome": {"dims":[...],"rows":[...]}}')
    for name, t in dataset.items():
        if not isinstance(t, dict) or not isinstance(t.get('rows'), list):
            raise SystemExit(f'dataset.json: tabela "{name}" precisa de "rows" (lista)')
        t.setdefault('dims', []); t.setdefault('filters', [])

    secs = {}
    for p in sorted(glob.glob(os.path.join(rel_dir, 's[0-9]*.json'))):
        s = _rj(p)
        sid = s.get('id') or os.path.splitext(os.path.basename(p))[0]
        s['id'] = sid
        secs[sid] = s
    if not secs:
        raise SystemExit('nenhuma seção relatorio/sNN.json')

    erros = []
    for sid, s in secs.items():
        for e in aprofundar.validate(s, dataset, {}):
            erros.append(f'{sid}: {e}')
    if erros:
        return {'ok': False, 'erros': erros}

    pag_p = os.path.join(rel_dir, 'paginas.json')
    if os.path.exists(pag_p):
        pages = _rj(pag_p)
        listadas = {x['id'] for p in pages for x in p.get('sections', [])}
        faltam = [sid for sid in secs if sid not in listadas]
        if faltam:
            return {'ok': False, 'erros': [f'paginas.json não lista a(s) seção(ões): {", ".join(faltam)}']}
        for p in pages:
            for x in p.get('sections', []):
                if x['id'] not in secs:
                    return {'ok': False, 'erros': [f'paginas.json cita seção inexistente: {x["id"]}']}
                x.setdefault('label', secs[x['id']].get('header', {}).get('title', x['id']))
    else:
        pages = [{'id': 'relatorio', 'label': 'Relatório',
                  'sections': [{'id': sid, 'label': s.get('header', {}).get('title', sid)} for sid, s in secs.items()]}]

    lay_p = os.path.join(rel_dir, 'layout.json')
    layout = _rj(lay_p) if os.path.exists(lay_p) else {'sections': {}}
    layout.setdefault('sections', {})
    for sid, s in secs.items():
        if sid not in layout['sections']:
            layout['sections'][sid] = aprofundar.default_layout(s)

    data = {'meta': {'client': meta['client'], 'client_name': meta.get('client_name') or meta['client'],
                     'title': meta['title'], 'type': 'analise-livre', 'theme': 'light',
                     'pergunta': meta.get('pergunta'), 'decisao': meta.get('decisao'),
                     'filters': [], 'nav': 'sidebar' if len(pages) > 1 else 'topnav'},
            'pages': pages}

    os.makedirs(out_dir, exist_ok=True)
    def wj(name, obj):
        with open(os.path.join(out_dir, name), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
    wj('dataset.json', dataset); wj('data.json', data); wj('layout.json', layout)
    for sid, s in secs.items():
        wj(f'{sid}.json', s)
    html = gerar.render_html(out_dir, meta['title'])
    return {'ok': True, 'secoes': sorted(secs), 'tabelas': sorted(dataset), 'paginas': [p['id'] for p in pages], 'html': html}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--relatorio', required=True, help='pasta com meta.json, dataset.json, sNN.json (e paginas.json/layout.json opcionais)')
    ap.add_argument('--out', required=True)
    a = ap.parse_args(argv)
    r = montar(a.relatorio, a.out)
    print(json.dumps(r, ensure_ascii=False, indent=2))
    return 0 if r.get('ok') else 1


if __name__ == '__main__':
    sys.exit(main())
