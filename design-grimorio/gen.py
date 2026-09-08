"""Gera as pranchetas (.dc.html) do canvas da plataforma Witly Grimório.

Cada página é o DOM REAL capturado do app (witly-templates/public) com o style.css
real inlinado — nada redesenhado. Textos longos de textarea vêm truncados e duas
listas (versões, contextos gerais) vêm com uma fatia representativa, para a prancheta
ter tamanho de tela e não de rolagem infinita.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
CSS = open(os.path.join(HERE, '..', 'witly-templates', 'public', 'style.css'), encoding='utf-8').read()
# `}}` seguidos poderiam ser lidos como fim de hole pelo runtime: separa (CSS idêntico)
CSS = CSS.replace('}}', '} }')

NAV = [('templates', '#/', 'Templates'), ('pessoais', '#/pessoais', 'Pessoais'), ('atividade', '#/atividade', 'Atividade'),
       ('gerais', '#/gerais', 'Contextos gerais'), ('plataforma', '#/plataforma', 'Design system'),
       ('usuarios', '#/usuarios', 'Usuários'), (None, '/docs/arquitetura.html', 'Como funciona')]


def header(active):
    links = ''.join(
        f'<a href="{href}" data-nav="{key or ""}"{" class=\"on\"" if key == active else ""}>{label}</a>'
        for key, href, label in NAV)
    return f'''<header id="top">
  <a class="brand" href="#/"><span class="brand-box">witly</span><span class="brand-name">Grimório</span></a>
  <nav id="nav">{links}</nav>
  <div id="who" class="who"><span id="who-name">projetos</span><span id="who-role" class="pill">editor</span><a class="btn btn-ghost" href="/ui/logout">Sair</a></div>
</header>'''


TPL = '''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap">
  <style>
{css}
/* prancheta: largura fixa de desktop, fundo da plataforma */
html, body {{ height: auto; }}
.artboard {{ width: 1280px; min-height: {h}px; background: var(--bg); overflow: hidden; }}
#top {{ position: static; }}
a:hover {{ color: #6D28D9; }}
  </style>
</helmet>
<div class="artboard">
{header}
<main id="app">
{body}
</main>
</div>
</x-dc>
</body>
</html>
'''


def write(name, active, body, h):
    out = TPL.format(css=CSS.strip(), header=header(active), body=body.strip(), h=h)
    with open(os.path.join(HERE, name), 'w', encoding='utf-8') as f:
        f.write(out)
    assert '{{' not in out and '}}' not in out, f'{name}: chaves duplas viram hole no runtime'
    return h


TABS = ('<div class="tabs"><button class="tab {info}" data-tab="info">Info</button><button class="tab {manifesto}" data-tab="manifesto">Manifesto</button>'
        '<button class="tab {contexto}" data-tab="contexto">Contexto</button><button class="tab " data-tab="queries">Queries</button>'
        '<button class="tab " data-tab="python">Python</button><button class="tab " data-tab="documento">Documento</button>'
        '<button class="tab " data-tab="guia">Guia</button><button class="tab " data-tab="perguntas">Perguntas</button>'
        '<button class="tab " data-tab="exemplo">Exemplo</button><button class="tab {versoes}" data-tab="versoes">Versões</button></div>')

CAB_TEMPLATE = '''<div class="head">
      <div><a class="muted sm" href="#/">← Templates</a><h1>Acompanhamento diário de campanha <code>acompanhamento-diario</code></h1>
        <div class="row sm"><span class="muted">Editando o <b>rascunho</b> (nº 3)</span>
        <span class="pill pub">publicada</span><span class="pill draft">rascunho</span></div></div>
      <div class="row">
        <button class="btn btn-p" id="publish">Publicar rascunho</button></div></div>'''


def tabs(on):
    return TABS.format(**{k: ('on' if k == on else ' ') for k in ('info', 'manifesto', 'contexto', 'versoes')})


# ── 1. Templates (catálogo) ────────────────────────────────────────────────
CATALOGO = r'''<div class="head"><div><h1>Templates</h1><p class="muted sm">O MCP entrega ao agente só a versão <b>publicada</b>. Edições ficam num rascunho até você publicar.</p></div>
      <button class="btn btn-p" id="new">+ Novo template</button></div>
      <div class="grid"><a class="card tcard" href="#/t/acompanhamento-diario">
        <div class="row" style="justify-content:space-between"><span class="t">Acompanhamento diário de campanha</span>
          <span><span class="pill pub">v1.0.2</span> <span class="pill draft">rascunho</span></span></div>
        <div class="muted sm" style="margin:6px 0"><code>acompanhamento-diario</code></div>
        <div class="sm">Acompanhar diariamente um lançamento em andamento: a cada dia, saber se está no ritmo da meta, o que melhorou ou piorou nos últimos 3 dias e onde está o maior gargalo para agir ainda dentro da campanha.</div></a><a class="card tcard" href="#/t/criativos">
        <div class="row" style="justify-content:space-between"><span class="t">Análise de criativos</span>
          <span><span class="pill pub">v1.0.2</span> </span></div>
        <div class="muted sm" style="margin:6px 0"><code>criativos</code></div>
        <div class="sm">Avaliar cada criativo de mídia paga isoladamente (quanto investiu, quanto retornou e com que qualidade captou) para decidir o que escalar, o que pausar e o que iterar no próximo ciclo. Dois modos: Resultado Final (ROAS, CAC, retorno) e Captação (CPL, CPMQL, qualidade, CPM).</div></a><a class="card tcard" href="#/t/analise-livre">
        <div class="row" style="justify-content:space-between"><span class="t">Análise livre (só design system + regras)</span>
          <span><span class="pill pub">v1.0.0</span> </span></div>
        <div class="muted sm" style="margin:6px 0"><code>analise-livre</code></div>
        <div class="sm">Fazer uma análise que não cabe em nenhum template, no mesmo padrão dos relatórios da Witly: você escreve o Python que calcula, monta as seções no design system e o kit valida e gera o HTML. Sem motor pronto; com as regras de contexto de como analisar e comunicar.</div></a><a class="card tcard" href="#/t/conversao-perfil">
        <div class="row" style="justify-content:space-between"><span class="t">Conversão por perfil</span>
          <span><span class="pill pub">v1.0.2</span> </span></div>
        <div class="muted sm" style="margin:6px 0"><code>conversao-perfil</code></div>
        <div class="sm">Descobrir quais perfis de lead convertem melhor (e pior) ao longo de vários lançamentos, para que mídia e copy priorizem a captação e a qualificação dos públicos certos e o custo por venda caia sem aumentar o investimento. Inclui relevância × codependência entre critérios (qualificador × qualificante).</div></a><a class="card tcard" href="#/t/debriefing">
        <div class="row" style="justify-content:space-between"><span class="t">Debriefing de lançamento</span>
          <span><span class="pill pub">v1.0.2</span> </span></div>
        <div class="muted sm" style="margin:6px 0"><code>debriefing</code></div>
        <div class="sm">Fechar um lançamento com evidência: atingiu as metas? O que puxou e o que segurou o resultado? O que escalar e o que pausar no próximo ciclo, por canal, temperatura e semana.</div></a><a class="card tcard" href="#/t/historico">
        <div class="row" style="justify-content:space-between"><span class="t">Histórico de lançamentos</span>
          <span><span class="pill pub">v1.0.2</span> <span class="pill draft">rascunho</span></span></div>
        <div class="muted sm" style="margin:6px 0"><code>historico</code></div>
        <div class="sm">Mapear a evolução de uma operação de lançamentos ao longo do tempo (conversão, qualidade de lead, eficiência de mídia paga e reembolso) e distinguir se cada resultado vem do canal, da plataforma, da temperatura ou do perfil MQL, para orientar os próximos ciclos.</div></a><a class="card tcard" href="#/t/recorte-quente">
        <div class="row" style="justify-content:space-between"><span class="t">Recorte Quente por dia</span>
          <span><span class="pill pub">v1.0.0</span> </span></div>
        <div class="muted sm" style="margin:6px 0"><code>recorte-quente</code></div>
        <div class="sm">CPL do Quente por dia</div></a></div>'''

# ── 2. Template · Info ─────────────────────────────────────────────────────
INFO = CAB_TEMPLATE + tabs('info') + r'''
      <div id="pane"><div class="card">
      <label>Nome</label><input id="f-name" value="Acompanhamento diário de campanha">
      <label>Objetivo</label><textarea id="f-obj" style="min-height:80px">Acompanhar diariamente um lançamento em andamento: a cada dia, saber se está no ritmo da meta, o que melhorou ou piorou nos últimos 3 dias e onde está o maior gargalo para agir ainda dentro da campanha.</textarea>
      <label>Quando usar</label><textarea id="f-when" style="min-height:80px">Durante a captação de um lançamento (clássico ou pago), com o dump diário da view de inscrições. Não serve para comparar lançamentos (use o histórico) nem para o pós-campanha (use o debriefing).</textarea>
      <div class="actions"><button class="btn btn-p" id="save">Salvar</button></div></div>
      <p class="muted sm" style="margin-top:10px">Nome, objetivo e "quando usar" valem para todas as versões (aparecem no catálogo do MCP).</p></div>'''

# ── 3. Template · Contexto ─────────────────────────────────────────────────
CONTEXTO = CAB_TEMPLATE + tabs('contexto') + r'''
      <div id="pane"><p class="muted sm">Uma página por tarefa de contexto: o que o agente levanta com o consultor antes de gerar. O agente recebe o texto inteiro.</p>
        <div class="split"><div class="card"><div class="list"><button data-id="lancamento" class="on">Identificar o lançamento<br><code>lancamento</code></button><button data-id="tipo_funil" class="">Tipo de funil: clássico ou pago<br><code>tipo_funil</code></button><button data-id="data_corte" class="">Data de corte e data do report<br><code>data_corte</code></button><button data-id="temperatura" class="">Temperatura das campanhas<br><code>temperatura</code></button><button data-id="metas" class="">Metas do lançamento<br><code>metas</code></button><button data-id="dicionario" class="">Dicionário de links dos criativos (opcional)<br><code>dicionario</code></button></div>
          <div class="actions"><button class="btn" id="newtask">+ Tarefa</button></div></div>
        <div class="card"><label>Título</label><input id="t-title" value="Identificar o lançamento">
          <label>Ordem</label><input id="t-sort" type="number" value="0" style="width:120px">
          <label>Conteúdo (Markdown: definição, regra padrão, query de apoio, exemplos, casos ambíguos, saída)</label>
          <textarea id="t-body" class="">**Saída:** `config.field_conversion`, `config.client`, `config.client_name`, `config.nome_campanha`. **Confirmar com o consultor.**

## Definição
`field_conversion` é o identificador do lançamento na base da Witly (ex.: `lcto-enxoval-set26`). Todas as views do acompanhamento filtram por ele. No lanç
…</textarea><div class="actions"><button class="btn btn-p" id="save">Salvar no rascunho</button></div></div></div></div>'''

# ── 4. Template · Versões (fatia de 6 versões) ─────────────────────────────
VROW = ('<tr><td><b>{v}</b> <span class="muted sm">nº {n}</span></td><td><span class="pill {cls}">{estado}</span></td>'
        '<td class="sm">{autor}</td><td class="sm muted">{quando}</td><td class="sm">{log}</td>'
        '<td class="row" style="justify-content:flex-end"><button class="btn btn-ghost" data-cmp="{n}">comparar com…</button>{restore}</td></tr>')
RESTORE = '<button class="btn" data-restore="{n}">Restaurar</button>'
VERSOES_ROWS = ''.join(VROW.format(restore=RESTORE.format(n=n) if cls == 'pub' else '', **dict(v=v, n=n, cls=cls, estado=estado, autor=autor, quando=quando, log=log)) for v, n, cls, estado, autor, quando, log in [
    ('v1.0.2', 14, 'pub', 'publicada', 'seed', '2026-09-08 15:01', 'ajuste: contextos gerais tipados'),
    ('v1.0.1', 13, 'pub', 'publicada', 'seed', '2026-09-08 14:57', 'ajuste: data de corte vira pergunta'),
    ('v1.0.0', 11, 'pub', 'publicada', 'seed', '2026-09-08 12:44', 'linha de base'),
    ('rascunho', 3, 'draft', 'rascunho', 'projetos@witly.digital', '2026-09-07 21:41', ''),
    ('v0.2.0', 2, 'pub', 'publicada', 'projetos@witly.digital', '2026-09-07 19:28', 'guia reescrito'),
    ('v0.1.0', 1, 'pub', 'publicada', 'seed', '2026-09-07 19:26', ''),
])
VERSOES = CAB_TEMPLATE + tabs('versoes') + f'''
      <div id="pane"><div class="split" style="grid-template-columns: 1fr 1fr;"><div class="card"><table><thead><tr><th>v</th><th>Estado</th><th>Autor</th><th>Quando</th><th>Nota de mudança</th><th></th></tr></thead><tbody>
        {VERSOES_ROWS}
        </tbody></table></div><div class="card" id="diff"><div class="empty">Escolha "comparar com…" numa versão.</div></div></div></div>'''

# ── 5. Pessoais ────────────────────────────────────────────────────────────
PESSOAIS = r'''<div class="head"><div><h1>Templates pessoais</h1><p class="muted sm">Salvos pelo agente com <code>salvar_template</code>. Só o dono usa no MCP. Promova o que merece virar padrão de todos; remova o que ninguém usa.</p></div></div>
      <div class="card"><table><thead><tr><th>Template</th><th>Dono</th><th>Versão</th><th>Gerações</th><th>Aprofund.</th><th></th></tr></thead><tbody>
      <tr data-s="recorte-quente"><td><a href="#/t/recorte-quente"><b>Recorte Quente por dia</b></a><br><code>recorte-quente</code></td><td>consultor@witly.digital</td><td>v1.0.0</td><td>0</td><td>0</td>
        <td class="row" style="justify-content:flex-end"><button class="btn btn-p" data-promote="">Promover para todos</button><button class="btn btn-ghost btn-danger" data-del="">Remover</button></td></tr>
      </tbody></table></div>'''

# ── 6. Atividade ───────────────────────────────────────────────────────────
ATIVIDADE = r'''<div class="head"><div><h1>Atividade</h1><p class="muted sm">O que os agentes registraram: gerações, aprofundamentos (pergunta, resposta, veredito) e edições. Vire exemplo, vire regra, ajuste o template.</p></div>
      <a class="btn" href="#/uso">Uso por template →</a></div>
      <div class="card row" style="margin-bottom:14px">
        <select id="f-slug" style="width:220px"><option value="" selected="">todos os templates</option><option value="acompanhamento-diario">Acompanhamento diário de campanha</option><option value="criativos">Análise de criativos</option><option value="analise-livre">Análise livre (só design system + regras)</option><option value="conversao-perfil">Conversão por perfil</option><option value="debriefing">Debriefing de lançamento</option><option value="historico">Histórico de lançamentos</option><option value="recorte-quente">Recorte Quente por dia</option></select>
        <select id="f-evento" style="width:170px"><option value="" selected="">todos os eventos</option><option value="geracao">Geração</option><option value="aprofundamento">Aprofundamento</option><option value="edicao">Edição</option></select>
        <input id="f-email" placeholder="e-mail" style="width:200px" value="">
        <input id="f-cliente" placeholder="cliente" style="width:140px" value="">
        <select id="f-aval" style="width:130px"><option value="" selected="">qualquer nota</option><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select>
        <label style="margin:0;display:flex;align-items:center;gap:6px;text-transform:none"><input type="checkbox" id="f-desc" style="width:auto" value="on"> só descartados</label>
        <button class="btn" id="f-go">Filtrar</button></div>
      <div class="card"><table><thead><tr><th>Quando</th><th>Quem</th><th>Evento</th><th>Template</th><th>Resumo</th><th>Nota</th><th></th></tr></thead><tbody>
      <tr><td class="sm muted">2026-09-07 21:40</td><td class="sm">consultor@witly.digital</td><td>Aprofundamento</td><td><code>acompanhamento-diario</code> v2<br><span class="sm muted">enxoval</span></td>
        <td class="sm"><b>Por que o CPL subiu nos últimos 3 dias?</b><br>O CPM subiu 31% (R$ 8,3 → R$ 10,9) com CTR estável em 1,6%; a decomposição atribui 84% da alta ao leilão. Não é criativo. <span class="pill pub">exemplo</span></td>
        <td>5</td>
        <td><a class="btn btn-ghost" href="#/atividade/act-1">ver mais</a></td></tr><tr><td class="sm muted">2026-09-07 21:40</td><td class="sm">consultor@witly.digital</td><td>Aprofundamento</td><td><code>acompanhamento-diario</code> v2<br><span class="sm muted">enxoval</span></td>
        <td class="sm"><b>Qual canal está pior?</b><br>Facebook meta 300 leads<br><span class="pill off">descartado</span> <span class="muted">inventou meta por canal</span> <span class="pill draft">regra</span></td>
        <td>—</td>
        <td><a class="btn btn-ghost" href="#/atividade/act-2">ver mais</a></td></tr><tr><td class="sm muted">2026-09-07 21:40</td><td class="sm">projetos@witly.digital</td><td>Geração</td><td><code>acompanhamento-diario</code> v2<br><span class="sm muted">enxoval</span></td>
        <td class="sm">Enxoval · Acompanhamento</td>
        <td>—</td>
        <td><a class="btn btn-ghost" href="#/atividade/act-3">ver mais</a></td></tr>
      </tbody></table></div>'''

# ── 7. Atividade · detalhe ─────────────────────────────────────────────────
DETALHE = r'''<div class="head"><div><a class="muted sm" href="#/atividade">← Atividade</a><h1>Aprofundamento · <code>acompanhamento-diario</code> v2</h1>
      <div class="sm muted">consultor@witly.digital · 2026-09-07 21:40 · cliente enxoval · nota da pessoa: <b>5</b></div></div>
      <div class="row"><button class="btn" id="rg">Virar regra</button><a class="btn btn-p" href="#/t/acompanhamento-diario/guia">Ajustar template</a></div></div>
      <div class="card"><h3>Pergunta</h3><p>Por que o CPL subiu nos últimos 3 dias?</p><h3>Resposta</h3><pre style="white-space:pre-wrap;background:#F9FAFB;color:inherit;border:1px solid var(--line)">O CPM subiu 31% (R$ 8,3 → R$ 10,9) com CTR estável em 1,6%; a decomposição atribui 84% da alta ao leilão. Não é criativo.</pre><h3>Consultas usadas</h3><pre style="background:#F9FAFB;color:inherit;border:1px solid var(--line)">[
  {
    "fn": "decomposicao",
    "metrica": "cpl"
  }
]</pre></div>
      <div class="card" style="margin-top:14px"><h3>Sua avaliação (editor)</h3><div class="row"><select id="en" style="width:120px"><option value="" selected="">— nota</option><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select><input id="ec" placeholder="comentário" value="" style="flex:1"><button class="btn btn-p" id="es">Salvar</button></div></div>'''

# ── 8. Uso ─────────────────────────────────────────────────────────────────
USO = r'''<div class="head"><div><h1>Uso por template</h1><p class="muted sm">Gerações, aprofundamentos, descartes e notas por versão. As perguntas mais frequentes dizem o que o template ainda não entrega.</p></div><a class="btn" href="#/atividade">← Atividade</a></div>
      <div class="card"><table><thead><tr><th>Template</th><th>Versão</th><th>Gerações</th><th>Aprofund.</th><th>Descartados</th><th>Nota média</th><th>Avaliações</th></tr></thead><tbody>
      <tr><td><a href="#/t/acompanhamento-diario"><code>acompanhamento-diario</code></a></td><td>v2</td><td>1</td><td>2</td><td>50%</td><td>4.0</td><td>1</td></tr>
      </tbody></table></div>
      <h2>Perguntas de aprofundamento mais frequentes</h2>
      <div class="card"><table><thead><tr><th>Template</th><th>Pergunta</th><th>Vezes</th></tr></thead><tbody>
      <tr><td><code>acompanhamento-diario</code></td><td>Por que o CPL subiu nos últimos 3 dias?</td><td>1</td></tr><tr><td><code>acompanhamento-diario</code></td><td>Qual canal está pior?</td><td>1</td></tr>
      </tbody></table></div>'''

# ── 9. Contextos gerais (fatia de 11 dos 27) ───────────────────────────────
CTX_ITENS = [
    ('dado-pessoal-nunca', 'pub', 'regra', 'Dado pessoal (e-mail, telefone, CPF, nome de lead) nunca entra em texto, tabela, registro ou template', True),
    ('analise-executada-nao-metodo', 'pub', 'regra', 'Entregue a análise executada, com números e conclusão; nunca o método ("calcule…", "avalie…")', False),
    ('meta-so-global', 'pub', 'regra', 'Meta existe só no nível global: nunca invente meta por canal, temperatura, público ou criativo', False),
    ('agregado-vem-da-tabela', 'pub', 'regra', 'Média, total, variação % e mín/máx vêm da tabela ou do motor, nunca de cabeça', False),
    ('base-pequena-sem-evidencia', 'pub', 'regra', 'Taxa sobre menos de ~30 eventos no denominador é "sem evidência", não resultado', False),
    ('taxa-nao-soma', 'pub', 'regra', 'Taxa, custo e ROAS nunca se somam nem tiram média simples: o geral é ponderado (Σ numerador ÷ Σ denominador)', False),
    ('numero-com-janela', 'pub', 'regra', 'Todo número vem com janela (ontem, 3 dias, 7 dias, lançamento) e a data do dado fechado', False),
    ('roas-liquido', 'leitor', 'definição', 'ROAS é líquido (faturamento ÷ investimento − 1): 0 empata, negativo é prejuízo, acima de 0 é lucro por real investido', False),
    ('cpa-e-cpl-vezes-conversao', 'leitor', 'definição', 'CPA = CPL ÷ conversão: a variação do CPA se explica por CPL e por conversão, nunca pelo próprio CPA', False),
    ('resposta-primeiro', 'draft', 'recomendação', 'Responda a pergunta em uma frase com o número decisivo antes de qualquer detalhe', False),
    ('recomendacao-em-fca-r', 'draft', 'recomendação', 'Recomendação em FCA-R: Fato (número + janela) → Causa → Ação → Resultado', False),
]
CTX_LISTA = ''.join(
    f'<button data-s="{slug}" class="{"on" if on else ""}"><span class="pill {cls}">{tipo}</span> {titulo}<br><code>{slug}</code></button>'
    for slug, cls, tipo, titulo, on in CTX_ITENS)
GERAIS = f'''<div class="head"><div><h1>Contextos gerais</h1><p class="muted sm">Poucos e curados: valem para <b>todo</b> template e vão junto com qualquer kit. Salvar publica na hora.</p></div></div>
        <div class="split"><div class="card"><p class="muted sm">O <b>título é a regra</b>: o agente lê pelos títulos. Corpo curto: por quê + como aplicar.</p><div class="list">{CTX_LISTA}</div>
          <div class="actions"><button class="btn" id="newg">+ Contexto geral</button></div></div>
        <div class="card"><label>Tipo</label><select id="g-tipo"><option value="regra" selected="">Regra — o agente não pode descumprir</option><option value="recomendacao">Recomendação — siga, salvo motivo dito</option><option value="definicao">Definição — como o termo é entendido</option></select>
          <label>Título (a regra em uma frase: o que fazer / não fazer)</label><input id="g-title" value="Dado pessoal (e-mail, telefone, CPF, nome de lead) nunca entra em texto, tabela, registro ou template">
          <label>Conteúdo (Markdown)</label><textarea id="g-body" class="">Métrica agregada pode; linha crua e identificador de pessoa, não. Se o CSV trouxer coluna pessoal, ela não sai da máquina e não vai para o relatório nem para o `registrar`.</textarea>
          <p class="muted sm">Atualizado 2026-09-08 15:01 por seed</p>
          <div class="actions"><button class="btn btn-ghost btn-danger" id="delg">Excluir</button><button class="btn btn-p" id="save">Salvar e publicar</button></div></div></div>'''

# ── 10. Design system (plataforma) ─────────────────────────────────────────
PLATAFORMA = r'''<div class="head"><div><h1>Plataforma</h1><p class="muted sm">Documentos que valem para <b>todo</b> template e entram em todo kit (zip): o design system dos aprofundamentos (widgets, binds, layout, regras). Salvar publica na hora.</p></div></div>
        <div class="split"><div class="card"><div class="list"><button data-s="design-system" class="on">Design system dos aprofundamentos<br><code>design-system.md</code></button></div>
          <div class="actions"><button class="btn" id="newd">+ Documento</button></div></div>
        <div class="card"><label>Título</label><input id="d-title" value="Design system dos aprofundamentos">
          <label>Nome do arquivo no kit (vazio = não entra no zip)</label><input id="d-file" value="design-system.md">
          <label>Conteúdo (Markdown)</label><textarea id="d-body" class="" style="min-height: 520px;"># Design system dos aprofundamentos

Todo aprofundamento entra **dentro do relatório**, como uma seção nova na página
"Aprofundamentos", usando os widgets do app. Nada de HTML solto. O agente escreve prosa
(título, achados, notas); **número só via `bind`** a uma tabela do dataset que você
calculou c
…</textarea>
          <p class="muted sm">Atualizado 2026-09-08 15:01 por seed</p>
          <div class="actions"><button class="btn btn-p" id="save">Salvar e publicar</button></div></div></div>'''

# ── 11. Usuários ───────────────────────────────────────────────────────────
USUARIOS = r'''<div class="head"><div><h1>Usuários</h1><p class="muted sm">Contas <code>@witly.digital</code> entram sozinhas como leitor. Desativar corta o MCP e a UI na próxima chamada e encerra as sessões.</p></div>
      <div class="row"><input id="u-email" placeholder="e-mail para convidar" style="width:260px" value=""><select id="u-role" style="width:120px"><option value="leitor" selected="">leitor</option><option value="editor">editor</option></select><button class="btn btn-p" id="u-add">Convidar</button></div></div>
      <div class="card"><table><thead><tr><th>E-mail</th><th>Nome</th><th>Papel</th><th>Ativo</th><th></th></tr></thead><tbody>
      <tr data-e="consultor@witly.digital"><td>consultor@witly.digital</td><td>Consultor</td>
        <td><select data-role=""><option selected="">leitor</option><option>editor</option></select></td>
        <td><span class="pill pub">ativo</span></td>
        <td class="row" style="justify-content:flex-end"><button class="btn" data-toggle="">Desativar</button><button class="btn btn-ghost" data-revoke="">Encerrar sessões</button></td></tr><tr data-e="parceiro@exemplo.com"><td>parceiro@exemplo.com</td><td></td>
        <td><select data-role=""><option selected="">leitor</option><option>editor</option></select></td>
        <td><span class="pill off">desativado</span></td>
        <td class="row" style="justify-content:flex-end"><button class="btn" data-toggle="">Reativar</button><button class="btn btn-ghost" data-revoke="">Encerrar sessões</button></td></tr><tr data-e="projetos@witly.digital"><td>projetos@witly.digital</td><td>projetos</td>
        <td><select data-role="" disabled=""><option>leitor</option><option selected="">editor</option></select></td>
        <td><span class="pill pub">ativo</span></td>
        <td class="row" style="justify-content:flex-end"><span class="muted sm">você</span></td></tr>
      </tbody></table></div>'''

PAGINAS = [
    ('Main.dc.html', 'templates', CATALOGO, 900, 'Templates · catálogo'),
    ('TemplateInfo.dc.html', 'templates', INFO, 800, 'Template · Info'),
    ('TemplateContexto.dc.html', 'templates', CONTEXTO, 940, 'Template · Contexto'),
    ('TemplateVersoes.dc.html', 'templates', VERSOES, 720, 'Template · Versões'),
    ('Pessoais.dc.html', 'pessoais', PESSOAIS, 460, 'Pessoais'),
    ('Atividade.dc.html', 'atividade', ATIVIDADE, 800, 'Atividade'),
    ('AtividadeDetalhe.dc.html', 'atividade', DETALHE, 820, 'Atividade · detalhe'),
    ('Uso.dc.html', 'atividade', USO, 640, 'Uso por template'),
    ('Gerais.dc.html', 'gerais', GERAIS, 980, 'Contextos gerais'),
    ('DesignSystem.dc.html', 'plataforma', PLATAFORMA, 1120, 'Design system'),
    ('Usuarios.dc.html', 'usuarios', USUARIOS, 600, 'Usuários'),
]

COLS = [0, 1400, 2800]
artboards, y, row_h = [], 0, 0
for i, (name, nav, body, h, titulo) in enumerate(PAGINAS):
    write(name, nav, body, h)
    col = i % 3
    if col == 0 and i:
        y += row_h + 190
        row_h = 0
    row_h = max(row_h, h)
    artboards.append({'file': name, 'x': COLS[col], 'y': y, 'w': 1280, 'h': h, 'title': titulo})

canvas = {
    'artboards': artboards,
    'annotations': [
        {'id': 'nota-fonte', 'x': 0, 'y': -170, 'w': 620,
         'text': 'Witly Grimório — a UI como ela está hoje (witly-templates/public).\nCada prancheta é o DOM real da página com o style.css real: Poppins, roxo #7C3AED, cards de 14px, botões de 9px, barra de 56px.\nPara redesenhar: mexa aqui e depois leve para o app.'},
        {'id': 'nota-cortes', 'x': 700, 'y': -170, 'w': 560,
         'text': 'Dois cortes para as pranchetas caberem: Versões mostra 6 das 14 versões e Contextos gerais 11 dos 27. Textos longos de campo aparecem truncados.'},
    ],
    'launch': {'view': 'canvas'},
}
with open(os.path.join(HERE, 'canvas.json'), 'w', encoding='utf-8') as f:
    json.dump(canvas, f, ensure_ascii=False, indent=2)
print(len(PAGINAS), 'pranchetas ·', 'altura total', y + row_h)
