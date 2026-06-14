# Revisão do motor de deepen — por pergunta de aprofundamento

Objetivo (goal): rodar as perguntas de aprofundamento 1 a 1, mas **antes verificar se o
motor já dá à IA as ferramentas/dados** para responder cada uma. Princípio: **ajustar o
MOTOR** (dados/consultas determinísticas) é mais preciso do que remendar o system prompt —
o número nasce no motor, a IA só faz prosa + bind. Este doc vira a base de um guia de
boas práticas/requisitos do motor e o checklist para revisar os outros tipos de análise.

> **Status de execução:** os deepens em si (geração via LLM) estão **bloqueados por crédito
> da API** ("credit balance is too low"). Esta rodada cobre a **prontidão do motor** —
> verificada com `query_api.py` direto (Python puro, sem API) e regeneração do relatório
> do `.base`. Executar/revisar a SAÍDA de cada deepen fica pendente para quando houver crédito.

Caso de teste: `enxoval-inteligente / acompanhamento` (tipo `acompanhamento-lancamento`).

---

## Ferramentas do motor que a IA tem hoje (acompanhamento)

**Catálogo (modo raso):** `acom_kpis` (KPI×meta/dev/cls/trend), `acom_funnel` (etapas×
migração/bench/gap/maior_furo), `acom_daily` (séries por dia), `acom_origem` (pago/org),
`acom_temp` (Quente/Morno/Frio × leads/invest/cpl/cpmql), `acom_canais` (utm_source).

**Deep mode (`consultar`):** `tabela / trend / variacao / series / series_long / correlacao /
ranking` + `cruzar_dia`; params `dimensao` (dia|temperatura|canal|origem), `recorte_*`
(origem/temperatura/canal), `incluir_geral` (linha/série "Geral" GLOBAL ponderada — soma
contagens, recalcula taxas), `metrica`.

---

## Matriz de prontidão (6 perguntas)

| # | Pergunta | Dados/cruzamento que precisa | Coberto? | Como |
|---|---|---|---|---|
| ac-funil-furo | maior furo do funil | etapas + migração/bench/gap/maior_furo | ✅ | `acom_funnel` (catálogo) |
| ac-pior-kpi | KPI macro mais fora da meta | KPIs × meta/dev/cls + trend 3d | ✅ | `acom_kpis` (catálogo) |
| ac-qualidade | qualidade caindo? por origem/criativo? | taxa_qual diária + por origem/temp/criativo no tempo | ✅ | `acom_daily.taxa_qual` + `cruzar_dia(taxa_qual, origem\|temperatura\|criativo)`; criativo agora é dimensão (M2) |
| ac-custo | CPL/CPMQL subindo? mídia vs qualif. | cpl/cpmql/cpm/taxa_qual diários | ✅ | `acom_daily` (cpl,cpmql,cpm,taxa_qual). CPMQL=CPL/taxa_qual decomponível pelos diários |
| ac-resposta | taxa de resposta suficiente? | taxa_resp nível+meta+tendência diária | ✅ | `acom_kpis.taxa_resp` (nível/meta) + tendência via `consultar(dia, taxa_resp)` → **agora também `acom_daily.taxa_resp` (bind direto)** |
| ac-pago-org | concentração pago×orgânico | leads por origem (+ métricas) | ✅ | `acom_origem` (catálogo) / `tabela(origem, incluir_geral)` |

Conclusão: **todas as 6 têm as ferramentas**. Lacunas: (a) conveniência — taxas diárias
fora do `acom_daily`; (b) cruzamento por **criativo** não existe no deep mode (gap real,
porém o prompt da pergunta de qualidade aceita origem como alternativa).

**Verificação (sem API):**
- P1/P2/P4: confirmados no `dataset.json` — `acom_funnel` tem etapa/value/migracao/bench/gap/
  maior_furo (maior furo = Pageviews, gap 57,8%); `acom_kpis` tem value/d3/meta/dev/cls/
  trend_dir/trend_pct por KPI (ex.: taxa_qual `bad` −21,9%, cpmql `bad`); `acom_daily` tem
  cpl/cpmql/cpm/taxa_qual diários.
