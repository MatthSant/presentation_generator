# Spec: Fase 1 — MCP de templates com login Google, UI mínima e o template "Acompanhamento diário"

**Branch**: `feat/mcp-templates` · **Criada**: 2026-09-07 · **Status**: Revisada em 2026-09-07 (pendências resolvidas) — segue para plano
**Origem**: conversa de 2026-09-07 + [PLANO.md](../../PLANO.md) (visão) + [constitution.md](../../constitution.md)

Esta spec cobre **só a Fase 1** do PLANO.md. Fora de escopo: versões/rollback, papéis e
convites, `registrar`/`avaliar`, staging/`propor_template`, validação automática, Sandbox,
Vectorize, assistente de autoria, multi-tenant real, os outros 4 templates.

---

## Histórias de usuário

### US1 — Consultor conecta o MCP e obtém o template (P1)

O consultor cola a URL do MCP no agente dele, loga com a conta Google, e pede o
acompanhamento diário de campanha. O agente recebe o kit-pai completo e o SQL pronto
para o Delfos, e consegue gerar a v0 na máquina do consultor.

**Por que P1**: é o produto. Sem isso o resto não tem valor.

**Teste independente**: com o Worker no ar e o template semeado, uma pessoa nova instala
em Claude Code, Codex e Claude.ai e, num chat, obtém o kit e o SQL; em seguida, com um
CSV do Delfos, gera a v0 do documento sem tocar no app Express.

**Cenários de aceitação**:

1. **Dado** o usuário sem o MCP instalado, **quando** adiciona a URL no Claude Code
   (`claude mcp add --transport http`), **então** o navegador abre o login Google e, ao
   concluir, as tools do MCP aparecem sem nenhum token digitado.
2. **Dado** o MCP conectado, **quando** o agente chama `listar_templates`, **então**
   recebe o catálogo com pelo menos `acompanhamento-diario` (slug, nome, objetivo, quando
   usar, resumo das tarefas de contexto).
3. **Dado** o MCP conectado, **quando** chama `obter_template('acompanhamento-diario')`,
   **então** recebe o kit inteiro na versão publicada: manifesto, tarefas de contexto
   (cada uma com definição, regra padrão, query de apoio, exemplos, casos ambíguos,
   formato de saída), queries, arquivos Python, documento-esqueleto, guia, exemplo.
4. **Dado** o kit, **quando** chama `montar_query('acompanhamento-diario', {field_conversion:'lcto-x', tipo_funil:'classico'})`,
   **então** recebe o(s) SQL(s) com os parâmetros substituídos e escapados, prontos
   para o `Witly_Query` do Delfos.
5. **Dado** o kit e um CSV exportado do Delfos, **quando** o agente roda o Python do
   kit localmente, **então** obtém `numeros.json` e o documento v0 preenchido, sem
   depender de nada do app Express.
6. **Dado** o mesmo usuário em Claude.ai (conector) e em Codex, **quando** repete o
   passo 1, **então** o fluxo é o mesmo (registro dinâmico do cliente, login Google).

### US2 — Editor altera o template na UI e publica (P2)

Um editor abre a UI, vê o catálogo, entra no acompanhamento diário, edita uma parte (ex.:
o guia, ou a regra padrão da tarefa de temperatura) e publica. O agente passa a receber
a versão nova.

**Por que P2**: é o que tira o template do git e o coloca na mão de quem não programa.
Sem UI, a Fase 1 ainda funciona (seed por script), por isso não é P1.

**Teste independente**: editar o guia na UI, publicar, chamar `guia('acompanhamento-diario')`
no agente e ver o texto novo.

**Cenários de aceitação**:

1. **Dado** um editor logado, **quando** abre a UI, **então** vê o catálogo de templates
   com nome, objetivo e estado (publicado/rascunho).
2. **Dado** um template aberto, **quando** edita uma parte (manifesto, uma tarefa de
   contexto, uma query, um arquivo Python, documento, guia, exemplo) e salva, **então** a
   alteração fica como **rascunho** e o MCP continua servindo a publicada.
3. **Dado** um rascunho, **quando** o editor clica "Publicar", **então** a versão
   publicada passa a ser a nova e a chamada seguinte do MCP já a devolve.
4. **Dado** uma query editada com `{{param}}` que não existe no manifesto, **quando**
   salva, **então** a UI avisa qual parâmetro falta (não bloqueia o rascunho).
5. **Dado** a área "Contextos gerais", **quando** o editor cria ou edita um contexto
   geral e salva, **então** ele passa a vir em todo `obter_template` e `guia` (contexto
   geral não tem rascunho: salvar publica, com quem/quando).

### US3 — Pessoa sem acesso é barrada (P2)

Alguém com conta Google fora da lista tenta conectar o MCP ou abrir a UI e não entra.

**Por que P2**: sem isso o MCP fica público. É pequeno, mas obrigatório antes de dar a
URL para alguém.

**Teste independente**: logar com uma conta Google de fora da lista e ver a tela "peça
acesso"; nenhuma tool fica disponível.

