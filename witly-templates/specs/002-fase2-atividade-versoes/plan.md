# Plano: Fase 2 — Atividade, avaliação, versões, pessoais e perguntas

**Branch**: `feat/mcp-templates` · **Data**: 2026-09-07 · **Spec**: [spec.md](spec.md)

## Resumo

Tudo sobre a base da Fase 1: uma migração D1 (atividade, avaliações, dono do template,
changelog), um gate de PII compartilhado por toda escrita vinda do MCP, cinco tools novas
(`registrar`, `avaliar`, `salvar_template`, `remover_template`, `perguntas`), rotas de
API e quatro telas novas na UI (Atividade, Uso, Versões, Pessoais), um importador do
`deepen_history` do app e o banco de perguntas dentro do kit (Python do app copiado pelo
kit-assemble; `gerar.py` grava `perguntas.json`).

## Verificação da constituição

| Princípio | Plano |
|---|---|
| I | Worker só grava/lê; relevância das perguntas calculada localmente pelo kit. |
| II | `kit/pii.ts` em `registrar`, `avaliar`, `salvar_template`, importador. Recusa e lista. |
| III | Perguntas/exemplos são prosa; números continuam no calc. |
| IV | "Virar exemplo/regra" edita o guia do template; nada vira contexto geral. |
| V | Pessoal = mesmo modelo (versões, kit, zip), `owner_email` preenchido. |
| VI | Mesmo Worker/login. |
| VII | Nenhuma tela ou tool conhece um slug específico. |
| VIII/IX | Este plano + tasks.md; teste por cenário. |

## Decisões de desenho

### D1. Migração `0002`
```sql
ALTER TABLE templates ADD COLUMN owner_email TEXT;        -- NULL = organização
ALTER TABLE templates ADD COLUMN promoted_from TEXT;
ALTER TABLE templates ADD COLUMN notas TEXT NOT NULL DEFAULT '';
ALTER TABLE template_versions ADD COLUMN changelog TEXT NOT NULL DEFAULT '';
CREATE TABLE activity (id, org_id, email, evento, slug, version_number, cliente, pergunta_id,
  dados_json, avaliacao, descartado, motivo, editor_nota, editor_comentario,
  virou_exemplo, virou_regra, origem 'mcp'|'app', at);
CREATE TABLE template_ratings (id, org_id, slug, version_number, email, nota, comentario, at);
```
Índices: `activity(slug, at)`, `activity(email, at)`, `template_ratings(slug)`.

### D2. Visibilidade
`listTemplates(org, viewer)` = `owner_email IS NULL OR owner_email = viewer`. Toda leitura
de kit no MCP e na API passa por `canSee(template, user)`; escrita em pessoal só pelo dono
(ou editor para promover/remover). Promover = `owner_email = NULL, promoted_from = dono`;
se o slug colidir com um da org, a API pede `novo_slug` e renomeia (templates, versões).

### D3. Gate de PII — `src/kit/pii.ts`
Regex: e-mail; telefone BR (`(\+55)?\s?\(?\d{2}\)?\s?9?\d{4}-?\d{4}`); CPF
(`\d{3}\.?\d{3}\.?\d{3}-?\d{2}`, com dígito verificador para reduzir falso positivo). Roda
sobre o JSON serializado da escrita. Devolve `{ok, achados:[{tipo, trecho mascarado}]}`.
Não tenta detectar nomes (falso positivo alto); a constituição pede PII "identificador".

### D4. Tools novas (em `kit/tools.ts`, puras)
- `registrar(evento, dados)` → valida forma por evento (zod), PII, tamanho ≤ 200 KB,
  slug visível → `activity`.
- `avaliar(slug, nota, comentario?)` → `template_ratings` com a versão publicada vigente.
- `salvar_template(kit)` → PII + tamanho por arquivo ≤ 1 MB + slug válido/livre-ou-meu →
  cria template pessoal ou nova versão **publicada** (pessoal não passa por rascunho no
  MCP). `remover_template(slug)` só do dono.
- `perguntas(slug)` → `perguntas.md` do kit.
- `obter_template` passa a incluir `perguntas.md` e a instrução de `registrar`/`avaliar`.

### D5. Atividade → guia
`virarExemplo(entry)` insere/estende `## Exemplos de aprofundamento` no `guia.md` do
**rascunho** (ensureDraft) com `### <pergunta>` + resposta; `virarRegra(entry)` acrescenta
`- <motivo>` em `## O que NÃO concluir` (cria a seção se faltar). Idempotente por `id`
(marca na entrada).

### D6. Versões
`listVersions(slug)`, `diffVersions(a, b)` (por arquivo/tarefa: `added|removed|changed`
+ diff de linhas simples via LCS para texto ≤ 64 KB), `restoreVersion(slug, n)` (copia
como rascunho `max+1`; se já há rascunho, substitui após confirmação), `publishDraft`
ganha `changelog`.

### D7. Perguntas no kit
`kit-assemble` copia `app/pysrc/perguntas/perguntas_calc.py` e `banks/{__init__,<bank>}.py`
para `python/perguntas/`; `gerar.py` chama `perguntas_calc.run(dataset, out)` após as
camadas e grava `perguntas.json`; o seed gera `perguntas.md` a partir de `QUESTIONS`
(id, pergunta, prompt) para o kit/UI. O manifest ganha `perguntas_bank: 'acompanhamento_lancamento'`.

### D8. Importador — `scripts/import-deepen-history.mjs <comments.db> [--remote]`
Lê SQLite com `node:sqlite`/`better-sqlite3` (dev dep), mapeia `analysis_type → slug`
(tabela no script), extrai pergunta (`prompt`), resposta (texto dos widgets de
`modal_json`), rating/status/feedback → SQL de INSERT em `activity` com `origem='app'`;
roda o gate de PII por linha e imprime relatório.

### D9. UI
Novas rotas de hash: `#/atividade`, `#/uso`, `#/pessoais`, `#/t/<slug>/versoes`; aba
"Perguntas" no editor. Lista de atividade com resumo + "ver mais" (decisão do dono).

### D10. Testes
`pii.test.ts`, `activity.test.ts` (tools + API + virar exemplo/regra), `versions.test.ts`
(diff/restore/changelog), `personal.test.ts` (visibilidade, promover, remover),
`import.test.mjs` (fixture SQLite pequena), Python: `test_kit.py` ganha `perguntas.json`.

## Estrutura (novo)
```
migrations/0002_fase2.sql
src/kit/{pii.ts, activity.ts, versions.ts, personal.ts}
src/api.ts (+ rotas) · src/mcp.ts (+ tools) · public/app.js (+ telas)
scripts/import-deepen-history.mjs
seed/acompanhamento-diario/perguntas.md (gerado pelo seed a partir do banco)
```
