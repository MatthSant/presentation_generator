"""Testes do kit (stdlib): o número nasce no calc.py e bate com a fixture sintética;
o gerar.py produz as 4 camadas + numeros.json + relatorio.html; todo placeholder de
documento.md existe em numeros.json.  Rodar: python -m unittest (na pasta python/)."""
import json
import os
import re
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PY = os.path.dirname(HERE)
KIT = os.path.dirname(PY)
sys.path.insert(0, PY)
sys.path.insert(0, HERE)

import make_fixture  # noqa: E402
import calc  # noqa: E402
import gerar  # noqa: E402

CONFIG = os.path.join(HERE, 'config.json')


class CalcFixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='kit-')
        cls.csv = make_fixture.write(os.path.join(cls.tmp, 'fixture.csv'))
        with open(CONFIG, encoding='utf-8') as f:
            cls.config = json.load(f)
        cls.rows = calc.load_rows(cls.csv)
        cls.r = calc.build(cls.rows, dict(cls.config))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_totais_batem_com_a_fixture(self):
        e = make_fixture.EXPECTED
        self.assertEqual(self.r['tot']['leads'], e['leads_total'])
        self.assertEqual(self.r['split']['leads_pago'], e['leads_pago'])
        self.assertAlmostEqual(self.r['tot']['investimento'], e['invest_total'])
        self.assertAlmostEqual(self.r['tot']['cpl'], e['cpl_pago'], places=3)

    def test_temperatura_pelas_regras(self):
        self.assertEqual(set(self.r['temp']), {'Quente', 'Frio'})
        self.assertEqual(self.r['temp']['Quente']['leads'], 100)
        self.assertEqual(self.r['temp']['Frio']['leads'], 75)
        self.assertAlmostEqual(self.r['temp']['Quente']['cpl'], 5.0)
        self.assertAlmostEqual(self.r['temp']['Frio']['cpl'], 10.0)

    def test_corte_e_dias(self):
        self.assertEqual(self.r['corte'], '2026-08-05')
        self.assertEqual(self.r['n_dias'], 5)
        self.assertEqual([d['date'] for d in self.r['days']], make_fixture.DAYS)

    def test_meta_status_semaforo(self):
        st = self.r['meta_status']
        self.assertEqual(st['leads']['cls'], 'ok')       # 225 = meta to-date
        self.assertEqual(st['cpl']['cls'], 'ok')         # 7,14 vs 8 → -10,7% (custo abaixo = ok)
        self.assertIn(st['conv_pag']['cls'], ('bad',))   # 9,5% vs bench 40%


class Gerar(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='kit-out-')
        cls.csv = make_fixture.write(os.path.join(cls.tmp, 'fixture.csv'))
        cls.out = os.path.join(cls.tmp, 'out')
        cls.res = gerar.gerar(CONFIG, cls.csv, cls.out)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_quatro_camadas_e_numeros(self):
        for f in ('dataset.json', 'data.json', 'layout.json', 's01.json', 'numeros.json'):
            self.assertTrue(os.path.exists(os.path.join(self.out, f)), f)
        with open(os.path.join(self.out, 'numeros.json'), encoding='utf-8') as f:
            n = json.load(f)
        self.assertNotIn('rows_corte', n)
        self.assertEqual(n['tot']['leads'], make_fixture.EXPECTED['leads_total'])

    def test_html_standalone(self):
        if not gerar._viewer_dir():
            self.skipTest('viewer/ ausente (rode npm run build + copie public/viewer)')
        html_path = os.path.join(self.out, 'relatorio.html')
        self.assertTrue(os.path.exists(html_path))
        with open(html_path, encoding='utf-8') as f:
            html = f.read()
        self.assertIn('window.__REPORT=', html)
        self.assertNotIn('{{REPORT_JSON}}', html)
        self.assertNotIn('{{VIEWER_JS}}', html)
        self.assertIn('Cliente Fixture', html)
        m = re.search(r'window\.__REPORT=(\{.*?\});window\.__REPORT\.logo', html, re.S)
        self.assertIsNotNone(m)
        rep = json.loads(m.group(1))
        self.assertTrue({'data', 'dataset', 'sections', 'layout'} <= set(rep))
        self.assertTrue('variants' in rep or 'variants_gz' in rep)
        self.assertIn('s01', rep['sections'])
        # filtros offline em cascata: dimensões do FAB (sem o intervalo de datas), tuplas de
        # utm e um snapshot por seleção efetiva (valor isolado + caminhos da hierarquia)
        v = json.load(open(os.path.join(self.out, 'variantes.json'), encoding='utf-8'))
        self.assertEqual(v['kind'], 'cascade')
        keys = [d['key'] for d in v['dims']]
        self.assertNotIn('dia', keys)
        self.assertEqual(keys[:2], ['origem', 'utm_source'])
        fb = next(sn for sn in v['snaps'] if {'utm_source': 'facebook'} in sn['sels'])
        self.assertTrue({'dataset', 'sections', 'layout', 'tuples'} <= set(fb))
        self.assertTrue(all(v['tuples'][i][keys.index('utm_source')] == 'facebook' for i in fb['tuples']))
        # caminho de prefixo (origem + canal + público) existe quando restringe de verdade
        self.assertTrue(any(len(x) >= 3 for sn in v['snaps'] for x in sn['sels']))   # caminho da hierarquia mapeado

    def test_placeholders_do_documento_existem(self):
        with open(os.path.join(KIT, 'documento.md'), encoding='utf-8') as f:
            doc = f.read()
        with open(os.path.join(self.out, 'numeros.json'), encoding='utf-8') as f:
            n = json.load(f)
        missing = []
        for ph in sorted(set(re.findall(r'\{\{numeros\.([A-Za-z0-9_.]+)\}\}', doc))):
            cur = n
            for part in ph.split('.'):
                if isinstance(cur, dict) and part in cur:
                    cur = cur[part]
                else:
                    missing.append(ph)
                    break
        self.assertEqual(missing, [], f'placeholders sem chave em numeros.json: {missing}')


if __name__ == '__main__':
    unittest.main()
