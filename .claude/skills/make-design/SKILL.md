---
name: make-design
description: "Constrói elementos isolados do design system — gráficos, componentes visuais, 1-pagers — como páginas HTML standalone com exportação PNG 3×. Lê dados colados no chat ou de um arquivo CSV em input/. Sugere o tipo de visualização e confirma com o usuário antes de gerar. Use quando o usuário invocar /make-design ou pedir para criar um gráfico, elemento visual ou mini-relatório no design system."
user-invocable: true
---

# make-design

Constrói um elemento visual isolado do design system e salva em `output/elements/[slug].html`.

## Visão geral

| | |
|---|---|
| **Input** | Dados colados no chat **ou** CSV em `input/` |
| **Output** | `output/elements/[slug].html` — abre no browser |
| **Exportação** | Botão "↓ PNG" fixo na tela, gera PNG 3× (≈3000px de largura) |
| **Composição** | Gráfico isolado / gráfico + contexto / 1-pager completo |
| **Tema** | Light (padrão) · Dark se o usuário mencionar |

---

## Processo

### Passo 1 — Capturar dados

Verifique se o usuário colou dados no chat ou se há um arquivo em `input/`.

- **CSV em `input/`** → leia o arquivo, parse colunas e linhas
- **Dados colados** → interprete diretamente do chat

Monte mentalmente uma tabela com dimensões e métricas antes de prosseguir.

Se não houver dados nem descrição clara, pergunte: qual é o dado? Cole aqui ou informe o arquivo em `input/`.

---

### Passo 2 — Analisar padrão e propor

Com base nos dados, identifique:

**Tipo de dado → gráfico sugerido:**

| Padrão | Tipo sugerido |
|---|---|
| Evolução no tempo (datas/períodos em eixo) | `line` ou `area` |
| Comparação entre categorias — ranking | `bar-horizontal` |
| Comparação vertical entre poucos valores | `bar` |
| Proporção / composição (partes de um todo) | `donut` |
| Dois indicadores com escalas diferentes | `mixed` (bar + line) |
| Parte de meta em % | `radialBar` |
| Múltiplas séries comparando atributos | `radar` |
| Hierarquia / peso relativo | `treemap` |
| Correlação entre dois valores numéricos | `scatter` |
| Evolução acumulada com volume | `area` multi-série |

**Escopo do elemento:**

| Composição | Quando usar |
|---|---|
| Só gráfico | Dado único, uso direto em outro contexto |
| KPI row + gráfico | Contexto numérico apoia a visualização |
| Gráfico + insights (`.row`) | Achados derivados do dado merecem destaque |
| 1-pager completo | Relatório autônomo com título, métricas, gráfico e achados |

---

### Passo 3 — Confirmar com o usuário

Use `AskUserQuestion` com **2–3 perguntas simultâneas**:

1. **Tipo de gráfico** — primeira opção é a sugestão, + 2–3 alternativas relevantes
2. **Escopo** — gráfico isolado / gráfico + contexto / 1-pager
3. **Tema** (somente se não mencionado) — Light / Dark

Prossiga somente após confirmação.

---

### Passo 4 — Gerar o HTML

O shell (`shell-element.html`) tem 6 placeholders — não é necessário lê-lo. Gere os valores abaixo e use o PowerShell para substituir diretamente no arquivo original.

| Placeholder | Valor |
|---|---|
| `{{TITLE}}` | Título para a aba do browser |
| `{{THEME}}` | `dark` ou `light` |
| `{{CONTENT}}` | HTML gerado em 4a |
| `{{DATA}}` | Bloco `var DATA = {...}` gerado em 4b |
| `{{CHART_DEFS}}` | Definições de gráfico geradas em 4c — referenciam `DATA.*` |
| `{{FILENAME}}` | Slug sem extensão (ex: `vendas-canal-2024`) |

#### 4a — Montar `{{CONTENT}}`

Use **somente** as classes do design system. Nunca inventar classes novas, `box-shadow` decorativo, `border-radius` alto em superfícies de conteúdo, ou `background` inline colorido.

---

**Cabeçalho de seção** (somente para escopo gráfico + contexto ou 1-pager):
```html
<div class="slide-hd">
  <span class="badge badge-p">ANÁLISE</span>
  <h1 class="slide-title">Título em frase <em>declarativa</em></h1>
</div>
```

**KPI row** (métricas de contexto):
```html
<div class="mr">
  <div class="mi"><div class="mv c-p">R$ 1.2k</div><div class="ml">Ticket Médio</div></div>
  <div class="mi"><div class="mv c-g">+18%</div><div class="ml">Crescimento YoY</div></div>
  <div class="mi"><div class="mv c-a">3.2×</div><div class="ml">ROAS</div></div>
</div>
```

**Gráfico:**
```html
<div class="chart-wrap" id="chart-[nome]"></div>
```

**Find note** (frase-síntese abaixo do gráfico):
```html
<p class="find-note find-note-p">Contexto derivado da visualização acima.</p>
```

