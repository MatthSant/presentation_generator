---
name: conversao-perfil
description: "Análise de conversão por perfil ao longo de vários lançamentos, a partir de um dump multidimensional de pesquisa (leads × vendas por critério). Percorre 5 fases: localizar e confirmar o dump → contexto do cliente → perguntas norteadoras → setup + exploração → dicionário, plano e execução seção a seção. Gera um relatório no app (modelo de 3 camadas) com Panorama, uma página por critério, Insights e Detalhamentos (com análise de codependência entre fatores). Use quando o usuário invocar /conversao-perfil ou pedir para analisar conversão de lançamentos por perfil/critério (renda, idade, patrimônio, perfil de decisão, custom_fields…), consistência por lançamento, heatmap de grupos ou ranking de segmentos."
user-invocable: true
---

# conversao-perfil

Pipeline que transforma um **dump multidimensional de pesquisa de lançamentos**
(uma linha por combinação de dimensões × lançamento × canal) numa análise
completa de conversão por perfil — servida pelo app em `/report/[cliente]/[slug]`.

Espelha a skill `ltv-analysis`: o **Python calcula** (eficiência de token), o app
renderiza o modelo de 3 camadas, e o LLM **nunca transcreve números** na view.

## Referências da skill (ler antes da Fase 5)

- **Motor de cálculo:** `conversao-perfil/conv_calc.py` — agrega o dump e calcula tudo.
- **Regras de cálculo + qualidade:** `conversao-perfil/calc-rules.md` ← **LER ANTES da Fase 5**.
- **Schema das 3 camadas + widgets:** `conversao-perfil/BLOCKS.md` ← **LER ANTES da Fase 5**.
- **Schema dos campos fixos do dump:** `conversao-perfil/dictionary.md`.
- **Exemplo válido das 4 camadas:** `conversao-perfil/template.json`.
- **Guias por página:** `conversao-perfil/sections/{PANORAMA,CRITERIO,INSIGHTS,DETALHAMENTOS}.md`.
- **Gerador genérico:** `conversao-perfil/build_report.py` — `build(csv_path, config, content, out_dir)` monta as 4 camadas numa passada. **É o motor de montagem das páginas.**
- **Exemplo de invocação (INDÊ):** `temp/inde/gen_inde.py` (passa `inde_config.json` + `inde_content.json` ao `build_report`).
- **App:** `app/` (TypeScript, porta 3131). Validar com `npx tsx scripts/validate.ts [cliente]/[slug]`.

---

## Visão geral das fases

```
Fase 0  → localizar o dump em input/[cliente]/ e confirmar
Fase 1  → nome do cliente e contexto do negócio → [CLIENTE]/[SLUG]
Fase 2  → perguntas norteadoras
Fase 3  → criar pastas + explorar o dump (conv_calc.load_dump)
Fase 4  → mapear custom_fields (dicionário) + escolher critérios + plano → APROVAÇÃO
Fase 5  → execução: dataset (Python) → sXX.json (widgets) → layout → validar
```

---

## Fase 0 — Localizar o dump

1. `Glob("input/**/*.csv")`.
2. Um arquivo: confirmar com `AskUserQuestion` ("Encontrei `[nome].csv`. Uso este?").
3. Vários: listar e perguntar qual.
4. Nenhum: pedir para colocar em `input/[cliente]/` e reexecutar.

Ler as 5 primeiras linhas com `Read` para conferir separador/encoding. Registrar **[CSV_PATH]**.

**Formato esperado** (ver `dictionary.md`): colunas fixas `field_conversion`
(lançamento), `tipo_trafego` (canal), `total_leads`, `vendas_lancamento`,
`vendas_12meses` (e opcional `vendas_6meses`); demais colunas = **dimensões**
(critérios). Linhas com todas as dimensões vazias = benchmark total do lançamento;
linhas com dimensões preenchidas = respondentes da pesquisa.

---

## Fase 1 — Contexto do negócio

`AskUserQuestion` com duas perguntas:
- **Nome do cliente/projeto** (texto livre) → **[NOME_CLIENTE]**.
- **Contexto** (texto livre): o que vendem, modelo de lançamento, quem são os leads → **[CONTEXTO]**.

Derivar **[CLIENTE]** (kebab-case sem acento) e **[SLUG]** (ex.: `conversao-perfil`).
Relatório em `http://localhost:3131/report/[CLIENTE]/[SLUG]`.

---

## Fase 2 — Perguntas norteadoras

`AskUserQuestion` (texto livre): "Quais perguntas você quer responder? Elas guiam
quais critérios priorizar e como ler os dados." → **[PERGUNTAS]**.

---

## Fase 3 — Setup + exploração

Criar `temp\[CLIENTE]\[SLUG]\` e `output\[CLIENTE]\[SLUG]\`.

Rodar exploração com `conv_calc` (script `temp\[CLIENTE]\[SLUG]\_explorar.py`):

```python
import sys; sys.path.insert(0, r'.claude\skills\conversao-perfil')
import conv_calc as cc, collections
rows = cc.load_dump(r'[CSV_PATH]')
dims = cc.dim_columns(rows)
lctos = cc.ordered_lancamentos(rows)                       # cronológico
print('lançamentos:', lctos); print('dimensões:', dims)
print('canais:', sorted(set(r[cc.COL_CANAL] for r in rows)))
resp = [r for r in rows if cc.is_respondent(r, dims)]
for d in dims:                                             # cobertura + valores
    vals = collections.Counter(r[d] for r in resp if r[d].strip())
    print(f'  {d}: {len(vals)} valores — cobertura {len(vals) and sum(vals.values())} resp')
    for v, n in vals.most_common(8): print(f'      {n:>6}  {v[:60]}')
