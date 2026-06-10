# Widgets e 3 camadas — conversao-perfil

Schema JSON aceito pelo app, focado nos widgets que **esta** skill usa. Fonte de
verdade: `app/src/shared/types.ts` (não ler o código do app — este doc espelha o
contrato). Para os tipos base (kpi/chart/table/heatmap/find-block/find-note/…),
ver também `ltv-analysis/BLOCKS.md`; aqui documentamos o modelo + o que o redesign
de conversão acrescenta.

---

## Modelo de 3 camadas

| Camada | Arquivo(s) | Quem escreve | Conteúdo |
|---|---|---|---|
| 1 — dataset | `dataset.json` | Python | tabelas long-format `{dims, filters, rows}` (só números) |
| 2 — view | `s01.json`…`s11.json` | LLM | lista plana de widgets; numéricos via `bind` |
| 3 — layout | `layout.json` | LLM | coords no grid de 12 col por widget, por seção |
| nav | `data.json` | LLM | `meta` (cliente/título/tema/filtros) + `pages` → `sections` |

**Regra de ouro:** o LLM nunca transcreve números na view. `bind` aponta para uma
tabela; o app resolve contra o dataset e os filtros ativos.

### `dataset.json` (long-format)
```json
{ "crit_renda_grp": {
    "dims": ["grupo"], "filters": ["canal"],
    "rows": [ {"canal":"Geral","grupo":">R$15k","diff_lcto":106.5,"conv_lcto":15.8,"conv_12m":19.1,"uplift":27.0} ] } }
```
`filters` lista as colunas fatiáveis (cada uma precisa de um `FilterDef` em `data.json`).

### `bind`
`{ "dataset", "x", "y", "series?", "agg?": sum|avg|min|max|count, "name?" }`.
Heatmap/tabela com `bind` resolvem `rows`; chart resolve `categories`+`series`.

---

## Widgets do redesign de conversão

### `eyebrow` — cabeçalho de zona
```json
{ "id":"renda-eb1", "type":"eyebrow", "n":"1", "color":"purple",
  "title":"RANKING DOS GRUPOS", "caption":"ordenado por variação vs. benchmark (60d)" }
```
`n` = número/índice ou glifo (`"✓"`,`"↗"`,`"!"`,`"%"`,`"⇄"`,`"⚖"`). `color`:
`purple` (padrão) · `green` · `amber` · `red`. Layout: `w:12, h:1`.

### `kpi-strip` — linha de métricas (1 widget, N itens)
```json
{ "id":"renda-kpi", "type":"kpi-strip", "items":[
  {"value":"+106,5%","label":"Melhor grupo · >R$15k"},
  {"value":"−82,0%","label":"Pior grupo · <R$1,5k"},
  {"value":"7,69%","label":"Conversão benchmark 60d","small":true} ] }
```
Texto pronto (não tem `bind`). Layout: `w:12, h:2`.

### `rank-card` — ranking de grupos (bound)
```json
{ "id":"renda-rank", "type":"rank-card", "title":"Ranking de Grupos · …",
  "bind":{"dataset":"crit_renda_rank"} }
```
A tabela `*_rank` precisa das colunas `grupo`, `pos`, `diff_lcto`, `diff_12m`,
`rep`, `wins`, `n`, `classe` (`cons|pos|var|neg|crit`). Layout: `w:12, h:4`.

### `heatmap-toggle` — consistência por lançamento (N abas)
```json
{ "id":"renda-hmtoggle", "type":"heatmap-toggle", "tabs":[
  {"label":"Variação vs. bench","sub":"diff % por lançamento","bind":{"dataset":"crit_renda_diff"}},
  {"label":"Conv. 60d","sub":"conversão real 60d","bind":{"dataset":"crit_renda_conv"}},
  {"label":"Uplift 12m","sub":"ganho 12m vs 60d","bind":{"dataset":"crit_renda_uplift"}} ] }
```
Cada tabela bound é long-format com `grupo` (linhas) × `lancamento` (colunas),
`valor` (texto) e `cls` (classe de cor). Layout: `w:12, h:6`.

### `chart-toggle` — proporção da base (N abas de chart)
```json
{ "id":"renda-reptoggle", "type":"chart-toggle", "title":"Proporção de leads por lançamento",
  "sub":"…", "tabs":[
   {"label":"Por grupo","sub":"…","chart":{"chartType":"stacked","stackType":"100%","height":320,"pct":true,"colors":[…],"options":{…},"bind":{"dataset":"crit_renda_rep","x":"lancamento","series":"grupo","y":"valor","agg":"sum"}}},
   {"label":"Por classificação","sub":"…","chart":{"chartType":"stacked","stackType":"100%","height":320,"pct":true,"colors":[…],"options":{…},"bind":{"dataset":"crit_renda_repclass","x":"lancamento","series":"classe","y":"valor","agg":"sum"}}} ] }
```
Cada `tab.chart` é um `chart` (sem `type`/`id`). Layout: `w:12, h:6`.

