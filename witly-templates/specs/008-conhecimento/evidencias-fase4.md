# Evidências — Spec 008, fase 4 (`kind = conversa`) — 2026-09-13

## O roteiro no MCP
- `obter_template("otimizar-trafego")` devolve **roteiro**, não kit: cabeçalho "Roteiro:", a regra do
  checkpoint ("entregue a etapa, faça a pergunta de `espera`, registre e só então avance"), o bloco
  nível 0 (urgentes + `sempre`), Entrada, Tarefas, a **tabela de etapas**
  (`# | entrega | espera | registra | puxa do conhecimento`), Ferramentas, Saída, Guia, Regras,
  Perguntas, "Ao terminar" e o índice do conhecimento escopado. **Sem** `curl` do zip e sem Python.
- `listar_templates` marca o roteiro: "**Tipo:** ROTEIRO de conversa em etapas (sem Python nem zip)".
- Teste `test/conversa.test.ts` (2) cobre os dois pontos e a criação pela API.

## Seed
- `seed/otimizar-trafego/` (v1.0.0): 6 etapas (contexto → report geral → temperatura → campanha a
  campanha → uma campanha por vez → fechamento), 2 tarefas, 8 regras, 2 perguntas, guia com os dois
  modos ("roda o report" para nas etapas 0–1; "otimização" vai até o fim), formato do report e as
  alavancas por nível.
- `seed/novo-cliente/` (v1.0.0): 4 etapas (fonte → perguntas → resumo → proposta), 1 tarefa com as
  9 perguntas de contexto em blocos, 3 regras, guia com o que a entrada `cliente` precisa ter.
- `kit-assemble` e `test-kits` pulam `kind = conversa` (sem Python); o seed grava só os `.md`.

## Browser (wrangler dev)
- Catálogo com o filtro **roteiros**: 2 de 9, cada card com a pill `ROTEIRO`.
- `#/t/otimizar-trafego/roteiro`: abas do roteiro (Info · Roteiro · Tarefas · Regras · Perguntas ·
  Guia · Manifesto (JSON) · Versões — sem Queries, Python, Documento e Exemplo), `kit 6/6`, e o
  editor de etapas com entrada/funil/tags/ferramentas/saída e, por etapa, id, entrega, espera,
  registra, puxa, além de mover (↑ ↓), excluir e "+ Etapa".
- Console sem erros.

## Suíte
- Vitest: 20 arquivos, **92** testes. Typecheck limpo.
