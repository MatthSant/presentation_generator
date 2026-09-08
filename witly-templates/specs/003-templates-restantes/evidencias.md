# Evidências — Fase 3 (os outros quatro templates)

**Data**: 2026-09-07 · **Worker**: `https://witly-templates.projetos-145.workers.dev` (versão 24753408, viewer com seletor de filtro) · D1 de produção com os 5 templates publicados pelo `seed.mjs --remote` (o rascunho `debriefing` v1 criado na UI ficou intacto; a publicada é a do seed).

## Automatizado (`npm run test:py` = `scripts/test-kits.mjs`)
| Kit | Motor | unittest | Paridade kit == app (fixture) |
|---|---|---|---|
| acompanhamento-diario | acompanhamento-lancamento | 10 OK | 4 arquivos idênticos |
| debriefing | debriefing-lancamento | 11 OK (totais, invest_cpt exclui campanha de vendas, metas somadas/média > 0, sem goals recusa, `--opts` recorte por canal, HTML offline, sem PII) | 9 arquivos |
| criativos | criativos | 12 OK (tipo de campanha exclui Venda, totais, temperatura/vídeo, dicionário → plataforma, média ponderada, min_invest, modo captação + temp via `--opts`) | 7 arquivos |
| historico | historico-lancamentos | 11 OK (ordem cronológica/rótulos, overview, quebras canal/plataforma/temp, mídia só pago, `--opts` launches/metric) | 5 arquivos |
| conversao-perfil | conversao-perfil | 11 OK (benchmark = respondentes ≠ total, consistente 4/4 × crítico 0/4, % não ×100, canais separados, relevância e codependência) | 9 arquivos |

Worker: 63 testes Vitest continuam verdes (nada mudou em `src/`).

## HTML offline (viewer da plataforma, browser)
| Kit | Verificado |
|---|---|
| debriefing | 6 páginas; 360° com 12 qa-cards e gráficos; números batem (fat R$ 52k vs meta R$ 42k, +25 %); sem `NaN` |
| criativos | Panorama com 9 gráficos nos pickers (evolução/dispersão), ficha `vid-quente-A` com embed do post; sem `NaN` |
| historico | Panorama 12 KPIs + 52 SVGs; Investimentos 88 SVGs e 6 tabelas; sem `NaN` |
| conversao-perfil | Panorama (−57 % / −14 % / +71 % por renda), página Renda com rank-card + heatmap-toggle (23 SVGs); **seletor de canal** (Geral/Pago/Orgânico) no cabeçalho da seção, novo no viewer offline |

## MCP real (produção, sessão Claude Code)
- `listar_templates` → 5 templates: `acompanhamento-diario` v8, `criativos` v3, `conversao-perfil` v1, `debriefing` v5, `historico` v2, cada um com tarefas de contexto e parâmetros.
- `obter_template('conversao-perfil')` → kit v1 completo (manifesto, 5 tarefas, query, documento, guia, perguntas, contextos gerais) + URL assinada; o zip baixado traz o viewer novo (`sa-filters`), o `gerar.py` genérico e a fixture sem e-mail.
- `montar_query('debriefing', {field_conversion, field_conversion_anterior})` → 3 SQLs preenchidos e escapados (dump, goals obrigatório, hist opcional), com a instrução de salvar como `dump.csv` / `goals.csv` / `hist.csv`.

## UI (local, `/ui/dev-login`)
- Lista de templates mostra os 5; detalhe do `debriefing` com as abas e a aba Contexto listando as 6 tarefas (lancamento, classificacao, temperatura, metas, historico, recorte); aba Exemplo carrega os números da fixture.

## Pendências
- Reconexão do Grimório no cliente MCP para que as tools da Fase 2 apareçam (mesma pendência da Fase 2).
- Claude.ai e Codex não testados (decisão anterior).

