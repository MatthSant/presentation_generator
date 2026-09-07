"""make_fixture — dump multidimensional SINTÉTICO de conversão por perfil (sem dado de cliente).

3 critérios (renda_mensal × idade × genero) × 4 lançamentos × 2 canais.
Taxa base 2 %, multiplicada por renda (0.5 / 1 / 2), idade (0.8 / 1 / 1.2) e canal (Pago 0.8 / Orgânico 1.2);
gênero não muda a taxa (critério irrelevante de propósito). Janela longa = 1.6× a curta.
Linhas de benchmark total (dimensões vazias) com 3× os leads e taxa 1 %.
Esperado: renda 'Acima de R$ 10.000' consistente (4/4), 'Até R$ 3.000' crítico (0/4); gênero com diff ~0.
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
COLS = ['field_conversion', 'tipo_trafego', 'renda_mensal', 'idade', 'genero', 'total_leads', 'vendas_lancamento', 'vendas_6meses', 'vendas_12meses']
LCTOS = ['lcto-fixture-mar25', 'lcto-fixture-jul25', 'lcto-fixture-nov25', 'lcto-fixture-mar26']
LABELS = ['mar/25', 'jul/25', 'nov/25', 'mar/26']
RENDA = [('Até R$ 3.000', 0.5), ('R$ 3.000 a R$ 10.000', 1.0), ('Acima de R$ 10.000', 2.0)]
IDADE = [('18-29', 0.8), ('30-44', 1.0), ('45+', 1.2)]
GENERO = [('Feminino', 1.0), ('Masculino', 1.0)]
CANAL = [('Pago', 0.8, 120), ('Orgânico', 1.2, 80)]
BASE = 0.02
EXPECTED = {'labels': LABELS, 'best_renda': 'Acima de R$ 10.000', 'worst_renda': 'Até R$ 3.000',
            'leads_resp_lcto_geral': 18 * (120 + 80)}


def write(dir_=None):
    dir_ = dir_ or HERE
    path = os.path.join(dir_, 'fixture.csv')
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        for li, lcto in enumerate(LCTOS):
            for canal, cf, leads in CANAL:
                for r, rf in RENDA:
                    for i, idf in IDADE:
                        for g, gf in GENERO:
                            rate = BASE * rf * idf * gf * cf
                            v = round(leads * rate * 10) / 10   # fração: leads×taxa
                            vl = int(round(v)); v12 = int(round(v * 1.6))
                            w.writerow({'field_conversion': lcto, 'tipo_trafego': canal, 'renda_mensal': r, 'idade': i, 'genero': g,
                                        'total_leads': leads, 'vendas_lancamento': vl, 'vendas_6meses': int(round(v * 1.3)), 'vendas_12meses': v12})
                tot = 18 * leads * 3
                w.writerow({'field_conversion': lcto, 'tipo_trafego': canal, 'renda_mensal': '', 'idade': '', 'genero': '',
                            'total_leads': tot, 'vendas_lancamento': int(tot * 0.01), 'vendas_6meses': int(tot * 0.013), 'vendas_12meses': int(tot * 0.016)})
    return path


if __name__ == '__main__':
    print(write())