- P3/P5/P6: confirmados via `query_api.py` — `cruzar_dia(taxa_qual, origem)` ok; `trend(dia,
  taxa_resp)` ok; `tabela(origem, incluir_geral)` ok (linha Geral ponderada).

---

## Mudanças no motor (changelog)

### M1 — `acom_daily` ganha as taxas diárias deriváveis (bind direto)
**Por quê:** `acom_daily` tinha leads/invest/cpl/cpmql/taxa_qual/cpm, mas **não** `taxa_resp`,
`conv_pag`, `ctr`. Para a tendência diária dessas, a IA era obrigada a `consultar` (passo
extra, mais chance de erro/mistura de agregado). Princípio: dado derivável e útil deve estar
pronto no catálogo p/ **bind direto**.
**O que mudou:** `build_report.py` → `acom_daily` agora inclui `taxa_resp`, `conv_pag`, `ctr`
sempre; `hook/hold/connect` só quando a base tem vídeo/página (senão seriam só null).
**Arquivo:** `pysrc/acompanhamento-lancamento/build_report.py`.

### M2 — dimensão `criativo` no deep mode
**Por quê:** a pergunta de qualidade pede relacionar a queda com **criativos**, mas não havia
dimensão criativo no `consultar` (só dia/temperatura/canal/origem). O dado existe (coluna
`field_ad_name`).
**O que mudou:** `calc.frame_rows`/`cross_dia` ganham `dim='criativo'` (anúncio pago, agrupa por
`field_ad_name`) + filtro `recorte_criativo`; `query_api` e o registry expõem (`dimensao`
inclui `criativo`, novo `recorte_criativo`). Verificado: `ranking(criativo, leads)` → 16
anúncios; `tabela(criativo, incluir_geral)` traz Geral ponderado.
**Arquivos:** `calc.py`, `query_api.py`, `typeRegistry.ts`, `claude.ts`.

---

### M3 — dimensões `publico` (adset) e `campanha` no deep mode
**Por quê:** faltavam, e vêm do dump. **público** = `field_adset_name`, **campanha** =
`field_campaign_name` (ambas tráfego pago).
**O que mudou:** `calc.frame_rows`/`cross_dia` + `recorte_publico`/`recorte_campanha` + query_api
+ registry + prompt. Verificado: `ranking(publico, leads)` (2 adsets), `tabela(campanha,
incluir_geral)` (campanhas + Geral). Helpers `adset_name`/`campaign_name`.

---

## Rodada de verificação das dimensões (o que vem do dump)

**Definição (do usuário):** dimensão = coluna pela qual as métricas são QUEBRADAS em linhas
(um agrupamento). Coluna que vem como VALOR agregável é métrica, não dimensão.

| Coluna do dump | É dimensão? | Status |
|---|---|---|
| `data` | sim → **dia** | ✅ coberta |
| `utm_source` | sim → **canal** | ✅ coberta |
| `field_ad_name` | sim → **criativo** | ✅ (M2) |
| `field_adset_name` | sim → **publico** | ✅ (M3) |
| `field_campaign_name` | sim → **campanha** (+ temperatura inferida) | ✅ (M3 / acom_temp) |
| (derivado invest>0) | sim → **origem** (pago/org) | ✅ coberta |
| `utm_medium`, `utm_campaign`, `utm_content`, `utm_*_traf` | sim, mas **redundantes** (duplicam hierarquia Meta campanha/adset/ad ou origem) | ⏸️ não expostas — adicionar só se houver caso real |
| `field_conversion` | não (id do lançamento — é FILTRO p/ um lançamento, não quebra interna) | n/a |
| `leads_novo`, `leads_antigos`, `cliente_inscrito` | **NÃO** — tipo de lead vem como CONTAGEM (métrica), não agrupa as outras métricas | ✅ corretamente fora |
| demais (`respostas`, `invest_total`, `impressoes`, `vendas_*`, `views_*`, `hook_rate`…) | não — métricas | n/a |

