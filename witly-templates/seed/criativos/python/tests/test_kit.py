"""Testes do kit de criativos: rodam só com o que está no zip (fixture sintética)."""
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
import calc  # noqa: E402

CONFIG = json.load(open(os.path.join(HERE, 'config.json'), encoding='utf-8'))
E = make_fixture.EXPECTED


def _run(*extra):
    return subprocess.run([sys.executable, os.path.join(PY, 'gerar.py'), *extra], capture_output=True, text=True, encoding='utf-8', errors='replace')


def _prep(rows):
    rows = calc.apply_temp_rules(rows, CONFIG['temp_rules'])
    rows = calc.apply_tipo_rules(rows, CONFIG['tipo_rules'])
    return [r for r in rows if r.get('tipo_campanha') == CONFIG['tipo_campanha']]


class Fixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.dump, cls.dic = make_fixture.write(cls.tmp)
        cls.rows = _prep(calc.load_rows(cls.dump))
        cls.B = calc.build(cls.rows, calc.load_dict(cls.dic), {})

    def test_tipo_campanha_exclui_venda(self):
        self.assertEqual({c['name'] for c in self.B['creatives']}, {'vid-quente-A', 'img-frio-B', 'vid-frio-C'})
        self.assertEqual(len(self.B['valid']), E['n_validos'])

    def test_totais(self):
        t = self.B['total']
        self.assertEqual(t['invest'], E['invest'])
        self.assertEqual(t['leads'], E['leads'])
        self.assertEqual(t['vendas'], E['vendas'])
        self.assertEqual(t['faturamento'], E['fat'])
        self.assertAlmostEqual(t['roas'], E['roas'], places=4)

    def test_temperatura_e_video(self):
        by = {c['name']: c for c in self.B['creatives']}
        self.assertEqual(by['vid-quente-A']['temps'], ['Quente'])
        self.assertEqual(by['img-frio-B']['temps'], ['Frio'])
        self.assertTrue(by['vid-quente-A']['is_video'])
        self.assertFalse(by['img-frio-B']['is_video'])
        self.assertIsNone(by['img-frio-B']['m']['hook_rate'])

    def test_dicionario(self):
        by = {c['name']: c for c in self.B['creatives']}
        self.assertEqual(by['vid-quente-A']['platform'], 'Instagram')
        self.assertEqual(by['img-frio-B']['platform'], 'Facebook')

    def test_media_ponderada(self):
        # razão agregada, não média das razões por criativo
        self.assertEqual(self.B['avg']['cpl'], self.B['total']['cpl'])
        self.assertEqual(self.B['avg']['invest'], round(E['invest'] / E['n_validos'], 4))

    def test_min_invest(self):
        B = calc.build(self.rows, {}, {'min_invest': 100 * len(make_fixture.DAYS) + 1})
        self.assertEqual({c['name'] for c in B['valid']}, {'img-frio-B'})


class Gerar(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.dump, cls.dic = make_fixture.write(cls.tmp)
        cls.out = os.path.join(cls.tmp, 'out')
        cls.res = _run('--config', os.path.join(HERE, 'config.json'), '--csv', cls.dump, '--dict', cls.dic, '--out', cls.out)

    def test_gera_camadas(self):
        self.assertEqual(self.res.returncode, 0, self.res.stderr)
        for f in ('dataset.json', 'data.json', 'layout.json', 'numeros.json', 'perguntas.json', 'relatorio.html'):
            self.assertTrue(os.path.exists(os.path.join(self.out, f)), f)
        data = json.load(open(os.path.join(self.out, 'data.json'), encoding='utf-8'))
        self.assertEqual([p['id'] for p in data['pages']], ['panorama', 'fichas'])
        self.assertEqual(len(data['pages'][1]['sections']), E['n_validos'])

    def test_numeros_batem(self):
        n = json.load(open(os.path.join(self.out, 'numeros.json'), encoding='utf-8'))
        self.assertEqual(n['total']['invest'], E['invest'])
        self.assertEqual(n['n_validos'], E['n_validos'])
        self.assertEqual(n['tipo_campanha'], 'Lead')
        self.assertNotIn('creatives', n)   # só agregados

    def test_perguntas(self):
        p = json.load(open(os.path.join(self.out, 'perguntas.json'), encoding='utf-8'))
        self.assertGreaterEqual(len(p['perguntas']), 8)

    def test_html_offline(self):
        html = open(os.path.join(self.out, 'relatorio.html'), encoding='utf-8').read()
        self.assertIn('window.__REPORT', html)
        self.assertNotIn('http://localhost', html)

    def test_opts_modo_captacao(self):
        out = os.path.join(self.tmp, 'cap')
        r = _run('--config', os.path.join(HERE, 'config.json'), '--csv', self.dump, '--dict', self.dic, '--out', out,
                 '--opts', json.dumps({'mode': 'captacao', 'temp': 'Frio'}))
        self.assertEqual(r.returncode, 0, r.stderr)
        n = json.load(open(os.path.join(out, 'numeros.json'), encoding='utf-8'))
        self.assertEqual(n['recorte'], {'temp': 'Frio'})
        self.assertEqual(n['n_validos'], 2)
        self.assertEqual(n['total']['invest'], 200 * len(make_fixture.DAYS))
        s01 = json.load(open(os.path.join(out, 's01.json'), encoding='utf-8'))
        self.assertIn('CAPTA', json.dumps(s01, ensure_ascii=False).upper())


class SemPII(unittest.TestCase):
    def test_fixture_nao_tem_pii(self):
        tmp = tempfile.mkdtemp()
        dump, dic = make_fixture.write(tmp)
        self.assertNotIn('@', open(dump, encoding='utf-8').read())
        self.assertNotRegex(open(dic, encoding='utf-8').read(), r'\d{4}')


if __name__ == '__main__':
    unittest.main()
