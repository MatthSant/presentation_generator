# Spec: Fase 2 — Atividade, avaliação, versões, templates pessoais e perguntas norteadoras

**Branch**: `feat/mcp-templates` (continua) · **Criada**: 2026-09-07 · **Status**: Rascunho revisado em 2026-09-07 (2 decisões + US6 do dono) — aguarda OK final para o plano
**Origem**: [PLANO.md](../../PLANO.md) §Registro de atividade e §Fases (2) · [constitution.md](../../constitution.md) · Fase 1 em [../001-fase1-mcp-templates/](../001-fase1-mcp-templates/)

Escopo: o que faz o Grimório **aprender com o uso** e ficar seguro de evoluir. Fora de escopo
(spec 003): os outros quatro templates (debriefing, histórico, criativos, conversão por
perfil). Fora de escopo (Fase 3): staging/`propor_template`, validação automática,
Sandbox, Vectorize, assistente de autoria.

Já entregue na Fase 1 e portanto fora daqui: papéis editor/leitor, convites, corte de
acesso, rascunho → publicado.

---

## Histórias de usuário

### US1 — O agente registra o que fez e o editor vê (P1)

Ao terminar uma geração ou um aprofundamento, o agente chama `registrar`. O editor abre a
tela **Atividade** e vê quem gerou o quê, com que template e versão, que perguntas de
aprofundamento foram feitas e como a pessoa avaliou.

**Por que P1**: é o sinal que hoje o `deepen_history` dá e sem o qual o template não
evolui com base em uso real.

**Teste independente**: no Claude Code, gerar um documento e chamar `registrar`; na UI,
a entrada aparece com os campos certos e sem PII.

**Cenários de aceitação**:

1. **Dado** o MCP conectado, **quando** o agente chama
   `registrar({evento:'geracao', slug, versao, cliente, contexto:{…}, resultado:{…}})`,
   **então** a plataforma grava a entrada com o e-mail do login, a data, o template e a
   versão, e devolve o `id`.
2. **Dado** um aprofundamento, **quando** o agente chama
   `registrar({evento:'aprofundamento', slug, pergunta, resposta, consultas:[…], avaliacao?, descartado?, motivo?})`,
   **então** a entrada guarda pergunta, resposta (prosa e tabelas agregadas), consultas
   usadas e o veredito.
3. **Dado** qualquer `registrar`, **quando** o conteúdo contém e-mail, telefone ou CPF,
   **então** a plataforma recusa com a lista do que encontrou e nada é gravado
   (constituição II; gate de PII).
4. **Dado** um editor na UI, **quando** abre Atividade, **então** vê a lista filtrável
   por pessoa, template, cliente, evento, período e avaliação, com o detalhe de cada
   entrada.
5. **Dado** um leitor, **quando** tenta abrir Atividade, **então** vê só as próprias
   entradas.

### US2 — O editor transforma atividade em melhoria do template (P2)

De uma entrada de aprofundamento, o editor clica **Virar exemplo** (a pergunta e a
resposta entram no guia do template como exemplo), **Virar regra** (o motivo de descarte
vira um item de "o que NÃO concluir" no guia) ou **Ajustar template** (abre o editor do
rascunho na aba certa). O `guia` do MCP passa a trazer isso na versão seguinte.

**Por que P2**: fecha o ciclo uso → template, que é a razão da tela existir.

**Teste independente**: de uma entrada avaliada com 5, "Virar exemplo"; publicar; o
`guia` no agente traz a seção "Exemplos de aprofundamento" com a pergunta.

**Cenários de aceitação**:

1. **Dado** uma entrada de aprofundamento, **quando** o editor clica "Virar exemplo",
   **então** o rascunho do template ganha (ou estende) uma seção `## Exemplos de
   aprofundamento` no `guia.md` com pergunta e resposta, e a entrada fica marcada como
   "virou exemplo".
2. **Dado** uma entrada descartada com motivo, **quando** clica "Virar regra", **então**
   o rascunho ganha um item na seção `## O que NÃO concluir` do `guia.md` com o motivo,
   e a entrada fica marcada como "virou regra".
