# Spec: Fase 3 — Os outros quatro templates (debriefing, criativos, histórico, conversão por perfil)

**Branch**: `feat/mcp-templates` (continua) · **Criada**: 2026-09-07 · **Status**: Revisada em 2026-09-07 (2 decisões do dono) — segue para plano
**Origem**: [PLANO.md](../../PLANO.md) §Fases · [constitution.md](../../constitution.md) · Fases 1–2 em `specs/001` e `specs/002`

Escopo: colocar no Grimório, no mesmo formato do `acompanhamento-diario`, os quatro tipos
que o app já tem: **debriefing de lançamento**, **análise de criativos**, **histórico de
lançamentos** e **conversão por perfil**. Cada um vira um template completo: manifesto com
tarefas de contexto, queries do montador, guia, documento, banco de perguntas, Python do
app copiado pelo kit-assemble, fixture sintética, testes e paridade com o app.

Fora de escopo: mudar o motor de qualquer tipo (o kit copia o `app/pysrc` como está),
controles interativos no HTML offline (ver premissas), staging/`propor_template`.

---

## O que os quatro têm de diferente do acompanhamento (levantado no app)

| Template | Dado de entrada | Auxiliares | Particularidades |
|---|---|---|---|
| **debriefing** | `VW_V2_inscricoes_res` de UM lançamento (utm × campanha × dia) | **goals.csv obrigatório** (`wtl_launch_goals`); temperatura por regra | 7 páginas (Panorama · Canal · Tráfego pago · Orgânico · Temporal · 360° · One pager); filtros de tipo/canal/temperatura/campanha/público/criativo são **recompute no servidor** no app |
| **criativos** | CSV ao nível de anúncio × dia × campanha × público (mídia + leads/vendas) | dicionário de links (opcional); temperatura e tipo de campanha por regra | dois **modos** (Resultado final × Captação) recalculados no servidor no app; uma ficha por criativo (sidebar); scatter e evolução por métrica |
| **histórico** | CSV consolidado: uma linha por evento × tráfego × plataforma × temperatura | — | vários lançamentos em ordem cronológica (`date_start`); filtro de lançamentos + toggle de métrica são recompute no servidor no app |
| **conversão por perfil** | dump multidimensional de pesquisa: uma linha por combinação de dimensões × lançamento × canal; linhas vazias = benchmark | — | `config.criterios` (id, coluna, rótulo, ordem, aliases) por cliente; canais; janelas 60 d / 12 m; **prosa autoral** (`content.json`: insights e detalhamentos) é do agente; motor canônico = `app/pysrc/conversao-perfil` (a skill antiga divergiu e NÃO é usada) |

---

## Histórias de usuário

### US1 — Debriefing de lançamento (P1)

Consultor pede "o debriefing do lançamento X". O agente executa as tarefas de contexto
(lançamento, temperatura, **goals obrigatório**), roda as queries, gera as 7 páginas e o
one pager, propõe perguntas do banco de debriefing no chat e aprofunda no design system.

**Por que P1**: é o pós-campanha que todo cliente recebe, e já existe um rascunho
`debriefing` criado pela UI em produção esperando conteúdo.

**Teste independente**: com a fixture sintética, `gerar.py` produz as 7 páginas; paridade
com o app; `montar_query` devolve dump + goals; falta de goals → erro claro antes de gerar.

**Cenários de aceitação**:

1. **Dado** `obter_template('debriefing')`, **então** o kit traz tarefas de contexto para
   lançamento, temperatura e **metas (goals.csv, obrigatório)**, as queries `dump` e
   `goals` (`montar_query` devolve as duas) e o guia com a leitura das 7 páginas.
2. **Dado** o kit e os CSVs, **quando** roda `gerar.py --config … --csv dump.csv --goals goals.csv`,
   **então** saem as 4 camadas (7 seções), `numeros.json`, `perguntas.json` e o HTML.
3. **Dado** `gerar.py` sem `--goals`, **então** falha dizendo que o debriefing exige metas.
4. **Dado** a fixture, **então** `dataset.json` do kit é idêntico ao do app (paridade).

