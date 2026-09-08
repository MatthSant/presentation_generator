"""Testes do kit de análise livre: o montar.py valida e gera a partir da pasta relatorio/."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PY = os.path.dirname(HERE)
sys.path.insert(0, PY)
sys.path.insert(0, HERE)

import make_fixture  # noqa: E402
import montar  # noqa: E402

E = make_fixture.EXPECTED


class Montar(unittest.TestCase):
    def test_gera_camadas_e_html(self):
        tmp = tempfile.mkdtemp()
        rel = make_fixture.write(tmp)
        out = os.path.join(tmp, 'saida')
        r = montar.montar(rel, out)
        self.assertTrue(r['ok'], r)
        self.assertEqual(r['secoes'], E['secoes'])
        self.assertEqual(r['tabelas'], E['tabelas'])
        for f in ('dataset.json', 'data.json', 'layout.json', 's01.json', 'relatorio.html'):
            self.assertTrue(os.path.exists(os.path.join(out, f)), f)
        data = json.load(open(os.path.join(out, 'data.json'), encoding='utf-8'))
        self.assertEqual(data['meta']['type'], 'analise-livre')
        self.assertEqual([p['id'] for p in data['pages']], ['relatorio'])
        self.assertEqual(data['meta']['nav'], 'topnav')
        ds = json.load(open(os.path.join(out, 'dataset.json'), encoding='utf-8'))
        self.assertEqual(ds['q-cpl-canal']['rows'][-1]['cpl'], E['cpl_geral'])
        html = open(os.path.join(out, 'relatorio.html'), encoding='utf-8').read()
        self.assertIn('window.__REPORT', html)
        self.assertIn('Cliente Fixture', html)

    def test_valida_e_nao_grava_com_erro(self):
        tmp = tempfile.mkdtemp()
        rel = make_fixture.write_invalida(tmp)
        out = os.path.join(tmp, 'saida')
        r = montar.montar(rel, out)
        self.assertFalse(r['ok'])
        erros = ' | '.join(r['erros'])
        self.assertIn('3.14', erros)               # número solto na prosa
        self.assertIn('nao-existe', erros)         # bind para tabela inexistente
        self.assertIn('grafico-magico', erros)     # tipo fora do design system
        self.assertFalse(os.path.exists(os.path.join(out, 'relatorio.html')))

    def test_paginas_json_e_layout_proprio(self):
        tmp = tempfile.mkdtemp()
        rel = make_fixture.write(tmp)
        json.dump([{'id': 'p1', 'label': 'Página 1', 'sections': [{'id': 's01', 'label': 'Resposta'}]},
                   {'id': 'p2', 'label': 'Página 2', 'sections': [{'id': 's01', 'label': 'De novo'}]}],
                  open(os.path.join(rel, 'paginas.json'), 'w', encoding='utf-8'))
        json.dump({'sections': {'s01': [{'id': 'hl', 'x': 0, 'y': 0, 'w': 12, 'h': 1}]}}, open(os.path.join(rel, 'layout.json'), 'w', encoding='utf-8'))
        r = montar.montar(rel, os.path.join(tmp, 'saida'))
        self.assertTrue(r['ok'], r)
        self.assertEqual(r['paginas'], ['p1', 'p2'])
        data = json.load(open(os.path.join(tmp, 'saida', 'data.json'), encoding='utf-8'))
        self.assertEqual(data['meta']['nav'], 'sidebar')
        lay = json.load(open(os.path.join(tmp, 'saida', 'layout.json'), encoding='utf-8'))
        self.assertEqual(lay['sections']['s01'][0]['w'], 12)

    def test_cli(self):
        tmp = tempfile.mkdtemp()
        rel = make_fixture.write(tmp)
        r = subprocess.run([sys.executable, os.path.join(PY, 'montar.py'), '--relatorio', rel, '--out', os.path.join(tmp, 'saida')],
                           capture_output=True, text=True, encoding='utf-8', errors='replace')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('"ok": true', r.stdout)


if __name__ == '__main__':
    unittest.main()
