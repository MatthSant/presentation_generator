# Plano — Witly Grimório: plataforma de templates + MCP (`witly-templates`)

Uma plataforma pequena, em Node na Cloudflare, com dois lados da mesma moeda:

- **UI** onde a pessoa cadastra templates de análise, edita o guia/regras de cada um e acompanha o uso.
- **MCP** que entrega esses templates ao agente da pessoa (Claude Code, Codex, Claude.ai…).

A pessoa pede "acompanhamento diário de campanha" no agente dela; o MCP devolve o
kit-pai; o agente gera a versão inicial com dado do Delfos; dali em diante o documento é
dela. A plataforma não roda análise de cliente e não guarda dado de cliente. Ela guarda
**método**, cada template com o seu próprio contexto, e torna isso editável e
versionado sem git.

---

## 1. O que a plataforma guarda

### Template (o "pai")

| Parte | O que é | Editor na UI |
|---|---|---|
| **Manifesto** | nome, objetivo, quando usar, para quem; índice das **tarefas de contexto** | formulário |
| **Contexto** | uma página por tarefa de contexto: definição, regra padrão, query de apoio, exemplos, casos ambíguos, formato de saída (ver abaixo) | editor de blocos, uma subpágina por tarefa |
| **Queries** | SQL parametrizado para o Delfos (agrega no banco para caber no contexto) | editor SQL com realce de `{{param}}` e checagem de parâmetro não declarado |
| **Cálculo** | `calc.py` (stdlib) que lê o CSV e escreve `numeros.json`; + schema do `numeros.json` | upload/editor + **teste** contra um CSV de amostra (ver §3) |
| **Documento** | esqueleto Markdown com placeholders ligados ao schema de `numeros.json` | editor com seletor de placeholder (só os que existem no schema) |
| **Guia** | **como funciona a mecânica** desta análise (lançamento clássico × pago, fases, o que é captação), definições de métrica, benchmarks, o que é furo, o que NÃO concluir — é aqui que mora a maior parte do contexto | blocos de texto estruturados (o `guias.json` + os `focus` do deepen de hoje) |
| **Exemplo** | um documento pronto | upload |

Cada template tem **versões**: rascunho → publicado; changelog; rollback. O MCP serve a
publicada; um editor pode pedir a rascunho para testar.

### Documentos da plataforma (o design system)

