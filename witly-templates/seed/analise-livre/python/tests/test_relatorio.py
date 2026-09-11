"""O builder da análise livre (relatorio.py) produz o mesmo esqueleto dos templates: páginas
com sidebar, eyebrows, KPIs `feature` com meta, comparativo, série no tempo, funil, achados,
ações — a partir do exemplo (python/exemplo) sobre dado SINTÉTICO. E recusa número digitado."""
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PY = os.path.dirname(HERE)
sys.path.insert(0, PY)
sys.path.insert(0, os.path.join(PY, 'exemplo'))

import build  # noqa: E402
import make_fixture_csv  # noqa: E402
from relatorio import Relatorio  # noqa: E402


class Exemplo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.csv = make_fixture_csv.write(os.path.join(cls.tmp, 'fixture.csv'))
        cls.out = os.path.join(cls.tmp, 'saida')
        cls.r = build.montar(cls.csv).gravar(cls.out)

    def _j(self, name):
        with open(os.path.join(self.out, name), encoding='utf-8') as f:
            return json.load(f)

    def test_tres_paginas_com_sidebar(self):
        data = self._j('data.json')
        self.assertEqual([p['id'] for p in data['pages']], ['panorama', 'canais', 'onepager'])
        self.assertEqual(data['meta']['nav'], 'sidebar')
        self.assertEqual(data['meta']['type'], 'dashboard')          # o mesmo tipo dos templates
        self.assertEqual(data['meta']['controls']['kind'], 'analise-livre')
        self.assertEqual(data['meta']['controls']['compare'], 'meta')
        self.assertIn('cover', data['meta'])

    def test_panorama_tem_o_esqueleto_do_debriefing(self):
        s = self._j('s01.json')
        tipos = [w['type'] for w in s['widgets']]
        self.assertGreaterEqual(tipos.count('eyebrow'), 4)
        cards = [w for w in s['widgets'] if w['type'] == 'kpi-card']
        self.assertGreaterEqual(len(cards), 10)
        self.assertTrue(all(c.get('tier') == 'feature' for c in cards))
        self.assertTrue(any(c.get('band') for c in cards))                       # atingimento
        self.assertTrue(any(c.get('goalCmp') for c in cards))                    # rodapé de meta
        self.assertIn('meta-bars', tipos)
        self.assertIn('evolution-picker', tipos)
        lay = {i['id']: i for i in self._j('layout.json')['sections']['s01']}
        self.assertTrue(all(lay[c['id']]['h'] == 2 for c in cards))
        self.assertEqual(lay[[w['id'] for w in s['widgets'] if w['type'] == 'evolution-picker'][0]]['w'], 12)

    def test_one_pager_funil_achados_acoes(self):
        s = self._j('s03.json')
        tipos = [w['type'] for w in s['widgets']]
        self.assertEqual(tipos.count('funnel'), 2)
        self.assertEqual(tipos.count('find-block'), 2)
        self.assertEqual(tipos.count('ni'), 3)
        fun = [w for w in s['widgets'] if w['type'] == 'funnel'][0]
        self.assertEqual([st['label'] for st in fun['steps']], ['Leads', 'Respostas', 'MQLs', 'Vendas'])
        self.assertTrue(all('migrate' in t for t in fun['transitions']))

    def test_numero_vem_do_dado(self):
        ds = self._j('dataset.json')
        self.assertIn('_numeros', ds)                                            # o que virou card é citável
        s = self._j('s02.json')
        c = [w for w in s['widgets'] if w['type'] == 'chart'][0]
        self.assertEqual(c['bind']['dataset'], 'q-canal')
        html = open(os.path.join(self.out, 'relatorio.html'), encoding='utf-8').read()
        self.assertIn('window.__REPORT', html)
        self.assertIn('Cliente Fixture', html)


class Builder(unittest.TestCase):
    def _r(self):
        R = Relatorio(client='x', client_name='X', title='X · teste')
        R.tabela('q', ['k'], [{'k': 'a', 'v': 10.0}, {'k': 'b', 'v': 30.0}])
        return R

    def test_valor_digitado_e_recusado(self):
        s = self._r().pagina('p', 'P').secao('s01', 'B', 'T')
        with self.assertRaises(ValueError):
            s.kpi('CPL', 'R$ 7,00', 'money')     # string: o builder formata NÚMERO
        with self.assertRaises(ValueError):
            s.grafico('bar', 'x', 'nao-existe', x='k', y='v')
        with self.assertRaises(ValueError):
            s.grafico('bar', 'x', 'q', x='k', y='inexistente')

    def test_prosa_com_numero_solto_nao_grava(self):
        R = self._r()
        s = R.pagina('p', 'P').secao('s01', 'B', 'T')
        s.kpi('Total', 40.0, 'int')
        s.achado('x', 'ok', 'ok', 'o total foi 40 e o pior 3,14')      # 3,14 não está em tabela nem card
        with self.assertRaises(SystemExit):
            R.gravar(os.path.join(tempfile.mkdtemp(), 'out'))
        # citando só o que existe (40 é card; 30.0 está na tabela) passa — e "53.6%" com ponto também
        R2 = self._r()
        s2 = R2.pagina('p', 'P').secao('s01', 'B', 'T')
        s2.kpi('Total', 40.0, 'int'); s2.kpi('Taxa', 53.6, 'pct')
        s2.achado('x', 'ok', 'ok', 'o total foi 40, o maior 30.0 e a taxa 53.6%')
        self.assertTrue(R2.gravar(os.path.join(tempfile.mkdtemp(), 'out'))['ok'])


if __name__ == '__main__':
    unittest.main()