**Conclusão:** todas as dimensões reais (hierarquia Meta + origem + temperatura + dia) estão
expostas. Tipo de lead corretamente tratado como métrica. UTMs redundantes deixadas de fora.

---

### M4 — `rank_extra=['leads','investimento']` (volume sempre no ranking)
**Por quê:** `ranking(criativo/publico, taxa)` mostrava extremos com amostra mínima
(ex.: criativo 100% de qualidade com 1 lead) sem o volume ao lado → a IA citaria ruído
como sinal. **Princípio: taxa sempre viaja com o volume.**
**O que mudou:** `query_api.build_frame` adiciona `rank_extra:['leads','investimento']` ao
frame → todo ranking traz Leads/Investimento ao lado da métrica. Verificado.
**Arquivo:** `query_api.py`.

---

## Simulação via Agent (sem crédito) — pergunta ac-qualidade

Rodei a pergunta "A qualidade está caindo?" num subagente Claude (billing à parte),
alimentado com os dados REAIS do `query_api`. Resultado: modal correta (conclusão SIM
no topo; atribuiu a queda ao **mix de pago** — Pago 27,2% × Orgânico 42,2%, Geral 31,2%
ponderado; **descartou o ranking de criativo como ruído** por ver o volume — M4 funcionando).

**Achados (viram requisitos do motor):**
- ✅ Confirmado: taxa não somada (usou o Geral ponderado), criativo de baixo volume
  reconhecido como ruído (graças ao volume no ranking).
- ⚠️ **Rate sempre com volume** vale também para a série diária e para o cruzamento:
  `cruzar_dia` devolve só `valor` (sem o N por dia/série) — a IA não enxerga o volume de
  cada ponto. Mitigação atual: `acom_daily` tem `leads` (série única) e `cruzar_dia(leads,
  grupo)` dá o volume por grupo (2ª consulta). Requisito: avaliar incluir o N no
  `cruzar_dia`.
- ⚠️ **"Perfil diferente do recente"** → no acompanhamento, "perfil" = temperatura/origem
  ao longo do tempo (não há demografia; isso é domínio do conversao-perfil). Respondível via
  `cruzar_dia(taxa_qual, temperatura|origem)` início-vs-recente — o prompt deve direcionar.
- ⚠️ **Criativo útil = alto volume / ativo nos últimos dias**, não os extremos do ranking.
  M4 dá o volume; um filtro de volume mínimo ou "top por volume" refinaria.

**Conclusão:** motor pronto para responder as 6 perguntas; refinamentos acima são
incrementais. A revisão da SAÍDA real (com o loop tool-calling/gate/critic) precisa de
crédito — a simulação valida o prompt + suficiência de dados, não substitui o run real.

---

### M5 — função `decomposicao` (CPL/CPMQL → contribuição por fator)
**Por quê:** a 2ª simulação (pergunta ac-custo) mostrou que a IA decompõe o CPL (CPM ÷
CTR ÷ Connect ÷ Conv.Página) "na unha" — frágil, pode apontar a alavanca errada. **Atribuição
deve ser do motor, pronta e auditável** (não álgebra do LLM).
**O que mudou:** nova `consultar decomposicao` (metrica=cpl|cpmql) — log-decomposição entre a
janela inicial e a final (3 dias), devolve a CONTRIBUIÇÃO % de cada fator. Verificado:
- CPL +231%: **CTR 62,6%** (alavanca), Connect 28,9%, CPM 12,3%, Conv.Página −3,8%.
- CPMQL +249%: **CPL 95,7%**, Taxa de Qualidade 4,3% → o salto é custo de mídia, não qualificação.
Robustez: `query_api` força stdout UTF-8 (summaries têm →/×/acentos).
**Arquivos:** `query_api.py`, `typeRegistry.ts`, `claude.ts`.

