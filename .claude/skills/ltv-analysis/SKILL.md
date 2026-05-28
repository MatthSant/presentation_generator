---
name: ltv-analysis
description: "Análise completa de LTV a partir de um CSV transacional. Percorre 5 fases: localizar e confirmar o CSV → contexto do cliente → perguntas norteadoras → setup de pastas e exploração dos dados → plano de análise e início da execução. Use quando o usuário invocar /ltv-analysis ou pedir para analisar LTV de uma base de clientes."
user-invocable: true
---

# ltv-analysis

Pipeline que transforma um CSV transacional em uma análise completa de LTV — por produto, por coorte e por perfil.

## Referências da skill

- **Schema do CSV:** `analyze-ltv/dictionary.md`
- **Mapa de seções:** `ltv-analysis/MAP.md`
- **Guias por seção:** `ltv-analysis/sections/S01–S08.md`
- **Templates:** `ltv-analysis/sections/PRODUTO_GRUPO_TEMPLATE.md` e `PERFIL_TEMPLATE.md`
- **Módulo Python:** `ltv-analysis/ltv_calc.py`
- **Regras de cálculo:** `ltv-analysis/calc-rules.md` ← **LER ANTES da Fase 5**
- **Shell do relatório:** `components/tools/shell-report.html`

---

## Visão geral das fases

```
Fase 0  → localizar CSV em input/ e confirmar com o usuário
Fase 1  → nome do cliente e contexto do negócio
Fase 2  → perguntas norteadoras do usuário
Fase 3  → criar pastas + explorar CSV (colunas, cobertura, usuários únicos)
Fase 4  → preencher dicionário de custom_fields + propor plano de análise
Fase 5  → iniciar execução seção a seção
```

---

## Fase 0 — Localizar o CSV

1. Listar arquivos em `input/` com `Glob("input/**/*")`.
2. **Um CSV encontrado:** informar o nome e perguntar ao usuário com `AskUserQuestion`:
   > "Encontrei `[nome].csv` em input/. Posso usar este arquivo?"
   - Sim, usar este
   - Não, quero indicar outro caminho
3. **Múltiplos CSVs:** usar `AskUserQuestion` listando os nomes e perguntando qual usar.
4. **Nenhum arquivo:** pedir que o usuário coloque o CSV em `input/` e reexecute.

Após confirmação, ler as primeiras 5 linhas do CSV com `Read` para verificar o separador e o encoding. Registrar mentalmente o caminho como **[CSV_PATH]**.

---

## Fase 1 — Contexto do negócio

Usar `AskUserQuestion` com **duas perguntas simultâneas**:

**Pergunta 1 — Nome do cliente:**
- Campo de texto livre: "Qual é o nome do cliente ou projeto? (será usado para nomear as pastas e o relatório)"

**Pergunta 2 — Contexto do negócio:**
- Campo de texto livre: "Descreva brevemente o negócio: o que vendem, quem são os clientes, qual o modelo de receita (curso, assinatura, produto físico, etc.)."

Registrar como **[NOME_CLIENTE]** e **[CONTEXTO]**.  
Derivar **[SLUG]** = nome em kebab-case minúsculo sem acentos (ex: "Instituto Singular" → `instituto-singular`).

---

## Fase 2 — Perguntas norteadoras

Usar `AskUserQuestion` com **uma pergunta**:

> "Quais são as principais perguntas que você quer responder com esta análise? Liste as que forem relevantes — elas vão guiar quais seções priorizar e como interpretar os dados."

Campo de texto livre, sem limite.

Registrar como **[PERGUNTAS]**.

Após receber: agradecer e informar que as pastas serão criadas e o CSV explorado.

---

## Fase 3 — Setup de pastas + exploração do CSV

### 3a. Criar estrutura de pastas

```bash
# Criar pastas de trabalho
mkdir temp\[SLUG]
mkdir output\[SLUG]
```

### 3b. Rodar exploração do CSV

Criar `temp\[SLUG]\_explorar.py` com o conteúdo abaixo e executar com `py -3`:

