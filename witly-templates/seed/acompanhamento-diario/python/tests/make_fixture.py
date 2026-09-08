"""make_fixture — gera tests/fixture.csv SINTÉTICA (sem dado de cliente) para os testes
do kit. Determinística: os testes conferem somas conhecidas.

Desenho: 5 dias × 3 fontes por dia
  facebook  | HOT-RMKT-envolvimento | ad-quente : pago, invest 100/dia, 20 leads/dia
  facebook  | COLD-interesses       | ad-frio   : pago, invest 150/dia, 15 leads/dia
  instagram | (orgânico)            |           : invest 0, 10 leads/dia
Totais por dia: 45 leads · R$ 250 · 35 leads pagos → CPL pago = 250/35.
"""
import csv
import os

COLS = ['field_conversion', 'data', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
        'field_adset_name', 'field_campaign_name', 'field_ad_name', 'leads', 'leads_mqls', 'respostas',
        'leads_novo', 'leads_antigos', 'cliente_inscrito', 'vendas', 'faturamento', 'invest_total',
        'impressoes', 'link_clicks', 'pageviews', 'leads_trafego', 'leads_mqls_trafego',
        'views_totais', 'views_50pc', 'one_day_click_attribution', 'link_criativo']

FC = 'lcto-fixture'
DAYS = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05']

ROWS_PER_DAY = [
    dict(utm_source='facebook', utm_medium='cpc', utm_campaign='HOT-RMKT-envolvimento', utm_content='ad-quente',
         field_adset_name='rmkt 30d', field_campaign_name='HOT-RMKT-envolvimento', field_ad_name='ad-quente',
         leads=20, leads_mqls=8, respostas=12, leads_novo=15, leads_antigos=5, cliente_inscrito=1,
         vendas=0, faturamento=0, invest_total=100, impressoes=10000, link_clicks=200, pageviews=160,
         leads_trafego=20, leads_mqls_trafego=8, views_totais=3000, views_50pc=900, one_day_click_attribution=20,
         link_criativo='https://example.com/p/quente'),
    dict(utm_source='facebook', utm_medium='cpc', utm_campaign='COLD-interesses', utm_content='ad-frio',
         field_adset_name='interesses maternidade', field_campaign_name='COLD-interesses', field_ad_name='ad-frio',
         leads=15, leads_mqls=3, respostas=6, leads_novo=14, leads_antigos=1, cliente_inscrito=0,
         vendas=0, faturamento=0, invest_total=150, impressoes=20000, link_clicks=300, pageviews=210,
         leads_trafego=15, leads_mqls_trafego=3, views_totais=5000, views_50pc=1200, one_day_click_attribution=15,
         link_criativo='https://example.com/p/frio'),
    dict(utm_source='instagram', utm_medium='social', utm_campaign='bio', utm_content='',
         field_adset_name='', field_campaign_name='', field_ad_name='',
         leads=10, leads_mqls=4, respostas=5, leads_novo=6, leads_antigos=4, cliente_inscrito=2,
         vendas=0, faturamento=0, invest_total=0, impressoes=0, link_clicks=0, pageviews=0,
         leads_trafego=0, leads_mqls_trafego=0, views_totais=0, views_50pc=0, one_day_click_attribution=0,
         link_criativo=''),
]

EXPECTED = {
    'leads_total': 45 * len(DAYS),
    'leads_pago': 35 * len(DAYS),
    'invest_total': 250 * len(DAYS),
    'cpl_pago': 250 / 35,
}


def write(path=None):
    path = path or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixture.csv')
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        for d in DAYS:
            for base in ROWS_PER_DAY:
                w.writerow({'field_conversion': FC, 'data': d, **base})
    return path


if __name__ == '__main__':
    print(write())
