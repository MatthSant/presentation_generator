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
- **Schema do output (3 camadas):** `ltv-analysis/BLOCKS.md` ← **LER ANTES da Fase 5**
- **App (servidor + renderer):** `app/` — TypeScript; `npm start` na porta 3131

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
   > "Encontrei `[nome].csv` em input/[cliente]/. Posso usar este arquivo?"
   - Sim, usar este
   - Não, quero indicar outro caminho
3. **Múltiplos CSVs:** usar `AskUserQuestion` listando os nomes e perguntando qual usar.
4. **Nenhum arquivo:** pedir que o usuário coloque o CSV em `input/[cliente]/` e reexecute.

Após confirmação, ler as primeiras 5 linhas do CSV com `Read` para verificar o separador e o encoding. Registrar mentalmente o caminho como **[CSV_PATH]**.

---

## Fase 1 — Contexto do negócio

Usar `AskUserQuestion` com **duas perguntas simultâneas**:

**Pergunta 1 — Nome do cliente:**
- Campo de texto livre: "Qual é o nome do cliente ou projeto? (será usado para nomear as pastas e o relatório)"

**Pergunta 2 — Contexto do negócio:**
- Campo de texto livre: "Descreva brevemente o negócio: o que vendem, quem são os clientes, qual o modelo de receita (curso, assinatura, produto físico, etc.)."

Registrar como **[NOME_CLIENTE]** e **[CONTEXTO]**.  
Derivar:
- **[CLIENTE]** = nome em kebab-case minúsculo sem acentos (ex: "Instituto Singular" → `instituto-singular`) — pasta do cliente
- **[SLUG]** = identificador da análise com data (ex: `ltv-mai-2026`) — pasta da análise

O relatório ficará acessível em: `http://localhost:3131/report/[CLIENTE]/[SLUG]`

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
mkdir temp\[CLIENTE]\[SLUG]
mkdir output\[CLIENTE]\[SLUG]
```

### 3b. Rodar exploração do CSV

Criar `temp\[CLIENTE]\[SLUG]\_explorar.py` com o conteúdo abaixo e executar com `py -3`:

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

Executar: `py -3 temp\[CLIENTE]\[SLUG]\_explorar.py`

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

Após receber as respostas, criar `temp\[CLIENTE]\[SLUG]\dicionario.md` copiando o template de `analyze-ltv/dictionary.md` e preenchendo a seção de campos customizados com as informações do usuário.

### 4b. Planejar as seções de perfil (Página 3)

Com base na cobertura dos campos e no mapeamento do dicionário, decidir quais dimensões de perfil serão analisadas:

**Critérios de inclusão** (ver `sections/PERFIL_TEMPLATE.md`):
- Cobertura ≥ 30% dos usuários
- ≥ 2 segmentos com n estimado ≥ 50
- Campo mapeado no dicionário com relevância para LTV

Listar no chat os campos qualificados e os descartados com justificativa breve.

### 4c. Gerar plano da análise

Criar `temp\[CLIENTE]\[SLUG]\plano_analise.md` com a estrutura abaixo:

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

A análise segue o **modelo de 3 camadas** (ver `ltv-analysis/BLOCKS.md`):
números ficam só no `dataset.json`; os arquivos de seção descrevem *o que*
mostrar via `bind`; o `layout.json` posiciona cada widget no grid. **A skill
nunca transcreve números nos `sXX.json`.**

Cada seção produz:

```
temp\[CLIENTE]\[SLUG]\calc_sXX.py   ← Python: cálculos + emite tabela(s) long-format
output\[CLIENTE]\[SLUG]\dataset.json← Camada 1 — números (uma tabela por bloco analítico)
output\[CLIENTE]\[SLUG]\sXX.json    ← Camada 2 — widgets planos com bind
output\[CLIENTE]\[SLUG]\layout.json ← Camada 3 — coords de grid por widget
```

`dataset.json` e `layout.json` são **acumulativos** — cada seção adiciona suas
tabelas e suas entradas de layout aos arquivos existentes (sem sobrescrever as
das seções anteriores).

O app TypeScript (`localhost:3131`) serve as seções dinamicamente à medida que
ficam prontas, resolvendo `bind` contra o `dataset.json` e os filtros ativos —
não há montagem final de HTML.

---

### Setup compartilhado — fazer UMA VEZ antes da primeira seção

Na Fase 3 já rodamos a exploração. Antes de começar as seções, criar `temp\[CLIENTE]\[SLUG]\_setup.py` que:
1. Lê o CSV
2. Constrói `users` e `all_txs`
3. Serializa para `temp\[CLIENTE]\[SLUG]\_users.json` e `temp\[CLIENTE]\[SLUG]\_txs.json`

```python
import sys, json
sys.path.insert(0, r'.claude\skills\ltv-analysis')
from ltv_calc import load_csv, build_users, parse_date