```python
import csv, collections, sys

PATH = '[CSV_PATH]'
MAX_ROWS = 50000  # limitar para exploração rápida

sep = ','
with open(PATH, encoding='utf-8-sig', errors='replace') as f:
    sample = f.read(4096)
    if sample.count(';') > sample.count(','):
        sep = ';'

rows = []
with open(PATH, encoding='utf-8-sig', errors='replace') as f:
    reader = csv.DictReader(f, delimiter=sep)
    for i, row in enumerate(reader):
        if i >= MAX_ROWS:
            break
        rows.append(row)

cols = list(rows[0].keys()) if rows else []
n = len(rows)

# Cobertura por coluna (% de células não-vazias)
coverage = {}
for col in cols:
    filled = sum(1 for r in rows if r.get(col, '').strip())
    coverage[col] = round(filled / n * 100, 1) if n else 0

# Usuários únicos (estimativa)
uid_col = next((c for c in cols if 'user' in c.lower() or 'id' in c.lower()), cols[0])
n_users = len(set(r[uid_col] for r in rows))

# Produtos únicos
prod_col = next((c for c in cols if 'produto' in c.lower() or 'product' in c.lower()), None)
products = collections.Counter(r[prod_col] for r in rows if prod_col and r.get(prod_col, '').strip())

# Custom fields detectados
custom_cols = [c for c in cols if 'custom' in c.lower() or 'field' in c.lower()]

print(f"=== EXPLORAÇÃO: {PATH} ===")
print(f"Linhas lidas: {n:,}")
print(f"Colunas: {len(cols)}")
print(f"Usuários únicos ({uid_col}): {n_users:,}")
print(f"\n--- Cobertura por coluna ---")
for col, pct in sorted(coverage.items(), key=lambda x: -x[1]):
    bar = '█' * int(pct / 5)
    print(f"  {col:<35} {pct:>5.1f}%  {bar}")
print(f"\n--- Top 15 produtos ({prod_col}) ---")
for prod, cnt in products.most_common(15):
    print(f"  {cnt:>6,}  {prod}")
print(f"\n--- Custom fields detectados ---")
for c in custom_cols:
    vals = collections.Counter(r[c] for r in rows if r.get(c, '').strip())
    top = ', '.join(f'"{v}"({n})' for v, n in vals.most_common(5))
    print(f"  {c}: {len(vals)} valores únicos — {top}")
```

Executar: `py -3 temp\[SLUG]\_explorar.py`

### 3c. Apresentar resultado ao usuário

Com base no output do script, apresentar no chat:
- Total de linhas e usuários únicos estimados
- Quais colunas têm boa cobertura (≥ 30%) vs baixa cobertura (< 30%)
- Lista de produtos encontrados (top 10)
- Custom fields detectados com valores de exemplo

---

## Fase 4 — Dicionário + Plano de análise

### 4a. Preencher dicionário de custom_fields

Com os custom fields detectados na Fase 3, usar `AskUserQuestion` perguntando o significado de cada um:

> "Identifiquei os seguintes campos de pesquisa no CSV. Para cada um, o que a pergunta perguntava ao comprador?"

Listar os campos com cobertura ≥ 20% e seus valores de exemplo. Campo de texto livre por campo.

Após receber as respostas, criar `temp\[SLUG]\dicionario.md` copiando o template de `analyze-ltv/dictionary.md` e preenchendo a seção de campos customizados com as informações do usuário.

### 4b. Planejar as seções de perfil (Página 3)

Com base na cobertura dos campos e no mapeamento do dicionário, decidir quais dimensões de perfil serão analisadas:

**Critérios de inclusão** (ver `sections/PERFIL_TEMPLATE.md`):
- Cobertura ≥ 30% dos usuários
- ≥ 2 segmentos com n estimado ≥ 50
- Campo mapeado no dicionário com relevância para LTV

Listar no chat os campos qualificados e os descartados com justificativa breve.

### 4c. Gerar plano da análise

Criar `temp\[SLUG]\plano_analise.md` com a estrutura abaixo:

