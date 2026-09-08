"""Gera os HTMLs standalone das páginas (um arquivo por página, CSS inlinado).

São os mesmos DOM/CSS reais das pranchetas do canvas, mas como página HTML normal:
abre no navegador sozinha e é o formato que o projeto do Claude Design espera
(a primeira linha traz o marcador @dsCard que vira o card no painel Design System).
"""
import os

import gen  # reaproveita CSS, header() e o conteúdo de cada página

OUT = os.path.join(gen.HERE, 'standalone')
os.makedirs(OUT, exist_ok=True)

DOC = '''<!-- @dsCard group="Plataforma · páginas" -->
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{titulo} · Witly Grimório</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap">
<style>
{css}
</style>
</head>
<body>
{header}
<main id="app">
{body}
</main>
</body>
</html>
'''

SLUG = {
    'Main.dc.html': 'templates-catalogo',
    'TemplateInfo.dc.html': 'template-info',
    'TemplateContexto.dc.html': 'template-contexto',
    'TemplateVersoes.dc.html': 'template-versoes',
    'Pessoais.dc.html': 'pessoais',
    'Atividade.dc.html': 'atividade',
    'AtividadeDetalhe.dc.html': 'atividade-detalhe',
    'Uso.dc.html': 'uso-por-template',
    'Gerais.dc.html': 'contextos-gerais',
    'DesignSystem.dc.html': 'design-system',
    'Usuarios.dc.html': 'usuarios',
}

escrito = []
for name, nav, body, h, titulo in gen.PAGINAS:
    slug = SLUG[name]
    doc = DOC.format(titulo=titulo, css=gen.CSS.strip(), header=gen.header(nav), body=body.strip())
    path = os.path.join(OUT, f'{slug}.html')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(doc)
    escrito.append((f'paginas/{slug}.html', titulo, h))

for p, t, h in escrito:
    print(f'{p:42} {t:24} {h}px')
print(len(escrito), 'páginas em', OUT)