CSV_PATH = '[CSV_PATH]'
CLIENTE  = '[CLIENTE]'
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

with open(rf'temp\{CLIENTE}\{SLUG}\_users.json', 'w', encoding='utf-8') as f:
    json.dump(users, f, default=serial, ensure_ascii=False)
with open(rf'temp\{CLIENTE}\{SLUG}\_txs.json', 'w', encoding='utf-8') as f:
    json.dump(all_txs, f, default=serial, ensure_ascii=False)

print(f'Setup OK — {len(users):,} usuários, {sum(len(v) for v in all_txs.values()):,} transações')
```

Executar: `py -3 temp\[CLIENTE]\[SLUG]\_setup.py`

A partir daqui, **cada script de seção carrega `_users.json` e `_txs.json` em vez de reler o CSV**.

---

### Loop por seção

Para cada seção no plano aprovado, executar este ciclo completo antes de passar para a próxima:

```
① Ler o MD da seção em ltv-analysis/sections/SXX-[nome].md
② Escrever temp\[CLIENTE]\[SLUG]\calc_sXX.py
③ py -3 temp\[CLIENTE]\[SLUG]\calc_sXX.py
   → imprime os números no terminal E faz merge das tabelas long-format
     desta seção em output\[CLIENTE]\[SLUG]\dataset.json
④ Apresentar achados no chat (números, padrões, anomalias)
⑤ Escrever output\[CLIENTE]\[SLUG]\sXX.json  (widgets planos com bind — ver BLOCKS.md)
⑥ Mesclar as entradas de layout desta seção em output\[CLIENTE]\[SLUG]\layout.json
⑦ Validar: npm run validate -- [CLIENTE]/[SLUG]   (a partir de app/)
⑧ Atualizar plano_analise.md: marcar [x] na seção concluída
⑨ Só então iniciar a próxima seção
```

**Nunca pular etapas.** Se o Python retornar erro ou o validador acusar erro,
diagnosticar e corrigir antes de seguir.

---

### Script Python padrão por seção (`calc_sXX.py`)

O Python **calcula e emite números** — para o terminal (revisão) e para o
`dataset.json` como tabelas long-format. Ele **não** escreve `sXX.json`.

```python
import sys, json, os
sys.path.insert(0, r'.claude\skills\ltv-analysis')
from ltv_calc import filter_by, group_by, calc_ltv_metrics, seg_table, \
                    ltv_progressao, dist_janela_recompra, mediana_retorno, \
                    recompra_destinos, fmt_brl, fmt_pct
# importar apenas as funções necessárias para esta seção (ver SXX.md)

CLIENTE = '[CLIENTE]'
SLUG    = '[SLUG]'
OUT     = rf'output\{CLIENTE}\{SLUG}'

with open(rf'temp\{CLIENTE}\{SLUG}\_users.json', encoding='utf-8') as f:
    users = json.load(f)
with open(rf'temp\{CLIENTE}\{SLUG}\_txs.json', encoding='utf-8') as f:
    all_txs = json.load(f)

# --- cálculos da seção conforme ltv-analysis/sections/SXX.md ---

