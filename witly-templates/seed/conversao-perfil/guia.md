# Guia de leitura: Conversão por perfil

## Como funciona a mecânica
Em cada lançamento parte dos leads responde uma pesquisa de perfil (renda, idade, gênero, tempo de acompanhamento, campos próprios do cliente). A análise cruza essas respostas com as compras (na janela do lançamento e no longo prazo) e pergunta, para cada **critério**, quais **grupos** convertem acima ou abaixo do benchmark, e se isso se repete lançamento após lançamento. Três respostas de negócio: quem compra de forma **consistente** (merece verba e mensagem), quem **nunca converte** apesar do volume (dilui a média) e quem compra mais **no longo prazo** (precisa de nutrição).

## O que o relatório entrega
| Página | O que mostra |
|---|---|
| Panorama | variação vs benchmark por critério (melhor e pior grupo, escala compartilhada), comparativo entre critérios e tabelas de detalhe com tendência; toggle Geral / Pago / Orgânico |
| Insights | zonas ✓ conclusões, ↗ aprofundar, ! atenção (prosa autoral; no kit sai o esqueleto) |
| Codependência | relevância × independência de cada critério: qualificador × qualificante, matriz de associação |
| Uma página por critério | ranking dos grupos por consistência, heatmap por lançamento (variação / conv. / uplift), conversão média curta e longa, evolução por grupo, proporção da base |

## Regras de cálculo (as que mais erram)
1. **Benchmark = respondentes da pesquisa daquele critério**, nunca o total de leads. Respondentes convertem 2–5× a média; comparar com o total infla os positivos. A linha "bench total" (dimensões vazias) é só contexto.
2. **Conversões já em %** (`1.07` = 1,07 %). Nunca ×100. Tendência em pp.
3. **Lançamentos em ordem cronológica** extraída do nome (`abr24`), nunca alfabética.
4. **Grupos normalizados** antes de agregar (`order` + `aliases`); valor sem match é anomalia.
5. **Três canais sempre** (Geral / Pago / Orgânico) calculados separadamente.

## Definições
- `conv_lcto` = vendas_lancamento ÷ total_leads × 100 (do grupo) · `conv_12m` idem na janela longa.
- `diff_lcto` = (conv_lcto − bench_lcto) ÷ bench_lcto × 100 (variação vs benchmark, em %).
- `uplift_12m` = (conv_12m − conv_lcto) ÷ conv_lcto × 100 (quanto o longo prazo acrescenta).
- `rep` = leads do grupo ÷ leads respondentes do critério × 100 (representatividade).
- **Classe por wins/N** (lançamentos com diff > 0): Consistente 100 % · Positivo ≥ 70 % · Variável ≥ 40 % · Negativo ≥ 10 % · Crítico 0 %.
- **Tendência** = média dos 2 últimos lançamentos − média dos 2 anteriores (abs.) e descontando o benchmark (rel.): Acelerando / Ganhando terreno / Perdendo espaço / Deteriorando.
- **Relevância** = desvio médio absoluto do diff entre grupos, ponderado pela representatividade: alta ≥ 30 % · média ≥ 12 % · baixa < 12 %.
- **Codependência**: associação (Cramér's V) entre critérios sobre a distribuição de leads + lift controlado (quanto do poder de discriminar sobrevive ao estratificar pelo fator mais associado). Survival ≥ 0,5 → **qualificador** (sinal próprio); < 0,5 → **qualificante** (proxy de outro).

## Como ler cada bloco
- **Panorama**: comece pelos critérios com maior amplitude (melhor − pior); a escala é compartilhada para comparar critérios.
- **Ranking**: classe primeiro, diff depois. Consistente com `rep` alta = a mina; Crítico com `rep` alta = sangria da base (alto volume, retorno baixo).
- **Heatmap por lançamento**: procure sinais que trocam de cor (variável) e o padrão dos 2 últimos (tendência).
- **Uplift**: grupo com uplift alto compra tarde; nutrição, não mídia.
- **Codependência**: veredito combinado: amplitude alta/média + qualificador → **priorizar**; amplitude alta/média + qualificante → proxy de X (priorize X); amplitude baixa → baixo impacto, independente ou não.
- **Pago × Orgânico**: grupo que muda de classe entre canais é um insight de canal.

## O que NÃO concluir
- Associação não é causalidade; relevância e lift controlado são heurísticas de priorização, não prova.
- `rep` < 3 % é amostra pequena: não conclua sobre o grupo (contexto geral "números pequenos").
- Não compare a conversão de respondentes com a conversão geral do lançamento.
- Lançamentos recentes não completaram a janela longa: uplift subestimado.
- Custom fields sem significado confirmado não viram critério.
- Menos de 3 lançamentos: não existe consistência.
- Não some conversões entre grupos ou canais; use o benchmark agregado.

## Cuidados
- O CSV é agregado (sem e-mail, sem linha por lead): a query já entrega assim; não exporte a CTE de inscrições.
- Pesquisa editada no meio da série (faixas diferentes): mapeie ou declare a quebra.
- `vendas_12meses` exige transações com data e e-mail casando com a inscrição; e-mails diferentes (pessoal × trabalho) subestimam a conversão.
