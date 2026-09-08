"""Testes do kit de histórico: rodam só com o que está no zip (fixture sintética)."""
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

E = make_fixture.EXPECTED


def _run(*extra):
    return subprocess.run([sys.executable, os.path.join(PY, 'gerar.py'), *extra], capture_output=True, text=True, encoding='utf-8', errors='replace')


class Fixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.dump = make_fixture.write(cls.tmp)
        cls.rows = calc.load_rows(cls.dump)
        cls.S = calc.build_series(cls.rows)

    def test_ordem_e_rotulos(self):
        self.assertEqual([self.S['labels'][fc] for fc in self.S['events']], E['labels'])
        self.assertEqual(self.S['produto'], E['produto'])

    def test_overview_primeiro(self):
        ov = self.S['ov'][self.S['events'][0]]
        self.assertEqual(ov['leads'], E['leads_first'])
        self.assertEqual(ov['vendas'], E['vendas_first'])
        self.assertEqual(ov['invest'], E['invest'])
        self.assertEqual(ov['fat_liq'], E['fat_liq_first'])
        self.assertAlmostEqual(ov['roas'], E['fat_liq_first'] / E['invest'], places=3)

    def test_quebras(self):
        ov = self.S['ov'][self.S['events'][0]]
        self.assertEqual(ov['by']['canal']['Pago']['leads'], 750)
        self.assertEqual(ov['by']['canal']['Orgânico']['leads'], 250)
        self.assertEqual(ov['by']['plataforma']['Google']['leads'], 50)
        self.assertEqual(ov['by']['temp']['Hot']['vendas'], 20)
        self.assertEqual(ov['recap'], 215)

    def test_midia_so_pago(self):
        m = self.S['media'][self.S['events'][0]]
        self.assertEqual(m['invest'], E['invest'])
        self.assertEqual(m['leads_p'], 750)
        self.assertAlmostEqual(m['cpl'], E['invest'] / 750, places=3)
        self.assertAlmostEqual(m['cpa'], E['invest'] / 28, places=3)

    def test_recorte_launches(self):
        S = calc.build_series(self.rows, only=['jul/25', 'mar/26'])
        self.assertEqual([S['labels'][fc] for fc in S['events']], ['jul/25', 'mar/26'])
        self.assertEqual(S['all_labels'], E['labels'])


class Gerar(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.dump = make_fixture.write(cls.tmp)
        cls.out = os.path.join(cls.tmp, 'out')
        cls.res = _run('--config', os.path.join(HERE, 'config.json'), '--csv', cls.dump, '--out', cls.out)

    def test_gera_camadas(self):
        self.assertEqual(self.res.returncode, 0, self.res.stderr)
        for f in ('dataset.json', 'data.json', 'layout.json', 'numeros.json', 'relatorio.html'):
            self.assertTrue(os.path.exists(os.path.join(self.out, f)), f)
        data = json.load(open(os.path.join(self.out, 'data.json'), encoding='utf-8'))
        self.assertEqual([p['id'] for p in data['pages']], ['panorama', 'investimentos'])

    def test_numeros_batem(self):
        n = json.load(open(os.path.join(self.out, 'numeros.json'), encoding='utf-8'))
        self.assertEqual(n['all_labels'], E['labels'])
        self.assertEqual([l['label'] for l in n['lancamentos']], E['labels'])
        self.assertEqual(n['lancamentos'][0]['ov']['leads'], E['leads_first'])
        self.assertEqual(sum(l['ov']['leads'] for l in n['lancamentos']), E['leads_total'])


    def test_html_offline(self):
        html = open(os.path.join(self.out, 'relatorio.html'), encoding='utf-8').read()
        self.assertIn('window.__REPORT', html)
        self.assertNotIn('http://localhost', html)

    def test_opts_recorte(self):
        out = os.path.join(self.tmp, 'rec')
        r = _run('--config', os.path.join(HERE, 'config.json'), '--csv', self.dump, '--out', out,
                 '--opts', json.dumps({'launches': ['nov/25', 'mar/26'], 'metric': 'qual'}))
        self.assertEqual(r.returncode, 0, r.stderr)
        n = json.load(open(os.path.join(out, 'numeros.json'), encoding='utf-8'))
        self.assertEqual([l['label'] for l in n['lancamentos']], ['nov/25', 'mar/26'])
        s01 = json.load(open(os.path.join(out, 's01.json'), encoding='utf-8'))
        self.assertIn('Qualificação', json.dumps(s01, ensure_ascii=False))


class SemPII(unittest.TestCase):
    def test_fixture_nao_tem_pii(self):
        tmp = tempfile.mkdtemp()
        self.assertNotIn('@', open(make_fixture.write(tmp), encoding='utf-8').read())


if __name__ == '__main__':
    unittest.main()
