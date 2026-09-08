"""make_fixture — dump e dicionário SINTÉTICOS da análise de criativos (sem dado de cliente).

Desenho (14 dias, 2026-08-01..14), por dia:
  vid-quente-A | LX_lead_quente  | pub-envolvimento : vídeo, Lead, Quente — invest 100, 40 leads, 2 vendas (R$ 1.000)
  img-frio-B   | LX_lead_frio    | pub-interesses   : estático, Lead, Frio — invest 120, 30 leads, 1 venda (R$ 500)
  vid-frio-C   | LX_lead_frio    | pub-aberto       : vídeo, Lead, Frio — invest 80, 12 leads, 0 vendas
  img-venda-D  | LX_venda_carrinho | pub-rmkt       : Venda — fica FORA (tipo_campanha = Lead)
Totais (Lead): invest 300/dia · 82 leads/dia · 3 vendas/dia · R$ 1.500/dia.
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
COLS = ['field_ad_name', 'field_campaign_name', 'field_adset_name', 'data', 'invest_total', 'impressoes', 'link_clicks', 'pageviews',
        'views_2s', 'views_50pc', 'views_100pc', 'views_totais', 'leads', 'leads_mqls', 'respostas', 'vendas', 'vendas_sale',
        'faturamento', 'faturamento_sale']
DAYS = [f'2026-08-{d:02d}' for d in range(1, 15)]

ROWS = [
    dict(field_ad_name='vid-quente-A', field_campaign_name='LX_lead_quente', field_adset_name='pub-envolvimento',
         invest_total=100, impressoes=20000, link_clicks=400, pageviews=320, views_2s=0, views_50pc=2400, views_100pc=1800, views_totais=6000,
         leads=40, leads_mqls=16, respostas=24, vendas=2, vendas_sale=2, faturamento=1000, faturamento_sale=1000),
    dict(field_ad_name='img-frio-B', field_campaign_name='LX_lead_frio', field_adset_name='pub-interesses',
         invest_total=120, impressoes=30000, link_clicks=450, pageviews=300, views_2s=0, views_50pc=0, views_100pc=0, views_totais=0,
         leads=30, leads_mqls=6, respostas=12, vendas=1, vendas_sale=1, faturamento=500, faturamento_sale=500),
    dict(field_ad_name='vid-frio-C', field_campaign_name='LX_lead_frio', field_adset_name='pub-aberto',
         invest_total=80, impressoes=16000, link_clicks=240, pageviews=180, views_2s=0, views_50pc=800, views_100pc=400, views_totais=4000,
         leads=12, leads_mqls=3, respostas=6, vendas=0, vendas_sale=0, faturamento=0, faturamento_sale=0),
    dict(field_ad_name='img-venda-D', field_campaign_name='LX_venda_carrinho', field_adset_name='pub-rmkt',
         invest_total=50, impressoes=5000, link_clicks=100, pageviews=80, views_2s=0, views_50pc=0, views_100pc=0, views_totais=0,
         leads=0, leads_mqls=0, respostas=0, vendas=1, vendas_sale=1, faturamento=500, faturamento_sale=500),
]
DICT = [('vid-quente-A', 'https://www.instagram.com/p/fixtureA/'), ('img-frio-B', 'https://www.facebook.com/fixture/posts/B'),
        ('vid-frio-C', 'https://www.instagram.com/reel/fixtureC/')]
N = len(DAYS)
EXPECTED = {'invest': 300 * N, 'leads': 82 * N, 'vendas': 3 * N, 'fat': 1500 * N, 'n_validos': 3, 'roas': 1500 * N / (300 * N) - 1}


def write(dir_=None):
    dir_ = dir_ or HERE
    dump = os.path.join(dir_, 'fixture.csv')
    with open(dump, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        for d in DAYS:
            for r in ROWS:
                w.writerow({'data': d, **r})
    dic = os.path.join(dir_, 'dict.csv')
    with open(dic, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['field_ad_name', 'post_url'])
        w.writerows(DICT)
    return dump, dic


if __name__ == '__main__':
    print(*write())