3. **Dado** uma entrada, **quando** clica "Ajustar template", **então** abre
   `#/t/<slug>/guia` do rascunho (criando o rascunho se preciso).
4. **Dado** uma entrada, **quando** o editor reavalia (nota própria) ou comenta,
   **então** fica guardado ao lado da avaliação da pessoa.

### US3 — Avaliar o template e ver o uso (P2)

O agente (ou a pessoa, pelo agente) chama `avaliar(slug, nota, comentario)`. O editor vê,
por template e versão: quantas gerações, avaliação média, taxa de descarte, e as
perguntas de aprofundamento mais frequentes.

**Por que P2**: diz qual template merece atenção e o que as pessoas pedem que ele ainda
não entrega.

**Teste independente**: duas avaliações → o painel mostra a média e a contagem.

**Cenários de aceitação**:

1. **Dado** o MCP, **quando** chama `avaliar('acompanhamento-diario', 4, 'faltou X')`,
   **então** grava com e-mail, versão publicada no momento e data.
2. **Dado** a tela Atividade, **quando** o editor abre "Uso", **então** vê por template
   e versão: gerações, aprofundamentos, avaliação média, % descartados, top 10
   perguntas (agrupadas por texto normalizado).

### US4 — Versões com histórico e rollback (P2)

O editor vê a lista de versões de um template (número, autor, data, estado, nota de
mudança), compara duas versões e **restaura** uma antiga como novo rascunho.

**Por que P2**: hoje publicar é irreversível; sem isso ninguém edita com confiança.

**Teste independente**: publicar v3, restaurar v2 → rascunho v4 igual à v2; publicar;
o MCP entrega v4.

**Cenários de aceitação**:

1. **Dado** um template, **quando** o editor abre "Versões", **então** vê todas as
   versões com número, estado, autor, data e nota de mudança.
2. **Dado** "Publicar", **quando** o editor confirma, **então** pode escrever uma nota
   de mudança (changelog), guardada na versão.
3. **Dado** duas versões, **quando** o editor pede "comparar", **então** vê o diff por
   arquivo/tarefa (adicionado, removido, alterado) em texto.
4. **Dado** uma versão antiga, **quando** clica "Restaurar", **então** um rascunho novo
   (número máximo + 1) nasce como cópia dela; a publicada não muda até publicar.
5. **Dado** um leitor, **quando** vê "Versões", **então** só lê.

### US6 — Templates pessoais: salvar pelo agente, promover pela UI (P1)

Uma pessoa faz uma análise específica (ex.: um recorte para um cliente) e quer guardar o
jeito de fazer. Pelo agente, chama `salvar_template` com o kit; o template fica
**pessoal**: só ela vê e usa no MCP, no mesmo lugar e no mesmo formato dos oficiais. Os
editores veem todos os pessoais na UI, com dono e uso, e podem **promover** um deles para
toda a organização ou **remover**.

**Por que P1**: é o que faz o padrão de cada um nascer já dentro da plataforma, em vez de
num arquivo solto, e dá ao editor o sinal de quais padrões merecem virar oficiais.

**Teste independente**: no Claude Code, `salvar_template` com um kit mínimo →
`listar_templates` mostra o pessoal para o dono e não para outra pessoa → na UI, um editor
o vê em "Pessoais" e promove → aparece para todos.

**Cenários de aceitação**:

1. **Dado** o MCP conectado, **quando** o agente chama
   `salvar_template({slug, name, objective, when_to_use, manifest, arquivos:{caminho:conteudo}, contexto:{tarefa:{title, body_md}}, notas?})`,
   **então** a plataforma cria (ou atualiza, se o slug já é dela) um template pessoal
   **publicado** do dono, e devolve slug e versão. O kit passa pelo gate de PII.
2. **Dado** um template pessoal, **quando** o dono chama `listar_templates` ou
   `obter_template`, **então** ele aparece marcado como "pessoal"; outra pessoa não o vê
   nem o obtém.
3. **Dado** slug já usado por um template da organização ou pessoal de outra pessoa,
   **quando** tenta salvar, **então** recebe erro pedindo outro slug.
