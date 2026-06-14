---
name: verificar-motor
description: "Verifica e melhora o MOTOR de aprofundamento (deep mode) de um tipo de análise do app — não roda a análise, audita o motor. Cobre: cobertura de dimensões/métricas do dump no deep mode (query_api), as funções de consulta vs as perguntas norteadoras, verificação SEM crédito de API rodando query_api.py contra a .base real, princípios de decomposição (só fatores medíveis; receita × custo; taxa nunca soma), auditoria das regras de relevância do banco de perguntas, e simulação das perguntas via subagente (Agent, billing separado da API). Sempre prefere ajustar o MOTOR (Python determinístico) a mexer no prompt. Registra tudo em app/docs/motor-deepen-review.md. Use quando o usuário pedir para 'verificar/revisar/auditar o motor', 'ver se a IA tem as ferramentas', 'revisar as perguntas de aprofundamento/relevância', 'rodar as perguntas de um tipo', ou /verificar-motor."
user-invocable: true
---

# verificar-motor

Audita o **motor de deep mode** (aprofundamento/detalhamento) de um tipo de análise e
deixa um registro acionável. Princípio-mestre: **é sempre mais preciso ajustar o MOTOR**
(o Python determinístico: `calc.py` + `query_api.py` + banco de perguntas) **do que o
system-prompt** — número só via motor; o LLM escreve prosa.

Pré-requisito mental: leia `app/CLAUDE.md` (modelo de 3 camadas, pipeline do tipo) e o
acumulado em `app/docs/motor-deepen-review.md` (changelog + boas práticas — este é o
**entregável vivo**; toda mudança entra aqui).

Entradas: o `<tipo>` (ex.: `acompanhamento-lancamento`, `debriefing-lancamento`) e uma
`.base` real com dump+config (ver Fase 0).

---

## Fase 0 — Localizar a base real (sem crédito)

A verificação roda **sem gastar crédito de API**: usa o `query_api.py` direto no CLI
contra um dump real. Ache a base retida:

```
app/.base/<cliente>/<analise>/{config.json, dump.csv[, dict.csv, goals.csv]}
output/<cliente>/<analise>/dataset.json     ← p/ rodar o banco de perguntas
```

Se não houver `.base` do tipo, procure fixtures em `backup/**/dump.csv` ou peça ao usuário
gerar uma análise do tipo. Confirme o caminho antes de seguir.

---

## Fase 1 — Cobertura de dimensões e métricas (o que o dump tem × o que a IA vê)

Varra **todas as colunas do dump** e mapeie cada uma para: vira dimensão? métrica? fica de
fora? O que ficar de fora deve ser **decisão explícita** (niche/vazio/nível-relatório), não
esquecimento.

```bash
cd app/pysrc
PYTHONPATH=. py -3 -c "import csv; r=list(csv.DictReader(open('<dump>',encoding='utf-8-sig'))); \
print(len(r),'linhas'); [print(c, sum(1 for x in r if (str(x.get(c) or '')).strip() not in ('','0','0.0'))) for c in r[0]]"
```

Regras:
- **Dimensão** = aquilo por que as métricas são QUEBRADAS em linhas (canal, temperatura,
  criativo=`field_ad_name`, público=`field_adset_name`, campanha, escopo, dia/semana).
  Orgânico tem `field_*` vazios → use **coalesce** com a UTM (`field_ad_name ← utm_content`,
  `field_campaign_name ← utm_campaign`) para o orgânico aparecer nomeado.
- **Métrica** = o que vem como NÚMERO por linha (leads, vendas, fat, invest, mqls…). Atenção:
  `lead novo/antigo`, hotleads etc. são **métricas**, não dimensões (vêm como coluna, não
  como agrupamento) — princípio que o usuário reforçou.
- Colunas vazias na base atual = client-specific; documente, não force.
- Confira no `calc.py` se a dimensão/métrica está de fato no `frame_rows`/`_derive` e exposta
  em `FRAME_METRICS`/`LABELS`; no `typeRegistry.ts` (`buildDeepenMeta`) se está no enum de
  `dimensao` e em `genericParams`.

