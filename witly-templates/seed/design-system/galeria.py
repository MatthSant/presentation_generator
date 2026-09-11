#!/usr/bin/env python3
"""galeria — gera os ELEMENTOS do design system: para cada chamada do relatorio.py, o widget que
ela produz, o layout e os dados de exemplo. Um JSON por elemento em elementos/<id>.json.

    python seed/design-system/galeria.py [--out seed/design-system/elementos]

A chamada (`call`) é ao mesmo tempo a documentação e o código: é executada aqui com `s` (a seção)
e `R` (o relatório) no escopo. Depois do seed, os elementos são editáveis na UI e versionados."""
import argparse
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))                       # witly-templates/
sys.path.insert(0, os.path.join(ROOT, 'seed', '_shared'))             # relatorio.py
sys.path.insert(0, os.path.join(os.path.dirname(ROOT), 'app', 'pysrc'))   # common/
from relatorio import Relatorio  # noqa: E402

# dado sintético compartilhado pelos elementos (sem cliente)
TABELAS = {
    'q-canal': (['canal'], [
        {'canal': 'facebook', 'leads': 1704, 'invest': 15132.0, 'cpl': 8.88, 'qualif': 54.0, 'conv': 5.6, 'vendas': 95},
        {'canal': 'instagram', 'leads': 1128, 'invest': 7449.0, 'cpl': 6.6, 'qualif': 53.6, 'conv': 5.9, 'vendas': 67},
        {'canal': 'Geral', 'leads': 2832, 'invest': 22581.0, 'cpl': 7.97, 'qualif': 53.8, 'conv': 5.7, 'vendas': 162},
    ]),
    'q-dia': (['dia'], [
        {'dia': f'{d:02d}/08', 'leads': 160 + 9 * d, 'invest': 1300.0 + 60 * d, 'cpl': round(8.1 + 0.05 * d, 2), 'vendas': 9 + d // 2}
        for d in range(1, 15)
    ]),
    'q-dia-canal': (['dia', 'canal'], [
        {'dia': f'{d:02d}/08', 'canal': c, 'leads': (90 if c == 'facebook' else 70) + 5 * d, 'invest': (800.0 if c == 'facebook' else 460.0) + 30 * d, 'respostas': (50 if c == 'facebook' else 40) + 3 * d}
        for d in range(1, 15) for c in ('facebook', 'instagram')
    ]),
    'q-temp': (['temperatura'], [
        {'temperatura': 'quente', 'leads': 1780, 'cpl': 7.1, 'conv': 8.0},
        {'temperatura': 'frio', 'leads': 1052, 'cpl': 9.4, 'conv': 4.5},
        {'temperatura': 'Geral', 'leads': 2832, 'cpl': 7.97, 'conv': 5.7},
    ]),
}

GRUPOS = [('numeros', 'Números'), ('graficos', 'Gráficos e tabelas'), ('funil', 'Funil e listas'), ('narrativa', 'Narrativa')]

# (id, grupo, título, descrição, chamada)
ELEMENTOS = [
    ('kpi', 'numeros', 'KPI', 'Card `feature`: rótulo, valor formatado pelo builder, sub. O número entra como número.',
     "s.kpi('Leads', 2832, 'int', sub='pago 60% · org 40%')"),
    ('kpi-meta', 'numeros', 'KPI com meta', 'Com `meta=` o card ganha o rodapé "Meta X · ±% ✓" (semáforo: ok ≤ 1%, atenção ≤ 10%, ruim > 10%).',
     "s.kpi('Vendas', 162, 'int', sub='no período', meta=130)"),
    ('kpi-custo', 'numeros', 'KPI de custo (invertido)', 'Custo: menor é melhor → `invert=True`. Aqui o CPL está acima da meta: ruim.',
     "s.kpi('CPL', 7.97, 'money', meta=6.5, invert=True, info='investimento ÷ leads')"),
    ('kpi-icone', 'numeros', 'KPI com ícone e cor', 'Ícone e cor do token para os indicadores globais (coin, database, bolt, circle-check…).',
     "s.kpi('Faturamento', 80514.0, 'money', sub='162 vendas', icon='coin', color='#3B6D11', meta=64000.0)"),
    ('kpi-emph', 'numeros', 'KPI em destaque', '`emph=True`: fundo roxo para a métrica-chave da zona (uma por zona).',
     "s.kpi('ROAS', 3.57, 'x', sub='faturamento ÷ investimento', icon='bolt', color='#EF9F27', emph=True)"),
    ('kpi-vivo', 'numeros', 'KPI vivo (recalcula no filtro)', 'Com `bind`, o card refaz o valor e o rodapé de meta nas linhas filtradas: `ratio` = Σ num ÷ Σ den (custo/taxa), `metric` = soma. Use com o seletor abaixo.',
     "s.kpi('CPL', 8.13, 'money', meta=7.0, invert=True, bind={'dataset': 'q-dia-canal', 'ratio': ('invest', 'leads')})"),
    ('kpi-exato', 'numeros', 'KPI em dinheiro exato', '`formato=\'exato\'`: R$ 2.350,00 em vez de R$ 2k — quando cards vizinhos diferem em centenas.',
     "s.kpi('Receita', 2350.0, 'money', formato='exato', sub='no período')"),
    ('kpi-hist', 'numeros', 'KPI com meta e histórico', 'Com `hist=` o rodapé alterna Meta ↔ Hist pelo controle de comparação do relatório.',
     "s.kpi('Qualificação', 53.8, 'pct', sub='MQLs ÷ respostas', meta=55.0, hist=49.2)"),
    ('banda', 'numeros', 'Banda de atingimento', '"realizado / meta" com a pill de %. Para metas de volume e receita, no topo do Panorama.',
     "s.banda('Atingimento · Leads', real=2832, meta=1900)"),
    ('comparativo', 'numeros', 'Comparativo realizado × meta', 'Barras de atingimento por indicador (meta-bars), na ordem do funil.',
     "s.comparativo([{'label': 'Leads', 'real': 2832, 'meta': 1900}, {'label': 'CPL', 'real': 7.97, 'meta': 6.5, 'fmt': 'money', 'invert': True}, {'label': 'Vendas', 'real': 162, 'meta': 130}, {'label': 'Faturamento', 'real': 80514.0, 'meta': 64000.0, 'fmt': 'money'}])"),
    ('grafico-bar', 'graficos', 'Barras por dimensão', 'Gráfico por `bind`: x = dimensão, y = métrica. `fmt` formata eixo e tooltip.',
     "s.grafico('bar', 'CPL por canal', 'q-canal', x='canal', y='cpl', fmt='money')"),
    ('grafico-bar-2', 'graficos', 'Duas séries', '`y` em lista = duas séries no mesmo gráfico (unidades compatíveis).',
     "s.grafico('bar', 'Leads e vendas por canal', 'q-canal', x='canal', y=['leads', 'vendas'], fmt='int')"),
    ('grafico-linha', 'graficos', 'Linha no tempo', 'Série diária; `largo=True` ocupa a linha inteira (12×6). `curva=\'reta\'|\'suave\'` (sem isto: reta a partir de 50 pontos); `eixo_x`/`eixo_y` nomeiam os eixos.',
     "s.grafico('line', 'CPL por dia', 'q-dia', x='dia', y='cpl', fmt='money', largo=True, curva='reta', eixo_x='Dia', eixo_y='CPL (R$)')"),
    ('grafico-comparar', 'graficos', 'Duas métricas: barra + linha', '`comparar=True` com y=[a, b]: a primeira em barras, a segunda em linha no eixo da direita.',
     "s.grafico('bar', 'Leads e CPL por dia', 'q-dia', x='dia', y=['leads', 'cpl'], comparar=True, fmt='int')"),
    ('grafico-donut', 'graficos', 'Donut', 'Participação por dimensão; o total no centro.',
     "s.grafico('donut', 'Leads por temperatura', 'q-temp', x='temperatura', y='leads', fmt='int', donutTotal=True)"),
    ('seletor', 'narrativa', 'Seletor de filtro inline', 'O mesmo filtro do FAB, como toggle na seção; "Todos" volta ao início. Declare o filtro com R.filtro(id, label, todos=...).',
     "s.seletor('canal', 'Canal')"),
    ('tabela-escala', 'graficos', 'Tabela com rótulos e escala vs alvo', '`colunas` rotula o cabeçalho; `escala` pinta o fundo em 5 degraus contra o alvo (True = menor é melhor); `ordem=\'desc\'` põe o maior primeiro.',
     "s.tabela('Por canal', 'q-canal', ['canal', 'leads', 'cpl', 'conv'], colunas={'canal': 'Canal', 'leads': 'Leads', 'cpl': 'CPL', 'conv': 'Conversão'}, escala={'cpl': (7.0, True), 'conv': (6.0, False)}, ordem='desc')"),
    ('tabela', 'graficos', 'Tabela', 'Tabela por `bind` com as colunas escolhidas; `sub` explica a linha Geral.',
     "s.tabela('Resultado por canal', 'q-canal', ['canal', 'leads', 'invest', 'cpl', 'qualif', 'conv', 'vendas'], sub='linha Geral = soma; taxas e custos ponderados')"),
    ('evolucao', 'graficos', 'Métricas no tempo', 'Seletor de métrica (barras) × segunda métrica (linha), por dia.',
     "s.evolucao('Métricas no tempo', 'q-dia', 'dia', [('leads', 'Leads', 'int'), ('invest', 'Investimento', 'money'), ('cpl', 'CPL', 'money'), ('vendas', 'Vendas', 'int')], current='leads', current2='cpl')"),
    ('funil', 'funil', 'Funil', 'Etapas com taxa de passagem e perda; com `bench=` marca o MAIOR FURO relativo.',
     "s.funil('Geral', [('Leads', 2832), ('Respostas', 1529), ('MQLs', 824), ('Vendas', 162)], bench=[50.0, 55.0, 6.5])"),
    ('funil-razao', 'funil', 'Funil com transição em razão', 'Nas pontas (custo → volume, volume → receita) a transição não é %: `transicao={0: \'msgs por R$\', -1: \'R$ por comprador\'}` mostra a razão.',
     "s.funil('Do custo à receita', [('Investimento', 22581), ('Mensagens', 2832), ('Compradores', 162), ('Receita', 80514)], transicao={0: 'msgs por R$', -1: 'R$ por comprador'})"),
    ('funil-compacto', 'funil', 'Funil compacto', 'Metade da altura, taxa ao lado da barra: para caber ao lado de outro bloco.',
     "s.funil('Tráfego', [('Impressões', 1881000), ('Cliques', 37565), ('Leads', 2832)], compact=True, base_label='bench')"),
    ('barras', 'funil', 'Lista de barras', 'Proporção entre itens de uma dimensão, com o valor ao lado.',
     "s.barras('Leads por canal', [('facebook', 1704), ('instagram', 1128)], w=4, h=4)"),
    ('eyebrow', 'narrativa', 'Eyebrow', 'Abre uma zona: título em caixa alta + caption com o que a zona responde.',
     "s.eyebrow('INDICADORES GLOBAIS', 'resultado macro do período')"),
    ('destaque', 'narrativa', 'Destaque (resposta)', 'A resposta em uma frase, com o número decisivo — o primeiro bloco da página da pergunta.',
     "s.destaque('Instagram captou a R$ 6,60 por lead contra R$ 8,88 do Facebook; o geral fechou em R$ 7,97.')"),
    ('achado', 'narrativa', 'Achado em card', 'Tag + tom (ok/warn/bad/n) + título que afirma + detalhe que cita a tabela.',
     "s.achado('Resposta', 'ok', 'Instagram é o canal mais barato', 'CPL de R$ 6,60 com 1.128 leads: volume suficiente para receber verba (tabela Resultado por canal).')"),
    ('achado-warn', 'narrativa', 'Achado de cuidado', 'Tom `warn` para o "sim, mas": o que a resposta não cobre.',
     "s.achado('Cuidado', 'warn', 'Custo não é tudo', 'Qualificação de 53.6% no Instagram contra 54.0% no Facebook: compare o CPMQL antes de mover verba.')"),
    ('achado-largo', 'narrativa', 'Alavanca / gargalo (largo)', 'Dois achados 6×4 no One Pager: o que puxou e o que segurou.',
     "s.achado('Segurou', 'bad', 'Frio caro e pouco convertido', 'O frio custa R$ 9,40 por lead e converte 4.5%: é onde a verba rende menos hoje.', w=6, h=4)"),
    ('acao', 'narrativa', 'Ação (FCA-R)', 'Ação numerada: título = a ação, por quê = o fato, acionável = o passo com critério.',
     "s.acao(1, 'Mover verba para o Instagram', 'menor CPL com volume real', 'subir 20% da verba do Facebook por 3 dias e comparar CPL e CPMQL')"),
    ('nota', 'narrativa', 'Nota', 'Nota de rodapé: janela, fonte, ressalva.',
     "s.nota('Janela: 14 dias até 14/08; dado fechado no dia seguinte. Base sem pageviews: conversão de página = leads ÷ cliques.')"),
]


def gerar(eid, grupo, title, desc, call):
    R = Relatorio(client='galeria', client_name='Galeria', title='Galeria do design system')
    for nome, (dims, rows) in TABELAS.items():
        R.tabela(nome, dims, rows, filters=['canal'] if nome == 'q-dia-canal' else None)
    R.filtro('canal', 'Canal', todos='Todos')
    s = R.pagina(grupo, dict(GRUPOS)[grupo]).secao(f'el-{eid}', dict(GRUPOS)[grupo], title, desc)
    exec(call, {'s': s, 'R': R})          # a chamada documentada é a executada
    usados = {w['bind']['dataset'] for w in s.widgets if isinstance(w.get('bind'), dict)}
    if any(w.get('type') == 'filter-seg' for w in s.widgets):
        usados.add('q-dia-canal')
    for w in s.widgets:
        if w.get('type') == 'evolution-picker':
            usados.add('q-dia')
    return {'id': eid, 'grupo': grupo, 'title': title, 'desc': desc, 'call': call,
            'widgets': s.widgets, 'layout': s.grid.items,
            'dataset': {n: {'dims': TABELAS[n][0], 'filters': ['canal'] if n == 'q-dia-canal' else [], 'rows': TABELAS[n][1]} for n in sorted(usados)},
            'filters': [{'id': 'canal', 'label': 'Canal', 'options': ['facebook', 'instagram'], 'allValue': 'Todos', 'default': 'Todos'}] if 'q-dia-canal' in usados else []}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(HERE, 'elementos'))
    a = ap.parse_args(argv)
    if os.path.isdir(a.out):
        shutil.rmtree(a.out)
    os.makedirs(a.out)
    for i, (eid, grupo, title, desc, call) in enumerate(ELEMENTOS):
        el = gerar(eid, grupo, title, desc, call)
        el['sort'] = i
        with open(os.path.join(a.out, f'{eid}.json'), 'w', encoding='utf-8') as f:
            json.dump(el, f, ensure_ascii=False, indent=1)
    print(f'{len(ELEMENTOS)} elementos → {a.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