4. **Dado** um editor na UI, **quando** abre "Pessoais", **então** vê todos os templates
   pessoais com dono, data, versão e uso (gerações/aprofundamentos), filtráveis por dono
   e por uso; um leitor vê só os seus.
5. **Dado** um template pessoal, **quando** o editor clica "Promover para todos",
   **então** ele vira template da organização (dono creditado, histórico de versões
   mantido) e passa a aparecer para todos no MCP; o slug é mantido se livre, senão o
   editor escolhe outro.
6. **Dado** um template pessoal, **quando** o editor (ou o dono) remove, **então** ele
   some do MCP e da UI; as entradas de atividade dele continuam (histórico).
7. **Dado** um template pessoal, **quando** o dono o edita na UI, **então** vale o mesmo
   fluxo rascunho → publicar dos oficiais, restrito ao dono.

### US7 — Perguntas norteadoras no kit (P2)

Cada template traz um **banco de perguntas norteadoras**: o que vale aprofundar em cada
caso relevante (ex.: "o maior furo do funil está no Connect?"), com a regra de quando a
pergunta é relevante e como aprofundar (qual consulta do `query_api`). A relevância é
**calculada localmente** sobre os números gerados (`perguntas.json` ranqueado), como no
app. O agente recebe o banco no kit e a lista ranqueada depois de gerar.

**Por que P2**: o consultor já parte de uma base do que perguntar, em vez de inventar; e
as perguntas seguidas alimentam a Atividade.

**Decidido pelo dono:** as perguntas **não entram no HTML**. Elas vão para o **chat**, como
sugestões: o agente lê o `perguntas.json` (relevância calculada) e o resultado da campanha
(`numeros.json`) e propõe ao consultor o que vale aprofundar, com a justificativa.

**Teste independente**: gerar com a fixture → `perguntas.json` ranqueado; `perguntas(slug)`
no MCP devolve o banco; a UI edita o banco na aba Perguntas.

**Cenários de aceitação**:

1. **Dado** o kit do acompanhamento, **quando** o agente roda `gerar.py`, **então** sai
   também `perguntas.json` com id, pergunta, justificativa, KPIs, relevância (0–100),
   nível e o prompt de aprofundamento, ordenado por relevância.
2. **Dado** o MCP, **quando** chama `perguntas(slug)` ou `obter_template`, **então**
   recebe o banco legível (`perguntas.md`: pergunta, quando é relevante, como aprofundar).
3. **Dado** a UI, **quando** o editor abre a aba "Perguntas", **então** edita o
   `perguntas.md` (texto) e, na aba Python, o cálculo (`python/perguntas/banks/*.py`).
4. **Dado** um aprofundamento registrado com `pergunta_id`, **quando** o editor vê a
   Atividade, **então** a entrada aponta para a pergunta do banco (e o painel Uso conta
   "perguntas seguidas" por id).

### US8 — Aprofundamento construído no design system (P2)

Quando o consultor aceita uma sugestão e pede um aprofundamento, o agente o constrói
**dentro do relatório**, com os mesmos widgets do design system do app (kpi-card, chart,
table, find-block, find-note…), números só via `bind` a tabelas que ele calcula com o
`query_api.py` local, e o HTML é regerado. Nada de HTML inventado.

**Por que P2**: o aprofundamento é a parte mais visível do valor; fora do design system
ele vira um documento diferente do resto.

**Teste independente**: no kit, `python/aprofundar.py` recebe uma seção JSON + tabela e
regera o `relatorio.html` com a seção nova navegável; a seção passa na validação do contrato.

**Cenários de aceitação**:

1. **Dado** o kit, **quando** o agente lê `design-system.md` (contrato dos widgets, binds,
   layout de 12 colunas, regras de design), **então** sabe exatamente que JSON produzir.
2. **Dado** uma consulta do `query_api.py`, **quando** o agente monta a seção
   (`det-<id>.json` com widgets bindados a uma tabela `q-<id>` no `dataset.json`) e roda
   `python/aprofundar.py --out saida --secao det-x.json --tabela q-x.json --pergunta "…"`,
   **então** a seção entra em `data.json` (página "Aprofundamentos"), o dataset ganha a
   tabela e o `relatorio.html` é regerado com a seção navegável.
