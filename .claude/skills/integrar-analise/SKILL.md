---
name: integrar-analise
description: "Procedimento padrão para colocar UMA análise nova DENTRO do app (analytics viewer) como um TIPO de primeira classe — não para rodar a análise, e sim para integrá-la ao app com todos os cuidados. Cobre: motor Python (pysrc/<tipo>/calc.py + build_report.py → 3 camadas), registro em typeRegistry.ts, páginas de criação (gerar/montador), banco de perguntas norteadoras, e o PRINCÍPIO de generalizar features novas (ex.: sidebar) como recurso de plataforma, nunca exclusivo de um tipo. Use quando o usuário pedir para 'colocar/integrar/portar uma análise no app', 'adicionar um tipo de análise', 'transformar este dashboard/HTML/gerador num tipo do app', ou /integrar-analise."
user-invocable: true
---

# integrar-analise

Onboard de uma análise nova como **tipo** do app. O app renderiza qualquer análise a
partir de um modelo de **3 camadas** (dataset → sXX widgets → layout) + um mapa de
navegação (data.json). Integrar = produzir esses artefatos por um motor Python
determinístico e registrar o tipo. Esta skill é o **procedimento com todos os cuidados**;
ela espelha o que os tipos existentes (`conversao-perfil`, `historico-lancamentos`) já fazem.

> **Princípio central (regra dura):** toda feature nova que a análise traz (ex.: uma
> sidebar, um modo de visualização, um novo widget) entra como **recurso de plataforma**
> reutilizável — via `meta`/feature-flag — **nunca** hardcoded para um único tipo. Se
> você se pegar escrevendo `if tipo === 'x'` para uma feature visual, generalize.

## Referências (ler antes de codar)

- **Contrato das 3 camadas + widgets:** `integrar-analise/CONTRATO.md` e
  `conversao-perfil/BLOCKS.md` (schema dos widgets). **LER ANTES da Fase 2.**
- **Registro de tipos:** `app/src/server/typeRegistry.ts` (interface `AnalysisTypeDef`).
- **Despacho do pipeline:** `app/src/server/pygen.ts` — `buildScript = pysrc/<pysrcDir>/build_report.py`;
  `renderScript`/`queryScript` resolvidos pelo registry.
- **Fluxo de criação no app:** `app/src/server/routes/generate.ts` (POST `/generate`) +
  `app/public/gerar-historico.html` (upload+config) + `montador-historico.html`.
- **Bibliotecas Python compartilhadas:** `app/pysrc/common/{layout.py (Grid), fmt.py, preserve.py}`.
- **Templates de motor (copiar/adaptar):** `app/pysrc/historico-lancamentos/{calc.py,build_report.py}`
  (o mais simples) e `app/pysrc/conversao-perfil/build_report.py`.
- **Perguntas norteadoras:** `app/pysrc/perguntas/banks/` (`__init__.py` + um módulo por tipo).
- **Validação:** `cd app && npx tsx scripts/validate.ts <cliente>/<slug>` + `npm run build` + `npm test`.
- **Regras de design:** `CLAUDE.md` → "Regras críticas de design" (proibições). **Seguir à risca.**
- **Scaffolder:** `integrar-analise/scaffold.py` — gera o esqueleto do tipo (opcional, acelera).

---

## Visão geral das fases

```
Fase 0  → entender a análise-fonte + decidir [TIPO]/[LABEL] e capacidades
Fase 1  → mapear o CSV → tabelas long-format do dataset.json
Fase 2  → motor: pysrc/<tipo>/calc.py (determinístico) + build_report.py (3 camadas)
Fase 3  → registrar o tipo em typeRegistry.ts + link em index.html
Fase 4  → UI de criação: public/gerar-<tipo>.html + montador-<tipo>.html
Fase 5  → FIDELIDADE: replicar o layout-fonte rigorosamente (só o design migra)
Fase 6  → perguntas norteadoras: banco em pysrc/perguntas/banks/<tipo>.py
Fase 7  → generalizar features novas como plataforma (nunca por tipo)
Fase 8  → gerar um caso real, validar e conferir na UI
```

---

## Fase 0 — Entender a fonte e decidir o tipo

1. Reunir os insumos: o(s) CSV(s), o **dashboard/gerador de referência** (HTML/JS/py) e
   qualquer doc de regras de cálculo. Se o gerador-fonte for JS, as fórmulas serão
   **portadas para Python** — leia-o como especificação.