```markdown
# Plano de Análise — [NOME_CLIENTE]

## Metadados
- **Cliente:** [NOME_CLIENTE]
- **Contexto:** [CONTEXTO]
- **CSV:** [CSV_PATH]
- **Data:** [data atual]

## Perguntas norteadoras
[PERGUNTAS]

## Seções planejadas

### Página 1 — Visão Geral (sempre presente)
- [ ] S01 — Perfil da Base
- [ ] S02 — Faturamento e Ticket
- [ ] S03 — LTV por Safra
- [ ] S04 — Progressão de LTV

### Página 2 — Análise por Produto
- [ ] S05 — Segmentação por Grupo (taxonomia a definir)
- [ ] S06 — LTV por Produto
- [ ] S07 — Tempo até Recompra
- [ ] S08 — Recompra por Grupo
[listar grupos descobertos em S05 — preencher após S05]

### Página 3 — Análise de Perfil
[listar apenas os custom_fields qualificados]

## Custom fields mapeados
[lista dos campos e seu significado]

## Custom fields ignorados
[lista dos campos descartados e por quê]

## Normalização de produtos
[preencher após S05 — aqui virá norm_produto() e norm_grupo()]
```

### 4d. Confirmar plano com o usuário

Apresentar o plano no chat e usar `AskUserQuestion`:
> "Este plano cobre suas perguntas norteadoras? Há alguma seção que devo priorizar ou remover?"

- Aprovado, iniciar
- Ajustar [indicar o quê]
- Adicionar análise específica

Só avançar para Fase 5 com aprovação.

---

## Fase 5 — Execução

### Princípio fundamental: uma seção de cada vez

**Nunca processar mais de uma seção simultaneamente.**  
Cada seção produz dois artefatos isolados que ficam em `temp\[SLUG]\`:

```
calc_sXX.py      ← script Python da seção (cálculos + print dos números)
_el-sXX.html     ← fragmento HTML da seção (sem shell, sem <html>/<body>)
```

A montagem final acontece **apenas depois de todas as seções prontas**, concatenando os fragmentos com PowerShell. O agente nunca precisa ler múltiplos arquivos `_el-*.html` ao mesmo tempo.

---

### Setup compartilhado — fazer UMA VEZ antes da primeira seção

Na Fase 3 já rodamos a exploração. Antes de começar as seções, criar `temp\[SLUG]\_setup.py` que:
1. Lê o CSV
2. Constrói `users` e `all_txs`
3. Serializa para `temp\[SLUG]\_users.json` e `temp\[SLUG]\_txs.json`

```python
import sys, json
sys.path.insert(0, r'.claude\skills\ltv-analysis')
from ltv_calc import load_csv, build_users, parse_date

CSV_PATH = '[CSV_PATH]'
SLUG     = '[SLUG]'

rows = load_csv(CSV_PATH)
users, all_txs = build_users(
    rows,
    col_user      = 'user_id',
    col_value     = 'valor_venda',
    col_date      = 'data_pedido',
    col_product   = 'nome_produto',
    col_first_product = 'primeiro_produto',
    profile_cols  = ['genero', 'escolaridade', 'renda_mensal', 'idade',
                     'custom_field_2', 'custom_field_5', ...]  # preencher com os campos do CSV
)

# Serializar — dates viram strings ISO
def serial(obj):
    from datetime import datetime, date
    if isinstance(obj, (datetime, date)): return obj.isoformat()
    raise TypeError(f'Not serializable: {type(obj)}')

with open(rf'temp\{SLUG}\_users.json', 'w', encoding='utf-8') as f:
    json.dump(users, f, default=serial, ensure_ascii=False)
with open(rf'temp\{SLUG}\_txs.json', 'w', encoding='utf-8') as f:
    json.dump(all_txs, f, default=serial, ensure_ascii=False)

