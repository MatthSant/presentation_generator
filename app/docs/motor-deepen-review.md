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
| ac-qualidade | qualidade caindo? por origem/criativo? | taxa_qual diária + por origem/temp no tempo | ✅ (origem/temp); ⚠️ criativo | `acom_daily.taxa_qual` + `cruzar_dia(taxa_qual, origem|temperatura)`. **Por CRIATIVO não existe** dimensão no deep mode (prompt diz "origem OU criativos" → origem supre). |
| ac-custo | CPL/CPMQL subindo? mídia vs qualif. | cpl/cpmql/cpm/taxa_qual diários | ✅ | `acom_daily` (cpl,cpmql,cpm,taxa_qual). CPMQL=CPL/taxa_qual decomponível pelos diários |
| ac-resposta | taxa de resposta suficiente? | taxa_resp nível+meta+tendência diária | ✅ | `acom_kpis.taxa_resp` (nível/meta) + tendência via `consultar(dia, taxa_resp)` → **agora também `acom_daily.taxa_resp` (bind direto)** |
| ac-pago-org | concentração pago×orgânico | leads por origem (+ métricas) | ✅ | `acom_origem` (catálogo) / `tabela(origem, incluir_geral)` |

Conclusão: **todas as 6 têm as ferramentas**. Lacunas: (a) conveniência — taxas diárias
fora do `acom_daily`; (b) cruzamento por **criativo** não existe no deep mode (gap real,
porém o prompt da pergunta de qualidade aceita origem como alternativa).

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
- Rodar os 6 deepens 1 a 1 e revisar a SAÍDA (usa a IA).
- Avaliar dimensão **criativo** no deep mode (pergunta de qualidade).
- Avaliar função `decomposicao` (CPMQL = CPL ÷ taxa_qual; CPL ← CPM/CTR) p/ atribuição.