Saída: tabela coluna→(dimensão/métrica/fora) no MD. Adicione ao motor o que faltar e for
decisório; documente o que ficar de fora.

---

## Fase 2 — Funções de consulta × perguntas norteadoras

Liste as funções que o tipo expõe (genéricas de `common/query_core.py` +
específicas no `query_api.py` do tipo) e cruze com as **perguntas norteadoras**
(`app/pysrc/perguntas/banks/<tipo>.py`): cada pergunta de decisão tem ferramenta
determinística que a responde?

Ferramentas-padrão a esperar (adapte ao tipo):
- genéricas: `tabela`, `ranking`, `series`, `series_long`, `correlacao`, `trend`, `variacao`.
- atribuição/decomposição: `decomposicao` (CUSTO: CPL←CPM/CTR/…, CPMQL←CPL/qualif),
  `onde_concentra` (drill criativo→publico→campanha→canal→temperatura; reporta pausados/novos),
  `impacto_receita` (RECEITA: Volume×Conversão×Ticket), `variacao_hist` (vs lançamento anterior),
  `cruzar_dia` (métrica por dia×dimensão).

Princípios que o motor deve respeitar (checklist de armadilhas reais já encontradas):
- **Só decomponha por fatores que o dado MEDE.** Inserir etapa não-identificada (ex.: conversão
  de MQL × não-MQL, ausente no dado) cria atribuição ESPÚRIA. Separe **receita**
  (volume/conversão/ticket) de **custo** (CPL/CPMQL/qualif).
- **Taxa/ROAS/CUSTO nunca se soma** entre grupos — total via `incluir_geral=sim` (Geral
  ponderado: soma contagens, recalcula taxa num÷den). % de composição e contagens podem somar.
