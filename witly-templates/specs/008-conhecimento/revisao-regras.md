# Revisão das regras dos templates — o que é geral, o que é do template (2026-09-12)

Critério: **conhecimento geral** = vale em mais de um template ou é conceito (métrica com fórmula, diagnóstico,
método, regra de leitura). **Fica no template** = delta: coluna do motor (`invest_cpt`, `vendas_sale`), corte
específico (Hold 50%/100%), mecânica do kit (preserve, goals.csv, CTE do dump), limiar do motor
(rep 3%, semáforo). Regra geral e regra de template iguais = ruído: o agente lia as duas.

## Saiu dos templates → entrada geral (30 entradas novas em `seed/conhecimento/`)
| geral (id) | tipo | vinha de |
|---|---|---|
| cpl · cpm · ctr · connect · conv-pagina · hook · hold · cpmql · cac · roi · retorno · conversao · taxa-de-resposta | metrica | acompanhamento, criativos, debriefing, historico (fórmulas repetidas 2–4×) |
| funil-de-trafego · produto-principal | definicao | acompanhamento; criativos + historico |
| decomposicao-do-cpl · compensar-cpm · saturacao-de-criativo | diagnostico | acompanhamento + debriefing + historico; historico; criativos |
| onde-a-piora-concentra | metodo (witly) | acompanhamento + debriefing |
| menos-de-3-pontos · associacao-nao-e-causa · captacao-nao-julga-roas · bloco-sem-tabela-sai | regra `sempre` | livre + conversao + historico; livre + conversao; criativos; livre |
| hook-hold-so-video · ranking-cruza-volume · mecanicas-diferentes · delta-300-denominador · consulte-antes-de-dizer-sem-dado · query-e-base | regra `geralmente` (por gatilho) | criativos ×2; historico ×3; debriefing; livre |
Removidas dos kits: 51 regras (acompanhamento 10, livre 4, conversão 2, criativos 16, debriefing 6, histórico 13).
`pontas-sao-ruidosas` já era `dia-isolado-e-ruido`; `def-taxa-de-qualidade`/`def-qualificacao` (÷ respostas) já era
`qualificacao-sobre-respostas`; `def-roas-liquido` já era `roas-liquido`; `def-cpa-2` já era `cpa-e-cpl-vezes-conversao`.

## Ficou no template (delta)
- **acompanhamento**: data de corte, rode todo dia (preserve), série diária é geral, sem metas sem semáforo, funil
  precisa de views, semáforo 5/15%, tendência 3 dias vs início, série de custo só com mídia, maior furo do funil,
  meta por canal (o motor soma até o corte), Hold 50%.
- **livre**: número nasce no calc_livre.py.
- **conversão por perfil**: benchmark = respondentes, não compare respondentes com geral, rep < 3%, custom field
  sem significado, dump agregado sem e-mail, janela longa incompleta, pesquisa editada, definições do motor
  (rep, diff, relevância, codependência, classe, uplift, conv_lcto, tendência 2×2).
- **criativos**: criativo válido (`min_invest`), média do lançamento, gap vs benchmark, Hold 100%, nome do anúncio
  bate, tipo recortado, dicionário de links, video_p100 pode faltar.
- **debriefing**: CPL/CAC/CPMQL/ROAS com `invest_cpt` e pago, metas (soma × média), impacto em receita, ponte sem
  qualificação, temperatura só pago, temporal por inscrição, início/recente ≠ realizado, recorte sem meta, sem
  goals/hist, classificação antes de gerar, Δ vs meta ±10%, variação vs histórico, meta por canal.
- **histórico**: investimento (+ paidmedia_tax), faturamento líquido, retorno com taxas, reembolso (5%),
  recapturados, conv. paga/MQL, CPA = invest ÷ vendas pagas, média das quebras, outlier, rótulos iguais,
  reembolso recente, vendas_mql zerada, **ROAS bruto** e **qualidade ÷ leads** (ver abaixo).

## Contradições encontradas — decisão do Matheus, não mudei o motor
| # | Onde | O que diz | Regra geral | O que fazer |
|---|---|---|---|---|
| C1 | histórico `def-roas` | ROAS = fat. líquido ÷ investimento (**bruto**) | `roas-liquido`: ROAS é líquido (−1) | ou o motor do histórico passa a líquido (calc + guia), ou a regra do template diz explicitamente "bruto, difere do padrão"; hoje o agente vê as duas |
| C2 | histórico `def-taxa-de-qualidade` | MQLs ÷ **leads** | `qualificacao-sobre-respostas`: MQLs ÷ respostas | o histórico não tem respostas na base? Se não tem, renomear para "qualidade sobre leads" e dizer que não é comparável ao CPMQL dos outros |
| C3 | acompanhamento Hold 50% × criativos Hold 100% | dois cortes | `hold` geral registra a divergência | unificar o corte (25/50/75/100) ou manter e sempre citar o corte |
| C4 | acompanhamento semáforo (ok ≤ 5%, atenção 5–15%, ruim > 15%) × debriefing (±10% "na meta") | duas réguas de desvio vs meta | nenhuma | decidir uma régua da casa (vira `benchmark`/`definicao` geral) ou justificar: diário tolera menos que o fechamento |