# Helper: faz merge de tabelas neste dataset.json sem perder as das outras seções
def merge_dataset(tables: dict):
    path = rf'{OUT}\dataset.json'
    data = {}
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
    data.update(tables)   # cada seção usa nomes de tabela próprios
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# Tabelas long-format: uma linha por combinação de dims × filters.
# 'filters' lista as colunas fatiáveis (precisam de um FilterDef em data.json).
merge_dataset({
    "perfil_freq": {
        "dims": ["frequencia"],
        "rows": [
            {"frequencia": "1 compra",  "clientes": n1},
            {"frequencia": "2 compras", "clientes": n2},
            {"frequencia": "3+",        "clientes": n3},
        ],
    },
    "kpis_base": {
        "dims": [],
        "rows": [{"clientes": n_clientes, "receita": receita_total, "pedidos": pedidos}],
    },
})

# Print estruturado — confere os números no terminal
print('=== S01 — Perfil da Base ===')
print(f'n_clientes:  {n_clientes:,}')
print(f'tx_recompra: {fmt_pct(tx_recompra)}')
print(f'ltv_medio:   {fmt_brl(ltv_medio)}')
# ...
```

**Diretrizes para as tabelas:**
- Nomes de tabela **únicos por seção** (ex.: `s03_safra`, `perfil_freq`) — o
  merge é por chave, então colisões sobrescrevem.
- `dims` = eixos de group-by (o que vira `x`/categorias). `filters` = colunas
  fatiáveis (ex.: `["canal"]`) — exija um `FilterDef` em `data.json` para cada.
- Pré-agregue ao nível que o widget consome; o app só re-agrega ao aplicar filtros.

---

### JSON da seção (`output\[CLIENTE]\[SLUG]\sXX.json`) — widgets com bind

A skill **não escreve HTML nem números** aqui. Escreve uma **lista plana de
widgets** que referenciam o `dataset.json` via `bind`. As posições no grid vão
no `layout.json` (não há containers `row`/`g2`/`g3`/`g4`).

> **Schema completo, tipos de widget e exemplos em `ltv-analysis/BLOCKS.md`.**
> Nunca ler o código TypeScript do app.

**Estrutura obrigatória:**

```json
{
  "id": "s01",
  "header": {
    "badge": "VISÃO GERAL",
    "title": "Perfil da base de clientes",
    "sub": "Distribuição por frequência de compra."
  },
  "widgets": [
    {
      "id": "kpi",
      "type": "kpi-row",
      "bind": { "dataset": "kpis_base", "metrics": ["clientes", "receita"] },
      "items": [
        { "key": "clientes", "label": "Clientes", "format": "0",  "color": "p" },
        { "key": "receita",  "label": "Receita",  "format": "R$", "color": "g" }
      ]
    },
    {
      "id": "freq",
      "type": "chart",
      "chartType": "donut",
      "title": "Frequência de compra",
      "bind": { "dataset": "perfil_freq", "x": "frequencia", "y": "clientes" }
    }
  ],
  "modals": [ /* opcional */ ]
}
```

**Widget types — resumo** (schema e exemplos completos em `BLOCKS.md`):

| `type` | Campos principais |
|---|---|
| `kpi-row` | `bind`, `items:[{key, label, format?, color?}]` |
| `chart` | `chartType`, `title?`, `height?`, `bind` (`x`/`y`/`series`) |
| `table` | `cols:[]`, `bind` (ou `rows` inline) |
| `heatmap` | `cols:[]`, `rows:[{label, cells:[{value,cls,title?}]}]` (inline) |
| `find-block` | `tag`, `tagColor`, `title`, `detail?`, `modal?` |
| `find-note` | `text` |
| `highlight` | `text`, `label?`, `color?` |
| `ni` / `ni-vertical` | `n`, `title`, `why?`, `action?` |
| `label-sec` | `text`, `sub?` |
| `request` | `text`, `status?` |
| `xs` | `text` (nota metodológica) |

> **`id` único por seção** em todo widget — é a chave do `layout.json`.  
> **Sempre prefira `bind`** em kpi-row/chart/table; inline só sem tabela de origem.  
> **Cores (tokens):** `p` roxo · `g` verde · `a` âmbar · `r` vermelho · `n` neutro.

---

### Layout da seção (`output\[CLIENTE]\[SLUG]\layout.json`) — grid de 12 colunas

Após escrever os widgets, posicione-os no grid. Mescle as entradas desta seção
sob a chave `sections.[id]` sem apagar as das outras seções:

```json
{
  "sections": {
    "s01": [
      { "id": "kpi",  "x": 0, "y": 0, "w": 12, "h": 1 },
      { "id": "freq", "x": 0, "y": 1, "w": 6,  "h": 3 }
    ]
  }
}
```

`x` coluna inicial (0–11) · `w` largura (1–12, com `x+w ≤ 12`) · `y` linha ·
`h` altura. Todo widget da seção precisa de uma entrada. Para compor "gráfico +
insights" lado a lado, dê ao chart `w:7` e empilhe os find-blocks em `w:5` à
direita (ver "Composições" em `BLOCKS.md`).

---

### Seção S05 — pausa obrigatória para taxonomia

S05 é o único ponto em que a execução para para confirmar com o usuário antes de prosseguir:

1. `calc_s05.py` roda análise exploratória: todos os produtos, ticket, tx_recompra, mediana de intervalo
2. Propor taxonomia de grupos no chat com justificativa baseada nos dados
3. `AskUserQuestion` — os nomes e a divisão fazem sentido para o negócio?
4. Só após aprovação: escrever `norm_produto()` e `norm_grupo()`, salvar em `temp\[CLIENTE]\[SLUG]\norm_functions.py`
5. Apenas então escrever `output\[CLIENTE]\[SLUG]\s05.json` e seguir

---

### Montagem final — após todas as seções

Não há montagem HTML. As 3 camadas já estão em `output\[CLIENTE]\[SLUG]\`
(`dataset.json`, `sXX.json`, `layout.json`). Só falta o `data.json` de
navegação — que inclui **`meta.filters`**: um `FilterDef` por coluna listada em
`filters` de alguma tabela do `dataset.json`.

```python
import json, os
from datetime import datetime

