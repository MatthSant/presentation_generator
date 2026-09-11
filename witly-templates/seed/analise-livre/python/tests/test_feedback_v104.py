"""Feedback de uso do kit v1.0.4 (11/09): filtro validado, card/destaque vivos, seletor inline,
dinheiro exato, tabela rotulada/escala/ordem, curva e eixos, funil em razão, autoria do
consultor, chrome e css/js extra — o que o relatorio.py passou a garantir."""
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PY = os.path.dirname(HERE)
sys.path.insert(0, PY)
from relatorio import Relatorio  # noqa: E402


def base():
    R = Relatorio(client='x', client_name='X', title='X · teste', chrome={'atalho': False, 'sidebar': 'fechada'})
    R.tabela('q-dc', ['dia', 'canal'], [
        {'dia': '01', 'canal': 'fb', 'leads': 10, 'invest': 80.0}, {'dia': '01', 'canal': 'ig', 'leads': 20, 'invest': 100.0},
        {'dia': '02', 'canal': 'fb', 'leads': 12, 'invest': 84.0}, {'dia': '02', 'canal': 'ig', 'leads': 18, 'invest': 108.0},
    ], filters=['canal'])
    R.tabela('q-canal', ['canal'], [{'canal': 'fb', 'leads': 22, 'cpl': 7.45}, {'canal': 'ig', 'leads': 38, 'cpl': 5.47}, {'canal': 'Geral', 'leads': 60, 'cpl': 6.2}])
    return R


class Filtros(unittest.TestCase):
    def test_opcoes_batem_com_os_valores_reais(self):
        R = base(); R.filtro('canal', 'Canal', todos='Todos')
        s = R.pagina('p', 'P').secao('s01', 'B', 'T'); s.seletor('canal', 'Canal'); s.kpi('Leads', 60, 'int')
        r = R.montar()
        self.assertEqual(r['data']['meta']['filters'], [{'id': 'canal', 'label': 'Canal', 'options': ['fb', 'ig'], 'allValue': 'Todos', 'default': 'Todos'}])
        self.assertEqual(r['data']['meta']['chrome'], {'atalho': False, 'sidebar': 'fechada'})
        sel = [w for w in r['sections']['s01']['widgets'] if w['type'] == 'filter-seg'][0]
        self.assertEqual(sel['filter'], 'canal')

    def test_rotulo_divergente_entre_tabelas_falha(self):
        R = base()
        R.tabela('q-outra', ['canal'], [{'canal': 'fb', 'x': 1}, {'canal': 'ig (novo)', 'x': 2}], filters=['canal'])
        R.filtro('canal', 'Canal')
        R.pagina('p', 'P').secao('s01', 'B', 'T').kpi('Leads', 60, 'int')
        with self.assertRaisesRegex(ValueError, 'q-outra.*faltam.*ig.*sobram.*ig \\(novo\\)'):
            R.montar()

    def test_seletor_sem_filtro_declarado_e_recusado(self):
        s = base().pagina('p', 'P').secao('s01', 'B', 'T')
        with self.assertRaises(ValueError):
            s.seletor('canal')


class Vivos(unittest.TestCase):
    def test_kpi_e_destaque_com_bind(self):
        R = base(); R.filtro('canal', 'Canal', todos='Todos')
        s = R.pagina('p', 'P').secao('s01', 'B', 'T')
        s.kpi('CPL', 6.2, 'money', meta=6.0, invert=True, bind={'dataset': 'q-dc', 'ratio': ('invest', 'leads')})
        s.kpi('Leads', 60, 'int', bind={'dataset': 'q-canal', 'metric': 'leads', 'exclude': {'canal': 'Geral'}})
        s.destaque('CPL de {cpl} no recorte.', bind={'dataset': 'q-dc'}, vars={'cpl': {'ratio': ('invest', 'leads'), 'fmt': 'money'}})
        ws = R.montar()['sections']['s01']['widgets']
        cpl, leads, hl = ws[0], ws[1], ws[2]
        self.assertEqual(cpl['bind'], {'dataset': 'q-dc'}); self.assertEqual(cpl['ratio'], ['invest', 'leads'])
        self.assertEqual((cpl['fmt'], cpl['metaValue'], cpl['invert']), ('money', 6.0, True))
        self.assertEqual(leads['bind'], {'dataset': 'q-canal', 'exclude': {'canal': 'Geral'}}); self.assertEqual(leads['metric'], 'leads')
        self.assertEqual(hl['vars'], {'cpl': {'fmt': 'money', 'ratio': ['invest', 'leads']}})
        with self.assertRaises(ValueError):
            s.kpi('x', 1, 'int', bind={'dataset': 'q-dc', 'metric': 'nao-existe'})


