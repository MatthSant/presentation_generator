# Regras de cálculo e qualidade — conversao-perfil

**Ler integralmente antes da Fase 5.** Todas as fórmulas já estão implementadas em
`conv_calc.py`; este documento explica o *porquê* e os erros a evitar. As regras de
cálculo são herdadas da skill original; as de 3 camadas e de design vêm do app atual.

---

## 1. Benchmark = respondentes da pesquisa (a regra mais importante)

> O benchmark de um critério é a taxa de conversão dos **respondentes daquele
> critério** (linhas onde a coluna da dimensão é **não-nula**), nunca o total de
> leads do lançamento.

Leads que respondem pesquisa convertem 2–5× acima da média geral (engajamento).
Comparar grupos de respondentes contra o total de leads infla artificialmente os
positivos. E o recorte é **por critério**: para critérios de cobertura ~100%
(ex.: renda) coincide com o total de respondentes; para os de cobertura menor
(ex.: gênero) o benchmark é só de quem respondeu aquela pergunta — isolando o
efeito dentro do pool correto. `conv_calc.agg_criterio` usa `r[crit_col]` não-nulo.

A linha **bench total leads** (dimensões todas vazias) entra apenas como contexto
secundário nas tabelas/heatmaps de conversão.

---

## 2. Unidade: conversões já em % — nunca ×100

`conv_lcto`, `conv_12m`, `bench_*` e seus agregados saem de `conv_calc` **já em
percentual** (ex.: `1.07` = 1,07%). Nunca multiplicar por 100 na view. A tendência
(`Tend. Abs./Rel.`) é diferença direta em **pp**, também sem ×100.

Fórmulas (todas em `conv_calc`):
```
conv_lcto  = vendas_lancamento / total_leads × 100   (do grupo)
conv_12m   = vendas_12meses   / total_leads × 100
bench_lcto = Σ vendas_lancamento / Σ total_leads      (respondentes do critério/canal)
diff_lcto  = (conv_lcto − bench_lcto) / bench_lcto × 100
uplift_12m = (conv_12m − conv_lcto) / conv_lcto × 100
rep        = leads_grupo / leads_respondentes_do_critério × 100
```

---

## 3. Três canais, sempre

Geral / Pago / Orgânico calculados separadamente (`agg_criterio` por canal). Cada
tabela do `dataset.json` leva `filters:["canal"]`, e `data.json → meta.filters`
declara o `FilterDef` do canal (`default/allValue = "Geral"`). O toggle refiltra
heatmaps, charts e tabelas em tempo real.

## 4. Lançamentos em ordem cronológica

`conv_calc.ordered_lancamentos` extrai (ano, mês) do nome do lançamento. Nunca
ordenar alfabeticamente. Os rótulos de eixo usam o formato curto `mmm/aa`.

## 5. Normalizar grupos duplicados antes de agregar

Mesmas categorias aparecem com formatação divergente (espaços, "1 milhão" vs
"1.000.000", sufixos de texto). Antes de agregar, definir a lista canônica
(`order`) e os aliases por critério; `conv_calc.make_canon` aplica alias → match
exato → match por prefixo. Valores não casados viram grupo próprio — **reportar
como anomalia** e pedir o alias ao usuário.

## 5b. Ordem de exibição das categorias

**Gráficos, heatmaps e tabelas exibem os grupos na ordem definida no config
`order`** — para TODO critério, não por diff. Senão faixas como "idade" saem
30-34, 35-39, 25-29… fora de ordem. Por isso o `order` de cada critério deve ser
definido na **sequência natural** das categorias:
- faixas ordinais (idade, renda, patrimônio, tempo): ascendente, com "Prefiro não
  informar"/desconhecido por último (`ordinal: true` no config sinaliza isso);
- nominais (gênero, perfil, RV, assessor): a ordem que fizer sentido para a leitura.

`build_report.display_groups` usa o `order` em gráficos, heatmaps, tabela de
detalhe e proporção. O **rank-card é a única exceção: sempre por diff** (é um
ranking). Grupos presentes fora do `order` caem no final.

## 6. Trend = LAST2 vs PREV2

`Tend. Abs.` = média de `conv_lcto` dos 2 lançamentos mais recentes − média dos 2
anteriores (Δpp). `Tend. Rel.` desconta a variação do próprio benchmark no período.
Leitura combinada (prioriza a relativa, neutra em ±0,05pp):
`Acelerando` (tr-gg) · `Ganhando terreno` (tr-rg) · `Perdendo espaço` (tr-gr) ·
`Deteriorando` (tr-rr).

## 7. Classificação por wins/N

`cons` 100% · `pos` ≥70% · `var` ≥40% · `neg` ≥10% · `crit` 0% (de lançamentos com
diff > 0). Define a cor do `rank-card` e a série "Por classificação" da proporção.

## 8. Escalas de cor (idênticas ao design system)

Diff (7 faixas): `csp` ≥70 · `cp2` ≥25 · `cp` ≥8 · `cn0` ±8 · `cn` >−28 · `csn`
>−60 · `cxn` resto. Uplift (4+neutro): `cup` ≥80 · `cup2` ≥50 · `cup3` ≥25 ·
`cup4` >0 · `cn0` ≤0. O Python emite o `cls` por valor (`diff_class`/`uplift_class`).