3. **Dado** uma seção fora do contrato (widget desconhecido, bind para tabela inexistente,
   número solto na prosa), **quando** roda `aprofundar.py`, **então** falha listando os
   erros (validação local, mesmo contrato do app) e nada é gravado.
4. **Dado** a seção gravada, **quando** o agente chama `registrar` do aprofundamento,
   **então** informa `pergunta_id` (se veio do banco) e a forma da seção.

### US5 — Importar o histórico do app como atividade inicial (P3)

O mantenedor importa o `deepen_history` do app (SQLite) como entradas de aprofundamento
do template correspondente, para a tela Atividade não começar vazia.

**Por que P3**: acelera o ciclo de melhoria com o que já existe, mas é trabalho de uma
vez.

**Cenários de aceitação**:

1. **Dado** um export do SQLite do app, **quando** o mantenedor roda o importador,
   **então** cada linha vira uma entrada `aprofundamento` com pergunta, resposta
   (do `modal_json`), avaliação, descarte e motivo, autor = e-mail do consultor quando
   houver, template = o mapeado de `analysis_type`, e marcada como `origem: 'app'`.
2. **Dado** uma linha com PII, **quando** importa, **então** é pulada e listada no
   relatório do importador.

---

## Casos de borda

- `registrar` sem `slug` conhecido → erro com os slugs disponíveis (não grava).
- `registrar` com `resposta` acima de 200 KB → recusa com o limite (a linha do D1 é 1 MB).
- "Virar exemplo" duas vezes na mesma entrada → não duplica no guia; avisa.
- "Restaurar" a própria publicada → cria rascunho igual à publicada (permitido, sem
  efeito até editar).
- Comparar versões com arquivo binário/JSON grande (exemplo) → mostra "alterado" sem diff
  linha a linha.
- Usuário desativado tinha entradas → continuam visíveis para editores (histórico não
  some).

---

## Requisitos funcionais

- **FR-001**: O MCP DEVE expor `registrar(evento, dados)` para `geracao`, `aprofundamento`
  e `edicao`, e `avaliar(slug, nota 1–5, comentario?)`; ambos gravam e-mail, data,
  template e versão publicada vigente.