**Cenários de aceitação**:

1. **Dado** uma conta Google fora da lista de acesso, **quando** conclui o login,
   **então** vê "peça acesso" com o e-mail usado e o MCP não emite token.
2. **Dado** uma conta na lista, **quando** conclui o login, **então** entra com o papel
   registrado (editor ou leitor); leitor usa o MCP mas não edita na UI.
3. **Dado** um usuário removido da lista, **quando** faz a próxima chamada de tool,
   **então** recebe erro de autorização (o token não sobrevive à remoção).
4. **Dado** um editor na UI, **quando** clica "Desativar" ou "Encerrar sessões" de uma
   pessoa, **então** a próxima chamada dela (MCP ou UI) falha e o refresh token não
   renova mais.

### US4 — Mantenedor semeia o template a partir do app atual (P3)

O template inicial do acompanhamento diário nasce do que já existe no app: o `calc.py`
e dependências do `pysrc`, o SQL dos montadores, o `guias.json` e o texto de leitura do
deepen. Um script monta o kit e o publica na plataforma.

**Por que P3**: é trabalho de uma vez, mas garante que a Fase 1 entrega método real, não
um exemplo de brinquedo.

**Teste independente**: rodar o seed numa base vazia e, no agente, obter o kit com
todas as partes preenchidas.

**Cenários de aceitação**:

1. **Dado** uma base vazia, **quando** o mantenedor roda o seed, **então** o template
   `acompanhamento-diario` existe, publicado, com as 7 partes preenchidas.
2. **Dado** o kit semeado, **quando** o agente roda o Python contra um CSV real do
   acompanhamento (na máquina do consultor), **então** o cálculo bate com o que o app
   Express produz para o mesmo CSV (mesmos KPIs macro).

---

## Casos de borda

- `obter_template` de slug inexistente ou sem versão publicada → erro claro, com a lista
  de slugs disponíveis.
- `montar_query` com parâmetro obrigatório faltando → erro listando os que faltam e a
  tarefa de contexto que os produz; nunca devolve SQL com `{{param}}` cru.
- Valor de parâmetro com aspas/`;` → escapado; o SQL nunca é concatenado sem escape.
- Token válido mas usuário removido → 401 na próxima tool (revalidar e-mail a cada chamada).
- Arquivo Python maior que o limite de linha do banco → ainda assim é servido íntegro
  (decisão de armazenamento fica no plano).
- Dois editores salvam rascunho do mesmo template → o último salva vence, com aviso de
  que havia rascunho mais novo (sem merge na Fase 1).
- Agente pede o kit e o template só tem rascunho → resposta diz que não há versão
  publicada (não serve rascunho a leitor).

---

## Requisitos funcionais

- **FR-001**: O MCP DEVE ser acessível por Streamable HTTP em uma URL única e aceitar
  registro dinâmico de cliente, com autorização delegada ao Google (OAuth).
- **FR-002**: O MCP DEVE expor as tools `listar_templates`, `obter_template`,
  `montar_query`, `guia` e os resources `template://<slug>`, `template://<slug>/guia`,
  `template://<slug>/exemplo`, `template://<slug>/contexto/<tarefa>`,
  `contexto://geral/<slug>`.
- **FR-003**: O kit devolvido por `obter_template` DEVE conter as 7 partes: manifesto,
  tarefas de contexto, queries, arquivos Python (um ou mais), documento-esqueleto, guia,
  exemplo — cada uma como texto íntegro, com nome de arquivo sugerido — **mais os
  contextos gerais** vigentes, em bloco separado e identificado como geral.
- **FR-014**: Um editor DEVE conseguir **cortar o acesso** de uma pessoa na hora: desativar
  o usuário (toda tool e toda rota da UI revalidam `active` a cada chamada, então o token
  MCP e o cookie param de valer imediatamente) e **encerrar as sessões** (revogar os
  grants OAuth da pessoa, para o refresh token morrer). Tokens de acesso têm TTL curto
  (≤ 1 h) como defesa extra.
- **FR-013**: O sistema DEVE manter uma lista de **contextos gerais** (slug, título,
  texto), editável por editor na UI em área própria, entregue com todo kit e via
  `guia`; a Fase 1 semeia ao menos "cuidados com números pequenos".
- **FR-004**: O manifesto DEVE declarar as tarefas de contexto com id, objetivo, como
  levantar, saída (campo do config) e se exige confirmação; cada tarefa DEVE ter a página
  detalhada (definição, regra padrão, query de apoio, exemplos, casos ambíguos, saída).
- **FR-005**: `montar_query` DEVE substituir `{{param}}` pelos valores recebidos,
  escapar strings para SQL e recusar chamadas com parâmetro obrigatório ausente.
- **FR-006**: O sistema DEVE manter, por template, uma versão publicada e no máximo um
  rascunho; o MCP serve a publicada.
- **FR-007**: A UI DEVE listar templates e permitir editar cada parte como texto, salvar
  rascunho e publicar.