### 2ª simulação (ac-custo) — conclusão
Modal correta (atribuiu a alta ao CTR/criativo, não ao leilão; CPMQL ← CPL). A crítica do
agente motivou a M5 e confirmou: dados diários (CPM/CTR/conv/qualidade) suficientes; o que
faltava era a **atribuição pronta** (agora M5). Demais pontos (N diário, volume por série no
cruzar_dia) já mitigados por `acom_daily.leads` + ranking com volume (M4).

---

### Revisão combinada das 4 perguntas restantes (funil-furo, pior-kpi, resposta, pago-org)
Todas **respondíveis** com catálogo + deep mode. Meta-insight do revisor (vira boa prática):
o motor entrega bem o **diagnóstico (o quê)** pelo catálogo, mas o **porquê/ação** depende de
chamadas do deep mode — o prompt precisa direcionar a IA a chamá-las:
- **pior-kpi**: cpmql `bad` → o "como recuperar" exige `decomposicao(cpmql)` (M5) p/ saber se é
  CPL ou qualificação. Prompt direciona.
- **pago-org**: leads por origem dão o diagnóstico; o RISCO exige qualidade/CPL por origem →
  `tabela(dimensao=origem)` / `frame_rows`. Disponível; prompt direciona.
- **funil-furo**: `acom_funnel.value` já traz o volume absoluto por etapa (perda absoluta p/
  contexto) — disponível no catálogo.
- **resposta**: 59,4% acima da meta (40%); risco baixo. Cruzamento resposta×qualificação via
  `cruzar_dia`/`tabela` se preciso.
Nenhum gap de DADO — os dados existem; é questão de a IA CHAMAR a consulta certa (prompt) +
o critic validar no run real.

---

### M6 — função `onde_concentra` (drill-down de atribuição)
**Por quê:** "qual criativo/público/campanha/canal/temperatura puxa a métrica, ou é geral?"
exigia a IA varrer dimensões e julgar concentração na mão — errado (confunde o maior item
com a causa). **O motor faz o drill-down e dá o veredito.**
**O que faz:** `consultar onde_concentra(metrica)` varre criativo → publico → campanha →
canal → temperatura (início→recente) e classifica cada nível: **AMPLO** (maioria do volume
piora → sobe de nível), **CONCENTRADO** (minoria piora, 1 item domina → é a causa),
inconclusivo (1 item). Se AMPLO/uniforme em tudo → **GLOBAL** (mídia/leilão/saturação).
**Heurística:** o sinal decisivo é `vol_pior_%` (quanto do volume piorou), NÃO o peso do top
(o maior item pesa por ser grande, não por degradar mais — armadilha de atribuição).
**Verificado:** CPL do enxoval → AMPLO em todos (criativo 98%, público/campanha/temp 100%)
→ veredito GLOBAL. Bate com a decomposição (CTR -62,6% global).
**Validação por agente:** a IA concluiu GLOBAL e ARGUMENTOU; explicitou que o veredito do
motor a impediu de culpar erradamente o maior criativo (55% = artefato de volume).
**Limites honestos (do DADO, não da lógica):** canal cego (1 só: meta-ads) → "global na
conta" pode ser "global no Meta"; sem frequency/reach no dump, saturação é hipótese não
medição; confiança menor onde a dimensão tem poucos itens (2 públicos/campanhas).
**Arquivos:** `query_api.py`, `typeRegistry.ts`, `claude.ts`.

---

### M7 — orgânico via UTM (coalesce) + itens pausados no drill-down
**Por quê (alertas do doc):** no orgânico os `field_ad_name/adset/campaign` vêm vazios → caíam
em 'Não trackeado'; e item sem dado recente era ambíguo (desligado × piorou).
**O que mudou:**
- **coalesce**: criativo = `coalesce(field_ad_name, utm_content)`, campanha =
  `coalesce(field_campaign_name, utm_campaign)` → orgânico aparece NOMEADO; essas dimensões
  deixam de filtrar só pago (incluem orgânico). publico (adset) segue pago (sem UTM equivalente).
  Verificado: ranking de criativo foi de 16 → 30 itens (com orgânico).
