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

## Como ler cada bloco
- **Panorama**: comece pelos critérios com maior amplitude (melhor − pior); a escala é compartilhada para comparar critérios.
- **Ranking**: classe primeiro, diff depois. Consistente com `rep` alta = a mina; Crítico com `rep` alta = sangria da base (alto volume, retorno baixo).
- **Heatmap por lançamento**: procure sinais que trocam de cor (variável) e o padrão dos 2 últimos (tendência).
- **Uplift**: grupo com uplift alto compra tarde; nutrição, não mídia.
- **Codependência**: veredito combinado: amplitude alta/média + qualificador → **priorizar**; amplitude alta/média + qualificante → proxy de X (priorize X); amplitude baixa → baixo impacto, independente ou não.
- **Pago × Orgânico**: grupo que muda de classe entre canais é um insight de canal.

## Regras desta análise
As regras (o que não concluir, os cuidados) são **entradas**, não texto solto: chegam no `obter_template` e no `regras.md` do kit, cada uma com o título dizendo a regra. Na plataforma ficam na aba **Regras**.
