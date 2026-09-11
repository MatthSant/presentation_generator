# Spec 006 — Design system vivo: galeria interativa, regras como entradas, versionado

**Estado**: pedida em 2026-09-11 ("o ideal é que a UI me mostre esses elementos… de forma
interativa… com versionamento… e um MD com indicações gerais… as regras num banco, editáveis").

## Problema
O design system é um Markdown num textarea (`platform_docs`), publicado na hora, sem histórico.
Ninguém vê como um elemento fica sem gerar um relatório; as regras ("KPI com meta sempre mostra
a comparação") ficam soltas no texto; e não há como evoluir o design com o uso, versão a versão.

## Decisão
O design system passa a ser **um template versionado** (`templates.kind = 'design'`, slug
`design-system`, fora do catálogo e do MCP como template), reaproveitando rascunho → publicar
(semver), histórico, diff e restaurar. Ele tem três partes:
1. **Contrato** (`contrato.md`): as indicações gerais — o que compor, a grade, o catálogo de
   widgets. Um arquivo do rascunho, editável na UI.
2. **Regras** (`template_rules`, tipo regra/recomendação/definição): uma entrada por regra, o
   título é a regra ("KPI com meta sempre mostra a comparação com a meta"). Mesma aba Regras
   dos templates. Entram no kit e no MCP com o contrato.
3. **Elementos** (`elementos/<id>.json`): um por elemento da galeria — `{grupo, title, desc,
   call, widgets, layout, dataset}` — a chamada Python (`s.kpi(...)`) e o widget que ela
   produz, gerados pelo próprio `relatorio.py` no seed (`galeria.py`) e depois editáveis.

A UI ganha a tela **Design system** (`#/design`): **Galeria** (o viewer renderiza os elementos,
agrupados; clicar num elemento abre o editor lateral: JSON do elemento, "Pré-visualizar" mostra
na hora sem salvar, "Salvar no rascunho" persiste) · **Regras** · **Contrato** · **Versões**.

O `design-system.md` do kit e o resource `contrato://widgets` são **gerados da versão publicada**:
contrato + regras + elementos (chamada → JSON). O `platform_docs` deixa de ter o design system.

## Requisitos
- FR-1 Migração 0009: `templates.kind` (`analise` | `design`); catálogo, MCP, saúde e stats
  ignoram `kind = 'design'`.
- FR-2 `seed/design-system/`: manifesto (`kind: design`), `contrato.md` montado das fontes de
  hoje (contrato + catálogo do app + regras de design), `regras/*.md` iniciais, `galeria.py` que
  gera `elementos/*.json` com o `relatorio.py`. Sem Python no kit desse template.
- FR-3 `src/kit/design.ts`: `designSystemMd(kit)`, `designReport(kit, elementoEmFoco?)` (uma
  página por grupo, uma seção por elemento; o elemento em foco vem primeiro) e `renderReportHtml`.
- FR-4 Rotas: `GET /design/preview?state=draft|published&el=<id>` (HTML, sessão da UI);
  `POST /design/preview` com `{state, el, elemento}` renderiza o elemento editado sem salvar.
  Elementos, regras, contrato, publicação, versões e diff usam as rotas de template já existentes.
- FR-5 UI `#/design`: galeria (iframe + lista), editor lateral com pré-visualização, abas Regras,
  Contrato e Versões (panes reaproveitados); nav "Design system" aponta para cá.
- FR-6 Seed: kit `kind = design` não monta Python nem exemplo; o seed **não sobrescreve** versão
  publicada por pessoa (autor ≠ `seed`) sem `--force` — vale para todos os kits.
- FR-7 `obter_template`/resource/zip: o design system vem de `designSystemMd`; sem versão
  publicada, cai no `platform_docs` legado.

## Fora de escopo
Editor visual arrastável; formulário por parâmetro (a interatividade é editar o JSON do elemento
com pré-visualização instantânea, mais os controles vivos do próprio viewer).

## Testes
- Vitest: `kind` some do catálogo/MCP; `designSystemMd` com contrato + regras + elementos;
  `designReport` põe o elemento em foco primeiro; `/design/preview` exige sessão e renderiza;
  POST renderiza o elemento editado; zip usa o design publicado.
- Manual: galeria no browser, editar um KPI e pré-visualizar, salvar, publicar v1.0.1, diff.