- **pausados/novos**: `onde_concentra` reporta, por nível, itens ATIVOS no início e sem dado
  recente (= provavelmente DESLIGADOS — não contam como piora) e os NOVOS. Verificado:
  criativo 9 pausados / 4 novos. A IA lê "pausaram os ruins / entraram novos".
**Arquivos:** `calc.py`, `query_api.py`, `claude.ts`.

### #22 — Perguntas norteadoras: recombinações × métricas secundárias
**Princípio (do usuário):** métrica SECUNDÁRIA/intermediária (CPMQL, CPM, CTR, conv.página…)
NÃO vira pergunta de aprofundamento — entra como pergunta de IMPACTO **dentro** do deepen
("por que o CPL subiu? → olha a métrica intermediária"). As 6 perguntas primárias ficam.
**Conclusão:** NÃO criar perguntas tipo "CPMQL por criativo". As recombinações (dimensão ×
métrica, métrica intermediária) são cobertas pelos TOOLS do deepen — `onde_concentra` (qual
recorte puxa), `cruzar_dia` (grupo no tempo), `decomposicao` (qual fator), dimensões +
`incluir_geral`. Ou seja, a "recombinação" é resolvida no deepen sob demanda, não como banco
de perguntas. Candidato PRIMÁRIO futuro (não secundário): "qual criativo/público escalar ou
cortar?" (ranking de eficiência) — avaliar se vira pergunta ou fica como deepen; por ora o
`ranking` por dimensão já cobre dentro do deepen.

---

## Status final (acompanhamento)
- **6 perguntas revisadas 1 a 1** (2 simulações ricas via agent: ac-qualidade, ac-custo;
  4 em revisão combinada). Todas **engine-ready**.
- **Motor ajustado (M1–M5):** taxas diárias no acom_daily; dimensões criativo/publico/campanha;
  volume no ranking; `incluir_geral`; `cruzar_dia`; `decomposicao`. Tudo verificado via query_api.
- **Pendente (precisa de crédito):** rodar os 6 deepens REAIS e revisar a SAÍDA (loop
  tool-calling/gate/critic) — a simulação valida prompt+dados, não substitui o run real.

---

## Debriefing de lançamento — mesmos checks aplicados

Confirmado que o dump do debriefing é **nível-anúncio** (tem `field_ad_name`,
`field_adset_name`, `field_campaign_name`, `utm_content`/`utm_campaign`) — o docstring
antigo do `calc` ("utm_source × campanha × dia") estava desatualizado. Logo os mesmos
recortes do acompanhamento se aplicam. Verificado sem crédito contra
`backup/_app-memory-cleared/base/inde/debriefing-ui/` (1726 linhas).

| Item (≡ acompanhamento) | Antes (debriefing) | Depois |
|---|---|---|
| Dimensões no deep | escopo/canal/temperatura/semana (pré-agregado) | **+ campanha, criativo, publico**; tudo via `frame_rows` sobre linhas cruas |
| Métricas por dimensão | canal só tinha leads/vendas/conv/qual/fat | **`_derive` rico**: + invest/ROAS/CPL/CPMQL/CPM/CTR/connect/conv_pag em qualquer recorte pago |
| Recortes (cross-cut) | nenhum | `recorte_escopo/temperatura/canal/criativo/publico/campanha` |
| Geral ponderado | não | `incluir_geral=sim` (soma contagens, recalcula taxa/ROAS — nunca somar) |
| Volume no ranking | não | `rank_extra=['leads','vendas','invest']` |
| Coalesce orgânico | não | `ad_name = field_ad_name ← utm_content`; `campaign_name ← utm_campaign` |
| Decomposição de custo | não | **`decomposicao`** CPL ← CPM/CTR/Connect/Conv.Página; CPMQL ← CPL/Qualidade paga |
| Drill-down de atribuição | não | **`onde_concentra`** criativo→publico→campanha→canal→temperatura + pausados/novos |
| Cruzamento no tempo | não | **`cruzar_dia`** (métrica por dia × dimensão, multi-linha) |
| UTF-8 no stdout | não | `sys.stdout.reconfigure('utf-8')` |