### US2 — Análise de criativos (P2)

Consultor pede "os criativos do lançamento X". O agente identifica o lançamento, classifica
temperatura e tipo de campanha, roda a query de mídia (e a do dicionário de links), escolhe o
**modo** com o consultor e gera panorama + fichas.

**Cenários de aceitação**:

1. **Dado** o kit, **então** as tarefas de contexto cobrem lançamento, temperatura, tipo de
   campanha, dicionário (opcional) e **modo** (Resultado final × Captação, com a regra de
   quando usar cada um).
2. **Dado** `gerar.py --opts '{"mode":"captacao"}'`, **então** o HTML sai no modo pedido
   (snapshot); sem `--opts`, no modo padrão do motor.
3. **Dado** o `dict.csv`, **então** as fichas trazem o link do anúncio; sem ele, só o nome.
4. Paridade com o app para a fixture.

### US3 — Histórico de lançamentos (P2)

Consultor pede "como a operação evoluiu nos últimos lançamentos". O agente monta a query
consolidada (vários `field_conversion`), gera panorama + quebras e propõe perguntas do banco
de histórico.

**Cenários de aceitação**:

1. **Dado** o kit, **então** a tarefa de contexto "lançamentos" orienta a listar os eventos
   do cliente em ordem cronológica e a escolher quais entram (todos por padrão).
2. **Dado** `gerar.py --opts '{"launches":[…],"metric":"conv"}'`, **então** o HTML sai com o
   recorte e a métrica pedidos (snapshot); sem `--opts`, todos os lançamentos e `conv`.
3. Paridade com o app para a fixture.

### US4 — Conversão por perfil (P3)

Consultor pede "quais perfis convertem melhor" para um cliente. O agente descobre as
dimensões do dump (renda, idade, `custom_field_N`…), monta `config.criterios` com o
consultor, gera panorama + uma página por critério + detalhamentos, e **escreve a prosa
autoral** (insights e detalhamentos) no `content.json` do kit, número só via bind.

**Por que P3**: é o mais dependente de contexto (critérios por cliente) e de prosa; vale
fechar os outros três antes.

**Cenários de aceitação**:

1. **Dado** o kit, **então** a tarefa de contexto "critérios" explica como mapear cada
   `custom_field_N` do dump para um critério (id, rótulo, ordem dos grupos, aliases) e como
   confirmar com o consultor; e a tarefa "canais" define os canais e as janelas.
2. **Dado** `gerar.py … --content content.json`, **então** os insights/detalhamentos
   escritos pelo agente entram nas páginas; sem `content.json`, o relatório sai só
   descritivo (como no app).
3. **Dado** prosa com número que não está em tabela bindada, **então** `aprofundar.py`/o
   validador do kit recusa (mesma regra da Fase 2).
4. Paridade com o app para a fixture.

### US5 — Um `gerar.py` para todos (P1, transversal)

O `gerar.py` deixa de ser específico do acompanhamento: vira um wrapper genérico do
contrato `build(csv, config, content, out_dir)` + `assemble(rows, config, content, opts)`
do app, com `--goals`, `--dict`, `--hist`, `--content`, `--opts` e `--rerender`, o mesmo
em todos os kits.

**Cenários de aceitação**:

1. **Dado** qualquer kit, **quando** roda `gerar.py`, **então** produz as 4 camadas,
   `numeros.json` (se o motor expõe um resumo) e `perguntas.json` (se há banco) e o HTML.
2. **Dado** `--opts`, **então** usa `assemble(..., opts)` e grava as camadas do recorte.
3. O `aprofundar.py` e o `design-system.md` (da plataforma) valem igual para os quatro.

---

## Casos de borda

- Debriefing sem `goals.csv` → erro antes de gerar (não gera relatório sem metas).
- Criativos sem `field_ad_name` no CSV → erro listando as colunas presentes.
- Histórico com um lançamento só → gera, com aviso de que não há comparação.
- Conversão por perfil com `custom_field_N` que o consultor não reconhece → a tarefa
  manda perguntar e permite excluir o critério.