## Ajustes pós-uso (2026-09-08, feedback do consultor no acompanhamento real)
- Viewer offline: sem a capa/masthead (o app não a mostra no relatório); relatório de uma página fica só no topnav, sem árvore lateral nem barra de seções.
- Filtros do relatório no HTML offline: `gerar.py` pré-calcula um snapshot por valor de cada dimensão de `meta.controls.filters` (acompanhamento: origem/utm_source/utm_medium/utm_campaign/utm_content; debriefing: tipo/canal/temperatura/campanha/público/criativo), um filtro por vez; `--sem-filtros` desliga. Provado no browser: utm_source=facebook muda leads de 225 para 175 e volta.
- `obter_template` marca em cada tarefa se o agente deve PERGUNTAR ao consultor e fecha com um checklist (tarefas a perguntar, parâmetros com padrão, auxiliares obrigatórios). Data de corte/report do acompanhamento passou a ser tarefa a perguntar (o agente estava decidindo sozinho).
- Worker versão f3ec0d58; templates republicados (acompanhamento v11, debriefing v7, criativos v5, histórico v4, conversão v3).
- Acompanhamento e debriefing: filtros **em cascata e combináveis** (as opções de cada dimensão se restringem ao já selecionado; snapshot por valor isolado e por caminho da hierarquia, resolvido pelo conjunto de tuplas; combinação sem snapshot fica desabilitada). Variantes grandes vão gzip+base64 e o viewer descomprime (DecompressionStream). Provado: Facebook → público só "rmkt 30d"; Facebook + COLD-interesses → 75 leads; debriefing Facebook + frio → R$ 10k.
- Filtros offline em TODOS os kits, no **botão flutuante** do canto inferior direito (mesmo `#filter-fab` + modal e CSS do app): acompanhamento/debriefing (dimensões de `_filter`), criativos (Modo, Temperatura, Investimento mínimo), histórico (Indicador, "sem <lançamento>"), conversão (canal Geral/Pago/Orgânico, client-side). Snapshots trocam dataset/seções/layout e, quando o recorte muda as seções (fichas, série), a navegação acompanha. Provado no browser: criativos Temperatura=Frio some a ficha `vid-quente-A`; histórico "sem mar/25" vira "3 lançamentos"; Limpar volta ao completo.

## Rodada de 2026-09-08 (versionamento, contextos, análise livre)
- **Versão semântica**: `template_versions.semver` (migração 0004; publicadas viraram 1.0.0, histórico 0.x). Publicar na UI escolhe ajuste (v1.0.x) / melhoria (v1.x.0) / mudança grande (vx.0.0); `seed.mjs --bump`. MCP, zip e UI mostram `v1.0.1`; o inteiro segue interno (URL assinada, logs). Descoberta: um `CASE…END` solto dentro de `VALUES` confunde o divisor de statements do wrangler (mesclava statements até estourar "statement too long"); entre parênteses funciona.
- **Contextos gerais curtos e tipados** (migração 0005, `tipo` = regra | recomendacao | definicao): 27 itens extraídos das instruções do deep do app e de `.claude/rules/comunicacao.md` (FCA-R, número com janela, vocabulário, "a Meta não desliga criativo"). O título é a regra; corpo = por quê + como aplicar. O `obter_template` lista por tipo com o rótulo `[REGRA]`/`[RECOMENDAÇÃO]`/`[DEFINIÇÃO]`.
- **Análise livre** (`analise-livre` v1.0.0): kit sem motor com `montar.py` (valida seções contra o design system: tipo de widget, binds, número solto na prosa; gera as 4 camadas + HTML), 3 tarefas de contexto (objetivo, dados, estrutura), `relatorio-exemplo/` pronto para copiar e 4 testes. O design system da plataforma passou a trazer um exemplo real (JSON) de cada um dos 28 tipos de widget, colhido dos relatórios gerados pelos templates.
- Worker versão a72b1e8e; templates em v1.0.1 (análise livre v1.0.0); 67 testes Vitest, 6 kits com unittest (paridade nos 5 com motor).
- Spec 004 (dados no HTML + JS) escrita para revisão: `specs/004-dados-no-html/spec.md`.

## Regras como entradas (2026-09-08, feedback: "as regras ainda estão em md" e "o contexto é mais tarefa que contexto")
- **`template_rules`** (migração 0006), versionada como as tarefas: `rule_id`, `tipo` (regra | recomendacao | definicao), `title` (a regra em uma frase), `body_md` (por quê + como aplicar), `sort`. Copiada em rascunho, versão nova e restauração.
- **48 regras** semeadas dos 6 kits (acompanhamento 8, debriefing 10, criativos 8, histórico 7, conversão 10, análise livre 5), extraídas do "O que NÃO concluir" e "Cuidados" dos guias — que perderam essas seções.
- **Nomes**: a aba "Contexto" virou **Tarefas** (é o que elas são) e nasceu a aba **Regras**; no zip, `contexto/*.md` virou `tarefas/*.md` e entrou `regras.md` gerado das entradas; no MCP, "## Tarefas" + "## Regras desta análise" + "## Contextos gerais".
- **Curadoria**: "virar regra" cria uma entrada no rascunho (com o id derivado do texto) em vez de anexar um bullet no guia.
- **Correção de conteúdo**: os launch goals têm uma linha por `utm_source` × dia e o `load_goals` do acompanhamento soma `por_canal` — então **meta por canal existe**. A regra geral virou "meta só existe onde a tabela define: por canal sim; por temperatura, campanha, público ou criativo, não invente", e a tarefa de metas do acompanhamento foi corrigida.
- Worker 2fe5f508; templates em v1.0.3 (análise livre v1.0.2); 67 testes Vitest, 6 kits verdes.