2. Definir:
   - **[TIPO]** — slug kebab-case (ex.: `criativos`). Vira `pysrcDir`, `controls.kind` e a
     pasta `pysrc/<tipo>/`.
   - **[LABEL]** — rótulo humano (ex.: "Análise de Criativos").
   - **Capacidades** (decidem campos do registry):
     - `supportsInsights` — tem zona de Insights gerada por IA? (Layer B1)
     - `renderScript` — tem **controles interativos** que recalculam a vista (toggles,
       filtros, pílulas)? → `pysrc/<tipo>/render_view.py`.
     - `queryScript` — tem **deep deepen** (cruzamentos sob demanda)? → `query_api.py` +
       `buildDeepenMeta` não-nulo. Sem isso, o deepen roda no **modo raso** (catálogo) e
       `buildDeepenMeta` retorna `null`.
     - **nav** — precisa de sidebar? Use `meta.nav` (Fase 7), nunca um nav exclusivo.
3. Registrar [CSV_PATH] e ler as 5 primeiras linhas para conferir separador/encoding.

## Fase 1 — Mapear o CSV → dataset

O `dataset.json` é um mapa `nome → { dims:[colunas-chave], filters:[], rows:[...] }` em
**formato longo** (uma linha por combinação de dims). Os widgets nunca carregam número:
fazem `bind` a uma tabela do dataset. Liste:
- As **entidades** (linhas do recorte: criativo, lançamento, evento…) → viram `dims`.
- As **métricas numéricas** por entidade → viram colunas/`y` dos widgets.
- Os **recortes** (por temperatura, canal, campanha…) → tabelas long extra (`dims` com a
  dimensão de quebra). Veja `historico-lancamentos/build_report.py` (`add_table`,
  `lc_brk_*`) como modelo.

## Fase 2 — Motor (Python determinístico)

**`pysrc/<tipo>/calc.py`** — stdlib pura (sem pandas). Lê o CSV (`csv.DictReader`), agrega
e devolve estruturas Python. O **número só nasce aqui**; o LLM nunca o inventa. Reuse de
`common`: `fmt.py` (money/pctf/xf/intf/safe/fmtval) na serialização.

**`pysrc/<tipo>/build_report.py`** — implemente o contrato:
```python
def assemble(rows, config, content, opts=None):  # puro → {dataset, data, layout, sections}
def build(csv_path, config, content, out_dir):    # carrega CSV, chama assemble, grava
```
- Monte o `dataset` (Fase 1), as `sections` (sXX.json: `{id, header, widgets}`) e o
  `layout` com `common.layout.Grid` (`pg.add(id, type, w, h)` → `pg.items`).
- `data.json` = `{ meta:{client,title,type:'dashboard',theme:'light',created_at,filters:[],
  controls:{kind:'<tipo>', pages:[...] , ...}, nav?}, pages:[{id,label,sections:[{id,label}]}] }`.
- Use SEMPRE `common.preserve.preserve(out_dir, data, sections)` antes de gravar (não perde
  trabalho do consultor numa regeração).
- Widgets: só os do design system (ver CONTRATO.md/BLOCKS.md). **Proibido** card ad-hoc.
  Altura de gráfico via JS (`height` no widget), nunca CSS.

## Fase 3 — Registrar o tipo

Em `app/src/server/typeRegistry.ts`, adicione a entrada em `TYPES`:
```ts
'<tipo>': {
  type: '<tipo>', label: '[LABEL]', pysrcDir: '<tipo>',
  supportsInsights: <bool>, controlsKind: '<tipo>',
  renderScript: 'render_view.py'?, queryScript: 'query_api.py'?,
  gerarPage: 'gerar-<tipo>.html', montadorPage: 'montador-<tipo>.html',
  validateConfig(config) { /* [] = ok */ },
  buildDeepenMeta(config) { return null /* ou {criterios,canais,metricas} */ },
}
```
`pygen.ts` já despacha por `pysrcDir` — não precisa tocar. Adicione o link de criação em
`app/public/index.html` (`/gerar-<tipo>.html`).

## Fase 4 — UI de criação

