# Seção — Detalhamentos (s11)

Aprofundamentos que **cruzam critérios** — vão além da leitura isolada de cada
perfil. Montada a partir dos pontos levantados nos Insights + a análise de
codependência. Montada por `build_report.py` (bloco s11).

## Estrutura

### A. Cross-cut de um ponto dos Insights (ex.: "é proxy de riqueza?")
1. `find-block card` (hipótese, `tag:"Hipótese" tagColor:"p"`) — a pergunta que a
   análise levantou.
2. `eyebrow` "OS DOIS SINAIS · LADO A LADO" (`n:"⇄"`).
3. Dois `chart bar-horizontal diverging` lado a lado (`w:6`), **escala compartilhada**
   (`axisMin/axisMax:-110/110`), bind aos `crit_{a}_grp` / `crit_{b}_grp` (y=diff_lcto).
4. `eyebrow` "LEITURA" (`n:"!" color:amber`) + 3 `find-block card` (`w:4`):
   convergência (`g`) · ressalva (`a`) · próximo passo (`p`).

Escolher o(s) cross-cut(s) a partir dos achados "Aprofundar" dos Insights.

### B. Zona de relevância × codependência (gerada, **filtrável por canal**)
Cruza **quanto cada fator move a conversão** (relevância) com **se o sinal é próprio
ou proxy** (independência). Codependência sem relevância não prioriza. Calculada nos
**3 canais** e emitida como datasets long-format (`filters:["canal"]`) → reage ao
filtro de canal igual ao resto do relatório.

Datasets (de `conv_calc.codependencia` + `conv_calc.relevancia`, por canal):
- `cod_assoc` (`dims:["fatorA","fatorB"]`): matriz de associação (Cramér's V) com
  `valor` + `cls` (intensidade verde `cup`/`cup2`/`cup3`/`cup4`, diagonal `cn0`).
- `cod_fatores` (`dims:["Fator"]`): por fator, `Amplitude`, `Independ.`, `Papel`
  (`qualificador` · `proxy de X` · `baixo impacto`), ordenado por amplitude.

Widgets:
1. `eyebrow` "RELEVÂNCIA × CODEPENDÊNCIA" (`n:"⚖"`).
2. `heatmap` **bound** a `cod_assoc` (`w:7`, `rowKey:fatorA`, `colKey:fatorB`,
   `valKey:valor`, `clsKey:cls`).
3. `table` **bound** a `cod_fatores` (`w:5`) com `colorScale:{Amplitude:'amp', Independ.:'surv'}`
   e `defs` (ⓘ por coluna). `amp`: alta ≥30→`cup` · média ≥12→`cup3` · baixa→`cn0`.
   `surv`: ≥50%→`cp` (verde) senão `cn` (vermelho).
4. `find-note` (metodologia + ressalva de causalidade).

> Não há cards-veredito de prosa aqui: como a zona é filtrável, o veredito vive na
> coluna **Papel** da tabela (recalculada por canal). Faixas de amplitude: alta ≥30%
> · média ≥12% · baixa <12% vs. benchmark.

## Layout
Coordenadas explícitas (o cross-cut e a zona de codependência têm posições fixas
para alinhar heatmap + cards). Sem sobreposição; ver `build_report.py`.

## Cuidados
- A codependência roda no canal **Geral**.
- Reportar no chat o papel de cada fator (qualificador/qualificante) e as associações
  mais fortes — é o achado central desta página.
- Não afirmar causalidade: o lift controlado é heurístico sobre a distribuição de leads.
