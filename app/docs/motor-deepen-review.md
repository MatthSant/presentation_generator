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

## Boas práticas do motor (rascunho — vale p/ todos os tipos)

1. **Dado derivável e útil = pronto no catálogo** (bind direto), não só via `consultar`.
2. **Geral/total quem calcula é o motor** (`incluir_geral`): soma contagens, recalcula taxas
   ponderadas — a IA nunca soma/recalcula agregado (fonte de "113%" e de "+313 vs +279").
3. **Toda quebra relevante = uma dimensão/recorte do deep mode** (não "não dá"); cruzamento
   2D no tempo via `cruzar_dia`.
4. **Só ERRO reprova** no gate; preferência de forma é sugestão (passada de polimento).
5. **Disponibilidade variável explícita** (ex.: sem pageviews → omite hook/hold/connect; conv.
   de página vira leads/clicks) — refletida no catálogo, não inventada.

## Pendências (quando houver crédito)
- Rodar os 6 deepens 1 a 1 e revisar a SAÍDA (usa a IA) — única parte bloqueada por crédito.
- Avaliar função `decomposicao` (CPMQL = CPL ÷ taxa_qual; CPL ← CPM/CTR) p/ atribuição — só
  vale confirmar se a IA tropeça nisso ao rodar; os dados já estão em `acom_daily`.
