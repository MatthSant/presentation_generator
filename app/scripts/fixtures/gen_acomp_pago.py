# -*- coding: utf-8 -*-
"""Gera o dump SINTETICO do lancamento pago usado para desenvolver/verificar o modo
`mecanica: pago` do acompanhamento.

    py -3 app/scripts/fixtures/gen_acomp_pago.py app/.base/ideia-cannes/acompanhamento-pago/dump.csv

Existe porque `app/.base/` e gitignored (politica LGPD: base de cliente nunca
versiona) — sem este gerador o fixture se perderia e a verificacao do motor pago
ficaria sem chao. Os dados NAO sao de cliente: foram reconstruidos do relatorio de
referencia (backup/lcto-pago/*.html), cujos numeros estao replicados abaixo.

Alvos extraidos do relatorio: 148 ingressos (98 pago / 50 organico), invest 4.071,39,
6 dias, 6 criativos no ultimo dia, temperatura 82/16, utm_source e tipo de lead.
Preco: ingresso R$ 47 e order bump R$ 147 (derivados da aritmetica dos criativos).
Deducoes (reembolso/imposto/broker) ficam >0 DE PROPOSITO: o caso real tem tudo zero
e nao exercitaria a formula de exposicao de caixa.
"""
import csv, os, sys

DIAS = ['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15']
PAGO_ING = [0, 0, 41, 29, 18, 10]          # invest/dia / custo-por-ingresso do relatorio
ORG_ING = [2, 2, 3, 5, 27, 11]             # completa D_ING = [2,2,44,34,45,21] -> 148
INVEST = [0.0, 0.0, 1250.65, 1500.45, 801.36, 518.93]
IMPRESS = [0, 0, 20000, 18919, 32000, 25363]
CLICKS = [0, 0, 380, 328, 420, 357]
TICKET, BUMPV = 47.00, 147.00

# ajuste fino p/ bater os totais do relatorio (115.201 impressoes, 1.813 cliques)
IMPRESS[2] -= (sum(IMPRESS) - 115201)
CLICKS[2] -= (sum(CLICKS) - 1813)
# e os ultimos 3 dias (13,14,15): 76.282 impressoes e 1.105 cliques
d3i = sum(IMPRESS[3:]); IMPRESS[3] += 76282 - d3i; IMPRESS[2] -= 76282 - d3i
d3c = sum(CLICKS[3:]); CLICKS[3] += 1105 - d3c; CLICKS[2] -= 1105 - d3c

BUMP_PAGO = [0, 0, 4, 3, 2, 1]             # 10 bumps no pago
BUMP_ORG = [1, 0, 1, 1, 3, 1]              # 7 no organico -> 17 no total
RESP_PAGO = [1, 1, 24, 17, 11, 6]
RESP_ORG = [1, 1, 2, 3, 16, 4]             # 60 + 27 = 87 respostas
MQL_PAGO = [0, 0, 5, 3, 2, 1]
MQL_ORG = [0, 0, 1, 1, 9, 2]               # 11 + 13 = 24 mqls

TEMPS = [('lcto-ideia-quente', 82), ('lcto-ideia-frio', 16)]
ORG_SRC = [('whatsapp', 18), ('email', 10), ('linkedin', 8), ('instagram', 2),
           ('meta-ads', 2), ('fb', 1), ('(direto)', 9)]
CRIATIVOS = [
    ('008-assistir-cases-video-idea', 60.85, 2, 1),
    ('005-assistiu-cannes-carrossel-idea', 94.39, 3, 0),
    ('010-criativo-convite-video-idea', 100.46, 2, 0),
    ('007-volta-cannes-video-idea', 116.51, 1, 0),
    ('011-pos-cannes-video-idea', 80.30, 1, 0),
    ('001-pensa-cannes-imagem-idea', 66.42, 1, 0),
]
COLS = ['field_conversion', 'data', 'utm_source', 'field_campaign_name', 'field_ad_name',
        'leads', 'leads_trafego', 'leads_mqls', 'respostas', 'leads_novo', 'leads_antigos',
        'cliente_inscrito', 'vendas_gen', 'faturamento_gen', 'vendas_bump', 'faturamento_bump',
        'refunded_value_gen', 'refunded_value_bump', 'sales_tax_gen', 'sales_tax_bump',
        'broker_fee_gen', 'broker_fee_bump', 'invest_total', 'paidmedia_tax',
        'impressoes', 'link_clicks', 'pageviews', 'views_totais', 'views_50pc']
