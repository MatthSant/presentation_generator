"""make_fixture — pasta relatorio/ mínima e SINTÉTICA para testar o montar.py (sem dado de cliente)."""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROWS = [{'canal': 'facebook', 'leads': 120, 'invest': 900.0, 'cpl': 7.5},
        {'canal': 'instagram', 'leads': 80, 'invest': 400.0, 'cpl': 5.0},
        {'canal': 'Geral', 'leads': 200, 'invest': 1300.0, 'cpl': 6.5}]
EXPECTED = {'secoes': ['s01'], 'tabelas': ['q-cpl-canal'], 'cpl_geral': 6.5}


KIT = os.path.dirname(os.path.dirname(HERE))


def write(dir_=None):
    rel = os.path.join(dir_, 'relatorio') if dir_ else os.path.join(KIT, 'relatorio-exemplo')
    os.makedirs(rel, exist_ok=True)
    def wj(name, obj):
        with open(os.path.join(rel, name), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
    wj('meta.json', {'client': 'fixture', 'client_name': 'Cliente Fixture', 'title': 'Cliente Fixture · CPL por canal',
                     'pergunta': 'Qual canal tem o menor CPL?', 'decisao': 'realocar verba'})
    wj('dataset.json', {'q-cpl-canal': {'dims': ['canal'], 'filters': [], 'rows': ROWS}})
    wj('s01.json', {'id': 's01', 'header': {'badge': 'Panorama', 'title': 'Qual canal tem o menor CPL?', 'sub': 'janela: 3 dias até 06/09'},
                    'widgets': [
                        {'id': 'hl', 'type': 'highlight', 'text': 'O Instagram tem o menor CPL (R$ 5,0) contra R$ 7,5 do Facebook; o geral é R$ 6,5.', 'color': 'p'},
                        {'id': 'k1', 'type': 'kpi-card', 'title': 'CPL geral', 'value': 'R$ 6,5', 'sub': '200 leads', 'bind': {'dataset': 'q-cpl-canal', 'metrics': ['cpl']}},
                        {'id': 'c1', 'type': 'chart', 'chartType': 'bar', 'title': 'CPL por canal', 'bind': {'dataset': 'q-cpl-canal', 'x': 'canal', 'y': 'cpl'}, 'height': 260},
                        {'id': 'fn', 'type': 'find-note', 'text': 'Base de 200 leads (janela de 3 dias); a diferença entre os canais é a alavanca da realocação.'},
                    ]})
    return rel


def write_invalida(dir_):
    """Seção com número solto e bind errado, para o teste do validador."""
    rel = write(dir_)
    with open(os.path.join(rel, 's02.json'), 'w', encoding='utf-8') as f:
        json.dump({'id': 's02', 'header': {'badge': 'X', 'title': 'Inválida'}, 'widgets': [
            {'id': 'a', 'type': 'find-note', 'text': 'O CPL caiu para R$ 3,14 por lead em uma semana.'},
            {'id': 'b', 'type': 'chart', 'chartType': 'bar', 'title': 'x', 'bind': {'dataset': 'nao-existe', 'x': 'canal', 'y': 'cpl'}},
            {'id': 'c', 'type': 'grafico-magico', 'text': 'tipo inexistente'},
        ]}, f, ensure_ascii=False)
    return rel


if __name__ == '__main__':
    print(write())