Além dos templates e dos contextos gerais, a plataforma guarda **documentos que valem para
todo template e entram em todo kit**: hoje, o **design system dos aprofundamentos** (contrato
dos widgets, binds, layout e regras de design, gerado do app). É editável na UI ("Design
system"), servido como `contrato://widgets` e vai no zip como `design-system.md`. O kit é
**autossuficiente**: quem usa o Grimório não tem o repositório; tudo que o Python precisa
está no zip.

### Contexto é o da análise, e o pai o transforma em tarefas do agente

Contexto aqui é **o que o consultor precisa passar para esta análise deste cliente**:
qual lançamento, período, como classificar temperatura, metas, dicionário de criativos.
Não fica guardado na plataforma e não é "contexto do cliente" reutilizável; nasce na hora,
para aquela geração.

O template não pede isso como um formulário que a pessoa preenche. Ele declara **tarefas
de contexto**, e o agente as executa antes de gerar:

```json
"tarefas_contexto": [
  { "id": "field_conversion",
    "objetivo": "identificar o lançamento",
    "como": "lookup em wtl_campaign_definition (nome/data); se ambíguo, listar candidatos e perguntar",
    "saida": "config.field_conversion" },
  { "id": "temperatura",
    "objetivo": "classificar cada campanha em Quente/Morno/Frio pelo nome",
    "como": "SELECT DISTINCT field_campaign_name …; aplicar as regras padrão do guia (palavras-chave); mostrar a tabela ao consultor e confirmar/ajustar",
    "saida": "config.temp_rules",
    "confirmar": true },
  { "id": "metas",
    "objetivo": "metas do lançamento (CPL, CPMQL, leads)",
    "como": "perguntar ao consultor; ou usar wtl_launch_goals se existir",
    "saida": "config.metas" }
]
```

Cada tarefa diz **o que produzir**, **como levantar** (query de apoio no Delfos, regra
padrão, ou perguntar), **onde entra** no config do `calc.py` e se **precisa de
confirmação** do consultor. O agente faz o trabalho (olha os nomes das campanhas e
propõe as temperaturas), o consultor só confere. Isso substitui os campos dos
`gerar-*.html` de hoje.

**Cada tarefa é uma página detalhável na plataforma.** O JSON acima é só o índice; o
"como" de verdade é um documento editável por tarefa, que o agente recebe inteiro. Para
a temperatura, por exemplo:

| Bloco | Conteúdo |
|---|---|
| Definição | o que é Quente/Morno/Frio nesta análise e por que importa (CPMQL usa a qualidade do tráfego pago…) |
| Regra padrão | palavras-chave por classe (`remarketing`, `rmkt`, `envolvimento` → Quente; `lookalike`, `LAL` → Morno; `interesse`, `aberto` → Frio), ordem de precedência, o que fazer com `advantage+` |
| Query de apoio | `SELECT DISTINCT field_campaign_name, SUM(spend) … WHERE field_conversion = {{field_conversion}}` |
| Exemplos | nomes reais de campanha (sem PII) → classe, incluindo os enganosos |
| Casos ambíguos | quando perguntar ao consultor, como apresentar a tabela para confirmação |
| Saída | o formato exato de `config.temp_rules` que o `calc.py` espera |

Na UI, o editor de template tem uma aba **Contexto** com uma subpágina por tarefa, com
esses blocos. No MCP, `template://<slug>/contexto/<tarefa>`. É aqui que o
conhecimento operacional ("como a Witly define temperatura") vive e evolui, versionado
junto com o template, e o log de atividade mostra onde o agente errou a classificação
para você afinar a regra.

Fora as tarefas, o agente recebe o **guia + regras do template pedido** e os
**contextos gerais**. Contexto geral é um conjunto pequeno e curado do que vale para o
modelo todo, sem exceção: cuidados com números pequenos (dias de baixo volume, taxa em
cima de poucos leads), taxa nunca soma entre grupos, benchmark tem de vir do dado e não
da cabeça. Vai junto com qualquer kit, é editável na UI numa área própria
("Contextos gerais") e tem resource `contexto://geral/<slug>`. Uma regra que vale só para
o acompanhamento não vira geral: fica no guia dele. Regra que serve a dois ou três
templates é escrita neles. O que continua não existindo é contexto por cliente guardado.

### Registro de atividade (o log que hoje é `deepen_history`)

Quem fez o quê, para depois ajustar template, guia e regras. Dois níveis:

**Automático (o servidor vê):** toda chamada de `obter_template`, `montar_query`,
`guia` — quem (e-mail do login Google), quando, template, versão, parâmetros
não sensíveis (tipo, período), cliente MCP usado.

**Reportado pelo agente (tool `registrar`):** o que o servidor não vê porque acontece
na máquina da pessoa.

| Evento | Campos |
|---|---|
| `geracao` | template/versão, cliente, resultado das tarefas de contexto (ex.: a tabela de temperatura confirmada), v0 gerada (título, seções), duração, problemas encontrados |
| `aprofundamento` | template, seção/bloco de origem, **pergunta**, **resposta** (prosa + tabelas agregadas), consultas usadas, avaliação (1–5), `descartado` + motivo |
| `edicao` | o que a pessoa mudou na v0 e por quê (opcional, quando o agente souber) |

O log passa pelo mesmo gate de PII da proposta. Agregado entra; lead, e-mail, telefone
não.

O prompt `gerar` e o guia de cada template instruem o agente a chamar `registrar` ao
terminar e a cada aprofundamento. É best-effort (depende do agente obedecer), mas é o
mesmo mecanismo que hoje alimenta o rating bar e o "descartar com motivo".

**Tela "Atividade" na UI:** filtro por pessoa, template, cliente, período, avaliação,
descartados. De cada entrada dá para agir:
- **"Virar exemplo"** → a pergunta+resposta entra no guia do template como few-shot
  (o que o `deepenHistory` faz hoje com aprovados).
- **"Virar regra"** → o motivo de descarte vira um item "o que NÃO concluir" no guia.
- **"Ajustar template"** → abre o editor na versão usada, com a entrada ao lado.
- **Reavaliar** (sua nota sobre a nota da pessoa) e comentar.

**Painel de uso:** volume por template/versão, avaliação média, taxa de descarte, top
perguntas de aprofundamento (o que as pessoas querem que o template ainda não entrega
→ candidato a seção nova).

**Privacidade:** escopado à `org`; agregado sim, linha crua e PII nunca.

### Staging: propor um template pelo MCP

A pessoa fez uma análise nova (ou melhorou uma existente) e quer que vire padrão. O
agente dela puxa as regras de proposta (`contrato://proposta`) e monta **quatro
arquivos**:

| Arquivo | O que é |
|---|---|
| `consulta.sql` | a consulta que usou para pegar o dado (parametrizada: `{{param}}` no lugar dos valores) |
| `gerar.py` | o Python que produz o documento a partir do CSV (calc + montagem) |
| `exemplo.html` / `.md` | o documento **como foi gerado**, com os números agregados reais; sem PII |
| `regras.md` | as regras de negócio que usou: definições, benchmarks, o que concluir e o que não |

```
propor_template({ slug?, base?, arquivos: { consulta, gerar, exemplo, regras }, notas })
```

A proposta entra em **staging** como uma "analisinha de estágio", com dono, data e
notas. Estados:

```
staging → em revisão → publicado
                    ↘ mudanças pedidas → (a pessoa reenvia pelo MCP) → em revisão
                    ↘ rejeitado (com motivo)
```

- `status_proposta(id)` devolve o estado e os comentários do revisor — a pessoa acompanha
  e responde sem sair do agente.
- Na UI, o revisor vê a proposta como um template normal (todas as abas), com **diff**
  contra a base quando houver, roda a **validação** (parâmetros da consulta declarados,
  placeholders do exemplo existem no que o `gerar.py` produz, `gerar.py` roda no Sandbox
  contra um CSV **sintético** gerado a partir do schema) e aprova, pede mudanças ou
  rejeita. Aprovar = publicar (template novo ou versão nova da base), com o autor
  creditado.
- **A plataforma deriva o esqueleto:** a partir do exemplo real + do que o `gerar.py`
  produz, o assistente de autoria "desnumera" (troca cada número pelo placeholder que o
  gerou) e propõe `documento.md` + schema. O revisor confere em vez de escrever do zero.
- **Gate de entrada (PII):** a plataforma recusa a proposta se detectar e-mail, telefone,
  CPF ou dado de pessoa em qualquer arquivo, e se a consulta trouxer literal de cliente
  no lugar de `{{param}}`. Métrica agregada passa.
- Propostas ficam privadas ao autor e aos editores até publicar.

---

## 2. O MCP (a mesma plataforma, outra porta)

| Tool | Devolve |
|---|---|
| `listar_templates()` | catálogo: slug, nome, objetivo, quando usar, tarefas de contexto |
| `sugerir_template(pergunta)` | os templates que respondem a pergunta (busca semântica sobre objetivo/quando usar) |
| `obter_template(slug, versao?)` | o kit: manifesto + queries + calc.py + schema + documento + guia (+ exemplo) |
| `montar_query(slug, params)` | SQL com parâmetros preenchidos, pronto para o Delfos |
| `guia(slug)` | só o guia de leitura |
| `propor_template(kit, notas, base?)` | manda um template novo (ou versão) para staging |
| `status_proposta(id)` | estado + comentários do revisor; reenviar = `propor_template` com o mesmo id |
| `registrar(evento, dados)` | log de geração / aprofundamento / edição (quem vem do login) |
| `avaliar(slug, nota, comentario)` | feedback do template em si |

Resources: `template://<slug>[/guia|/exemplo|/contexto/<tarefa>]` e
`contexto://geral/<slug>` (os gerais, poucos e curados).
Prompt opcional `gerar(slug)`: o roteiro padrão (tarefas de contexto com o consultor →
config → `montar_query` → Delfos → CSV local → calc → documento → v0). A pessoa segue
se quiser.

---

## 3. "Um pouco mais inteligente"

- **Sugestão de template** por pergunta (Vectorize sobre objetivo/quando usar/guia).
- **Assistente de autoria**: a partir de uma descrição + um resultado de query de amostra,
  rascunha manifesto, schema, documento e guia; o editor revisa. (Anthropic API no Worker.)
- **Validação automática ao publicar**: todo `{{param}}` da query está no manifesto;
  todo placeholder do documento existe no schema; o `calc.py` roda contra um CSV
  **sintético** (gerado a partir do schema, ou fornecido sintético pelo autor) e produz um
  `numeros.json` que bate com o schema. Roda num container **Sandbox SDK**, só na
  autoria. Detector de PII em qualquer arquivo enviado.
- **Importador** do app atual: os 5 tipos entram como templates iniciais (calc.py do
  `pysrc/`, SQL dos `montador-*.html`, `guias.json`, `focus` dos prompts).
- **Feedback → evolução**: painel de uso e avaliações por template e versão.

---

## 4. Stack (tudo Cloudflare, Node)

| Peça | Tecnologia |
|---|---|
| API + MCP | Worker (Hono, `nodejs_compat`); MCP via `McpAgent` (Agents SDK), Streamable HTTP |
| UI | Workers Assets (client TS sem bundler, mesmo espírito do app de hoje; design system light) |
| Dados | D1 (templates, versões, propostas, usuários, uso, avaliações) |
| Arquivos | R2 (calc.py, exemplos, CSV de amostra, snapshots de versão) |
| Busca | Vectorize (sugestão de template, busca dentro do guia de cada template) |
| Teste de calc | Sandbox SDK (container efêmero com Python) |
| Auth | **Login Google** para tudo: MCP via `@cloudflare/workers-oauth-provider` com Google como identidade upstream; UI com o mesmo login (ver §4.1) |

Multi-tenant desde o começo (`org` em tudo): se um dia for "colocar no mercado" para
outras operações, é configuração, não refactor.

### 4.1 Instalação = colar a URL e logar no Google

O Worker faz dois papéis (padrão oficial da Cloudflare, demo `remote-mcp-google-oauth`):

- **Servidor OAuth para os clientes MCP** (`OAuthProvider` com `authorizeEndpoint`,
  `tokenEndpoint` e `clientRegistrationEndpoint` — registro dinâmico de cliente, então
  Claude.ai, Claude Code, Codex e Cursor se registram sozinhos, sem cadastrar app por
  ferramenta).
- **Cliente OAuth do Google**: o `/authorize` redireciona para o Google; o `/callback`
  troca o código, lê e-mail/nome, emite o token MCP e conclui o handshake.

O que a pessoa vê:

```
Claude.ai      → Conectores → adicionar → https://mcp.witly.../mcp → abre o Google → pronto
Claude Code    → claude mcp add --transport http witly https://mcp.witly.../mcp → abre o navegador → pronto
Codex / Cursor → mesma URL no config → mesmo fluxo
```

Sem token para copiar, sem chave em arquivo. Revogar acesso = remover a pessoa na UI.

Dentro do `McpAgent`, `this.props` traz `{ email, name }` do Google. A plataforma
resolve e-mail → `org` + papel em D1 (allowlist por domínio `@witly...` e/ou convite por
e-mail), e é isso que escopa `listar`/`obter`/`avaliar` e o log de uso. Uma conta Google
desconhecida cai numa tela "peça acesso".

Infra do fluxo: KV `OAUTH_KV` (estado e tokens), secrets `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `COOKIE_ENCRYPTION_KEY`; no Google Cloud, um OAuth client com
callback `https://mcp.witly.../callback`. A UI usa o mesmo login (o `defaultHandler` do
provider serve as páginas; Access com IdP Google é a alternativa se preferir zero código
de sessão na UI).