- Dump com delimitador `;` (export BR) → o motor detecta (já é assim no app).

## Requisitos funcionais

- **FR-001**: Cada um dos quatro templates DEVE existir em `seed/<slug>/` com: `manifest.json`
  (engine, perguntas_bank, params, queries com `when` quando houver, tarefas de contexto,
  config de exemplo, como_gerar, arquivos), `contexto/*.md` (uma página por tarefa),
  `queries/*.sql` (extraídas dos `montador-*.html`), `guia.md` (de `guias.json` + `focus`
  do deepen + mecânica), `documento.md`, `python/tests/{make_fixture.py,config.json,test_kit.py}`.
- **FR-002**: O `gerar.py` DEVE ser um único arquivo compartilhado (`seed/_shared/gerar.py`,
  copiado pelo kit-assemble), engine-agnóstico, com `--opts` via `assemble`.
- **FR-003**: `kit-assemble` DEVE copiar por template o motor (`engine`) e o banco de
  perguntas (`perguntas_bank`); `seed.mjs` publica os quatro; `parity.mjs` roda para cada.
- **FR-004**: Cada template DEVE ter fixture sintética (sem PII), testes `unittest` e
  paridade `dataset.json` idêntica ao app.
- **FR-005**: Auxiliares obrigatórios (goals no debriefing) DEVEM ser declarados no
  manifesto (`required_files`) e verificados pelo `gerar.py` antes de gerar.
- **FR-006**: Templates com controles interativos no app (debriefing, criativos, histórico)
  DEVEM documentar no guia que o HTML offline é um **snapshot** do recorte escolhido
  (`--opts`) e como gerar outro recorte.
- **FR-007**: A UI e o MCP não mudam (tudo entra pelo seed); o `debriefing` rascunho
  existente em produção é substituído pelo seed.

## Critérios de sucesso

- **SC-001**: `listar_templates` mostra 5 templates publicados; `obter_template` de cada um
  traz as 7 partes + perguntas.
- **SC-002**: Para cada template, `gerar.py` na fixture produz HTML que abre offline, e a
  paridade com o app passa.
- **SC-003**: Um debriefing real (CSV do Delfos) gerado por um consultor de dentro do zip,
  sem o repositório.
- **SC-004**: Suíte verde: Worker + `unittest` dos 5 kits + paridade dos 5.

## Premissas

- Os motores do app são a fonte; nada é reescrito. Divergência da skill antiga do
  conversao-perfil é ignorada (canônico = `app/pysrc/conversao-perfil`).
- O viewer offline não tem controles: recortes interativos viram snapshots por `--opts`.
  **Decidido pelo dono:** o recorte é uma **tarefa de contexto com confirmação** — o agente
  pergunta ao consultor, antes de gerar, qual modo/recorte quer (ex.: criativos em
  Resultado final ou Captação; histórico com quais lançamentos e qual métrica; debriefing
  com qual filtro) e gera esse snapshot. Quer outro, gera de novo.
- **Decidido:** ordem debriefing → criativos → histórico → conversão por perfil.
- Guias e tarefas de contexto reaproveitam as do acompanhamento onde a regra é a mesma
  (temperatura, lançamento, data), escritas em cada template (constituição IV).

## Verificação da constituição

| Princípio | Como a spec atende |
|---|---|
| I | Nada roda no Worker; quatro kits a mais, mesmo mecanismo. |
| II | Fixtures sintéticas; exemplos sem PII; gate já existente. |
| III | Motores do app; prosa do conversao-perfil via `content.json` com bind. |
| IV | Contexto por template (regras repetidas onde coincidem); gerais e design system continuam da plataforma. |
| V | Kits autossuficientes; `gerar.py` compartilhado é copiado para dentro de cada zip. |
| VI/VII | Sem mudança de UI/MCP; nada específico por slug no código. |
| VIII/IX | Esta spec; testes + paridade por template. |