**Janela de tempo (adaptação ao tipo):** o debriefing é retrospectivo (vs META, não
início→recente como o acompanhamento diário). `decomposicao`/`onde_concentra` comparam a
**janela inicial × final do lançamento** (≈20% dos dias com captação de cada ponta) →
responde "a eficiência deteriorou ao longo do lançamento?" (saturação). O gap vs meta
segue **global** (não há meta desagregada) — `atingimento` cobre isso; a IA é instruída
a não inventar meta por dimensão.

**Validação sem crédito (fixture INDÊ):**
- `decomposicao cpl`: CPL +27% → **CPM +51,8% contribui 176%** (leilão), amortecido por CTR/Conv.Página melhorando.
- `decomposicao cpmql`: +85% → **Qualidade paga contribui 61,6%** (caiu -31,6%) > CPL 38,4% → driver = qualidade (responde `db-cpmql-driver`).
- `onde_concentra cpl`: veredito **GLOBAL** (piora ampla; canal "1 item só" = facebook-ads) — concorda com a decomposição (CPM/leilão, não um criativo).
- `tabela`/`ranking` por temperatura: ROAS quente 2,14× × advantage 0,64× (responde escalar/pausar); escopo Pago ROAS 1,05× × Orgânico conv 6,06%.
- `recorte_temperatura=quente` filtra o canal; `incluir_geral` adiciona Geral ponderado.

**Simulação via Agent (sem crédito API) — pergunta db-custo:** o agente investigou com
`decomposicao cpmql/cpl` + `onde_concentra` e produziu um detalhamento honesto e correto:
CPMQL +85% puxado **61,6% por qualidade** (não leilão) e CPL +27% **integralmente por CPM**
(176%, amortecido por CTR/Conv.Página). Não inventou meta por dimensão quando `atingimento`
deu `nao_disponivel`, e não somou taxa. **Achado de discoverability:** rodou `trend` sem
`dimensao` → caiu no default `canal` em vez da curva temporal. Capacidade já existia
(`trend`/`series` com `dimensao=semana`); só faltava sinalizar — corrigido no desc da
dimensão (`trend cpmql dimensao=semana` → CPMQL S1→S6 52,73→112,25, +113%, CV=0,22).

**Pendência de crédito:** rodar as 17 perguntas norteadoras 1 a 1 e revisar a SAÍDA da IA
(igual ao acompanhamento — só essa parte depende de crédito). As 6 perguntas de custo/
mídia/saturação/gap agora têm ferramenta determinística dedicada.

### Simulação via Agent das 17 perguntas (sem crédito API)

Rodada completa em 5 agentes (clusters) contra a base REAL `inde/debriefing` (com metas).
Veredito: **o motor + as instruções bastam** — todas as 17 foram respondidas com número
real (atingimento/decomposicao/onde_concentra/tabela/ranking/trend); nenhuma meta
inventada por dimensão; nenhuma taxa/ROAS somada (usaram `incluir_geral`); métricas
secundárias ficaram como o "porquê" (decomposição), não viraram perguntas novas. As 3
históricas (`db-vs-historico`, `db-receita-invest`, `db-roas-hist`) degradaram com
honestidade ("sem lançamento anterior carregado" — `hist_csv` ausente nesta base), sem
inventar histórico.

Achados acionáveis da simulação → **3 ajustes aplicados**:
1. **`so_midia=sim`** (dia/semana/cruzar_dia): poda a cauda pós-lançamento (dias sem mídia
   paga). Sem isso o `trend` de leads reportava "−99%" por causa das semanas com mídia
   desligada. `decomposicao`/`onde_concentra` já cortavam essa cauda; faltava nas séries.
