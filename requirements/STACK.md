# Stack Técnica

## TL;DR

Não há Python, Node.js, Docker nem etapa de build.  
O projeto é **frontend estático puro** — os outputs são arquivos `.html` que abrem diretamente no browser.  
Todas as dependências de runtime são carregadas via CDN na abertura do arquivo.

---

## Dependências de runtime (CDN)

Carregadas automaticamente pelo browser ao abrir os arquivos gerados.  
Não há `npm install`, `pip install` nem nada a executar.

| Biblioteca | Versão | Uso | CDN |
|---|---|---|---|
| **Reveal.js** | `5.1.0` | Framework de slides (apresentações) | `cdn.jsdelivr.net/npm/reveal.js@5.1.0` |
| **ApexCharts** | latest | Visualização de dados (todos os gráficos) | `cdn.jsdelivr.net/npm/apexcharts` |
| **html2canvas** | `1.4.1` | Exportação PNG 3× no `/make-design` | `cdn.jsdelivr.net/npm/html2canvas@1.4.1` |
| **Google Fonts** | — | Tipografia — família Exo 2 (400–900) | `fonts.googleapis.com` |

> **Offline:** os arquivos `.html` precisam de conexão na **primeira abertura** para carregar CDN e fontes. Após o carregamento inicial o browser faz cache; exportações PNG subsequentes não requerem rede adicional.

---

## Ferramentas de desenvolvimento

O que você precisa ter instalado na sua máquina para usar este projeto.

| Ferramenta | Versão mínima | Função |
|---|---|---|
| **Claude Code** | qualquer | Executa as skills (`/plan-slides`, `/build-slides`, `/make-design`) |
| **Git** | qualquer | Controle de versão |
| **PowerShell** | 5.1+ | Cópia de arquivos nos comandos das skills (Windows) |
| **Browser moderno** | Chrome 90+ / Firefox 90+ / Edge 90+ | Visualizar e exportar os outputs |

> **Sistema operacional:** os comandos de arquivo nas skills usam PowerShell (Windows). Em macOS/Linux seria necessário adaptar os comandos `Copy-Item`/`New-Item` para `cp`/`mkdir`.

---

## Estrutura de outputs

Nenhum output é comitado no repositório (listados no `.gitignore`):

```
output/               ← gerado por /build-slides e /make-design
  presentation.html   ← abre direto no browser
  backgrounds/        ← SVGs copiados automaticamente pela skill
  elements/           ← elementos isolados gerados por /make-design

temp/                 ← arquivos intermediários do pipeline
  analise_summary.md
  slides_plan.md

input/                ← dados de análise do cliente (nunca comitar)
```

---

## Arquivos de referência (não são executados)

Ficam em `_source/` e também estão no `.gitignore`:

| Arquivo | Descrição |
|---|---|
| `design-system/index.html` | Design system visual completo — dark |
| `design-system/light-mode.html` | Design system visual completo — light |
| `template_presentation.html` | Apresentação de referência com todos os componentes |
| `REQUIREMENTS.md` | Spec técnica do parser/editor visual HTML |
| `slides.md` | Exemplo de slides em markdown |

---

## Componentes da biblioteca interna (`.claude/skills/components/`)

Estes arquivos são lidos pelas skills durante a geração — não são servidos nem compilados.

| Tipo | Arquivos | Descrição |
|---|---|---|
| **Shells** | `shell.html`, `shell-light.html`, `shell-element.html` | Wrappers HTML com CSS + JS completo |
| **Slides** | `slide-*.html` (5 arquivos) | Templates de seções Reveal.js |
| **Blocos** | `block-*.html` (14 arquivos) | Componentes de conteúdo reutilizáveis |
| **Gráficos** | `chart-*.html` (11 arquivos) | Snippets de `chartDefs` por tipo |
| **Backgrounds** | `backgrounds/*.svg` (9 dark + 9 light) | SVGs decorativos copiados para `output/` |
| **Catálogo** | `tools-map.md` | Regras de uso e mapeamento de componentes |

---

## Versionamento das dependências

Atualmente ApexCharts é carregado sem versão fixada (`latest`). Para garantir reprodutibilidade em produção, considerar fixar para uma versão específica no shell:

```html
<!-- atual (latest) -->
<script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>

<!-- versionado (recomendado para produção) -->
<script src="https://cdn.jsdelivr.net/npm/apexcharts@3.54.0/dist/apexcharts.min.js"></script>
```

> **Nota:** `html-to-image` foi descartado por instabilidade ao serializar SVGs do ApexCharts em contexto local (file://). `html2canvas` é mais robusto para captura de conteúdo misto SVG + HTML.