print(f'Setup OK — {len(users):,} usuários, {sum(len(v) for v in all_txs.values()):,} transações')
```

Executar: `py -3 temp\[SLUG]\_setup.py`

A partir daqui, **cada script de seção carrega `_users.json` e `_txs.json` em vez de reler o CSV**.

---

### Loop por seção

Para cada seção no plano aprovado, executar este ciclo completo antes de passar para a próxima:

```
① Ler o MD da seção em ltv-analysis/sections/SXX-[nome].md
② Escrever temp\[SLUG]\calc_sXX.py
③ py -3 temp\[SLUG]\calc_sXX.py   → números no terminal
④ Apresentar achados no chat (números, padrões, anomalias)
⑤ Escrever output\[SLUG]\sXX.json  (typed blocks — ver schema abaixo)
⑥ Atualizar plano_analise.md: marcar [x] na seção concluída
⑦ Só então iniciar a próxima seção
```

**Nunca pular etapas.** Se o Python retornar erro, diagnosticar e corrigir antes de escrever o JSON.

---

### Script Python padrão por seção (`calc_sXX.py`)

```python
import sys, json
sys.path.insert(0, r'.claude\skills\ltv-analysis')
from ltv_calc import filter_by, group_by, calc_ltv_metrics, seg_table, \
                    ltv_progressao, dist_janela_recompra, mediana_retorno, \
                    recompra_destinos, fmt_brl, fmt_pct
# importar apenas as funções necessárias para esta seção (ver SXX.md)

SLUG = '[SLUG]'

with open(rf'temp\{SLUG}\_users.json', encoding='utf-8') as f:
    users = json.load(f)
with open(rf'temp\{SLUG}\_txs.json', encoding='utf-8') as f:
    all_txs = json.load(f)

# --- cálculos da seção conforme ltv-analysis/sections/SXX.md ---

# Print estruturado — o que vai virar KPIs e gráficos no JSON
print('=== S01 — Perfil da Base ===')
print(f'n_clientes:       {n_clientes:,}')
print(f'tx_recompra:      {fmt_pct(tx_recompra)}')
print(f'ltv_medio:        {fmt_brl(ltv_medio)}')
# ...
```

---

### JSON da seção (`output\[SLUG]\sXX.json`) — typed blocks

A skill **não escreve HTML**. Escreve JSON com blocos tipados que o app renderiza.
O renderer em `app/public/renderer.js` é o único lugar que conhece classes CSS.

**Estrutura obrigatória:**

```json
{
  "id": "s01",
  "page": "visao-geral",
  "pageLabel": "Visão Geral",
  "sectionLabel": "Perfil da Base",
  "header": {
    "badge": "VISÃO GERAL",
    "badgeColor": "p",
    "title": "Base com ",
    "titleEm": "1.234 clientes ativos"
  },
  "blocks": [ ... ],
  "modals": [ ... ]
}
```

**Block types disponíveis:**

| `type` | Campos principais |
|---|---|
| `kpi-row` | `items: [{value, label, color}]` |
| `chart` | `id, chartType, height, series, labels/categories, colors` |
| `find-block` | `tag, tagColor, title, detail, modal?` |
| `find-note` | `text, color` |
| `highlight` | `text, color?` |
| `ni` | `number, text, color` |
| `row` | `cols: [{flex, blocks:[]}]` |
| `g2`/`g3`/`g4` | `items: [{title?, blocks:[]}]` |
| `heatmap` | `cols:[], rows:[{label, cells:[{value,cls}]}]` |
| `table` | `headers:[], rows:[[cell,...]]` |
| `label-sec` | `text, sub?, divider?` |

**Exemplo de seção completa:**

```json
{
  "id": "s01",
  "page": "visao-geral",
  "pageLabel": "Visão Geral",
  "sectionLabel": "Perfil da Base",
  "header": { "badge": "VISÃO GERAL", "badgeColor": "p", "title": "Base com ", "titleEm": "1.234 clientes" },
  "blocks": [
    {
      "type": "kpi-row",
      "items": [
        { "value": "1.234",   "label": "Clientes únicos",  "color": "p" },
        { "value": "34%",     "label": "Taxa de recompra", "color": "g" },
        { "value": "R$ 1.8k", "label": "LTV médio",        "color": "p" }
      ]
    },
    {
      "type": "row",
      "cols": [
        {
          "flex": 1.1,
          "blocks": [
            { "type": "chart", "id": "chart-s01-dist", "chartType": "donut", "height": 260,
              "series": [68.2, 20.1, 7.4, 4.3], "labels": ["1 compra","2 compras","3 compras","4+"],
              "colors": ["#8B5CF6","#7C3AED","#6D28D9","#4C1D95"] },
            { "type": "find-note", "text": "68% dos clientes comprou apenas uma vez.", "color": "p" }
          ]
        },
        {
          "flex": 0.9,
          "blocks": [
            { "type": "find-block", "tag": "Recompra", "tagColor": "p",
              "title": "1 em cada 3 clientes voltou a comprar.",
              "detail": "Taxa de recompra de 34% — acima da média do setor (22%)." }
          ]
        }
      ]
    }
  ]
}
```

> **IDs de gráficos:** sempre `chart-sXX-[descricao]` — únicos por seção.  
> **Cores de `find-block`:** `p` (roxo), `g` (verde), `a` (âmbar), `r` (vermelho).  
> **`find-note`** vai embaixo do gráfico no mesmo col; `find-block` vai na coluna de insights.

---

### Seção S05 — pausa obrigatória para taxonomia

S05 é o único ponto em que a execução para para confirmar com o usuário antes de prosseguir:

1. `calc_s05.py` roda análise exploratória: todos os produtos, ticket, tx_recompra, mediana de intervalo
2. Propor taxonomia de grupos no chat com justificativa baseada nos dados
3. `AskUserQuestion` — os nomes e a divisão fazem sentido para o negócio?
4. Só após aprovação: escrever `norm_produto()` e `norm_grupo()`, salvar em `temp\[SLUG]\norm_functions.py`
5. Apenas então escrever `output\[SLUG]\s05.json` e seguir

---

### Montagem final — após todas as seções

Não há montagem HTML. As seções já estão em `output\[SLUG]\sXX.json`.
Só gerar o `data.json` de navegação:

```python
import json, os, glob
from datetime import datetime

