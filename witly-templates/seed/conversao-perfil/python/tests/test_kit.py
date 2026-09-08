"""Testes do kit de conversão por perfil: rodam só com o que está no zip (fixture sintética)."""
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
import conv_calc as cc  # noqa: E402

CONFIG = json.load(open(os.path.join(HERE, 'config.json'), encoding='utf-8'))
E = make_fixture.EXPECTED


def _run(*extra):
    return subprocess.run([sys.executable, os.path.join(PY, 'gerar.py'), *extra], capture_output=True, text=True, encoding='utf-8', errors='replace')


class Fixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.dump = make_fixture.write(cls.tmp)
        cls.rows = cc.load_dump(cls.dump)
        cls.dims = cc.dim_columns(cls.rows)
        cls.lctos = cc.ordered_lancamentos(cls.rows)

    def test_ordem_cronologica_e_dimensoes(self):
        self.assertEqual(self.lctos, make_fixture.LCTOS)
        self.assertEqual(self.dims, ['renda_mensal', 'idade', 'genero'])

    def test_benchmark_e_respondentes(self):
        cd = cc.agg_criterio(self.rows, 'renda_mensal', self.dims, self.lctos, 'Geral')
        # respondentes: 18 combos × (120 + 80) leads; benchmark ≠ linha total (1 %)
        self.assertEqual(sum(cd['por_grupo'][g]['leads'][0] for g in cd['grupos']), E['leads_resp_lcto_geral'])
        self.assertGreater(cd['bench_pesq_lcto'][0], 2.0)
        self.assertAlmostEqual(cd['bench_total_lcto'][0], 1.0, places=1)

    def test_grupos_consistente_e_critico(self):
        cd = cc.agg_criterio(self.rows, 'renda_mensal', self.dims, self.lctos, 'Geral')
        best, worst = cd['por_grupo'][E['best_renda']], cd['por_grupo'][E['worst_renda']]
        self.assertEqual((best['wins'], best['n']), (4, 4))
        self.assertEqual((worst['wins'], worst['n']), (0, 4))
        self.assertGreater(best['avgDiff_lcto'], 50)
        self.assertLess(worst['avgDiff_lcto'], -50)

    def test_conversao_em_percentual(self):
        cd = cc.agg_criterio(self.rows, 'renda_mensal', self.dims, self.lctos, 'Geral')
        self.assertAlmostEqual(cd['por_grupo'][E['best_renda']]['avgConvLcto'], 4.0, places=2)   # 4 %, não 0.04

    def test_canais_separados(self):
        p = cc.agg_criterio(self.rows, 'renda_mensal', self.dims, self.lctos, 'Pago')
        o = cc.agg_criterio(self.rows, 'renda_mensal', self.dims, self.lctos, 'Orgânico')
        self.assertLess(p['bench_pesq_lcto'][0], o['bench_pesq_lcto'][0])

    def test_relevancia_e_codependencia(self):
        renda = cc.agg_criterio(self.rows, 'renda_mensal', self.dims, self.lctos, 'Geral')
        genero = cc.agg_criterio(self.rows, 'genero', self.dims, self.lctos, 'Geral')
        self.assertGreater(cc.relevancia(renda), 30)
        self.assertAlmostEqual(cc.relevancia(genero), 0.0, places=3)
        spec = [{'id': c['id'], 'label': c['label'], 'col': c['col']} for c in CONFIG['criterios']]
        cod = cc.codependencia(self.rows, spec, self.dims, 'Geral', self.lctos)
        self.assertEqual(cod['fatores']['renda']['papel'], 'qualificador')   # dimensões independentes na fixture


class Gerar(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.dump = make_fixture.write(cls.tmp)
        cls.out = os.path.join(cls.tmp, 'out')
        cls.res = _run('--config', os.path.join(HERE, 'config.json'), '--csv', cls.dump, '--out', cls.out)

    def test_gera_camadas(self):
        self.assertEqual(self.res.returncode, 0, self.res.stderr)
        for f in ('dataset.json', 'data.json', 'layout.json', 'numeros.json', 'perguntas.json', 'relatorio.html'):
            self.assertTrue(os.path.exists(os.path.join(self.out, f)), f)
        data = json.load(open(os.path.join(self.out, 'data.json'), encoding='utf-8'))
        self.assertEqual([p['id'] for p in data['pages']], ['panorama', 'insights', 'codependencia', 'renda', 'idade', 'genero'])
        self.assertEqual([f['id'] for f in data['meta']['filters']], ['canal'])

    def test_numeros_batem(self):
        n = json.load(open(os.path.join(self.out, 'numeros.json'), encoding='utf-8'))
        self.assertEqual(n['lancamentos'], make_fixture.LCTOS)
        r = n['criterios']['renda']['canais']['Geral']
        self.assertEqual(r['grupos'][E['best_renda']]['wins'], 4)
        self.assertEqual(n['codependencia']['Geral']['ids'], ['renda', 'idade', 'genero'])

    def test_perguntas(self):
        p = json.load(open(os.path.join(self.out, 'perguntas.json'), encoding='utf-8'))
        self.assertGreaterEqual(len(p['perguntas']), 5)

    def test_html_offline(self):
        html = open(os.path.join(self.out, 'relatorio.html'), encoding='utf-8').read()
        self.assertIn('window.__REPORT', html)
        self.assertNotIn('http://localhost', html)


class SemPII(unittest.TestCase):
    def test_fixture_nao_tem_pii(self):
        tmp = tempfile.mkdtemp()
        s = open(make_fixture.write(tmp), encoding='utf-8').read()
        self.assertNotIn('@', s)
        self.assertNotIn('email', s)


if __name__ == '__main__':
    unittest.main()