---

## 5. Fases

| Fase | Entrega |
|---|---|
| 1 | Worker + D1 + R2 + **login Google (OAuth) desde o dia 1**; MCP com `listar`/`obter`/`montar_query`/`guia`; UI mínima (catálogo + editor de manifesto/queries/documento/guia como texto); importador com o **acompanhamento diário**. Testar a instalação em Claude Code, Codex e Claude.ai |
| 2 | Versões (rascunho/publicado/rollback), papéis (editor/leitor) e convites, `registrar` + `avaliar`, tela **Atividade** com "virar exemplo / virar regra / ajustar template"; importar o `deepen_history` atual como histórico inicial; os outros 4 templates importados |
| 3 | **Staging**: `contrato://proposta`, `propor_template`/`status_proposta`, fila de revisão na UI com diff e aprovar/pedir mudanças/rejeitar, gate de PII; validação ao publicar + teste do calc no Sandbox; `sugerir_template` (Vectorize); assistente de autoria (inclui derivar esqueleto do exemplo real); painel de uso |
| 4 | Multi-tenant de verdade |

## Regras

- **Dado pessoal nunca sai da máquina da pessoa.** E-mail, telefone, CPF, nome de lead,
  qualquer identificador de pessoa: não entra em proposta, log, exemplo ou avaliação.
  Gate automático na entrada (detector de PII).
- **Métrica agregada de cliente pode subir** (CPL, leads por dia, ROAS…): o exemplo do
  documento vem como foi gerado, com os números reais. O que não sobe é **linha crua**
  (dump CSV, lead a lead): a amostra para teste do `gerar.py` é sintética ou agregada
  sem PII.
- Dado bruto vai Delfos → máquina da pessoa. A plataforma só vê método + agregados.
- Número só de `calc.py`. O guia não contém número de cliente.
- O MCP serve só versão publicada, salvo pedido explícito de rascunho por editor.
- Template é autossuficiente: nada depende do app Express.