- **FR-008**: O acesso (MCP e UI) DEVE ser restrito a e-mails Google autorizados, com
  papel `editor` ou `leitor`. **Decidido:** toda conta do domínio `@witly.digital` entra
  automaticamente como `leitor`; editores são promovidos na lista (o primeiro editor é
  semeado por configuração). Conta fora do domínio vê "peça acesso".
- **FR-009**: O sistema DEVE registrar automaticamente cada chamada de `obter_template`
  e `montar_query` (quem, quando, template, versão) — sem UI de leitura nesta fase.
- **FR-010**: O template `acompanhamento-diario` DEVE existir publicado, com o cálculo
  equivalente ao do app para o mesmo CSV, e o documento v0 como **HTML standalone**
  (decidido): um arquivo só, abre sem servidor, gráficos interativos, visual do design
  system do app. O `gerar.py` não depende do app Express; os recursos de visualização
  que o HTML precisa (CSS/JS) vêm no kit como arquivos baixáveis, não pelo contexto do
  modelo.
- **FR-011**: Nenhum dado de cliente DEVE ser armazenado pela plataforma além do que o
  editor coloca conscientemente no exemplo (agregado, sem PII).
- **FR-012**: Cada cenário de aceitação desta spec DEVE ter ao menos um teste
  automatizado: Worker (tools, `montar_query` com escape e parâmetros faltantes, gate de
  acesso, publicado × rascunho, registro de uso) e Python do template (cálculo contra
  fixture sintética; todo placeholder do documento existe em `numeros.json`). A suíte
  roda em CI.

## Entidades

- **Organização**: dona dos templates e usuários (uma só na Fase 1; campo existe).
- **Usuário**: e-mail Google, nome, papel (`editor`/`leitor`), organização.
- **Template**: slug, nome, objetivo, quando usar; aponta para a versão publicada.
- **Versão de template**: número, estado (`rascunho`/`publicado`), autor, data, e as
  **partes**: manifesto (JSON), tarefas de contexto (uma página cada), queries (uma ou
  mais, nomeadas), arquivos Python (um ou mais, com caminho), documento, guia, exemplo.
- **Contexto geral**: slug, título, texto, autor, data; vale para todo template.
- **Registro de uso**: usuário, tool, template, versão, data.

## Critérios de sucesso

- **SC-001**: Uma pessoa nova conecta o MCP em Claude Code, Claude.ai e Codex em menos
  de 5 minutos, sem digitar token.
- **SC-002**: Com o kit e um CSV do Delfos, um agente gera a v0 do acompanhamento
  diário na máquina do consultor sem consultar o app Express, e os KPIs macro batem com
  os do app para o mesmo CSV.
- **SC-003**: Um editor altera o guia na UI e publica; a chamada seguinte de `guia` no
  agente devolve o texto novo.
- **SC-004**: Conta Google fora da lista não obtém token nem vê a UI.
- **SC-005**: Uma inspeção da base não encontra PII nem linha crua de cliente.
- **SC-006**: Suíte de testes (Worker + Python) verde em CI, com cada cenário de
  aceitação rastreável a um teste.

## Premissas

- O consultor obtém o dado rodando o SQL no Delfos (`Witly_Query`) e salvando o
  resultado como CSV local (decidido); o volume que o Delfos devolve ao modelo é
  aceitável nesta fase e as queries agregam no banco. Export via n8n/R2 fica para depois.
- O Python do kit pode ser um conjunto de arquivos (o `calc.py` do app mais os módulos
  `common` de que depende), executado com Python 3 padrão, sem instalar nada.
- Os editores da Fase 1 são a equipe interna; o primeiro editor é o dono do projeto.
- Deploy no `workers.dev` da conta Witly (decidido); domínio próprio depois só troca o
  callback do Google.
- A UI fica atrás do mesmo login Google; Cloudflare Access não é usado nesta fase.

## Verificação da constituição

| Princípio | Como a spec atende |
|---|---|
| I. Inteligência, não compute | Nenhuma tool roda Python nem recebe CSV; o agente gera localmente (US1.5). |
| II. PII nunca | FR-011, SC-005; sem escrita de conteúdo pelo MCP nesta fase. |
| III. Número no calc | Documento-esqueleto com placeholders; `numeros.json` gerado localmente. |
| IV. Contexto por análise, geral curado | Tarefas de contexto dentro do template (FR-004); contextos gerais poucos, em área própria, entregues com todo kit (FR-013). |
| V. Template autossuficiente e versionado | FR-003, FR-006, US4.2 (cálculo equivalente sem o app). |
| VI. Uma plataforma, login Google | FR-001, FR-007, FR-008, SC-001. |
| VII. Genérico | Tools e UI não conhecem o slug `acompanhamento-diario`. |
| VIII. Spec-driven | Este documento; plano e tarefas só após revisão. |
| IX. Testes unitários | FR-012, SC-006; tarefas só fecham com teste verde. |