- **FR-002**: Toda escrita vinda do MCP (`registrar`, `avaliar`) e do importador DEVE
  passar por um **gate de PII** (e-mail, telefone BR, CPF, e o padrão de "nome +
  sobrenome" só quando acompanhado de e-mail/telefone) que recusa e lista o que achou.
- **FR-003**: A UI DEVE ter a tela **Atividade** com filtros (pessoa, template, cliente,
  evento, período, avaliação, descartados) e detalhe; leitor vê só as próprias entradas.
- **FR-004**: De uma entrada, um editor DEVE poder: virar exemplo, virar regra, ajustar
  template, reavaliar e comentar; as duas primeiras editam o `guia.md` do **rascunho**
  (nunca a publicada) e marcam a entrada.
- **FR-005**: A UI DEVE ter o painel **Uso** por template e versão (gerações,
  aprofundamentos, média, % descartados, top perguntas).
- **FR-006**: Versões: listar, nota de mudança ao publicar, comparar duas, restaurar como
  rascunho novo. O MCP continua servindo só a publicada.
- **FR-007**: O `obter_template` e o prompt `gerar` DEVEM instruir o agente a chamar
  `registrar` ao terminar e a cada aprofundamento, e `avaliar` quando a pessoa der uma
  nota.
- **FR-008**: Importador do `deepen_history` do app (arquivo SQLite exportado) com
  mapeamento `analysis_type → slug`, relatório do que entrou e do que foi pulado.
- **FR-010**: Templates têm `owner_email` (NULL = organização). O MCP DEVE expor
  `salvar_template(kit)` (cria/atualiza só pessoais do próprio dono) e `remover_template(slug)`
  (só o próprio); `listar_templates`/`obter_template`/`montar_query`/`guia` DEVEM incluir os
  pessoais do usuário e nunca os de outra pessoa. A UI DEVE ter "Pessoais" (editor vê todos,
  com uso; leitor vê os seus), "Promover para todos" e "Remover". Escrita de kit pelo MCP
  passa pelo gate de PII (FR-002) e pelo limite de 1 MB por arquivo.
- **FR-011**: O kit DEVE poder conter `perguntas.md` (banco legível) e
  `python/perguntas/` (cálculo de relevância, copiado do app pelo kit-assemble);
  `gerar.py` DEVE gravar `perguntas.json` quando houver banco. O MCP DEVE expor
  `perguntas(slug)`; `registrar` aceita `pergunta_id`.
- **FR-012**: O kit DEVE conter `design-system.md` (contrato dos widgets e regras de design,
  gerado do app) e `python/aprofundar.py` (valida a seção contra o contrato, grava
  `det-*.json` + tabela no dataset + entrada em `data.json`, regera o HTML). O MCP DEVE
  expor o contrato como resource `contrato://widgets`.
- **FR-009**: Cada cenário desta spec tem teste automatizado (Worker; importador em
  Node); gate de PII com casos positivos e negativos.

## Entidades

- **Atividade**: id, evento, e-mail, org, template, versão, cliente (slug, não PII),
  data, `dados` (JSON: contexto/resultado ou pergunta/resposta/consultas), avaliação da
  pessoa, descartado + motivo, reavaliação do editor, comentário do editor, flags
  `virou_exemplo`/`virou_regra`, origem (`mcp` | `app`).
- **Avaliação de template**: id, slug, versão, e-mail, nota, comentário, data.
- **Versão de template** (existente) + `changelog`.
- **Template** (existente) + `owner_email` (NULL = organização), `promoted_from` (e-mail
  do dono original quando promovido), `notas`.

## Critérios de sucesso

- **SC-001**: Uma geração e um aprofundamento feitos no Claude Code aparecem na Atividade
  em até 1 minuto, sem PII.
- **SC-002**: "Virar exemplo" + publicar → o `guia` do MCP entrega o exemplo.
- **SC-003**: Restaurar uma versão antiga e publicar → o MCP entrega a restaurada.
- **SC-004**: O importador traz o histórico atual do app com relatório de pulos por PII.
- **SC-005**: Um template salvo pelo agente aparece só para o dono; promovido, aparece para todos.
- **SC-006**: Suíte verde (Worker + importador) com um teste por cenário.

## Premissas

- O agente obedece à instrução de chamar `registrar` (best-effort; o guia e o prompt
  reforçam). Não há como garantir do lado do servidor.
- Resposta de aprofundamento é prosa + tabelas **agregadas**: permitida (constituição II).
- O export do SQLite do app é fornecido pelo dono (`comments.db` da VM); o importador
  roda localmente e escreve no D1 via `wrangler d1 execute`.
- Diff de versões é textual por arquivo (sem editor visual de diff).
- **Decidido:** Atividade lista resumo (pergunta, template, nota, primeiras linhas) e abre
  a resposta completa em "ver mais".
- **Decidido:** plataforma primeiro (esta spec); os outros 4 templates são a spec 003.
- Template pessoal salvo pelo MCP nasce **publicado** (é da pessoa; não há revisor); o
  gate de PII e o limite de tamanho são as únicas barreiras. Promover não re-valida
  conteúdo além disso: o editor é quem lê antes de promover.

## Verificação da constituição

| Princípio | Como a spec atende |
|---|---|
| I | Nada roda no Worker além de gravar/ler; geração continua local. |
| II | FR-002 gate de PII em toda escrita do MCP e no importador; agregado permitido. |
| III | Nenhum número entra em template por esta spec; exemplos vão para o guia (prosa). |
| IV | "Virar exemplo/regra" edita o guia **do template**; nada vira contexto geral automaticamente. |
| V | Versões continuam a unidade; rollback = rascunho novo, publicada intacta. Template pessoal segue o mesmo modelo (versões, kit, zip). |
| VI | Mesmo Worker, mesmo login. |
| VII | Atividade/versões são genéricas para qualquer template. |
| VIII/IX | Esta spec; plano e tarefas após revisão; FR-009. |