### `chart` — opções específicas de conversão
| Opção | Efeito |
|---|---|
| `chartType:"bar-horizontal"` | barras horizontais (ranking / conversão por grupo) |
| `diverging:true` | colore por sinal (verde ≥0 / vermelho <0) — diff vs. benchmark |
| `pct:true` | eixo de valor e rótulos como `%` |
| `axisMin`/`axisMax` | limites fixos do eixo de valor → **escala compartilhada** entre charts |
| `meanLine:true` | linha tracejada na média dos valores, rótulo `média X%` |
| `showLabels:true` | rótulo de dado em cada barra |
| `colors:[…]` | paleta (diff usa verde/vermelho automático; conv usa `["#7C3AED"]`) |

Diff (Panorama, cross-cuts): `bar-horizontal` + `diverging` + `axisMin/axisMax`
(escala compartilhada, ex.: ±120). Conversão/uplift por grupo: `bar-horizontal` +
`pct` + `meanLine`. Evolução: `line` + `pct` + `series:"grupo"`.

### `table` — colorScale + defs
```json
{ "id":"pan-comp", "type":"table", "title":"Comparativo por Critério",
  "cols":["Critério","Melhor grupo","Diff melhor","Pior grupo","Diff pior","Positivos","Uplift méd."],
  "colorScale":{"Diff melhor":"diff","Diff pior":"diff","Uplift méd.":"uplift"},
  "defs":{"Conv. 60d":"…"}, "bind":{"dataset":"panorama_comp"} }
```
`colorScale` colore células de uma coluna pela escala `"diff"`, `"uplift"`, `"amp"`
(amplitude/relevância: ≥30→`cup` · ≥12→`cup3` · resto `cn0`) ou `"surv"`
(independência: ≥50%→`cp` verde · senão `cn` vermelho). Funciona com tabela inline
ou **bound** (o app calcula o `cls` a partir do valor, então a coloração sobrevive
ao filtro de canal).
`defs` adiciona um ⓘ por cabeçalho com a definição (substitui o glossário).
Células bound podem ser `{value, cls}` (cor já calculada pelo Python).

### `find-block` — achado (formato card)
```json
{ "id":"ins-0-0", "type":"find-block", "card":true, "tag":"Oportunidade",
  "tagColor":"g", "title":"…", "detail":"… <strong>+106,5%</strong> …" }
```
`card:true` = formato card (barra de acento à esquerda). `tagColor`:
`g`·`a`·`r`·`p`·`n`. Insights e Detalhamentos usam sempre `card:true`.

### `mdef-block` / `find-note`
`mdef-block` = bloco de definições (`title` + `bullets[]`). `find-note` = nota
metodológica (`text`, HTML inline). Layout: `h:1`.

---

## Classes de cor das células (heatmap / table colorScale)

Diff: `csp` (≥70) · `cp2` (≥25) · `cp` (≥8) · `cn0` (±8) · `cn` (>−28) · `csn`
(>−60) · `cxn` (resto). Uplift: `cup` (≥80) · `cup2` (≥50) · `cup3` (≥25) · `cup4`
(>0) · `cn0` (≤0). Tendência: `tr-gg`·`tr-rg`·`tr-gr`·`tr-rr`. O Python emite o
`cls` por valor (`conv_calc.diff_class`/`uplift_class`).

---

## `layout.json` e `data.json`

`layout.json`: `{ "sections": { "s01": [ {id,x,y,w,h}, … ] } }`. Sem sobreposição;
`x+w ≤ 12`; o próximo na vertical começa em `y+h`. Alturas típicas: `kpi-strip` 2 ·
`eyebrow` 1 · `rank-card` 4 · `heatmap`/`chart`/`table` 4 · `heatmap-toggle`/`chart-toggle` 6 ·
`line` 5 · `find-block` 2–3 · `find-note` 1.

`data.json`: `meta` (com `filters` — o `FilterDef` do canal: `options:[Geral,Pago,Orgânico]`,
`default:"Geral"`; **não** declarar `allValue`, pois "Geral" é um canal real/combinado,
não um "sem filtro") + `pages` na ordem **Panorama → Insights → Detalhamentos →
[um por critério]**.

**Marcador de filtro (automático):** quando o filtro ativo é ≠ default (ex.: canal =
Pago), o app pinta um pequeno badge roxo (ícone de funil) no canto de cada tile cujo
dataset responde àquele filtro (`filters` inclui a coluna). Tiles sem bind (kpi-strip,
find-block de prosa, insights) ficam **sem** badge — sinalizando que mostram o número
geral/fixo, não a fatia filtrada. Nada a autorar: basta o dataset ter `filters:["canal"]`.

> Exemplo completo e válido das 4 camadas: `conversao-perfil/template.json`.
> Gerador que monta tudo isto: `conversao-perfil/build_report.py` (invocação de
> exemplo: `temp/inde/gen_inde.py`).