```

Apresentar no chat: lançamentos detectados (ordem cronológica), canais, e para
cada dimensão o nº de valores + amostras (sinalizar duplicatas de formatação).

---

## Fase 4 — Dicionário + plano (parada de aprovação)

### 4a. Mapear cada dimensão / custom_field
`AskUserQuestion`: para cada coluna de dimensão (esp. `custom_field_N`), o que a
pergunta media e o rótulo curto desejado. Gravar `temp\[CLIENTE]\[SLUG]\dicionario.md`
(copiar de `conversao-perfil/dictionary.md` e preencher a seção de custom_fields).

### 4b. Normalização de grupos duplicados + ordem das categorias
Onde a exploração mostrar variantes do mesmo grupo (espaços, "1 milhão" vs
"1.000.000", sufixos), montar a lista canônica e o mapa de aliases — vão para o
`config` (`order` + `aliases`) consumido por `conv_calc.make_canon`. **Regra #5.**
Definir o `order` de cada critério na **sequência natural** (faixas ordinais
ascendentes; desconhecido por último) e marcar `ordinal: true` nos critérios de
faixa (idade, renda, patrimônio, tempo) — assim eles são exibidos em ordem, não
por diff. **Regra #5b.**

### 4c. Config da análise
Gravar `temp\[CLIENTE]\[SLUG]\config.json` (ver `gen_inde`/`inde_config.json`):
`client`, `title`, `slug`, `channels`, `window`/`long_window`, e por critério
`{id, col, label, tab, abbr?, order, ordinal?, short_labels, cores, aliases}`.

### 4d. Plano + aprovação
Gerar `plano_analise.md` (critérios escolhidos com cobertura/relevância; quais
viram página; estrutura Panorama → Insights → Detalhamentos → critérios).
`AskUserQuestion`: "Cobre suas perguntas? Priorizar/remover algo?" — **só seguir com aprovação.**

---

## Fase 5 — Execução

Modelo de 3 camadas (ver `BLOCKS.md`): números só no `dataset.json` (Python);
`sXX.json` só widgets com `bind`; `layout.json` posiciona. **Ler `calc-rules.md` antes.**

A montagem das 4 camadas já está pronta e é reutilizável em
`conversao-perfil/build_report.py`. O trabalho da Fase 5 é **preparar os dois
insumos** (`config` + `content`) e chamar o gerador:

```
① Montar config.json (Fase 4): por critério { id, col, label, tab, abbr?, order[], short_labels{}, cores[], aliases{} } + client/title/slug/channels/window/long_window
② Analisar os números (conv_calc.agg_criterio) e APRESENTAR no chat por critério
③ Escrever content.json: insights (3 zonas, cards autorais) + detalhamentos (cross-cut + cards) — a prosa que você concluiu dos números
④ Rodar:  py -3 .claude\skills\conversao-perfil\build_report.py config.json content.json [CSV_PATH] output\[CLIENTE]\[SLUG]
⑤ Validar:  npx tsx scripts/validate.ts [CLIENTE]/[SLUG]   (a partir de app/)
```

`build_report` cuida de: tabelas (rank/grp/diff/conv/evol/uplift/bench/detail/rep/
repclass) + panorama_comp; widgets finais do redesign + layout; Panorama, Insights,
Detalhamentos (incl. a **zona de codependência** via `conv_calc.codependencia`);
`data.json` na ordem Panorama → Insights → Detalhamentos → [um por critério].
Ver `temp/inde/gen_inde.py` como exemplo de invocação. Se quiser estrutura
diferente, edite `build_report.py` — é o molde de design compartilhado.

**Apresentar os achados no chat** ao longo da execução (números por critério,
padrões, anomalias) — não apenas salvar arquivos. As páginas Insights e
Detalhamentos são **autorais**: o LLM escreve a prosa dos `find-block` a partir
do que os números mostraram (não inventa números — referencia os já calculados).

> Não há montagem de HTML. Salvar um `sXX.json` recarrega a seção no browser via SSE.

---

## Regras de qualidade

Ler `calc-rules.md` integralmente antes da Fase 5. As mais críticas:

1. **Benchmark = respondentes da pesquisa daquele critério** (linhas onde a
   dimensão é não-nula), nunca o total de leads. `conv_calc` já faz isso.
2. **Conversões já em %** — nunca ×100 na view; tendência em pp = diferença direta.
3. **Três canais** (Geral/Pago/Orgânico) — tabelas com `filters:["canal"]` + `FilterDef`.
4. **Lançamentos cronológicos** (`conv_calc.ordered_lancamentos`), nunca alfabético.
5. **Normalizar grupos duplicados** antes de agregar (aliases por critério).
6. **LLM nunca transcreve número** no `sXX.json` — só `bind`.
7. **Uma passada limpa** — emitir a estrutura final direto; sem pós-processadores.
8. **Insights + Detalhamentos sempre presentes**, logo após o Panorama.
9. **Relevância × codependência**: cruzar **amplitude** (quanto o fator move a
   conversão, ponderado pela base — `conv_calc.relevancia`) com **independência**
   (lift controlado). Priorizar só o que é relevante **e** qualificador; baixa
   amplitude = baixo impacto mesmo se independente. Associação ≠ causalidade.

---

## Comportamento em erros

| Situação | Ação |
|---|---|
| Separador ≠ vírgula | `conv_calc.detect_sep` resolve (`;`/`\t`) |
| Dimensão com cobertura < 10% | listar como ignorada no dicionário; não criar página |
| Valor de grupo não casa com o canônico | `make_canon` devolve o valor cru → reportar como anomalia e pedir alias |
| Grupo com n/rep muito baixo | marcar "amostra pequena" na nota; cuidado ao concluir |
| Erro de Python | mostrar traceback, diagnosticar e corrigir antes de seguir |
