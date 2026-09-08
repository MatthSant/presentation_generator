# Spec 004 — Dados no HTML: o relatório se recalcula em JavaScript

**Estado**: rascunho para revisão do Matheus (decisão de 2026-09-08: "Dados no HTML + JS").
**Substitui**: os snapshots pré-calculados de filtros (spec 003, ajustes pós-uso).

## Problema
Hoje o HTML offline é um retrato: o Python calcula tudo (KPIs, funil, riscos, tendência, vereditos) e o viewer só desenha. Filtrar exige recalcular; sem Python no navegador, resolvemos com snapshots por combinação, que são pesados, limitados à hierarquia e estranhos de manter. O consultor quer o que o app faz: filtrar por função, sobre os dados, com qualquer combinação.

## Decisão de arquitetura
O relatório passa a carregar **os dados agregados** (uma tabela de fatos por motor: dimensões × dia × métricas aditivas) e uma **descrição declarativa** do documento (quais blocos, quais métricas, quais comparações). O JavaScript do viewer (e do app) **avalia** as métricas a partir dos fatos filtrados. O Python continua sendo a origem de tudo: ele **define** as métricas (fórmulas, benchmarks, metas, classificações) e **emite** os fatos; ele deixa de escrever números prontos nas seções.

Princípio III da constituição, reescrito: *o número nasce da definição do motor (Python): fórmula, meta, regra de classificação. A avaliação da fórmula sobre um recorte pode acontecer no renderer, que é código determinístico e testado. O modelo de linguagem nunca calcula.*

## O que muda em cada camada
| Camada | Hoje | Depois |
|---|---|---|
| `dataset.json` | tabelas já agregadas por bloco (`acom_kpis`, `deb_temp`…) | **1 tabela de fatos** por motor (`fatos`: dims + dia + métricas aditivas) + tabelas auxiliares não deriváveis (metas, benchmarks, dicionários, histórico) |
| `sXX.json` | widgets com números escritos (`value: "R$ 12,40"`) | widgets **declarativos**: `kpi-card {metric: "cpl", compare: "meta", window: "3d"}`, `funnel {steps: [...métricas], bench: ...}`, `chart {metric, by: "dia"}`; texto com **placeholders** `{cpl}` resolvidos pelo renderer |
| `metrics.json` (novo) | — | catálogo emitido pelo Python: `cpl = invest_cpt / leads_traf`, `taxa_qual = mqls / respostas`, formatos, "custo sobe = pior", benchmarks e metas |
| Blocos de texto (riscos, vereditos, alavancas) | prosa pronta | **regras** declaradas (`risco: metric cpl vs meta > 15% → texto template`) avaliadas no renderer; o que não couber numa regra simples fica fixo ao recorte geral e marcado como "não recalcula com filtro" |
| Filtros | snapshots | qualquer combinação de dimensões, avaliada na hora (FAB do app) |
| App (servidor) | recalcula via `render_view.py` | usa o mesmo renderer; `render_view.py` fica só para análises antigas |

## Escopo
- **US1 (P1)** Acompanhamento diário: fatos + métricas + widgets declarativos; filtros por origem/canal/público/campanha/anúncio/dia combináveis no HTML e no app. Paridade: para o recorte "tudo", os números do renderer batem com os do `calc.py` atual (teste automático).
- **US2 (P2)** Debriefing: idem, incluindo temperatura por regra de nome e metas globais; os vereditos do 360° viram regras ou ficam fixos ao geral, marcados.
- **US3 (P3)** Criativos, histórico e conversão por perfil: avaliar caso a caso; conversão já é bind-driven; histórico e criativos têm agregações por lançamento/criativo que cabem no modelo.
- **Fora de escopo**: aprofundamentos (`aprofundar.py`) continuam como seções fixas; perguntas norteadoras continuam calculadas em Python (`perguntas.json`).

## Requisitos
- FR-1 O motor emite `fatos` no grão (dims declaradas × dia) só com métricas **aditivas** (leads, mqls, respostas, invest, impressões, cliques, pageviews, vendas, faturamento…). Nada pessoal; sem linha por lead.
- FR-2 `metrics.json` declara cada métrica derivada como razão/diferença de somas, com formato, direção (maior é melhor / custo) e fonte de meta/benchmark. É gerado pelo Python a partir das mesmas constantes do `calc.py` (uma origem).
- FR-3 O renderer avalia métricas sobre o conjunto de fatos filtrado (AND entre dimensões, intervalo de dias) e alimenta widgets declarativos: kpi-card (valor, delta vs meta/histórico/janela), chart (série por dia ou por dimensão), table, funnel (etapas + maior furo relativo ao benchmark), bar-list/ranking, heatmap.
- FR-4 Texto com número usa placeholders `{metric}` e `{metric:fmt}`; texto que depende de lógica (risco, veredito) é declarado como regra `{when: expr, text: ...}`; sem regra possível, o bloco é marcado `fixo: true` e o viewer o dessatura quando há filtro ativo (o app já faz isso com o badge de filtro).
- FR-5 Paridade: `scripts/parity.mjs` compara os números do renderer (recorte geral) com os do `calc.py` de hoje para as fixtures (tolerância de arredondamento). Teste por métrica.
- FR-6 O HTML offline continua autossuficiente (viewer + dados + descrição) e menor que hoje (sem snapshots).
- FR-7 O app usa o mesmo renderer para as análises novas; as antigas (sem `fatos`) seguem no caminho atual.

## Riscos e decisões pendentes (para a revisão)
1. **Duplicação de definição vs avaliação**: a fórmula fica em um lugar (Python emite `metrics.json`), mas a avaliação existe em JS (renderer) e em Python (`calc.py`, para o app antigo e para `numeros.json`). Proposta: `calc.py` passa a avaliar a partir do mesmo catálogo (um avaliador de fórmulas em Python) para não haver duas listas de fórmulas.
2. **Blocos de prosa**: riscos, "maior furo", alavancas do One Pager e vereditos do 360° têm lógica além de razões de soma. Proposta: regras declarativas para os casos simples (comparação com meta/benchmark, argmax de gap) e `fixo: true` para o resto, com a lista do que fica fixo aprovada por template.
3. **Tamanho dos fatos**: acompanhamento real ≈ 60 combinações × 30 dias × 25 métricas ≈ 45 mil números (~300 KB de JSON, ~40 KB gzip). Aceitável. Debriefing por anúncio × dia pode ser 5–10×; gzip resolve.
4. **Esforço**: US1 é uma reescrita do `build_report.py` do acompanhamento (1.000 linhas) para o modelo declarativo + renderer novo (avaliador de métricas, widgets declarativos, regras) + paridade. Estimativa: 3 a 5 dias de trabalho focado; US2 outro tanto.

## Fora da spec, mas decidido junto
- Versionamento semântico dos templates (feito nesta rodada).
- Contextos gerais curtos e tipados (feito nesta rodada).
- Análise livre com design system e exemplos (feito nesta rodada).

## Próximo passo
Revisão desta spec pelo Matheus: confirmar o escopo (US1 primeiro), as duas propostas dos riscos 1 e 2 e a lista de blocos que podem ficar fixos no acompanhamento. Depois: `plan.md` e `tasks.md`.
