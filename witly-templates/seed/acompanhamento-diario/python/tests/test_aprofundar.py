"""Perguntas norteadoras (perguntas.json ranqueado) e aprofundar.py (seção válida entra no
relatório e regera o HTML; seção inválida falha listando erros e não grava nada)."""
import json
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PY = os.path.dirname(HERE)
sys.path.insert(0, PY)
sys.path.insert(0, HERE)

import make_fixture  # noqa: E402
import gerar  # noqa: E402
import aprofundar  # noqa: E402

CONFIG = os.path.join(HERE, 'config.json')
TABELA = {'name': 'q-cpl-decomp', 'dims': ['fator'], 'filters': [],
          'rows': [{'fator': 'CPM', 'inicio': 8.3, 'recente': 10.9, 'contrib_pct': 84.0},
                   {'fator': 'CTR', 'inicio': 1.6, 'recente': 1.6, 'contrib_pct': 4.0}]}
SECAO_OK = {
    'id': 'det-cpl-subindo',
    'header': {'badge': 'Aprofundamento', 'title': 'Por que o CPL subiu nos últimos 3 dias?', 'sub': 'decomposição'},
    'widgets': [
        {'id': 'hl', 'type': 'highlight', 'label': 'Resposta', 'text': 'A alta é de leilão: 84,0% vem do CPM.'},
        {'id': 't1', 'type': 'table', 'title': 'Decomposição', 'cols': ['fator', 'inicio', 'recente', 'contrib_pct'],
         'bind': {'dataset': 'q-cpl-decomp', 'x': 'fator', 'metrics': ['inicio', 'recente', 'contrib_pct']}},
        {'id': 'f1', 'type': 'find-block', 'tag': 'Causa', 'title': 'Leilão', 'detail': 'CPM de 8,3 para 10,9 (tabela Decomposição).'},
    ],
}


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='kit-apr-')
        csv = make_fixture.write(os.path.join(cls.tmp, 'fixture.csv'))
        cls.out = os.path.join(cls.tmp, 'out')
        gerar.gerar(CONFIG, csv, cls.out)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)


class Perguntas(Base):
    def test_perguntas_json_ranqueado(self):
        p = os.path.join(self.out, 'perguntas.json')
        self.assertTrue(os.path.exists(p))
        with open(p, encoding='utf-8') as f:
            d = json.load(f)
        qs = d['perguntas']
        self.assertGreaterEqual(len(qs), 5)
        for q in qs:
            for k in ('id', 'pergunta', 'justificativa', 'kpis', 'relevancia', 'nivel', 'deepen'):
                self.assertIn(k, q)
            self.assertIn(q['nivel'], ('alta', 'media', 'baixa'))
            self.assertTrue(q['deepen'].get('prompt'))
        self.assertEqual([q['relevancia'] for q in qs], sorted((q['relevancia'] for q in qs), reverse=True))
        # não entra no HTML: nenhuma página "perguntas" no data.json do kit
        with open(os.path.join(self.out, 'data.json'), encoding='utf-8') as f:
            pages = json.load(f)['pages']
        self.assertFalse(any(p.get('kind') == 'perguntas' and p.get('sections') for p in pages if p['id'] != 'perguntas'))


class Aprofundar(Base):
    def test_secao_valida_entra_e_regera(self):
        r = aprofundar.aprofundar(self.out, json.loads(json.dumps(SECAO_OK)), [TABELA], pergunta=None)
        self.assertTrue(r['ok'], r)
        self.assertEqual(r['secao'], 'det-cpl-subindo')
        with open(os.path.join(self.out, 'data.json'), encoding='utf-8') as f:
            data = json.load(f)
        det = next(p for p in data['pages'] if p['id'] == 'detalhamentos')
        self.assertEqual(det['sections'][0]['id'], 'det-cpl-subindo')
        with open(os.path.join(self.out, 'dataset.json'), encoding='utf-8') as f:
            self.assertIn('q-cpl-decomp', json.load(f))
        with open(os.path.join(self.out, 'layout.json'), encoding='utf-8') as f:
            lay = json.load(f)['sections']['det-cpl-subindo']
        self.assertEqual([i['id'] for i in lay], ['hl', 't1', 'f1'])
        self.assertTrue(os.path.exists(os.path.join(self.out, 'det-cpl-subindo.json')))
        if gerar._viewer_dir():
            with open(os.path.join(self.out, 'relatorio.html'), encoding='utf-8') as f:
                self.assertIn('det-cpl-subindo', f.read())

    def test_secao_invalida_falha_sem_gravar(self):
        ruim = {'id': 'det-ruim', 'header': {'title': 'x'}, 'widgets': [
            {'id': 'a', 'type': 'foo'},
            {'id': 'b', 'type': 'table', 'cols': ['x'], 'bind': {'dataset': 'nao-existe', 'x': 'x'}},
            {'id': 'c', 'type': 'chart', 'chartType': 'line', 'bind': {'dataset': 'q-cpl-decomp', 'x': 'fator', 'y': 'inexistente'}},
            {'id': 'd', 'type': 'find-note', 'text': 'O CPL foi de R$ 12,34, número que não está em tabela nenhuma.'},
            {'id': 'e', 'type': 'kpi', 'label': 'sem dado'},
        ]}
        r = aprofundar.aprofundar(self.out, ruim, [TABELA])
        self.assertFalse(r['ok'])
        errs = '\n'.join(r['erros'])
        self.assertIn('"foo" não existe', errs)
        self.assertIn('nao-existe', errs)
        self.assertIn('inexistente', errs)
        self.assertIn('12.34', errs)
        self.assertIn('sem `bind`', errs)
        self.assertFalse(os.path.exists(os.path.join(self.out, 'det-ruim.json')))
        with open(os.path.join(self.out, 'data.json'), encoding='utf-8') as f:
            det = next((p for p in json.load(f)['pages'] if p['id'] == 'detalhamentos'), None)
        self.assertFalse(det and any(s['id'] == 'det-ruim' for s in det['sections']))


if __name__ == '__main__':
    unittest.main()
