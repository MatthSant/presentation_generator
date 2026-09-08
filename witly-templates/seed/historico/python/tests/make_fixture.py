"""make_fixture — consolidado SINTÉTICO do histórico (sem dado de cliente).

4 lançamentos (mar/25, jul/25, nov/25, mar/26) × 4 recortes (linhas):
  Pago | Meta Ads   | Hot      : invest 2000, 400 leads, 20 vendas (R$ 20.000), 1 reembolso (R$ 1.000)
  Pago | Meta Ads   | Cold     : invest 3000, 300 leads, 6 vendas (R$ 6.000)
  Pago | Google Ads | N/C      : invest 500, 50 leads, 2 vendas (R$ 2.000)
  Orgânico | —      | Orgânico : 250 leads, 15 vendas (R$ 15.000)
Leads e vendas escalam por lançamento pelo fator F = [1, 1.5, 1.25, 2]; investimento fixo.
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
COLS = ['field_conversion', 'date_start', 'tipo_lancamento', 'tipo_trafego', 'plataforma', 'temperatura_lead',
        'invest_total', 'paidmedia_tax', 'impressoes', 'link_clicks', 'leads', 'leads_mqls', 'leads_antigos', 'respostas_pesquisa',
        'vendas', 'faturamento', 'vendas_sale', 'vendas_mql', 'vendas_nao_mql', 'sales_tax', 'broker_fee', 'refunds', 'refunded_value']
LAUNCHES = [('lcto-fixture-mar25', '2025-03-01'), ('lcto-fixture-jul25', '2025-07-01'), ('lcto-fixture-nov25', '2025-11-01'), ('lcto-fixture-mar26', '2026-03-01')]
LABELS = ['mar/25', 'jul/25', 'nov/25', 'mar/26']
F = [1, 1.5, 1.25, 2]
BASE = [
    dict(tipo_trafego='Pago', plataforma='Meta Ads', temperatura_lead='Hot', invest_total=2000, paidmedia_tax=0, impressoes=200000, link_clicks=4000,
         leads=400, leads_mqls=160, leads_antigos=80, respostas_pesquisa=240, vendas=20, faturamento=20000, vendas_sale=20, vendas_mql=14, vendas_nao_mql=6,
         sales_tax=1000, broker_fee=500, refunds=1, refunded_value=1000),
    dict(tipo_trafego='Pago', plataforma='Meta Ads', temperatura_lead='Cold', invest_total=3000, paidmedia_tax=0, impressoes=400000, link_clicks=6000,
         leads=300, leads_mqls=60, leads_antigos=10, respostas_pesquisa=100, vendas=6, faturamento=6000, vendas_sale=6, vendas_mql=4, vendas_nao_mql=2,
         sales_tax=300, broker_fee=150, refunds=0, refunded_value=0),
    dict(tipo_trafego='Pago', plataforma='Google Ads', temperatura_lead='N/C', invest_total=500, paidmedia_tax=0, impressoes=20000, link_clicks=1000,
         leads=50, leads_mqls=15, leads_antigos=5, respostas_pesquisa=25, vendas=2, faturamento=2000, vendas_sale=2, vendas_mql=2, vendas_nao_mql=0,
         sales_tax=100, broker_fee=50, refunds=0, refunded_value=0),
    dict(tipo_trafego='Orgânico', plataforma='', temperatura_lead='Orgânico', invest_total=0, paidmedia_tax=0, impressoes=0, link_clicks=0,
         leads=250, leads_mqls=100, leads_antigos=120, respostas_pesquisa=150, vendas=15, faturamento=15000, vendas_sale=15, vendas_mql=10, vendas_nao_mql=5,
         sales_tax=750, broker_fee=375, refunds=0, refunded_value=0),
]
SCALED = ['leads', 'leads_mqls', 'leads_antigos', 'respostas_pesquisa', 'vendas', 'faturamento', 'vendas_sale', 'vendas_mql', 'vendas_nao_mql']
EXPECTED = {'labels': LABELS, 'leads_first': 1000, 'vendas_first': 43, 'invest': 5500, 'fat_liq_first': 42000,
            'leads_total': sum(int(round(b['leads'] * f)) for f in F for b in BASE), 'produto': 'vendas_sale'}


def write(dir_=None):
    dir_ = dir_ or HERE
    path = os.path.join(dir_, 'fixture.csv')
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        for (fc, ds), fac in zip(LAUNCHES, F):
            for b in BASE:
                r = dict(b)
                for k in SCALED:
                    r[k] = int(round(b[k] * fac))
                w.writerow({'field_conversion': fc, 'date_start': ds, 'tipo_lancamento': 'Lançamento', **r})
    return path


if __name__ == '__main__':
    print(write())
