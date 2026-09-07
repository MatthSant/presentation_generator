# Plano: Fase 3 — os outros quatro templates

**Branch**: `feat/mcp-templates` · **Data**: 2026-09-07 · **Spec**: [spec.md](spec.md)

## Resumo

Nenhuma mudança de plataforma: tudo entra pelo `seed/`. O trabalho é (1) generalizar o
`gerar.py` (um só, em `seed/_shared/`, copiado pelo kit-assemble) para qualquer motor do
app, com `--opts` via `assemble`, auxiliares (`--goals`, `--dict`, `--hist`, `--content`) e
`required_files` do manifesto; (2) escrever quatro kits de conteúdo (manifesto, tarefas de
contexto, queries dos montadores, guia, documento) com fixture, testes e paridade; (3)
publicar. Ordem: debriefing → criativos → histórico → conversão por perfil.

## Verificação da constituição

| Princípio | Plano |
|---|---|
| I–III | Motores do app copiados; números do calc; prosa do conversao-perfil via `content.json` (bind). |
| IV | Tarefas de contexto por template; as que coincidem (lançamento, temperatura, data) são escritas em cada um. |
| V | Kits autossuficientes: `gerar.py` compartilhado vai dentro de cada zip; design system da plataforma entra em todos. |
| VI–VII | UI/MCP intactos; `kit-assemble`/`seed` já são genéricos por `manifest.engine`/`perguntas_bank`. |
| VIII/IX | Este plano + tasks.md; `unittest` + paridade por kit. |

## Decisões de desenho

### D1. `gerar.py` genérico (`seed/_shared/gerar.py`)
- Descobre o motor pelo `manifest.json` do kit (`engine`, `required_files`, `aux`), importa
  `calc`/`build_report` do próprio kit.
- Sem `--opts`: `build_report.build(csv, config, content, out)` (preserva o que o app faz).
  Com `--opts`: `rows = calc.load_rows(csv)` → `assemble(rows, config, content, opts)` → grava
  as 4 camadas (sem `preserve`, é um snapshot).
- Auxiliares: `--goals` → `config.goals_csv`; `--dict` → `config.dict_csv`; `--hist` →
  `config.hist_csv`; `--content` → `content.json` (senão um `DEFAULT_CONTENT` mínimo).
  `required_files` do manifesto (ex.: `["goals"]`) → erro antes de gerar se faltar.
- `numeros.json`: se o `calc` expõe `build(rows, config)` → resumo sem linhas cruas; senão,
  um resumo genérico a partir do `dataset.json` (tabelas, dims, nº de linhas).
- `perguntas.json` e `relatorio.html` como hoje; `--rerender` idem.
- O kit do acompanhamento passa a usar o mesmo arquivo (remove o `gerar.py` próprio).

### D2. Estrutura por kit
```
seed/<slug>/
├── manifest.json  (engine, perguntas_bank, required_files, params, queries[+when], tarefas_contexto, config exemplo, como_gerar, arquivos)
├── contexto/*.md · queries/*.sql · guia.md · documento.md
└── python/tests/{make_fixture.py, config.json, test_kit.py}   (+ goals.csv/dict.csv sintéticos quando o tipo pede)
```
Motor, `common/`, `perguntas/`, `gerar.py` e `aprofundar.py` são copiados pelo kit-assemble
(`aprofundar.py` também vai para `_shared`).

### D3. Fixtures sintéticas
- **debriefing**: 3 semanas × 2 fontes (facebook pago, instagram orgânico) × 2 campanhas
  (captação `cadastro-…` quente/frio + 1 de vendas) com leads, respostas, MQLs, vendas,
  faturamento; `goals.csv` com metas por dia; `hist.csv` opcional pequeno.
- **criativos**: 4 anúncios × 5 dias × 2 públicos; `dict.csv` com 2 links.
- **histórico**: 3 eventos × pago/orgânico × 2 plataformas × 3 temperaturas.
- **conversão por perfil**: 2 lançamentos × 2 canais × 2 critérios (renda 3 faixas, idade 3
  faixas) + linhas benchmark (dimensões vazias).
Valores inteiros e determinísticos; os testes conferem somas conhecidas + paridade.

### D4. Tarefas de contexto novas
- `recorte` (debriefing: filtros; criativos: modo; histórico: lançamentos + métrica): explica
  as opções, **pergunta ao consultor** e sai como `--opts`.
- `metas` do debriefing: obrigatória, só `goals.csv` (tabela `wtl_launch_goals`), com o
  formato exato; `historico` (opcional, CSV do lançamento anterior).
- `classificacao` (debriefing/criativos): fonte paga (`utm_source`), campanha de captação
  (prefixo) e temperatura — regras do config.
- `criterios` e `canais` (conversão por perfil).

### D5. Paridade e seed
`parity.mjs <slug> <engine>` já é parametrizado; `npm run parity` roda os 5. `seed.mjs`
publica todos os kits de `seed/` (já iterava); o `debriefing` rascunho de produção é
substituído pela versão publicada do seed.

## Estrutura (novo)
```
seed/_shared/{gerar.py, aprofundar.py}
seed/debriefing/ · seed/criativos/ · seed/historico-lancamentos/ · seed/conversao-perfil/
scripts/kit-assemble.mjs (copia _shared + engine + bank; lê required_files)
```

## Riscos
- Motores com `assemble` de assinatura diferente (conversao-perfil sem `opts`): o `gerar.py`
  trata `opts` ausente.
- Fixtures do debriefing precisam acionar as 7 páginas (colunas de vendas/refund/pageviews):
  validar contra o `detect` do banco (`deb_kpis` + `deb_temp`).
- Volume de conteúdo (guias/contextos) é o maior custo; reaproveitar `guias.json` e `focus`.
