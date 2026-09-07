# Evidências — Fase 3 (os outros quatro templates)

**Data**: 2026-09-07 · **Worker**: `https://witly-templates.projetos-145.workers.dev` · D1 de produção com os 5 templates publicados pelo `seed.mjs --remote` (o rascunho `debriefing` v1 criado na UI ficou intacto; a publicada é a do seed).

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
- `montar_query('debriefing', {field_conversion, field_conversion_anterior})` → 3 SQLs preenchidos e escapados (dump, goals obrigatório, hist opcional), com a instrução de salvar como `dump.csv` / `goals.csv` / `hist.csv`.

## UI (local, `/ui/dev-login`)
- Lista de templates mostra os 5; detalhe do `debriefing` com as abas e a aba Contexto listando as 6 tarefas (lancamento, classificacao, temperatura, metas, historico, recorte); aba Exemplo carrega os números da fixture.

## Pendências
- Reconexão do Grimório no cliente MCP para que as tools da Fase 2 apareçam (mesma pendência da Fase 2).
- Claude.ai e Codex não testados (decisão anterior).