## 9. Alertas de amostra

`rep` < 3% → marcar "amostra pequena". 0 wins + rep alta → "sangria da base" (alto
volume, baixo retorno). Grupo que muda de classe entre canais → insight de canal.

---

## Regras do modelo de 3 camadas

10. **Regra de ouro:** o LLM **nunca** transcreve números no `sXX.json`. Números só
    na Camada 1 (`dataset.json`, emitida pelo Python); a view referencia via `bind`.
11. **Python só emite números** (terminal + `dataset.json`). Não há geração de
    HTML/JS — o app renderiza. (Substitui as antigas regras anti-`f-string`/anti-`onclick`.)
12. **Uma passada limpa** — gerar a estrutura final direto (via `build_report.py`),
    sem cadeias de pós-processadores.
13. **Layout sem sobreposição.** `h` realista: `kpi-strip` 2 · `eyebrow` 1 ·
    `rank-card` 4 · `heatmap`/`chart`/`chart-toggle`/`table` 4–6 · `find-block` 2–3 ·
    `find-note` 1. O próximo na vertical começa em `y + h` do anterior.
14. **Insights e Detalhamentos sempre presentes**, logo após o Panorama.

---

## Regras de design (fidelidade ao app atual)

15. **Diff sempre `bar-horizontal diverging`** (Panorama e cross-cuts de
    Detalhamentos) com **escala compartilhada** (`axisMin/axisMax`, ex.: ±120) para
    comparabilidade entre critérios.
16. **conv60/conv12/uplift por critério** = `bar-horizontal` com `pct` e `meanLine`
    (linha da média). Cor única roxa (`#7C3AED`).
17. **Consistência por lançamento** num único `heatmap-toggle` (abas Variação /
    Conv 60d / Uplift), não vários heatmaps soltos.
18. **Proporção da base** num `chart-toggle` (Por grupo / Por classificação) —
    100% stacked; a aba "Por classificação" usa as cores das classes.
19. **Insights** = 3 zonas com `eyebrow` colorido (✓ verde / ↗ âmbar / ! vermelho) e
    `find-block` no formato **card** (`card: true`).

---

## Relevância × codependência (o que priorizar)

Codependência **sozinha não prioriza**: um fator pode ser independente mas mexer
pouco na conversão (±10% não muda o jogo). Cruzam-se sempre **duas** dimensões:

- **Relevância / amplitude** (`conv_calc.relevancia`): desvio médio absoluto do diff
  vs. benchmark entre os grupos, **ponderado pela representatividade** (em % vs.
  benchmark). Mede o quanto o fator de fato move a conversão considerando o tamanho
  dos grupos. Faixas usadas: alta ≥ 30% · média ≥ 12% · baixa < 12%.
- **Independência** (`conv_calc.codependencia`):
  - **Associação** (Cramér's V) entre cada par de critérios sobre a distribuição de
    leads → matriz/heatmap. Alta associação = carregam sinal parecido.
  - **Lift controlado** (`controlled_survival`): quanto do poder de discriminação
    sobrevive ao estratificar pelo fator mais associado. ~1 = sinal próprio; baixo =
    explicado por outro. Limiar: survival ≥ 0,5 → qualificador; < 0,5 → qualificante.

**Veredito combinado:**
- alta/média amplitude **+** qualificador → **priorizar** (move a conversão e por
  conta própria);
- alta/média amplitude **+** qualificante → **relevante, porém proxy** de X (priorize
  X, não o fator);
- baixa amplitude → **baixo impacto** (independente ou não, não muda o resultado).

**Apresentar como indício, não prova:** associação ≠ causalidade; amplitude e lift
controlado são heurísticas sobre a distribuição de leads para priorização —
confirmar no nível do lead quando possível.

**Filtrável por canal:** a zona é calculada nos 3 canais e emitida como datasets
long-format (`cod_assoc`, `cod_fatores`, ambos com `filters:["canal"]`), então
heatmap e tabela reagem ao filtro. Como find-block (prosa) não troca por filtro, o
veredito vai na coluna **Papel** da tabela (recalculada por canal), não em cards.

---

## Checklist antes de entregar

- [ ] Benchmark = respondentes do critério (não total de leads)
- [ ] Conversões em % sem ×100; tendência em pp direto
- [ ] 3 canais calculados; `meta.filters` com o canal
- [ ] Lançamentos cronológicos
- [ ] Grupos duplicados normalizados (aliases); anomalias reportadas
- [ ] Nenhum número transcrito no `sXX.json` (tudo via `bind`)
- [ ] Diff horizontal+diverging com escala compartilhada; conv/uplift com `meanLine`
- [ ] heatmap-toggle (consistência) + chart-toggle (proporção) por critério
- [ ] Insights (3 zonas, cards) + Detalhamentos (cross-cuts + codependência)
- [ ] `npx tsx scripts/validate.ts [cliente]/[slug]` sem erros
- [ ] Achados apresentados no chat por critério
