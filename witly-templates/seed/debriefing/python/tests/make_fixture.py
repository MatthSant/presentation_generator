"""make_fixture — dump, goals e hist SINTÉTICOS do debriefing (sem dado de cliente).

Desenho (21 dias, 2026-08-01..21), por dia:
  facebook  | cadastro-quente-envolvimento | ad-quente : pago, captação, quente — invest 150, 30 leads, 2 vendas (R$ 1.000)
  facebook  | cadastro-frio-interesses     | ad-frio   : pago, captação, frio   — invest 200, 20 leads, 1 venda (R$ 500)
  facebook  | venda-carrinho               | ad-venda  : pago, VENDAS (fora do invest_cpt) — invest 50, 0 leads, 1 venda (R$ 500)
  instagram | bio                          |           : orgânico — 15 leads, 1 venda (R$ 500)
Totais: 65 leads/dia · 5 vendas/dia · R$ 2.500/dia · invest 400/dia (cpt 350).
goals: por dia, facebook + instagram. hist: 7 dias do lançamento anterior, valores menores.
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
COLS = ['field_conversion', 'data', 'utm_source', 'utm_medium', 'field_campaign_name', 'field_ad_name',
        'leads', 'leads_mqls', 'respostas', 'leads_novo', 'leads_antigos', 'cliente_inscrito', 'vendas', 'faturamento',
        'invest_total', 'impressoes', 'link_clicks', 'pageviews', 'leads_trafego', 'leads_mqls_trafego',
        'vendas_sale', 'faturamento_sale', 'refunds', 'refunded_value']
GOAL_COLS = ['data', 'utm_source', 'field_conversion', 'meta_leads', 'meta_taxa_resp', 'meta_taxa_qual', 'meta_valor_invest',
             'meta_cpl', 'meta_cpmql', 'meta_cpl_aceitavel', 'meta_cpmql_aceitavel', 'meta_conversao', 'meta_receita', 'meta_vendas']

FC = 'lcto-fixture-ago26'
FC_ANT = 'lcto-fixture-mai26'
DAYS = [f'2026-08-{d:02d}' for d in range(1, 22)]
DAYS_ANT = [f'2026-05-{d:02d}' for d in range(1, 8)]

ROWS = [
    dict(utm_source='facebook', utm_medium='cpc', field_campaign_name='cadastro-quente-envolvimento', field_ad_name='ad-quente',
         leads=30, leads_mqls=12, respostas=18, leads_novo=22, leads_antigos=8, cliente_inscrito=1, vendas=2, faturamento=1000,
         invest_total=150, impressoes=15000, link_clicks=300, pageviews=240, leads_trafego=30, leads_mqls_trafego=12,
         vendas_sale=2, faturamento_sale=1000, refunds=0, refunded_value=0),
    dict(utm_source='facebook', utm_medium='cpc', field_campaign_name='cadastro-frio-interesses', field_ad_name='ad-frio',
         leads=20, leads_mqls=5, respostas=8, leads_novo=19, leads_antigos=1, cliente_inscrito=0, vendas=1, faturamento=500,
         invest_total=200, impressoes=25000, link_clicks=375, pageviews=260, leads_trafego=20, leads_mqls_trafego=5,
         vendas_sale=1, faturamento_sale=500, refunds=0, refunded_value=0),
    dict(utm_source='facebook', utm_medium='cpc', field_campaign_name='venda-carrinho', field_ad_name='ad-venda',
         leads=0, leads_mqls=0, respostas=0, leads_novo=0, leads_antigos=0, cliente_inscrito=0, vendas=1, faturamento=500,
         invest_total=50, impressoes=5000, link_clicks=100, pageviews=90, leads_trafego=0, leads_mqls_trafego=0,
         vendas_sale=1, faturamento_sale=500, refunds=0, refunded_value=0),
    dict(utm_source='instagram', utm_medium='social', field_campaign_name='bio', field_ad_name='',
         leads=15, leads_mqls=6, respostas=9, leads_novo=9, leads_antigos=6, cliente_inscrito=2, vendas=1, faturamento=500,
         invest_total=0, impressoes=0, link_clicks=0, pageviews=0, leads_trafego=0, leads_mqls_trafego=0,
         vendas_sale=1, faturamento_sale=500, refunds=0, refunded_value=0),
]
GOALS = [
    dict(utm_source='facebook', meta_leads=45, meta_taxa_resp=0.4, meta_taxa_qual=0.4, meta_valor_invest=350, meta_cpl=8, meta_cpmql=25,
         meta_cpl_aceitavel=10, meta_cpmql_aceitavel=30, meta_conversao=0.05, meta_receita=1500, meta_vendas=3),
    dict(utm_source='instagram', meta_leads=15, meta_taxa_resp=0.4, meta_taxa_qual=0.4, meta_valor_invest=0, meta_cpl=0, meta_cpmql=0,
         meta_cpl_aceitavel=0, meta_cpmql_aceitavel=0, meta_conversao=0.05, meta_receita=500, meta_vendas=1),
]
EXPECTED = {'leads': 65 * 21, 'vendas': 5 * 21, 'fat': 2500 * 21, 'invest_cpt': 350 * 21, 'invest': 400 * 21,
            'meta_leads': 60 * 21, 'meta_vendas': 4 * 21}


def _write(path, cols, rows):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    return path


def write(dir_=None):
    dir_ = dir_ or HERE
    dump = _write(os.path.join(dir_, 'fixture.csv'), COLS, [{'field_conversion': FC, 'data': d, **r} for d in DAYS for r in ROWS])
    goals = _write(os.path.join(dir_, 'goals.csv'), GOAL_COLS, [{'data': d, 'field_conversion': FC, **g} for d in DAYS for g in GOALS])
    ant = []
    for d in DAYS_ANT:
        for r in ROWS:
            rr = dict(r); rr['leads'] = max(0, r['leads'] - 5); rr['vendas'] = max(0, r['vendas'] - 1)
            rr['faturamento'] = rr['vendas'] * 500; rr['vendas_sale'] = rr['vendas']; rr['faturamento_sale'] = rr['faturamento']
            ant.append({'field_conversion': FC_ANT, 'data': d, **rr})
    hist = _write(os.path.join(dir_, 'hist.csv'), COLS, ant)
    return dump, goals, hist


if __name__ == '__main__':
    print(*write())
