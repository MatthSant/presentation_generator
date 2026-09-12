# Pesquisa — memória/conhecimento organizacional para agentes (2026-09-12)

Comparativo do desenho da spec 008 com `akitaonrails/ai-memory` e sistemas parecidos. Fontes lidas na
íntegra pelo pesquisador; links no fim de cada item.

## 1. `akitaonrails/ai-memory`
**O que é.** Binário Rust (crates `core/store/wiki/mcp/hooks/llm/consolidate/workstream/cli`) que dá memória
de longo prazo a ~20 CLIs de código (Claude Code, Codex, Cursor, Gemini CLI…) com handoff tipado entre eles.
Fonte de verdade é um **wiki markdown versionado em git** (`wiki/`); SQLite/FTS5 é índice derivado e
reconstruível. Inspirado em Karpathy LLM Wiki, agentmemory, basic-memory, cognee, Hermes e A-MEM.
[README](https://github.com/akitaonrails/ai-memory) · [ARCHITECTURE.md](https://github.com/akitaonrails/ai-memory/blob/main/docs/ARCHITECTURE.md)

**Modelo de dados.** `pages` (versionadas em cadeia `is_latest` + `supersedes`, com `access_count`,
`last_accessed_at`, `salience`, `expires_at`), `pages_fts`, `sessions`/`observations` (captura bruta),
`links` (`link_type` fechado), `handoffs`, `page_feedback` (append-only: helpful/not_helpful/stale/wrong),
`page_evidence` (o que produziu/reafirmou cada versão), `entities` com janela `valid_from/superseded_at`,
`auto_improve_proposals`, `client_activity` (chamadas MCP por dia/cliente), `audit_log`.

**Tipos.** Quatro tiers numa tabela: working (sessão), episodic (decai:
`salience·e^(−λΔt) + σ·log(1+access)·e^(−μ·dias)`, `crates/ai-memory-store/src/decay.rs`), semantic
(indefinido, só supersedível), procedural (decai se não reobservado). O consolidador classifica em
`decision | fact | rule | gotcha`; `rule` vai para `wiki/_rules/`; `_slots/` fixados (`state | invariant`).

**Leitura/escrita.** Escrita quase toda por hooks (SessionStart/PostToolUse/SessionEnd, fire-and-forget);
o autor rejeita "write_note manual" (design-decisions §6). Leitura por 19 tools; centrais: `memory_query`
(RRF de FTS5 + entidades + grafo + vetor opcional, multiplicador de autoridade por kind/tier/pinned/tags,
`explain=true`) e `memory_briefing` (regras, slots, recentes; `settled_first` até 8 páginas rule/decision
por `evidence_count`).

**Versionamento.** Supersessão in-place + `as_of` (só tempo de ingestão, nunca tempo-de-mundo — decisão
consciente). Arestas `causes | fixes | contradicts`; `contradicts` vira lint sem LLM (docs/typed-edges.md).

**Curadoria.** `auto-improvement-loop.md`: revisor LLM propõe JSON validado (`operation, path, kind,
confidence, rationale, evidence[{page,quote}]`), filtros negativos ("tool X quebrada", falha transitória,
narrativa one-off), piso 0.75, caps de tamanho, *rejection buffer*, eval gate opcional. Default
auto-aprova; em time recomenda `require_approval = true` → `pending-writes list/diff/approve/reject`.
`design-rules-promotion.md` (não implementado): orçamento ~15 regras/40 linhas, evict-to-admit humano,
nunca auto-edita `AGENTS.md`, rank = confiança × abrangência × recência.

**Resolve bem:** captura sem cerimônia, wiki legível, retrieval barato sem vetor, auditoria total,
contradição declarada, handoff tipado. **Não cobre:** conhecimento de time de negócio (é memória de projeto
de código), votos, escopo cliente/campanha, campos por tipo, urgência/confirmação, validade no mundo,
resultado de ação. O autor: "agentes precisam ser roteados manualmente para consultar memória"
([post](https://akitaonrails.com/en/2026/05/23/i-built-memory-system-for-coding-agents-ai-memory/)).

## 2. Sistemas na mesma linha
| Sistema | Modelo | Carga | Curadoria | Confiança/decadência | Feedback | Copiar / evitar |
|---|---|---|---|---|---|---|
| [Karpathy LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | raw → wiki → schema; `index.md` + `log.md` | índice 1 linha/página; até ~100 fontes | lint (contradições, órfãs, stale) | — | não | Copiar lint. Evitar índice monolítico ([v2](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2): penhasco em ~200 páginas) |
| [arXiv 2607.26637](https://arxiv.org/abs/2607.26637) | árvore md com 3 agentes | busca por agente | — | — | destila skills | "organização erode para todos exceto o agente mais forte; nenhum converte organização em resposta melhor" → schema fixo |
| [Anthropic Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) | SKILL.md + references/scripts | 3 níveis: metadata sempre (~100 tokens), corpo ao disparar (<5k), recursos 0 até ler | eval-first ([best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)) | — | não | description = o quê + quando; referências a 1 nível; corpo <500 linhas |
| [Claude Code memory](https://code.claude.com/docs/en/memory) | CLAUDE.md + auto memory (user/feedback/project/reference) + rules com `paths:` | CLAUDE.md sempre (<200 linhas); MEMORY.md 200 linhas/25 KB | humano | `modified` | não | corte duro com erro; rules por gatilho |
| [Cursor Rules](https://cursor.com/docs/rules) | `.mdc` alwaysApply/description/globs | Always · Auto Attached · Agent Requested · Manual | Team > Project > User | — | não | 4 modos = nossos níveis 0–3 |
| [Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory) | MEMORY.md (2.200 chars) + USER.md + skills | snapshot com % de uso; skills 3 níveis | `write_approval` → pending/ com diff; curador só arquiva | — | revisão a cada 10 turnos | erro ao exceder; staging com diff |
| [Zep/Graphiti](https://github.com/getzep/graphiti) | grafo bitemporal; tipos Pydantic | BM25+vetor+grafo | contradição invalida, não apaga | janela de validade | não | supersessão com histórico; evitar datação por LLM |
| [Mem0](https://arxiv.org/abs/2504.19413) | fatos; ADD/UPDATE/DELETE/NOOP | top-k vetor | LLM decide | [`expiration_date`](https://docs.mem0.ai/platform/features/memory-expiration) | não | expirar ≠ decair ≠ apagar |
| [Letta/MemGPT](https://www.letta.com/blog/memory-blocks/) | memory blocks com limite, read-only | core sempre; archival por tool | dev | — | não | blocos read-only = nível 0 |
| [LangMem](https://docs.langchain.com/oss/python/concepts/memory) | semântica/episódica/procedural | — | hot path vs background | — | não | "registrar ao fechar" = background write |
| [A-MEM](https://arxiv.org/abs/2502.12110) | notas Zettelkasten | embedding | evolução automática | — | não | evitar evolução sem revisão |
| [Generative Agents](https://arxiv.org/abs/2304.03442) / [MemoryBank](https://arxiv.org/abs/2305.10250) | stream + reflexão / Ebbinghaus | recência+importância+relevância | — | reforço por acesso | não | origem da fórmula do ai-memory |
| [Cognee](https://docs.cognee.ai/core-concepts/main-operations/improve) | grafo + `feedback_weight` | — | session_learnings | pesos 👍/👎 | sim | feedback por entrada usada |
| [Guru](https://help.getguru.com/docs/what-is-verifcation) / [Slite](https://slite.com/learn/ai-knowledge-base-guide) / [Glean](https://docs.glean.com/user-guide/assistant/how-glean-accesses-info) | cards com verificador, intervalo, verified/unverified | AI usa "só verificados" | SME; reverifica o usado; "flagged multiple times" → unverified | data de verificação | sinais de uso | verificador + prazo + status na resposta |
| [basic-memory](https://docs.basicmemory.com/start-here/what-is-basic-memory) | frontmatter + observações + relações | build_context | nenhuma ([review](https://github.com/zby/commonplace/blob/main/kb/agent-memory-systems/reviews/basic-memory.md)) | — | não | evitar a lacuna |
| [arXiv 2606.17591](https://arxiv.org/abs/2606.17591) | regras + evidence log por regra | — | crítico → proponente → curador; deprecated never deleted | por evidência | closed-loop | mesma experiência dá −4,9 pp ou +5,3 pp só pela curadoria |
| [ReasoningBank](https://research.google/blog/reasoningbank-enabling-agents-to-learn-from-experience/) / [ExpGraph](https://arxiv.org/abs/2605.30712) | sucessos e falhas / grafo por utilidade | top-k | juiz LLM | utilidade medida | sim | modelo para caso FCA-R e teste |

Sem relevância: Rewind, Khoj, [memory server oficial do MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/memory).

## 3. Respostas específicas
- **(a) Tipos com campos por tipo**: parcial (Graphiti, basic-memory, Claude auto memory, ai-memory `kind`,
  [Hindsight](https://hindsight.vectorize.io/)). Ninguém com famílias e campos por tipo como a 008.
- **(b) Propostas + votos + reversão**: propostas/aprovação em ai-memory, Hermes,
  [memorywire](https://arxiv.org/abs/2606.01138). **Votos: sem precedente.** Reversão: ai-memory via git.
- **(c) Urgência confirmada com o usuário**: sem padrão exato. Fragmentos: ai-memory `memory_feedback
  (stale|wrong)`, Guru rebaixa card sinalizado, Hermes aprovação inline. **Novidade nossa.**
- **(d) Carga em camadas**: Anthropic (3 níveis com custo), Claude Code, Hermes, Cursor, ai-memory
  `briefing`; [context engineering da Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).
- **(e) Ações com resultado**: 2606.17591, ExpGraph, ReasoningBank, Cognee; ai-memory `page_evidence`.
  Ninguém liga recomendação → ação → resultado de campanha como conhecimento. **Novidade nossa.**
- **(f) Medir contexto e uso**: ai-memory (`access_count`, `client_activity`, `explain`), Hermes (% do
  bloco), Anthropic (custo por nível), [Mem0](https://mem0.ai/blog/how-to-reduce-context-cost-with-smart-context-construction) (orçamento = 120% do p95).

## 4. Dez aprendizados (adotados na seção 14 do spec como P1–P10)
1. Esquema fixo; o agente propõe, não reorganiza (2607.26637).
2. Nível 0 com limite duro e erro; mostrar % do orçamento (Claude Code, Hermes).
3. Índice = título + "quando usar", 1 linha, referências a 1 nível (Anthropic Skills).
4. Contradição/supersessão como aresta declarada com vocabulário fechado (ai-memory, Graphiti).
5. Deprecar, nunca apagar; evidence log por entrada (2606.17591).
6. Verificação com dono e prazo em vez de confiança numérica (Guru/Slite, LLM Wiki v2).
7. Proposta com JSON validado e filtros negativos (ai-memory auto-improvement-loop).
8. Rejection buffer: recusas evitam repropor (ai-memory).
9. Feedback por entrada usada (Cognee, ai-memory acesso ≠ ajudou).
10. Promoção ao "sempre" subtrativa e humana (ai-memory design-rules-promotion).
