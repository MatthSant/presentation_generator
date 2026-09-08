"""Testes do kit debriefing: rodam só com o que está no zip (fixture sintética)."""
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


class Fixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.dump, cls.goals, cls.hist = make_fixture.write(cls.tmp)
        cfg = dict(CONFIG, goals_csv=cls.goals, hist_csv=cls.hist)
        cls.rows = calc.load_rows(cls.dump)
        cls.M = calc.build(cls.rows, cfg)

    def test_totais(self):
        M = self.M
        self.assertEqual(M['leads_total'], E['leads'])
        self.assertEqual(M['vendas_total'], E['vendas'])
        self.assertEqual(M['fat'], E['fat'])

    def test_invest_cpt_exclui_campanha_de_vendas(self):
        self.assertEqual(self.M['invest_cpt'], E['invest_cpt'])
        self.assertEqual(self.M['invest_total'], E['invest'])
        self.assertAlmostEqual(self.M['cpl'], E['invest_cpt'] / (50 * 21), places=2)

    def test_pago_x_organico(self):
        self.assertEqual(self.M['leads_pago'], 50 * 21)
        self.assertEqual(self.M['leads_org'], 15 * 21)

    def test_metas_somadas(self):
        g = self.M['goals']
        self.assertEqual(g['leads'], E['meta_leads'])
        self.assertEqual(g['vendas'], E['meta_vendas'])
        self.assertEqual(g['cpl'], 8.0)   # média das linhas > 0 (instagram = 0 não entra)
        self.assertEqual(g['cpmql'], 25.0)


class Gerar(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.dump, cls.goals, cls.hist = make_fixture.write(cls.tmp)
        cls.out = os.path.join(cls.tmp, 'out')
        cls.res = _run('--config', os.path.join(HERE, 'config.json'), '--csv', cls.dump, '--goals', cls.goals, '--hist', cls.hist, '--out', cls.out)

    def test_gera_camadas(self):
        self.assertEqual(self.res.returncode, 0, self.res.stderr)
        for f in ('dataset.json', 'data.json', 'layout.json', 'numeros.json', 'perguntas.json', 'relatorio.html'):
            self.assertTrue(os.path.exists(os.path.join(self.out, f)), f)
        data = json.load(open(os.path.join(self.out, 'data.json'), encoding='utf-8'))
        self.assertEqual([p['id'] for p in data['pages']], ['panorama', 'canal', 'trafego', 'organico', 'analise', 'onepager'])

    def test_numeros_batem(self):
        n = json.load(open(os.path.join(self.out, 'numeros.json'), encoding='utf-8'))
        self.assertEqual(n['leads_total'], E['leads'])
        self.assertEqual(n['goals']['leads'], E['meta_leads'])

    def test_perguntas(self):
        p = json.load(open(os.path.join(self.out, 'perguntas.json'), encoding='utf-8'))
        self.assertGreaterEqual(len(p['perguntas']), 10)

    def test_html_offline(self):
        html = open(os.path.join(self.out, 'relatorio.html'), encoding='utf-8').read()
        self.assertIn('window.__REPORT', html)
        self.assertNotIn('http://localhost', html)

    def test_sem_goals_recusa(self):
        r = _run('--config', os.path.join(HERE, 'config.json'), '--csv', self.dump, '--out', os.path.join(self.tmp, 'sem'))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('goals', (r.stderr + r.stdout).lower())

    def test_opts_recorte(self):
        out = os.path.join(self.tmp, 'ig')
        r = _run('--config', os.path.join(HERE, 'config.json'), '--csv', self.dump, '--goals', self.goals, '--out', out,
                 '--opts', json.dumps({'filters': {'canal': ['instagram']}}))
        self.assertEqual(r.returncode, 0, r.stderr)
        n = json.load(open(os.path.join(out, 'numeros.json'), encoding='utf-8'))
        self.assertEqual(n['leads_total'], 15 * 21)


class SemPII(unittest.TestCase):
    def test_fixture_nao_tem_pii(self):
        tmp = tempfile.mkdtemp()
        for f in make_fixture.write(tmp):
            self.assertNotIn('@', open(f, encoding='utf-8').read())


if __name__ == '__main__':
    unittest.main()