SLUG       = '[SLUG]'
NOME       = '[NOME_CLIENTE]'
OUTPUT_DIR = rf'output\{SLUG}'

# Estrutura de páginas — derivada do plano_analise.md
pages = [
    { "id": "visao-geral", "label": "Visão Geral",
      "sections": [
        {"id":"s01","label":"Perfil da Base"},
        {"id":"s02","label":"Faturamento e Ticket"},
        {"id":"s03","label":"LTV por Safra"},
        {"id":"s04","label":"Progressão de LTV"},
      ]
    },
    { "id": "produtos", "label": "Por Produto",
      "sections": [
        {"id":"s05","label":"Segmentação por Grupo"},
        # ... adicionar grupos e seções de perfil conforme plano
      ]
    },
]
# Filtrar só seções cujo arquivo existe
for page in pages:
    page["sections"] = [s for s in page["sections"]
                        if os.path.exists(rf'{OUTPUT_DIR}\{s["id"]}.json')]
pages = [p for p in pages if p["sections"]]

data = {
    "meta": {
        "client": NOME, "slug": SLUG, "type": "ltv",
        "theme": "light", "title": f"Análise de LTV — {NOME}",
        "created_at": datetime.now().isoformat()
    },
    "pages": pages
}

with open(rf'{OUTPUT_DIR}\data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'data.json gerado — {sum(len(p["sections"]) for p in pages)} seções')
print(f'Abrir: http://localhost:3131/report/{SLUG}')
```

> **Iniciar o app antes de abrir:** `cd app && node server.js` (ou já estar rodando)  
> **Live reload:** salvar um `sXX.json` atualizado recarrega a seção no browser automaticamente via SSE.

---

## Guardrails analíticos — ler `calc-rules.md` antes de iniciar a Fase 5

Ler `ltv-analysis/calc-rules.md` integralmente antes de calcular qualquer métrica. As regras abaixo são as mais críticas e devem ser verificadas ativamente em cada seção:

### Filtro base (toda seção, sem exceção)
- `valor_venda > 0` — excluir reembolsos, cortesias e erros **antes de qualquer cálculo**
- Deduplicar "Primeira Compra": se o mesmo `user_id` tiver mais de uma transação classificada como primeira, manter apenas a de `data_pedido` mais antiga

### ⚠️ Comparação entre segmentos — armadilha de safra

**NUNCA comparar LTV total ou taxa de recompra diretamente entre segmentos que podem ter distribuições de safra diferentes.**

Clientes de safras mais recentes têm menos tempo para recomprar — um segmento com entrada mais recente vai mostrar LTV e tx_recompra menores apenas por maturidade, não por comportamento distinto.

**Regra obrigatória:** ao comparar dois segmentos (produto A vs B, canal X vs Y, perfil profissional vs mãe/pai), sempre aplicar uma das duas abordagens:

```
# Opção 1 — janela fixa (preferida quando os segmentos têm safras mistas)
comparar ltv_12m = sum(transações até data_t1 + 365 dias)
comparar tx_recompra_12m = % com t2 em até 365 dias após t1

# Opção 2 — controle de safra (quando quiser maturidade total)
filtrar ambos os segmentos para mesma safra (ex: somente clientes com entrada em 2022–2023)
só então comparar ltv_total e tx_recompra
```

**Janelas recomendadas para comparação entre segmentos:** 90d (curto prazo), 180d (semestral), 12m (padrão).  
Usar `ltv_total` sem janela **apenas** quando todas as safras comparadas têm ≥ 2 anos de histórico.

### ⚠️ Grupos parcelados — métricas incomparáveis

- `tx_recompra` de grupos parcelados é artificialmente alta (~70–90%) porque cada parcela é uma transação
- `mult` de grupos parcelados representa número de parcelas, não fidelidade
- **Nunca colocar grupos parcelados no mesmo gráfico de tx_recompra ou mult que grupos de compra discreta sem aviso explícito**
- Identificar a mecânica: se `mediana_intervalo_entre_compras` ≈ 28–35 dias → são parcelas → sinalizar na visualização

### Upside — calcular no agregado, não como média individual

```
# CORRETO — no nível agregado
upside_pct = (ltv_medio - t1_medio) / t1_medio

# ERRADO — média de upsides individuais (distorce com outliers)
upside_pct = mean((ltv_i - t1_i) / t1_i for each user)
```

### LTV "limpo" em safras (S03)

Quando a base tem produtos de entrada muito baratos (eventos, pitches), o LTV inicial de safras recentes pode parecer menor apenas porque mais clientes entraram por esses produtos. Calcular `ltv_limpo_12m` excluindo entradas com `valor_venda ≤ threshold` (threshold a definir por contexto — geralmente R$ 50–100) para separar o efeito de mix do efeito de degradação real.

---

## Design system — construção do relatório com `shell-report.html`

O relatório final usa `components/tools/shell-report.html` como shell — **não** o `shell-element.html`. O shell-report tem sidebar de páginas, tab bar de seções, sistema de comentários e modal de detalhamento integrados.

### Placeholders do shell

| Placeholder | O que recebe |
|---|---|
| `{{TITLE}}` | Título da aba do browser |
| `{{THEME}}` | `dark` ou `light` |
| `{{CONTENT}}` | HTML de todas as seções concatenadas |
| `{{CHART_DEFS}}` | Objeto JS com definições de todos os gráficos |

### Estrutura de cada seção `_el-sXX.html`

Cada arquivo de seção **deve ter exatamente um elemento raiz** com os três atributos de navegação:

```html
<div class="card content"
     id="s01"
     data-page="visao-geral"
     data-page-label="Visão Geral"
     data-report-section="Perfil da Base">

  <!-- conteúdo da seção aqui -->

</div>
```

| Atributo | Obrigatoriedade | Descrição |
|---|---|---|
| `id` | **obrigatório** | Identificador único — usado por `switchTab()` para mostrar/ocultar |
| `data-page` | **obrigatório** | Agrupa seções na mesma página da sidebar |
| `data-page-label` | recomendado | Label exibido na sidebar (pode ser igual em todas as seções da mesma página) |
| `data-report-section` | **obrigatório** | Label exibido na tab bar — deve ser o nome curto da seção |

**Páginas e IDs padrão:**

| `data-page` | `data-page-label` | Seções |
|---|---|---|
| `visao-geral` | `Visão Geral` | S01 → S04 |
| `analise-produto` | `Análise por Produto` | S05 → S08 + grupos |
| `analise-perfil` | `Análise de Perfil` | Sxx+ (perfil) |

### IDs de seção

Usar padrão `s[número]` sem zero à esquerda para seções fixas (`s1`, `s2` ... `s8`).  
Para grupos de produto: `s8-[slug-grupo]` (ex: `s8-core`, `s8-evento`).  
Para perfil: `sp-[slug-dimensao]` (ex: `sp-genero`, `sp-papel`).

### Gráficos — `{{CHART_DEFS}}`

Cada gráfico no HTML precisa de um `<div class="chart-wrap" id="chart-[nome]"></div>` e uma entrada correspondente no objeto `chartDefs`:

```javascript
'chart-s1-dist-tx': {
  type: 'donut',
  height: 260,
  series: [68.2, 20.1, 7.4, 4.3],
  labels: ['1 compra', '2 compras', '3 compras', '4+'],
  colors: ['#8B5CF6', '#7C3AED', '#6D28D9', '#4C1D95'],
},
'chart-s2-fat': {
  type: 'stacked',
  height: 300,
  series: [
    { name: 'Novos', data: [1200000, 1450000, 1680000, 1920000] },
    { name: 'Recompra', data: [380000, 520000, 710000, 980000] },
  ],
  categories: ['2022', '2023', '2024', '2025'],
  colors: ['#8B5CF6', '#10B981'],
},
```

IDs de gráfico: `chart-s[número]-[slug-descritivo]` — únicos em todo o relatório.

### Modais de detalhamento

Botão "ver tabela completa" dentro do card → modal com tabela de 10 colunas.

```html
<!-- dentro do card, antes do </div> final -->
<div class="find-block" data-modal="modal-s1-dist" style="cursor:pointer">
  <span class="find-tag find-tag-p">Tabela</span>
  <div class="find-title">Ver tabela completa</div>
  <p class="sm">Todos os segmentos com as 10 métricas</p>
</div>

<!-- fora do card (após o </div> raiz da seção) -->
<div class="ic-overlay" id="modal-s1-dist">
  <div class="ic-dialog">
    <div class="ic-dialog-hd">
      <span class="ic-dialog-title">Distribuição de Compras — Detalhamento</span>
      <button class="ic-close" data-ic-close>✕</button>
    </div>
    <div class="hl">Tabela com todos os segmentos e 10 métricas padrão</div>
    <div class="tw">
      <table>
        <thead><tr>
          <th>Segmento</th><th>N</th><th>LTV Médio</th><th>Multiplic.</th>
          <th>Upside %</th><th>Taxa Rcmp</th><th>Ticket PC</th><th>Ticket Rcmp</th>
          <th>Fat. 1ª</th><th>Fat. Rcmp</th><th>Fat. Total</th>
        </tr></thead>
        <tbody>
          <tr><td>...</td>...</tr>
        </tbody>
      </table>
    </div>
  </div>
</div>
```

O handler de modal já está no `shell-report.html` — qualquer elemento com `data-modal="[id]"` abre o overlay com esse `id` ao ser clicado.

### Montagem final com PowerShell

```powershell
$shell   = Get-Content '.claude\skills\components\tools\shell-report.html' -Raw -Encoding UTF8
$charts  = Get-Content 'temp\[SLUG]\_el-charts.js' -Raw -Encoding UTF8

# Concatenar seções na ordem correta
$parts = @(
  'temp\[SLUG]\_el-s1.html',
  'temp\[SLUG]\_el-s2.html',
  # ... todas as seções em ordem de página
)
$content = ($parts | ForEach-Object { Get-Content $_ -Raw -Encoding UTF8 }) -join "`n"

$out = $shell.Replace('{{TITLE}}', 'Análise de LTV — [NOME_CLIENTE]').Replace('{{THEME}}', 'dark').Replace('{{CONTENT}}', $content).Replace('{{CHART_DEFS}}', $charts)

New-Item -ItemType Directory -Force "output\[SLUG]" | Out-Null
[IO.File]::WriteAllText(
  (Join-Path (Get-Location) "output\[SLUG]\relatorio-ltv.html"),
  $out,
  [Text.Encoding]::UTF8
)
```

> **Atenção:** charts devem ser renderizados **antes** de `buildNavigation()` no shell — o `shell-report.html` já garante isso (renderiza todos os `[id^="chart-"]` no `DOMContentLoaded` antes de construir a nav). Não há nada a fazer além de garantir que os IDs no HTML e no `chartDefs` coincidam.

### Classes disponíveis (design system)

Usar exclusivamente as classes do design system. Referência rápida das mais usadas em relatórios:

| Classe | Uso |
|---|---|
| `.content` | Wrapper principal da seção com `gap: 14px` |
| `.slide-hd` + `.slide-title` | Cabeçalho com badge + título |
| `.badge.badge-p/g/a` | Badge de categoria (roxo/verde/âmbar) |
| `.mr` > `.mi` > `.mv` + `.ml` | KPI row: valor + label |
| `.c-p / .c-g / .c-r / .c-a` | Cores de texto semânticas |
| `.chart-wrap` | Container de gráfico ApexCharts |
| `.chart-title` | Título acima do gráfico |
| `.find-block` + `.find-tag` + `.find-title` | Card de insight com tag |
| `.find-note.find-note-p/g/a` | Frase síntese abaixo do gráfico |
| `.row` > `.col` | Layout gráfico + insights lado a lado |
| `.g2` / `.g3` | Grid 2 ou 3 colunas iguais |
| `.hl` | Highlight — número ou frase em destaque |
| `.tw > table` | Tabela estruturada (header roxo, linhas alternadas) |
| `.hm-wrap` > `.hm-grid` | Heatmap — ver `block-heatmap.html` |
| `.hm-g3/g2/g1` · `.hm-n` · `.hm-r1/r2/r3` | Escala de cor do heatmap (verde → neutro → vermelho) |
| `.ic-overlay` + `.ic-dialog` | Modal de detalhamento |
| `.sm` | Texto secundário (13px, cinza) |
| `.xs` | Texto extra-pequeno (11px, cinza2) |

Proibido: `border-left > 1px` como stripe, gradient text, glassmorphism, cards ad-hoc, superfícies opacas. `height` de gráfico sempre via JS no `chartDef`, nunca CSS.

---

## Comportamento durante a execução

- **Apresentar números no chat** após cada seção — não apenas salvar arquivos silenciosamente
- **Perguntar antes de prosseguir** se um achado for surpreendente ou contraditório com o contexto do negócio
- **Registrar anomalias** no `temp\[SLUG]\plano_analise.md` (ex: coluna vazia, produto sem categorização)
- **Nunca deletar arquivos em `temp\[SLUG]\`** — o usuário pode querer retomar ou ajustar
- **Atualizar o plano** (`plano_analise.md`) marcando `[x]` as seções concluídas conforme avança

---

## Comportamento em erros

| Situação | Ação |
|---|---|
| CSV com separador diferente de vírgula | Detectar automaticamente (`;` ou `\t`) na Fase 3 |
| Coluna `user_id` com nome diferente | Identificar pela cobertura e padrão — perguntar ao usuário se não for óbvio |
| Custom field com < 20% de cobertura | Listar como "ignorado" no dicionário — não criar seção de perfil |
| Produto não mapeado em `norm_produto()` | Reportar ao usuário após S05 — perguntar se deve ser agrupado em "Outros" |
| Script Python com erro | Mostrar o traceback no chat, diagnosticar e corrigir antes de continuar |
| n_clientes de um grupo < 100 | Incluir nota visual na seção; não criar seção de detalhe para esse grupo |