CONV = 'lcto-ideia-workshop-jun-26'


def blank():
    return dict((c, 0) for c in COLS)


rows = []
cri_inv = sum(c[1] for c in CRIATIVOS)
for i, d in enumerate(DIAS):
    ult = (i == len(DIAS) - 1)
    npago = PAGO_ING[i]
    if npago:
        if ult:
            # ultimo dia: reparte entre os 6 criativos do relatorio. As respostas/MQLs do
            # dia vao na 1a linha (a "resto" pode nem existir quando os 6 ja somam o dia).
            usadas_imp = usadas_clk = 0
            for n_, (nome, inv, ing, bmp) in enumerate(CRIATIVOS):
                imp = int(IMPRESS[i] * inv / cri_inv)
                clk = int(CLICKS[i] * inv / cri_inv)
                if n_ == len(CRIATIVOS) - 1:      # ultima leva o resto do arredondamento
                    imp = IMPRESS[i] - usadas_imp
                    clk = CLICKS[i] - usadas_clk
                usadas_imp += imp; usadas_clk += clk
                r = blank()
                r.update(field_conversion=CONV, data=d, utm_source='meta-ads',
                         field_campaign_name='lcto-ideia-quente', field_ad_name=nome,
                         leads=ing, leads_trafego=ing, vendas_gen=ing,
                         faturamento_gen=round(ing * TICKET, 2), vendas_bump=bmp,
                         faturamento_bump=round(bmp * BUMPV, 2), invest_total=inv,
                         impressoes=imp, link_clicks=clk,
                         respostas=(RESP_PAGO[i] if n_ == 0 else 0),
                         leads_mqls=(MQL_PAGO[i] if n_ == 0 else 0))
                rows.append(r)
            resto = npago - sum(c[2] for c in CRIATIVOS)
            if resto > 0:
                r = blank()
                r.update(field_conversion=CONV, data=d, utm_source='meta-ads',
                         field_campaign_name='lcto-ideia-frio', field_ad_name='000-outros-idea',
                         leads=resto, leads_trafego=resto, vendas_gen=resto,
                         faturamento_gen=round(resto * TICKET, 2), vendas_bump=BUMP_PAGO[i],
                         faturamento_bump=round(BUMP_PAGO[i] * BUMPV, 2),
                         invest_total=round(INVEST[i] - cri_inv, 2))
                rows.append(r)
        else:
            for j, (camp, share) in enumerate(TEMPS):
                if j == len(TEMPS) - 1:
                    ing = npago - sum(round(npago * s / 98) for _, s in TEMPS[:-1])
                else:
                    ing = round(npago * share / 98)
                if ing <= 0:
                    continue
                frac = float(ing) / npago
                r = blank()
                r.update(field_conversion=CONV, data=d, utm_source='meta-ads',
                         field_campaign_name=camp, field_ad_name='%02d-criativo-idea' % (j + 1),
                         leads=ing, leads_trafego=ing, vendas_gen=ing,
                         faturamento_gen=round(ing * TICKET, 2),
                         vendas_bump=(BUMP_PAGO[i] if j == 0 else 0),
                         faturamento_bump=round((BUMP_PAGO[i] if j == 0 else 0) * BUMPV, 2),
                         invest_total=round(INVEST[i] * frac, 2),
                         impressoes=int(IMPRESS[i] * frac), link_clicks=int(CLICKS[i] * frac),
                         respostas=(RESP_PAGO[i] if j == 0 else 0),
                         leads_mqls=(MQL_PAGO[i] if j == 0 else 0))
                rows.append(r)
    norg = ORG_ING[i]
    if norg:
        tot_org = sum(ORG_ING)
        for k, (src, share) in enumerate(ORG_SRC):
            if k == len(ORG_SRC) - 1:
                ing = norg - sum(round(norg * s / tot_org) for _, s in ORG_SRC[:-1])
            else:
                ing = round(norg * share / tot_org)
            if ing <= 0:
                continue
            r = blank()
            r.update(field_conversion=CONV, data=d, utm_source=src,
                     field_campaign_name='organico', field_ad_name='',
                     leads=ing, leads_trafego=0, vendas_gen=ing,
                     faturamento_gen=round(ing * TICKET, 2),
                     vendas_bump=(BUMP_ORG[i] if k == 0 else 0),
                     faturamento_bump=round((BUMP_ORG[i] if k == 0 else 0) * BUMPV, 2),
                     invest_total=0,
                     respostas=(RESP_ORG[i] if k == 0 else 0),
                     leads_mqls=(MQL_ORG[i] if k == 0 else 0))
            rows.append(r)

