#!/usr/bin/env python3
"""build — EXEMPLO de composição de uma análise livre no design system dos templates.

    python exemplo/build.py --csv dump.csv --out saida/         (o seu dado)
    python exemplo/build.py --fixture --out saida/              (dado sintético, para ver o resultado)

Três páginas, como um debriefing enxuto: Panorama (metas + volume + no tempo + comparativo),
Canais (a pergunta em si: gráfico, tabela, achados) e One Pager (KPIs + funil + alavancas +
ações). Copie, troque a pergunta, mantenha o esqueleto.
"""
import argparse
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))   # python/ (relatorio, common, gerar, aprofundar)
sys.path.insert(0, HERE)
from relatorio import Relatorio, money, pctf  # noqa: E402
import calc_livre  # noqa: E402

# metas que o consultor deu (tarefa "objetivo"); sem meta, os cards saem sem rodapé
METAS = {'leads': 1900, 'vendas': 130, 'faturamento': 64000.0, 'cpl': 6.5, 'conv': 6.5, 'qualif': 55.0, 'taxa_resp': 50.0}


def montar(csv_path, client='fixture', client_name='Cliente Fixture', campanha='LF ago/26'):
    T = calc_livre.calcular(csv_path)
    tot = calc_livre.totais(T)
    canais = [r for r in T['q-canal']['rows'] if r['canal'] != 'Geral']
    melhor = min(canais, key=lambda r: r['cpl'] or 9e9)
    pior = max(canais, key=lambda r: r['cpl'] or 0)

    R = Relatorio(client=client, client_name=client_name, title=f'{client_name} · CPL por canal', campaign_label=campanha,
                  pergunta='Qual canal captou mais barato e vale receber verba?', decisao='realocar verba entre canais na próxima semana',
                  chrome={'atalho': False, 'trocar': False})   # o HTML vai ao cliente: sem ⌘K nem chevron de trocar análise
    for nome, t in T.items():
        R.tabela(nome, t['dims'], t['rows'], filters=t.get('filters'))
    # filtro de canal: opções conferidas contra os valores reais da tabela que o declara
    R.filtro('canal', 'Canal', todos='Todos')
    VIVO = {'dataset': 'q-dia-canal'}   # os cards abaixo recalculam no filtro (razão de somas, nunca soma de linhas)

    # ── Panorama ─────────────────────────────────────────────────────────
    p = R.pagina('panorama', 'Panorama')
    s = p.secao('s01', 'Panorama', f'{client_name} · {campanha}', 'a captação em números: metas, volume e o que mudou no tempo')
    s.seletor('canal', 'Canal')
    s.eyebrow('ATINGIMENTO', 'realizado vs meta da campanha')
    s.banda('Atingimento · Leads', tot['leads'], METAS['leads'])
    s.banda('Atingimento · Vendas', tot['vendas'], METAS['vendas'])
    s.eyebrow('INDICADORES GLOBAIS', 'resultado macro')
    s.kpi('Faturamento', tot['faturamento'], 'money', sub=f'{int(tot["vendas"])} vendas', icon='coin', color='#3B6D11', meta=METAS['faturamento'])
    s.kpi('Investimento', tot['invest'], 'money', sub='mídia de captação', icon='database', color='#534AB7')
    s.kpi('ROAS', tot['roas'], 'x', sub='faturamento ÷ investimento', icon='bolt', color='#EF9F27', emph=True)
    s.kpi('Conversão', tot['conv'], 'pct', sub='vendas ÷ leads', icon='circle-check', color='#3B6D11', meta=METAS['conv'])
    s.eyebrow('INDICADORES DE VOLUME', '8 métricas')
    s.kpi('Leads', tot['leads'], 'int', meta=METAS['leads'], bind={**VIVO, 'metric': 'leads'})
    s.kpi('CPL', tot['cpl'], 'money', meta=METAS['cpl'], invert=True, info='investimento ÷ leads', bind={**VIVO, 'ratio': ('invest', 'leads')})
    s.kpi('Taxa de resposta', tot['taxa_resp'], 'pct', meta=METAS['taxa_resp'], bind={**VIVO, 'ratio': ('respostas', 'leads'), 'mult': 100})
    s.kpi('Qualificação', tot['qualif'], 'pct', sub='MQLs ÷ respostas', meta=METAS['qualif'], bind={**VIVO, 'ratio': ('mqls', 'respostas'), 'mult': 100})
    s.kpi('CPMQL', tot['cpmql'], 'money', info='CPL ÷ qualificação', invert=True, bind={**VIVO, 'ratio': ('invest', 'mqls')})
    s.kpi('CTR', tot['ctr'], 'pct', sub='cliques ÷ impressões')
    s.kpi('CPM', tot['cpm'], 'money', invert=True)
    s.kpi('Vendas', tot['vendas'], 'int', meta=METAS['vendas'])
    s.eyebrow('COMPARATIVO — REALIZADO vs META', 'na ordem do funil')
    s.comparativo([
        {'label': 'Investimento', 'real': tot['invest'], 'fmt': 'money'},
        {'label': 'Leads', 'real': tot['leads'], 'meta': METAS['leads']},
        {'label': 'CPL', 'real': tot['cpl'], 'meta': METAS['cpl'], 'fmt': 'money', 'invert': True},
        {'label': 'Qualificação', 'real': tot['qualif'], 'meta': METAS['qualif'], 'fmt': 'pct'},
        {'label': 'Vendas', 'real': tot['vendas'], 'meta': METAS['vendas']},
        {'label': 'Faturamento', 'real': tot['faturamento'], 'meta': METAS['faturamento'], 'fmt': 'money'},
    ])
    s.eyebrow('MÉTRICAS NO TEMPO', 'qualquer métrica × métrica, por dia')
    s.evolucao('Métricas no tempo', 'q-dia', 'dia',
               [('leads', 'Leads', 'int'), ('invest', 'Investimento', 'money'), ('cpl', 'CPL', 'money'), ('vendas', 'Vendas', 'int'),
                ('faturamento', 'Faturamento', 'money'), ('conv', 'Conversão', 'pct'), ('qualif', 'Qualificação', 'pct')],
               current='leads', current2='cpl')

    # ── Canais (a pergunta) ─────────────────────────────────────────────
    p = R.pagina('canais', 'Canais')
    s = p.secao('s02', 'Canais', 'Qual canal captou mais barato?', 'CPL, qualificação e conversão por canal, com o volume ao lado')
    s.destaque(f'{melhor["canal"].title()} captou a {money(melhor["cpl"])} por lead contra {money(pior["cpl"])} do {pior["canal"].title()}; '
               f'o geral fechou em {money(tot["cpl"])}.')
    s.eyebrow('CUSTO E QUALIDADE POR CANAL')
    s.grafico('bar', 'CPL por canal', 'q-canal', x='canal', y='cpl', fmt='brl')
    s.grafico('bar', 'Qualificação por canal', 'q-canal', x='canal', y='qualif', fmt='pct')
    s.tabela('Resultado por canal', 'q-canal', ['canal', 'leads', 'invest', 'cpl', 'taxa_resp', 'qualif', 'cpmql', 'vendas', 'conv'],
             sub='linha Geral = soma; taxas e custos ponderados',
             colunas={'canal': 'Canal', 'leads': 'Leads', 'invest': 'Investimento', 'cpl': 'CPL', 'taxa_resp': 'Resposta', 'qualif': 'Qualificação', 'cpmql': 'CPMQL', 'vendas': 'Vendas', 'conv': 'Conversão'},
             escala={'cpl': (METAS['cpl'], True), 'conv': (METAS['conv'], False)})
    s.eyebrow('POR TEMPERATURA', 'quente × frio')
    s.grafico('bar', 'CPL por temperatura', 'q-temp', x='temperatura', y='cpl', fmt='brl', eixo_y='CPL (R$)')
    s.grafico('bar', 'Conversão por temperatura', 'q-temp', x='temperatura', y='conv', fmt='pct', eixo_y='Conversão (%)')
    s.eyebrow('LEADS POR DIA E CANAL', 'responde ao seletor de canal lá em cima')
    s.grafico('line', 'Leads por dia', 'q-dia-canal', x='dia', y='leads', fmt='int', largo=True, curva='reta', eixo_x='Dia')
    s.eyebrow('O QUE ISSO DIZ')
    s.achado('Resposta', 'ok', f'{melhor["canal"].title()} é o canal mais barato',
             f'CPL de {money(melhor["cpl"])} com {int(melhor["leads"])} leads: volume suficiente para receber verba (tabela Resultado por canal).')
    s.achado('Cuidado', 'warn', 'Custo não é tudo',
             f'Qualificação de {pctf(melhor["qualif"])} no {melhor["canal"].title()} contra {pctf(pior["qualif"])} no {pior["canal"].title()}: compare o CPMQL antes de mover verba.')
    s.achado('Contexto', 'n', 'Frio custa mais e converte menos',
             'A diferença entre temperaturas é maior que a diferença entre canais (gráficos acima): a decisão de verba é por temperatura primeiro.')

    # ── One Pager ───────────────────────────────────────────────────────
    p = R.pagina('onepager', 'One Pager')
    s = p.secao('s03', 'One Pager', 'One Pager', 'uma tela para quem não abre as outras páginas')
    s.eyebrow('INDICADORES', 'os mesmos do Panorama')
    s.kpi('Leads', tot['leads'], 'int', meta=METAS['leads'])
    s.kpi('CPL', tot['cpl'], 'money', meta=METAS['cpl'], invert=True)
    s.kpi('Vendas', tot['vendas'], 'int', meta=METAS['vendas'])
    s.kpi('ROAS', tot['roas'], 'x', emph=True)
    s.eyebrow('PIPELINE DE CONVERSÃO')
    s.funil('Geral', [('Leads', tot['leads']), ('Respostas', tot['respostas']), ('MQLs', tot['mqls']), ('Vendas', tot['vendas'])],
            bench=[METAS['taxa_resp'], METAS['qualif'], METAS['conv']], compact=True)
    s.funil('Tráfego', [('Impressões', tot['impressoes']), ('Cliques', tot['cliques']), ('Leads', tot['leads'])], compact=True, base_label='bench')
    s.barras('Leads por canal', [(r['canal'], r['leads']) for r in canais], w=4, h=5)
    s.eyebrow('ALAVANCAS E GARGALOS')
    s.achado('Puxou', 'ok', 'Quente segurou o CPL', 'O CPL do quente ficou abaixo do frio e a conversão, acima (página Canais).', w=6, h=4)
    s.achado('Segurou', 'bad', 'Frio caro e frio pouco convertido', 'O frio custa mais por lead e converte menos: é onde a verba rende menos hoje.', w=6, h=4)
    s.eyebrow('AÇÕES')
    s.acao(1, f'Mover verba para o {melhor["canal"].title()}', 'menor CPL com volume real',
           'subir 20% da verba do canal mais caro por 3 dias e comparar CPL e CPMQL')
    s.acao(2, 'Reduzir o frio antes de cortar canal', 'a temperatura explica mais que o canal',
           'pausar os conjuntos frios com CPMQL acima da meta; manter os quentes')
    s.acao(3, 'Reler em 3 dias', 'volume de 3 dias é a menor janela que decide',
           'rodar este relatório de novo com o dump atualizado e registrar o aprofundamento')
    return R


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--csv', help='dump agregado (dia, canal, temperatura, invest, impressoes, cliques, leads, respostas, mqls, vendas, faturamento)')
    ap.add_argument('--fixture', action='store_true', help='usa o dado sintético do exemplo')
    ap.add_argument('--out', required=True)
    a = ap.parse_args(argv)
    if a.fixture or not a.csv:
        import make_fixture_csv
        a.csv = make_fixture_csv.write(os.path.join(tempfile.mkdtemp(), 'fixture.csv'))
    r = montar(a.csv).gravar(a.out)
    print(r)
    return 0


if __name__ == '__main__':
    sys.exit(main())
