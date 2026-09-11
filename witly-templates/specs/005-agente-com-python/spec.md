# Spec 005 — O agente com Python na mão; perguntas e definições como entradas

**Estado**: aprovada na conversa de 2026-09-08 ("pode seguir"), com uma condição do Matheus:
**a primeira versão do relatório continua nascendo inteira no Python** (`gerar.py` → 4 camadas +
`numeros.json` + `relatorio.html`). O que fica para as pessoas é a camada de cima — regras,
perguntas, definições. A reescrita do renderer em JS (spec 004) fica parada.

## Problema
O kit carrega dois Pythons: o que **gera** o relatório (`calc.py` + `build_report.py` + `gerar.py`)
e o que **calculava para o LLM do app antigo** (`query_api.py` com um menu de consultas por CLI,
e `perguntas/banks/*.py` pontuando relevância). No Grimório o "modelo" é o agente do consultor,
com Python e o CSV na mão: ele escreve o corte que a pergunta pede. O segundo Python é um menu
que o agente não precisa, ~2,4 k linhas em 5 motores, e confunde ("por que dois?").

Ao mesmo tempo, o que **é** conhecimento (as perguntas que valem aprofundar, as definições de
cada métrica, o know-how de decompor CPL ou achar onde a piora concentra) está preso dentro de
Python ou solto no `guia.md` — não é entrada editável, não é versionado como regra, não chega
ao agente como "o título já diz".

E o agente **não tem como contribuir**: `registrar` só relata; `salvar_template` não aceita
regras; não existe "sugiro esta regra" que caia na triagem do editor.

## Decisões
1. **O kit para de embarcar `query_api.py` e `perguntas/`.** O agente recebe `calc.py` (as
   definições, importáveis), `build_report.py`, `gerar.py`, `aprofundar.py` (o portão: número só
   via `bind`). O `gerar.py` deixa de escrever `perguntas.json`. Os arquivos continuam no app
   (`app/pysrc`) para o deep mode dele — nada é apagado do app.
2. **Pergunta é entrada**, na mesma tabela das regras: `template_rules.tipo = 'pergunta'`
   (título = a pergunta; corpo = como aprofundar / que decisão alimenta). Mesma UI, mesmo
   versionamento, mesmo diff, mesma cópia em rascunho/publicação/restauração. Fonte no git:
   `seed/<kit>/perguntas/<id>.md`. O agente lê `numeros.json` e propõe as 3–5 no chat — sem
   scoring em Python.
3. **Definição é entrada** (`tipo = 'definicao'`, que já existe): as fórmulas do `## Definições`
   dos guias e o know-how que estava em funções do `query_api` (decomposição de CPL, onde a
   piora concentra, impacto em receita, saturação) viram entradas em `seed/<kit>/regras/`. O
   `guia.md` fica com mecânica e "como ler".
4. **O agente propõe**: tool `sugerir_regra({slug, tipo, titulo, corpo?, motivo?})` grava
   `activity` com `evento = 'sugestao'` e cai na **mesma fila de triagem** (sem veredito). Aceitar =
   "virar regra" cria a entrada no rascunho com o tipo/título sugeridos. `salvar_template`
   passa a aceitar `regras` (com perguntas). O evento `edicao` sai das tools (ninguém emite).
5. **Higiene**: seed idempotente por hash de conteúdo (não publica versão igual);
   `seed/<kit>/contexto/` → `tarefas/`; viewer embute só o subset `latin` (o português cabe
   nele); "último uso" conta também as chamadas de tool (`usage_log`). `oauth-utils.ts` fica:
   9 dos 12 exports são usados pelo login.

## Requisitos
- FR-1 `kit-assemble` não copia `query_api.py` nem `perguntas/`, e apaga cópias antigas.
- FR-2 `gerar.py` não gera `perguntas.json`; `como_gerar` dos manifestos passa a 4 passos
  (tarefas → queries → gerar → ler/propor) + aprofundar sem CLI de consulta.
- FR-3 `template_rules.tipo` aceita `pergunta`; `obter_template`, `perguntas` (tool), o resource
  `template://<slug>/perguntas` e o `perguntas.md` do zip vêm das entradas.
- FR-4 UI: aba **Perguntas** edita entradas `tipo = pergunta` (mesmo pane das Regras, filtrado);
  aba Regras não mostra perguntas; `kit n/10` conta perguntas pelas entradas.
- FR-5 `sugerir_regra` (MCP): gate de PII, template visível, `evento = 'sugestao'`, `dados =
  {tipo, titulo, corpo, motivo}`; aparece na Atividade e na revisão com "Aceitar como entrada" e
  "Descartar"; aceitar cria a entrada no rascunho e fecha o veredito como `regra`.
- FR-6 `salvar_template.regras`: `{id: {tipo, title, body_md}}`; validação de id e PII.
- FR-7 Seed: `content_hash` (sha-256 de manifesto + arquivos + tarefas + regras) gravado em
  `template_versions`; kit com hash igual ao publicado não gera versão (`--force` ignora).
- FR-8 Migração 0008: `activity.evento` aceita `sugestao` (tabela recriada — SQLite não altera
  CHECK), índices refeitos; `template_versions.content_hash`.

## Fora de escopo
Renderer em JS (spec 004). Unificar `usage_log` e `activity` numa tabela. Apagar `query_api`
do app. Detectar nome de pessoa no gate de PII.

## Testes
- Vitest: tipo `pergunta` no kit/zip/tool/resource; `sugerir_regra` → fila → aceitar cria
  entrada; `salvar_template` com regras; `edicao` recusado pela tool; hash no seed (função pura).
- `unittest` dos 5 kits sem `perguntas.json`; paridade kit == app inalterada.
- Manual no browser: aba Perguntas, card de sugestão na triagem, aceitar → aba Regras.

## Emenda (2026-09-11): a análise livre no design system dos templates
O exemplo da análise livre era uma página nua (destaque + 1 card + 1 gráfico), porque o
"design system" que ela recebia era o contrato do **aprofundamento** (uma seção solta). Decisão
do Matheus: **o design system é um contrato com instruções; os HTMLs reais vêm como arquivos no
zip**. Então:
- `seed/_shared/relatorio.py`: builder em Python com o mesmo esqueleto do debriefing e do
  acompanhamento (páginas com sidebar, eyebrow, kpi `feature` com meta, banda, comparativo,
  gráfico/tabela por bind, série no tempo, funil, barras, achado em card, ação). Número entra
  como número (texto é recusado); a prosa só cita o que está numa tabela ou num card.
- `seed/analise-livre/python/exemplo/` (`calc_livre.py` + `build.py` + fixture sintética): o
  exemplo é um relatório de 3 páginas (Panorama · a pergunta · One Pager); o seed gera o exemplo
  por ele. A pasta `relatorio/` em JSON (`montar.py`) fica como caminho alternativo.
- Manifesto `exemplos_de`: o zip leva `exemplos/<slug>.html` dos templates listados (a análise
  livre leva debriefing e acompanhamento), além do próprio `exemplo/relatorio.html`.
- O contrato do design system (documento da plataforma) ganha a seção "Documento inteiro";
  `documento.md`, `guia.md`, tarefas e regra da análise livre falam do `build.py`.
- `aprofundar._numbers_in` passa a entender "53.6%" e "1.536" (ponto decimal × milhar).

