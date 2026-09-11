#!/usr/bin/env python3
"""calc_livre — EXEMPLO do cálculo de uma análise livre (só stdlib).

Lê um CSV agregado (uma linha por dia × canal × temperatura, sem dado pessoal) e devolve as
TABELAS que o relatório vai mostrar. É aqui que o número nasce: o build.py só compõe.

    python calc_livre.py dump.csv                → imprime as tabelas (JSON)
    from calc_livre import calcular; T = calcular('dump.csv')

Troque este arquivo pelo cálculo da SUA pergunta, mantendo o contrato: cada tabela é
{"dims": [...], "rows": [{...}]} com colunas numéricas cruas (o builder formata) e, quando
faz sentido, uma linha "Geral" calculada por SOMA (nunca por média de taxas).
"""
import csv
import json
import os
import sys
from collections import defaultdict

COLS = ('dia', 'canal', 'temperatura', 'invest', 'impressoes', 'cliques', 'leads', 'respostas', 'mqls', 'vendas', 'faturamento')


def ler(csv_path):
    with open(csv_path, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    out = []
    for r in rows:
        o = {'dia': r['dia'], 'canal': r['canal'], 'temperatura': r.get('temperatura') or 'n/c'}
        for k in COLS[3:]:
            try:
                o[k] = float(r.get(k) or 0)
            except ValueError:
                o[k] = 0.0
        out.append(o)
    return out


def _agg(rows, key):
    g = defaultdict(lambda: defaultdict(float))
    for r in rows:
        k = key(r)
        for m in COLS[3:]:
            g[k][m] += r[m]
    return g


def _razoes(m):
    """Taxas e custos SEMPRE ponderados: Σ numerador ÷ Σ denominador."""
    leads, resp, mqls, vendas = m['leads'], m['respostas'], m['mqls'], m['vendas']
    inv, imp, cli, fat = m['invest'], m['impressoes'], m['cliques'], m['faturamento']
    d = lambda a, b: (a / b) if b else None
    return {
        'cpl': d(inv, leads), 'ctr': d(cli, imp) and d(cli, imp) * 100, 'cpm': d(inv, imp) and d(inv, imp) * 1000,
        'conv_pagina': d(leads, cli) and d(leads, cli) * 100, 'taxa_resp': d(resp, leads) and d(resp, leads) * 100,
        'qualif': d(mqls, resp) and d(mqls, resp) * 100, 'cpmql': d(inv, mqls), 'conv': d(vendas, leads) and d(vendas, leads) * 100,
        'roas': d(fat, inv), 'cac': d(inv, vendas),
    }


def calcular(csv_path):
    rows = ler(csv_path)
    T = {}

    def tabela(nome, dim, grupos, ordem=None, geral=True):
        keys = ordem or sorted(grupos)
        linhas = []
        for k in keys:
            m = grupos[k]
            linhas.append({dim: k, **{c: round(m[c], 2) for c in COLS[3:]}, **{c: (round(v, 2) if v is not None else None) for c, v in _razoes(m).items()}})
        if geral:
            tot = defaultdict(float)
            for m in grupos.values():
                for c in COLS[3:]:
                    tot[c] += m[c]
            linhas.append({dim: 'Geral', **{c: round(tot[c], 2) for c in COLS[3:]}, **{c: (round(v, 2) if v is not None else None) for c, v in _razoes(tot).items()}})
        T[nome] = {'dims': [dim], 'filters': [], 'rows': linhas}

    dias = sorted({r['dia'] for r in rows})
    tabela('q-dia', 'dia', _agg(rows, lambda r: r['dia']), ordem=dias, geral=False)
    tabela('q-canal', 'canal', _agg(rows, lambda r: r['canal']))
    tabela('q-temp', 'temperatura', _agg(rows, lambda r: r['temperatura']))
    geral = T['q-canal']['rows'][-1]
    T['q-total'] = {'dims': ['metrica'], 'filters': [], 'rows': [{'metrica': k, 'valor': v} for k, v in geral.items() if k != 'canal' and v is not None]}
    return T


def totais(T):
    return {r['metrica']: r['valor'] for r in T['q-total']['rows']}


if __name__ == '__main__':
    if len(sys.argv) < 2 or not os.path.exists(sys.argv[1]):
        print('uso: calc_livre.py dump.csv'); sys.exit(1)
    print(json.dumps(calcular(sys.argv[1]), ensure_ascii=False, indent=1))