- **Métrica secundária = deepen, não pergunta nova** (#22): "por que o CPL subiu" é detalhamento
  via `decomposicao`/`onde_concentra`, não vira uma pergunta norteadora de CPM/CTR.
- **Item sem dado recente = desligado**, não "piorou pra zero" (pausados em `onde_concentra`).
- **Disponibilidade variável explícita**: sem pageviews → connect/hook omitidos, conv_pág vira
  leads/clicks — refletido no motor, não inventado.
- **Adaptar a janela ao tipo**: séries no tempo podem precisar podar cauda pós-lançamento
  (`so_midia`), ou comparar janela início×fim vs meta vs histórico.

---

## Fase 3 — Verificação sem crédito (rodar o motor de verdade)

Rode o `query_api.py` contra a base e CONFIRME os números (não confie na leitura do código):

```bash
cd app/pysrc
CFG="../.base/<cliente>/<analise>/config.json"; DUMP="../.base/<cliente>/<analise>/dump.csv"
PYTHONPATH=. py -3 <tipo>/query_api.py "$CFG" "$DUMP" <fn> '<args.json>'
# ex.: tabela '{"dimensao":"temperatura"}' ; decomposicao '{"metrica":"cpmql"}'
#      onde_concentra '{"metrica":"cpl"}' ; impacto_receita '{"base":"meta"}'
```

Checagens obrigatórias:
- **somas fecham**: numa decomposição/ponte, os R$ de cada fator somam o Δ total.
- **sinais corretos**: custo Δ%+ = piora; receita Δ%+ = melhora.
- **`null` onde não há base** (ROAS/CPL no orgânico sem verba) — não força número.
- **UTF-8 no stdout**: `query_api.main()` deve ter `sys.stdout.reconfigure(encoding='utf-8')`
  (console Windows cp1252 quebra em →/×/acentos).
- Métricas inválidas / sem dado → `nao_disponivel` com motivo claro, nunca crash.

---

## Fase 4 — Auditar as regras de relevância do banco de perguntas

Rode `evaluate_all` no `dataset.json` real e leia cada relevância/justificativa
criticamente:

```bash
cd app && PYTHONPATH=pysrc py -3 -c "import json,sys; sys.path.insert(0,'pysrc/perguntas/banks'); \
import <tipo_modulo> as B; ds=json.load(open('../output/<cliente>/<analise>/dataset.json',encoding='utf-8')); \
[print(round(q['relevancia'],1), q['nivel'], q['id'], '|', q['justificativa']) for q in B.evaluate_all(ds)]"
```

Armadilhas de relevância já encontradas (procure por elas):
- **Sinal de custo:** se o `dev` guardado é BRUTO (`(val-meta)/meta`), `min(dev)`/`max(dev)`
  está invertido para custos (CPL acima da meta = `dev>0` = pior). Normalize por direção
  (`gap = dev` p/ custo, `-dev` p/ normal; pegue o MAIOR gap). Ex. real: `q_pior_kpi` pegava
  `taxa_qual −22%` e ignorava `CPMQL +28%` (o pior).
- **OR cego:** "saturação" não pode disparar só por custo↑ se o volume está SUBINDO (= escala,
  não saturação). Exija a condição conjunta.
- **`na` correto:** dado necessário ausente (sem histórico/meta) → `{'na': True}` p/ a pergunta
  ser descartada, não pontuar com número inventado.
- **Refs do `_nz`:** sinais fortes saturam em 100 (ok, é desejado); confira que o ref reflete
  "quando isso vira relevante de fato".
- **Direção do `_dev(invert=)`:** custos com `invert=True` (a forma robusta — direção já
  normalizada na origem; preferível a tratar sinal depois).

Conserte os bugs no banco e re-rode.

---

## Fase 5 — Simulação via Agent (sem crédito de API)

Com a API sem crédito (ou para revisar prompt+motor de ponta a ponta), simule as perguntas
com **subagentes** (ferramenta Agent — billing separado da API). Cada agente assume o papel
da IA de detalhamento, investiga via `query_api` CLI + lê o `dataset.json`, escreve um
detalhamento curto (2-3 find-blocks + 1 gráfico) e devolve um **relatório de validação**:
(a) funções/args usadas; (b) o motor respondeu bem / faltou ferramenta?; (c) a pergunta /
relevância faz sentido?; (d) foi tentado a violar regra (somar taxa, inventar meta/histórico,
decompor por fator não-medível) e o que o motor deu no lugar.

Boas práticas da simulação:
- 1 agente por cluster de perguntas (3-4), em paralelo (várias chamadas Agent numa mensagem).
- dê ao agente: papel, regras de domínio (do `focus` em `claude.ts`), o CLI exato com os
  caminhos da base, e o formato do relatório.
- a simulação **expõe furos que a leitura do código não pega** (ex.: descoberta de ferramenta,
  rótulo enganoso, atribuição espúria) — trate cada achado e re-simule se mexeu no motor.

⚠️ Aproxima, mas não é idêntico ao deepen real (sem o loop de gate/critic/layout). Serve para
validar que o motor + instruções BASTAM; a saída real só com crédito.

---

## Fase 6 — Registrar no MD e commitar

Atualize `app/docs/motor-deepen-review.md`: cobertura, mudanças do motor (changelog),
resultados das simulações, bugs de relevância corrigidos, e as **boas práticas** (vale para
todos os tipos — este doc vira o requirements do motor). Depois:

- `cd app && npm run build` (se mexeu em `typeRegistry.ts`/`claude.ts`) — TS limpo.
- `py -3 -m py_compile` nos arquivos Python tocados.
- commit + push (mensagem termina com o Co-Authored-By do projeto).

Lembrete do projeto: **testar de verdade antes de commitar** (rodar o motor/UI, não só ler o
código). A parte bloqueada por crédito (rodar os deepens reais e revisar a SAÍDA da IA) fica
como pendência explícita no MD.

---

## Checklist rápido

- [ ] base real localizada (Fase 0)
- [ ] toda coluna do dump mapeada; faltantes adicionados ou justificados (Fase 1)
- [ ] cada pergunta de decisão tem ferramenta determinística (Fase 2)
- [ ] decomposições só com fatores medíveis; receita × custo separados (Fase 2)
- [ ] query_api rodado: somas fecham, sinais certos, null correto, UTF-8 (Fase 3)
- [ ] regras de relevância auditadas; bugs de sinal/OR/na corrigidos (Fase 4)
- [ ] perguntas simuladas via Agent; achados tratados (Fase 5)
- [ ] MD atualizado + build/compile limpos + commit (Fase 6)
