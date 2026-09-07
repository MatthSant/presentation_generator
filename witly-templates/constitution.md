# Constituição — witly-templates

Princípios que valem para toda spec, plano e tarefa deste projeto. Uma mudança que viole
um princípio precisa de emenda aqui antes, não de exceção no código.

## Princípios

### I. O MCP é inteligência, não compute
A plataforma entrega **método** ao agente da pessoa (Claude Code, Codex, Claude.ai…).
Não roda análise, não guarda análise de cliente, não tem agente próprio. O Python roda na
máquina da pessoa. O Delfos continua como está e é a única porta para o dado.

### II. Dado pessoal nunca entra; número agregado pode
E-mail, telefone, CPF, nome de lead, qualquer identificador de pessoa: não entra em
template, exemplo, log ou avaliação. Linha crua (dump lead a lead) não entra. Métrica
agregada de cliente (CPL, leads/dia, ROAS) pode aparecer em exemplo e log. Gate
automático de PII na entrada, quando existir escrita pelo MCP.

### III. Número nasce no `calc.py`
O documento e o guia de um template não contêm número de cliente: contêm placeholders
resolvidos a partir do que o Python produz. O agente escreve prosa; o número vem do
cálculo determinístico.

### IV. Contexto é por análise; o geral é pouco, curado e explícito
Cada template carrega o seu guia, as suas regras e as suas tarefas de contexto. Existe
um conjunto **pequeno** de **contextos gerais** que valem para todo template e vão junto
com qualquer kit (ex.: cuidados com números pequenos, taxa nunca soma). Um contexto só
vira geral quando vale para o modelo todo, sem exceção; regra que vale para dois ou três
templates é escrita neles, não promovida a geral. Não existe contexto por cliente
guardado: o que o consultor precisa passar (lançamento, temperatura, metas) vira
**tarefa do agente**, executada na hora.

### V. Template é a unidade, autossuficiente e versionada
Um template = manifesto + tarefas de contexto + queries + `gerar.py` + documento + guia
+ exemplo. Não depende do app Express nem de nada fora da própria pasta/registro. Tem
versões (rascunho → publicado); o MCP serve só a publicada, salvo pedido explícito de
editor.

### VI. Uma plataforma, dois lados
UI (cadastro/edição/uso) e MCP (entrega ao agente) são o mesmo Worker e a mesma base.
Login Google para os dois; instalar o MCP = colar a URL e logar. Sem token manual.

### VII. Feature nova entra genérica
Nada de `if template === 'x'`. O que um template precisa, todos ganham (herdado do app).

### VIII. Spec-driven, proporcional ao problema
Constituição → spec → plano → tarefas, com revisão humana entre spec e plano. A spec é
**ancorada**: quando o comportamento muda, a spec muda junto. Bug pequeno não ganha
spec; feature ganha.

### IX. Testes unitários são parte da entrega
Toda regra de negócio tem teste unitário antes de a tarefa ser dada como concluída:
no Worker (Vitest com o pool de Workers: tools do MCP, montagem/escape de SQL, gate de
acesso, versionamento) e no Python de cada template (`unittest` da stdlib, sem pip:
cálculo contra uma fixture sintética, placeholders do documento cobertos por
`numeros.json`). Cada critério de aceitação da spec mapeia para ao menos um teste. A
suíte roda em CI e o `tasks.md` só marca `[x]` com teste verde. Além disso, toda tarefa
concluída foi testada no cliente MCP real (Claude Code no mínimo) e na UI real, não só
por curl.

## Restrições técnicas

- Cloudflare: Workers (Node compat), Durable Objects via Agents SDK (`McpAgent`), D1,
  KV (OAuth), R2 quando arquivo não couber em D1, Vectorize/Sandbox só em fases
  posteriores.
- Auth: `@cloudflare/workers-oauth-provider` com Google upstream; UI com o mesmo login.
- Client sem bundler (ES modules), como o app. Design system light do app.
- Português nos artefatos e na UI; código e identificadores em inglês ou pt sem acento.

## Governança

- Esta constituição prevalece sobre PLANO.md, specs e código.
- Emenda = PR que altera este arquivo com justificativa e impacto nas specs existentes.
- Toda spec tem seção "Verificação da constituição"; violação precisa de justificativa
  explícita na tabela de complexidade do plano.

**Versão**: 1.0.0 | **Ratificada**: 2026-09-07 | **Última emenda**: 2026-09-07
