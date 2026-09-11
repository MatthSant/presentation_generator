#!/usr/bin/env python3
"""make_fixture_csv — dump SINTÉTICO (sem dado de cliente) para o exemplo e os testes:
14 dias × 2 canais × 2 temperaturas, uma linha por combinação, já agregado."""
import csv
import os
import random

HEADER = ['dia', 'canal', 'temperatura', 'invest', 'impressoes', 'cliques', 'leads', 'respostas', 'mqls', 'vendas', 'faturamento']


def linhas(seed=7):
    rnd = random.Random(seed)
    out = []
    for d in range(1, 15):
        dia = f'2026-08-{d:02d}'
        for canal, base in (('facebook', 60), ('instagram', 40)):
            for temp, fator in (('quente', 1.0), ('frio', 0.6)):
                leads = int(base * fator * (1 + 0.04 * d) * rnd.uniform(0.85, 1.15))
                invest = round(leads * (7.0 if canal == 'facebook' else 5.2) * (1.25 if temp == 'frio' else 1.0) * (1 + 0.02 * d), 2)
                imp = int(invest / 12.0 * 1000)
                cli = int(imp * (0.018 if canal == 'facebook' else 0.024))
                resp = int(leads * 0.55)
                mqls = int(resp * (0.62 if temp == 'quente' else 0.45))
                vendas = int(leads * (0.08 if temp == 'quente' else 0.045))
                fat = round(vendas * 497.0, 2)
                out.append([dia, canal, temp, invest, imp, cli, leads, resp, mqls, vendas, fat])
    return out


def write(path):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow(HEADER)
        w.writerows(linhas())
    return path


if __name__ == '__main__':
    print(write(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixture.csv')))