Clone `public/gerar-historico.html` → `gerar-<tipo>.html` e `montador-historico.html` →
`montador-<tipo>.html`, ajustando os campos do `config` ao tipo. O `gerar` faz upload do
CSV + `config` e posta para `POST /api/:client/:slug/generate` (campo `type` = `<tipo>`),
que roda o `build_report` e grava as 4 camadas.

## Fase 5 — Fidelidade de layout

Se há um dashboard-fonte, **replique-o rigorosamente**: mesmas páginas, seções, blocos e
ordem. Só o **design** migra para o design system do app (widgets, tokens, superfícies
semi-transparentes). Confira lado a lado com a fonte antes de validar.

## Fase 6 — Perguntas norteadoras

Se o material traz perguntas norteadoras, crie um **banco**:
`app/pysrc/perguntas/banks/<tipo>.py` com:
```python
TYPE = '<tipo>'
def detect(ds): ...            # reconhece o dataset.json deste tipo (ex.: por nome de tabela)
def evaluate_all(ds): ...      # [{id, pergunta, justificativa, relevancia, nivel, kpis,
                               #   deepen:{sectionId, blockId, prompt}}] — relevância sobre os números
```
Registre em `app/pysrc/perguntas/banks/__init__.py` (`from . import <tipo>` + `BANKS`). A
ordem importa: o primeiro `detect` verdadeiro vence. Cada pergunta "seguida" gera um
detalhamento (deepen) — preencha `deepen` apontando para uma seção/bloco reais.

## Fase 7 — Generalizar features novas (NÃO exclusivas)

Para cada recurso novo da análise, pergunte: "isto deveria existir para qualquer análise?"
Se sim, generalize:
- **Nav lateral (sidebar):** `data.json.meta.nav: 'topnav' | 'sidebar'` (default `topnav`).
  O shell (`report.html`/`navigation.ts`/`style.css`) lê `meta.nav`; qualquer tipo ativa
  via `build_report`. Não crie um nav exclusivo.
- **Modos de KPI / toggles:** via `meta.controls` + um widget reutilizável (ex.:
  `metric-toggle`), não um componente do tipo.
- **Widget novo:** se precisar de um bloco que não existe, adicione-o ao renderer + ao
  validador (`WIDGET_TYPES`) como um widget de plataforma, documentado no BLOCKS.md.

## Fase 8 — Gerar, validar e conferir

> **Cuidado (multi-tenant):** a home lista só análises de clientes que o consultor
> **possui** (`user_clients`). O fluxo `/generate` (UI) faz `assignClient` automaticamente;
> mas se você gerar por script (`gen_<tipo>.py`), o cliente fica **órfão** e não aparece na
> home (embora renderize em `/report/<cliente>/<slug>`). Atribua a posse ao usuário —
> ex.: `assignClient(db, userId, '<cliente>')` — ou gere pela UI.

1. `temp/<cliente>/gen_<tipo>.py` (config + content) → grava em `output/<cliente>/<slug>/`.
2. `cd app && npx tsx scripts/validate.ts <cliente>/<slug>` → 3 camadas válidas.
3. `npm run build` (TS limpo) + `npm test` (suíte verde; adicione um teste de `assemble`).
4. Subir o app (`/setup` ou `node dist/server/index.js`, porta 3131) e abrir
   `/report/<cliente>/<slug>`: conferir layout vs. fonte, a página de **Perguntas**, e
   qualquer feature generalizada (sidebar) — **e que os outros tipos seguem intactos**.

---

## Checklist final (todos os pontos de toque)

- [ ] `pysrc/<tipo>/calc.py` + `build_report.py` (3 camadas, `assemble`/`build`).
- [ ] (se interativo) `render_view.py`; (se deep deepen) `query_api.py` + `buildDeepenMeta`.
- [ ] Entrada em `typeRegistry.ts` (`TYPES['<tipo>']`).
- [ ] Link em `public/index.html` + `public/gerar-<tipo>.html` + `montador-<tipo>.html`.
- [ ] Banco de perguntas em `pysrc/perguntas/banks/<tipo>.py` + registro no `__init__.py`.
- [ ] Features novas generalizadas via `meta` (sidebar etc.) — nada hardcoded por tipo.
- [ ] Caso real gerado + `validate.ts` ok + `npm run build`/`npm test` verdes.
- [ ] Conferência visual na UI (layout fiel + perguntas + feature nova) antes de commit.