2. **`escopo` 3 vias** (Pago/Orgânico/**Não identificado**): o `_esc` jogava
   `nao_identificado` em "Orgânico" → orgânico inflava (552 vs 545 vendas do relatório).
   Agora bate com o `deb_split_vend` (9009 leads / 545 vendas no orgânico).
3. **`atingimento` anexa nota** "metas só no nível global" quando recebe `dimensao` (a IA
   às vezes passa `dimensao=canal` esperando meta por canal; antes era descartado em
   silêncio).

### Histórico no modo-fundo — `variacao_hist` (implementado)

O gap de cruzamento histórico foi fechado. `calc.build` agora mantém `M['_hist_rows']`
(linhas classificadas do lançamento anterior, quando `hist_csv` configurado) e a
`consultar` ganhou **`variacao_hist`**:
- **sem `dimensao`** → Δ% dos KPIs globais (vendas/leads/fat/qualif/CPL/CPMQL/ROAS/invest),
  atual × anterior, com a direção de custo anotada (+ = piora em CPL/CPMQL);
- **com `dimensao`=canal/temperatura/escopo** (que recorrem entre lançamentos) → atual ×
  anterior × Δ% de uma métrica por grupo, + contagem de novos/sumiram (criativo/campanha
  geralmente não recorrem). Itens sem base (ex.: ROAS/CPL no orgânico) vêm `null`.
- sem `hist_csv` → `nao_disponivel` com mensagem apontando o `deb_kpis.hist` (bind global).

Validado sem crédito com um lançamento anterior sintético (atual = anterior × 1,25):
`variacao_hist {}` deu volumes +25% e **taxas Δ0%** (prova o recálculo ponderado — escalar
leads/invest/fat junto não move CPL/ROAS); por temperatura/canal idem; orgânico `null`.
Simulação via Agent das 3 históricas: usou `variacao_hist` (global + dimensão)
corretamente, respeitou direção de custo e `null`, classificou honestamente como
"crescimento de escala, não de eficiência", sem inventar histórico nem somar taxa.

### Check de cobertura — todas as colunas do dump (debriefing)

Varredura do dump `inde/debriefing` (1726 linhas) mapeando cada coluna → o que o
modo-fundo entrega à IA:

| Coluna(s) | Vira | Status |
|---|---|---|
| utm_source | dimensão `canal` | ✅ |
| field_campaign_name (← utm_campaign) | dim `campanha` + `temperatura` | ✅ |
| field_ad_name (← utm_content) | dim `criativo` | ✅ |
| field_adset_name | dim `publico` | ✅ |
| data | dim `dia`/`semana` | ✅ |
| _tipo (utm_source) | dim `escopo` (Pago/Orgânico/Não id.) | ✅ |
| leads, vendas, faturamento, invest_total | métricas leads/vendas/fat/invest | ✅ |
| leads_mqls, respostas | qual, taxa_resp | ✅ |
| impressoes, link_clicks, pageviews, leads_trafego | cpm/ctr/connect/conv_pag/cpl | ✅ (pageviews=0 aqui → connect null, tratado) |
| **leads_novo, leads_antigos** | **métricas novos/antigos/pct_novos** | ✅ **adicionado** (frescor de audiência) |
| utm_medium | — | não exposto (canal cobre; marginal) |
| faturamento_sale/gen/bump/upsell, refunds | KPI de relatório (fat_sale/dsell, refunds_n) | nível-relatório, não no deep (niche; gen/bump/upsell≈0 aqui) |
| hotleads, leads_whats, *_whatsapp, sales_tax, broker_fee | — | vazios neste dump (client-specific) |

Conclusão: todas as dimensões e métricas decisórias estão expostas; a única lacuna real
de métrica (novos/antigos) foi adicionada. Produto-mix/refunds ficam no relatório (não
há pergunta norteadora que precise deles no deep).

### Impacto na receita por etapa do funil — `impacto_receita` (implementado)

Pedido-chave do debriefing: **medir o impacto na RECEITA de uma métrica de outra parte do
funil** (ex.: "quanto a queda de qualificação custou de faturamento?"). Antes os agentes
faziam esse contrafactual NA MÃO ("se o pago convertesse como o orgânico, +364 vendas").
Agora há ferramenta determinística.

`impacto_receita` decompõe a variação de faturamento (atual × baseline) pela identidade
exata **Faturamento = Volume(leads) × Taxa de Resposta × Qualificação × (Vendas÷MQL) ×
Ticket**, via log-decomposição, e atribui a cada etapa o **Impacto em R$** (soma = Δ
total, sinal correto) + Δ% + % do gap. **Ressalva (apontada na revisão):** NÃO há coluna
de vendas atribuídas a MQL no dado — o 4º fator é **`Vendas÷MQL`** = razão
vendas_totais/MQLs, que telescopa a identidade mas NÃO é conversão MQL→venda (pode passar
de 1 no orgânico, onde há venda sem MQL); `taxa_resp` e `qual` são taxas reais. Rótulo
ajustado de "Fechamento (MQL→venda)" → "Vendas ÷ MQL" p/ não prometer causalidade.
`base=meta|historico|janela`; `recorte_*` para um segmento (ex.: só o Pago). `calc.rev_factors` + `calc.match` (filtro compartilhado
com `frame_rows`); `load_goals` agora lê `meta_taxa_resp` p/ a baseline meta.

Validação sem crédito (base real `inde/debriefing`, gap de receita vs meta −R$155,6k):
**Qualificação −R$477k** (etapa que mais destruiu receita: 31,8%→20,1%), quase toda
compensada por **Taxa de Resposta +R$445k** (48,7%→74,6%); Volume −R$78k, Fechamento
−R$100k, Ticket +R$54k — os R$ somam exatamente o gap. Simulação via Agent ("qual etapa
do funil custou os R$155 mil?"): achou `impacto_receita` de primeira (boa discoverability),
contou a história certa (qualificação é a alavanca, mascarada pela resposta), sugeriu
waterfall. Ajuste do feedback: a coluna foi renomeada de "Contribuição %" → **"% do gap"**
(o sinal era contraintuitivo quando etapas se compensam; o "Impacto R$" é o número
inequívoco). Próximo passo possível (não bloqueante): um `por:dimensao` no
`impacto_receita` p/ drillar a etapa-alavanca (hoje a IA encadeia com ranking/variacao_hist).

## Boas práticas do motor (rascunho — vale p/ todos os tipos)

1. **Dado derivável e útil = pronto no catálogo** (bind direto), não só via `consultar`.
2. **Geral/total quem calcula é o motor** (`incluir_geral`): soma contagens, recalcula taxas
   ponderadas — a IA nunca soma/recalcula agregado (fonte de "113%" e de "+313 vs +279").
3. **Toda quebra relevante = uma dimensão/recorte do deep mode** (não "não dá"); cruzamento
   2D no tempo via `cruzar_dia`.
4. **Só ERRO reprova** no gate; preferência de forma é sugestão (passada de polimento).
5. **Disponibilidade variável explícita** (ex.: sem pageviews → omite hook/hold/connect; conv.
   de página vira leads/clicks) — refletida no catálogo, não inventada.
6. **Contrafactual/atribuição é trabalho do MOTOR, não da IA na mão.** Impacto na receita por
   etapa do funil (`impacto_receita`), atribuição de custo (`decomposicao`), onde a piora se
   concentra (`onde_concentra`) e variação vs histórico (`variacao_hist`) entregam R$/contribuição
   AUDITÁVEIS (log-decomposição, soma fecha com o Δ total) — a IA reporta e argumenta, nunca
   calcula o "e se" na mão.
7. **Check de cobertura por tipo:** varrer TODAS as colunas do dump e mapear o que vira
   dimensão/métrica no deep — o que ficar de fora é decisão explícita (niche/vazio), não
   esquecimento.

## Pendências (quando houver crédito)
- Rodar os 6 deepens 1 a 1 e revisar a SAÍDA (usa a IA) — única parte bloqueada por crédito.
- Avaliar função `decomposicao` (CPMQL = CPL ÷ taxa_qual; CPL ← CPM/CTR) p/ atribuição — só
  vale confirmar se a IA tropeça nisso ao rodar; os dados já estão em `acom_daily`.