CLIENTE    = '[CLIENTE]'
SLUG       = '[SLUG]'
NOME       = '[NOME_CLIENTE]'
OUTPUT_DIR = rf'output\{CLIENTE}\{SLUG}'

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

# Filtros — um FilterDef por coluna 'filters' do dataset. allValue = "sem filtro".
# Ex.: se as tabelas têm filters:["canal"] com valores Loja/Online:
filters = [
    {
        "id": "canal", "label": "Canal",
        "options": ["Loja", "Online"],
        "default": "Geral", "allValue": "Geral",
    },
    # adicionar um bloco por coluna fatiável; omitir se nenhuma tabela usa filters
]

data = {
    "meta": {
        "client": NOME, "type": "ltv",
        "theme": "light", "title": f"Análise de LTV — {NOME}",
        "created_at": datetime.now().isoformat(),
        "filters": filters,
    },
    "pages": pages
}

with open(rf'{OUTPUT_DIR}\data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'data.json gerado — {sum(len(p["sections"]) for p in pages)} seções')
print(f'Abrir: http://localhost:3131/report/{CLIENTE}/{SLUG}')
```

Validar a análise inteira antes de abrir (a partir de `app/`):

```bash
npm run validate -- [CLIENTE]/[SLUG]
```

> **Iniciar o app antes de abrir:** a partir de `app/`, `npm start` (ou `npm run dev`
> para watch). O app compila TypeScript para `dist/` + `public/js/`.  
> **Live reload:** salvar um `sXX.json` atualizado recarrega a seção no browser
> automaticamente via SSE.

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

## Comportamento durante a execução

- **Apresentar números no chat** após cada seção — não apenas salvar arquivos silenciosamente
- **Perguntar antes de prosseguir** se um achado for surpreendente ou contraditório com o contexto do negócio
- **Registrar anomalias** no `temp\[CLIENTE]\[SLUG]\plano_analise.md` (ex: coluna vazia, produto sem categorização)
- **Nunca deletar arquivos em `temp\[CLIENTE]\[SLUG]\`** — o usuário pode querer retomar ou ajustar
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