**Find blocks** (insights com tag):
```html
<div class="find-block">
  <span class="find-tag find-tag-p">Achado</span>
  <div class="find-title">Frase declarativa que sintetiza o insight.</div>
  <p class="sm">Detalhe ou dado de suporte.</p>
</div>
```

> **Linguagem do `find-title`:** declare a conclusão de negócio em linguagem simples — nunca jargão estatístico ou analítico ("artefato", "viés", "distribuição", "percentil", "correlação"). Se a explicação exige linguagem técnica, coloque-a no `.sm` ou mova para uma modal. Exemplo errado: *"A queda na mediana é um artefato de composição."* Exemplo certo: *"A mediana caiu porque o mix mudou — não porque o core retorna mais rápido."*

**Layout gráfico + insights (`.row`):**
```html
<div class="row">
  <div class="col" style="flex:1.1">
    <div class="chart-wrap" id="chart-principal"></div>
    <p class="find-note find-note-p">Síntese da visualização.</p>
  </div>
  <div class="col" style="flex:.9">
    <!-- find-blocks aqui -->
  </div>
</div>
```

**Dois gráficos comparativos (`.g2`):**
```html
<div class="g2">
  <div><div class="chart-title">Série A</div><div class="chart-wrap" id="chart-a"></div></div>
  <div><div class="chart-title">Série B</div><div class="chart-wrap" id="chart-b"></div></div>
</div>
```

**Highlight** (para números ou frases de destaque):
```html
<div class="hl"><strong>Dado de destaque:</strong> contexto que explica o número.</div>
```

**NI block** (ação ou item numerado):
```html
<div class="ni">
  <div class="nb nb-p">1</div>
  <div class="nt"><strong>Título da ação.</strong> Descrição ou justificativa curta.</div>
</div>
```

---

**Regras de composição:**
- `.content` como wrapper com `gap:14px` para elementos em coluna única
- Sempre terminar com `find-note` ou `find-block` quando o escopo incluir insights
- Cores de texto via `.c-p`, `.c-g`, `.c-r`, `.c-a`, `.c-o` — nunca hex inline
- Superfícies via `var(--surface)` — nunca `rgba()` hardcoded
- Sem tags filhas em campos texto-puro (títulos de badge, find-tag)

---

#### 4b — Montar `{{DATA}}`

Todos os arrays de dados ficam num único bloco `var DATA = {...}` com nomes descritivos. Os gráficos não repetem os números — apenas referenciam `DATA.nomeDaChave`.

```javascript
var DATA = {
  // Séries (arrays de números)
  faturamento:  [120, 145, 132, 178, 201, 189],
  meta:         [130, 130, 150, 150, 180, 180],
  // Dimensão (eixo X ou labels)
  meses:        ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
  // Para donut/pie: labels separados
  canais:       ['Orgânico', 'Pago', 'Direto', 'Afiliados'],
  participacao: [42, 31, 18, 9],
};
```

**Regras:**
- Nomear as chaves pelo significado do dado, nunca `series1` ou `data1`
- Séries de gráficos diferentes ficam em chaves separadas — nunca compartilhar arrays entre gráficos com escalas distintas
- KPIs e textos de `.mv` também podem vir do DATA se forem derivados dos mesmos dados (ex: `DATA.faturamento.reduce(...)`)
- Nunca repetir os mesmos números em `{{DATA}}` e `{{CHART_DEFS}}`

---

#### 4c — Montar `{{CHART_DEFS}}`

As definições referenciam `DATA.*` — zero arrays inline.

```javascript
'chart-[nome]': {
  type: 'bar',
  height: 320,
  series: [{ name: 'Faturamento', data: DATA.faturamento }],
  categories: DATA.meses,
  colors: ['#8B5CF6'],
},
```

**Altura sugerida por escopo:**
- Gráfico isolado (1-pager): `height: 420`
- Gráfico + insights lado a lado: `height: 340`
- Dois gráficos em `.g2`: `height: 280`

**Cores por tema:**
| | Dark | Light |
|---|---|---|
| purple | `#8B5CF6` | `#7C3AED` |
| green  | `#10B981` | `#059669` |
| amber  | `#F59E0B` | `#D97706` |
| orange | `#F97316` | `#EA580C` |
| red    | `#EF4444` | `#DC2626` |

Barras horizontais (ranking): usar `colors` com array gradado do mais para o menos intenso (ex: `['#8B5CF6','#7C3AED','#6D28D9','#5B21B6','#4C1D95']`).

---

#### 4d — Salvar via PowerShell

Use o **Write tool** para criar três arquivos temporários (são arquivos novos — não exigem Read prévio):

- `temp\_el-content.html` → HTML de `{{CONTENT}}`
- `temp\_el-data.js` → bloco `var DATA = {...}` de `{{DATA}}`
- `temp\_el-charts.js` → entradas de `{{CHART_DEFS}}`

Em seguida, rode o PowerShell abaixo substituindo os valores literais de `{{TITLE}}`, `{{THEME}}` e `{{FILENAME}}` diretamente na linha de comando:

```powershell
$shell   = Get-Content '.claude\skills\components\tools\shell-element.html' -Raw -Encoding UTF8
$content = Get-Content 'temp\_el-content.html' -Raw -Encoding UTF8
$data    = Get-Content 'temp\_el-data.js'       -Raw -Encoding UTF8
$charts  = Get-Content 'temp\_el-charts.js'     -Raw -Encoding UTF8
$out = $shell `
  .Replace('{{TITLE}}',      'Título do Elemento') `
  .Replace('{{THEME}}',      'light') `
  .Replace('{{CONTENT}}',    $content) `
  .Replace('{{DATA}}',       $data) `
  .Replace('{{CHART_DEFS}}', $charts) `
  .Replace('{{FILENAME}}',   'slug-do-arquivo')
New-Item -ItemType Directory -Force 'output\elements' | Out-Null
[IO.File]::WriteAllText(
  (Join-Path (Get-Location) 'output\elements\slug-do-arquivo.html'),
  $out,
  [Text.Encoding]::UTF8
)
Remove-Item 'temp\_el-content.html','temp\_el-data.js','temp\_el-charts.js' -ErrorAction SilentlyContinue
```

> `.Replace()` é método .NET literal — sem problemas com aspas, tags HTML ou caracteres especiais no conteúdo.

**1-pager com múltiplas seções** (mais eficiente em tokens): em vez de um único `_el-content.html`, crie um arquivo por seção + `_el-map.md`. Monte `$content` concatenando no PowerShell:

```powershell
$hdr = Get-Content 'temp\_el-header.html' -Raw -Encoding UTF8
$s1  = Get-Content 'temp\_el-s1.html'     -Raw -Encoding UTF8
$s2  = Get-Content 'temp\_el-s2.html'     -Raw -Encoding UTF8
$content = '<div class="content" style="gap:24px">' + $hdr + $s1 + $s2 + '</div>'
```

Vantagem: para editar uma seção basta `Read` + `Write` daquele arquivo — sem tocar nas demais seções. Ao iterar sobre o conteúdo, omitir o `Remove-Item` final para manter os arquivos de seção no `temp/`.

---

### Passo 5 — Informar

Informe:
- Caminho do arquivo
- Instruções: abrir no browser (requer rede para carregar fontes e ApexCharts na primeira abertura)
- O botão "↓ PNG" aparece após o carregamento e exporta o elemento em 3× de resolução

---

## Comportamento em ambiguidade

| Situação | Ação |
|---|---|
| Dado ambíguo (não fica claro qual é dimensão vs. métrica) | Perguntar antes de propor |
| Tipo de gráfico não reconhecido | Usar `bar` como fallback, avisar |
| Sem dados e sem arquivo em `input/` | Pedir que o usuário cole os dados |
| Tema não mencionado e escopo é só gráfico | Usar light sem perguntar |
| Múltiplos gráficos na mesma página | IDs únicos obrigatórios: `chart-a`, `chart-b`, etc. |
| Usuário quer tabela mas dados têm ≤ 2 dimensões | Sugerir gráfico, só usar tabela se o usuário confirmar preferência |

---

## Classes disponíveis no shell

Referência rápida de classes menos frequentes que existem no shell mas não aparecem nos exemplos acima.

| Classe | Uso |
|---|---|
| `.tag .tag-p/g/a/r/o` | Pill de categoria menor que badge — inline em texto ou listas |
| `.bul li` | Lista com bullet circular roxo (alternativa ao `def-bullets`) |
| `.tw > table` | Tabela estruturada: header roxo escuro / lavanda claro, linhas alternadas |
| `.hm-wrap` > `.hm-grid` | Heatmap — grid de células coloridas por valor; usar `--hm-cols:N` no style |
| `.hm-g3/g2/g1` · `.hm-n` · `.hm-r1/r2/r3` | Escala de cor do heatmap: ≥80 verde escuro → neutro → ≤−66 vermelho escuro |
| `.sp .sp-p/g/a/o/r` | Status pill inline (ex: "Ativo", "Crítico") — fundo sólido, texto branco/preto |
| `.impact` | Pill verde para impacto positivo — ex: `<span class="impact">+18%</span>` |
| `.ai / .an / .at / .as` | Item de agenda compacto: número quadrado + título + subtítulo |
| `.card .card-title .card-body` + `.cl/cl-g/cl-a` | Card genérico com borda tintada — usar com moderação |
| `.panel-l / .panel-r` | Colunas assimétricas (1.1 / 0.9) — alternativa semântica a `.col` com `flex` inline |
| `.g3 / .g4` | Grid de 3 ou 4 colunas iguais |
| `.divl` | Linha decorativa roxa (36 × 3 px) — separador leve abaixo de label-sec |
| `.label-sec` | Label de seção em uppercase — para agrupar visualmente sem título completo |
| `.xs` | Texto extra-pequeno (11 px, cinza2) |