# imposto de midia + impostos/taxas de venda: exercitam a formula de exposicao
for r in rows:
    if r['invest_total']:
        r['paidmedia_tax'] = round(r['invest_total'] * 0.02, 2)
    if r['faturamento_gen']:
        r['sales_tax_gen'] = round(r['faturamento_gen'] * 0.05, 2)
        r['broker_fee_gen'] = round(r['faturamento_gen'] * 0.03, 2)
    if r['faturamento_bump']:
        r['sales_tax_bump'] = round(r['faturamento_bump'] * 0.05, 2)
        r['broker_fee_bump'] = round(r['faturamento_bump'] * 0.03, 2)
rows[-1]['refunded_value_gen'] = 47.00     # 1 reembolso: exposicao liquida de verdade


def espalha(campo, alvo, filtro):
    """Distribui `alvo` unidades entre as linhas que casam, sem estourar r['leads'].
    Faz varias passadas: uma passada so, limitada pela media, deixava sobra."""
    alvos = [r for r in rows if filtro(r) and r['leads']]
    resta = alvo
    while resta > 0:
        antes = resta
        for r in alvos:
            if resta <= 0:
                break
            livre = r['leads'] - r[campo]
            if livre <= 0:
                continue
            v = min(livre, resta, max(1, alvo // max(len(alvos), 1)))
            r[campo] += v
            resta -= v
        if resta == antes:      # ninguem tem espaco — nao da para completar
            break


espalha('leads_antigos', 42, lambda r: r['invest_total'] > 0)
espalha('leads_antigos', 25, lambda r: r['invest_total'] == 0)
espalha('cliente_inscrito', 19, lambda r: r['invest_total'] > 0)
espalha('cliente_inscrito', 9, lambda r: r['invest_total'] == 0)
for r in rows:
    r['leads_novo'] = max(0, r['leads'] - r['leads_antigos'])

out = sys.argv[1]
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=COLS)
    w.writeheader()
    w.writerows(rows)


def S(c, f=None):
    return sum(r[c] for r in rows if (f is None or f(r)))


pago = lambda r: r['invest_total'] > 0
receita = S('faturamento_gen') + S('faturamento_bump')
ded = (S('refunded_value_gen') + S('refunded_value_bump') + S('sales_tax_gen')
       + S('sales_tax_bump') + S('broker_fee_gen') + S('broker_fee_bump'))
expo = receita - ded - S('invest_total') - S('paidmedia_tax')
out_lines = [
    'linhas          %5d' % len(rows),
    'ingressos       %5d   (ref 148)' % S('vendas_gen'),
    '  pago          %5d   (ref 98)' % S('vendas_gen', pago),
    '  organico      %5d   (ref 50)' % S('vendas_gen', lambda r: not pago(r)),
    'invest      %9.2f   (ref 4071.39)' % S('invest_total'),
    'impressoes      %5d   (ref 115201)' % S('impressoes'),
    'clicks          %5d   (ref 1813)' % S('link_clicks'),
    'bumps           %5d   (ref 17)' % S('vendas_bump'),
    'respostas       %5d   (ref 87)' % S('respostas'),
    'mqls            %5d   (ref 24)' % S('leads_mqls'),
    'antigos         %5d   (ref 67)' % S('leads_antigos'),
    'clientes        %5d   (ref 28)' % S('cliente_inscrito'),
    'CPM         %9.2f   (ref 35.34)' % (S('invest_total') / S('impressoes') * 1000),
    'CTR         %9.2f%%  (ref 1.57)' % (S('link_clicks') / float(S('impressoes')) * 100),
    'receita     %9.2f' % receita,
    'deducoes    %9.2f   (>0 de proposito)' % ded,
    'EXPOSICAO   %9.2f' % expo,
]
sys.stdout.buffer.write(('\n'.join(out_lines) + '\n').encode('utf-8'))
