# O documento: Análise de criativos

Duas páginas: **Panorama** e **Fichas** (uma seção por criativo válido, listadas na sidebar com busca e ordenação). Todo número vem de `numeros.json` (`calc.build` + `metrics`); as tabelas `cr_daily` e `cr_creatives` do `dataset` alimentam gráficos, ranking e o banco de perguntas. O modo (Resultado Final × Captação) e os filtros de temperatura / investimento mínimo viram `--opts` no offline: um HTML = um recorte.

## 1. Panorama (`s01`)
- **KPIs macro do modo** (10 kpi-cards no Resultado Final: Investimento, Leads, CPL, Qualidade, CPMQL projetado ★, Vendas, Tx. conversão, CAC, Retorno bruto, ROAS líquido ★; 8 na Captação: Investimento, CPM, CTR, Leads, CPL, Tx. resposta, Qualidade, CPMQL ★). Ordem do funil: dinheiro entra → leads → custo → qualificação → venda → retorno.
- **Funil**: impressões → cliques → pageviews → leads → respostas → MQLs → vendas, agregado dos criativos válidos.
- **Qualidade do criativo** (6 kpi-cards): CPM, Hook Rate, Hold Rate, CTR, Connect Rate, Conversão de página, cada um com rodapé "Bench X · ±%" contra o `funnel_bench`.
- **Gráficos**: `evolution-picker` (série diária de leads, investimento, vendas, CPL…) e `scatter-picker` (dispersão dos criativos com eixos selecionáveis, ex.: investimento × ROAS).
- **Criativos por desempenho** (`link-card` por criativo): ordenados pela métrica ★ do modo; cada card abre a ficha. Criativos sem tráfego ou abaixo do investimento mínimo aparecem em cinza.

## 2. Fichas (`s02`, `s03`, …, uma por criativo)
- **Preview** (`embed`): o post do Instagram/Facebook, quando há dicionário; senão só o nome e a plataforma.
- **Métricas** (os mesmos KPIs macro do modo), cada card comparado à **média do lançamento** (razões ponderadas; aditivas por criativo).
- **Caminho até a venda** (`funnel`) do criativo.
- **Qualidade do criativo** (CPM, Hook, Hold, CTR, Connect, Conv. página vs benchmark).
- **Evolução no tempo** (`evolution-picker` diário do criativo): serve para ver saturação.
- **Onde este criativo rodou** (`heatmap-toggle`): quebra por campanha / público / temperatura com as métricas do modo.

## O que o agente escreve no chat (não no HTML)
- As 3–5 perguntas norteadoras mais relevantes (leia `numeros.json`; as perguntas vêm no kit em `perguntas.md`), sempre citando o modo.
- As premissas: tipo de campanha escolhido, regras de temperatura, benchmark usado (próprio ou padrão), dicionário presente ou não, recorte.

## Aprofundamentos
Perguntas aceitas viram seções `det-<id>` via `aprofundar.py`, dentro do `design-system.md`, com números calculados em Python a partir do `calc.py` (mesmas definições do relatório).