class Acabamento(unittest.TestCase):
    def test_dinheiro_exato_tabela_grafico_funil(self):
        R = base()
        s = R.pagina('p', 'P').secao('s01', 'B', 'T')
        s.kpi('Receita', 2350.0, 'money', formato='exato')
        s.tabela('Por canal', 'q-canal', ['canal', 'leads', 'cpl'], colunas={'cpl': 'CPL'}, escala={'cpl': (6.0, True)}, ordem='desc')
        s.grafico('line', 'x', 'q-dc', x='dia', y='leads', curva='reta', eixo_x='Dia', eixo_y='Leads')
        s.grafico('bar', 'y', 'q-dc', x='dia', y=['leads', 'invest'], comparar=True)
        s.funil('Custo à receita', [('Investimento', 372), ('Mensagens', 60), ('Compradores', 6), ('Receita', 2982)], transicao={0: 'msgs por R$', -1: 'R$ por comprador'})
        ws = R.montar()['sections']['s01']['widgets']
        self.assertEqual(ws[0]['value'], 'R$ 2.350,00')
        t = ws[1]
        self.assertEqual(t['labels'], {'cpl': 'CPL'}); self.assertEqual(t['escala'], {'cpl': {'alvo': 6.0, 'menor': True}}); self.assertEqual(t['sort'], {'col': 'canal', 'dir': 'desc'})
        g = ws[2]
        self.assertEqual(g['curve'], 'straight'); self.assertEqual(g['options']['xaxis']['title'], {'text': 'Dia'})
        self.assertNotIn('showLabels', g)                       # rótulo dentro da barra é padrão só em barras
        m = ws[3]
        self.assertEqual((m['chartType'], m['seriesTypes'], m['secondaryAxis'], m.get('showLabels')), ('mixed', ['bar', 'line'], 1, None))   # misto: sem rótulo dentro da barra
        f = ws[4]
        self.assertEqual(f['transitions'][0]['note'], '0,16 msgs por R$')
        self.assertIn('migrate', f['transitions'][1])
        self.assertEqual(f['transitions'][2]['note'], 'R$ 497,00 R$ por comprador')
        with self.assertRaises(ValueError):
            s.grafico('line', 'z', 'q-dc', x='dia', y='leads', curva='ondulada')

    def test_autoria_do_consultor_e_extras(self):
        R = base()
        s = R.pagina('p', 'P').secao('s01', 'B', 'T')
        s.kpi('Leads', 60, 'int')
        s.achado('Alavanca', 'ok', 'Quente segurou', 'CPL caiu 3,14 com 999 leads a mais', autoria='consultor')   # números não estão em tabela
        R.css_extra('.kc{border-radius:0}'); R.js_extra("console.log('x')")
        out = os.path.join(tempfile.mkdtemp(), 'saida')
        r = R.gravar(out)
        self.assertTrue(r['ok'])
        html = open(os.path.join(out, 'relatorio.html'), encoding='utf-8').read()
        self.assertIn('<style id="extra-css">.kc{border-radius:0}</style>', html)
        self.assertIn('<script id="extra-js">console.log(\'x\')</script>', html)
        meta = json.load(open(os.path.join(out, 'data.json'), encoding='utf-8'))['meta']
        self.assertEqual(meta['extra']['css'], '.kc{border-radius:0}')
        # sem autoria, o mesmo texto não grava
        R2 = base(); s2 = R2.pagina('p', 'P').secao('s01', 'B', 'T'); s2.kpi('Leads', 60, 'int')
        s2.achado('Alavanca', 'ok', 'Quente segurou', 'CPL caiu 3,14 com 999 leads a mais')
        with self.assertRaises(SystemExit):
            R2.gravar(os.path.join(tempfile.mkdtemp(), 'saida'))


if __name__ == '__main__':
    unittest.main()
