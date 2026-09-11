# Evidências — Spec 005 (2026-09-08)

## O kit
- `kit-assemble` deixa de copiar `query_api.py` e `perguntas/` e apaga cópias antigas; o kit do
  debriefing passou de 51 para 34 arquivos versionados (regras e perguntas viraram entradas, não
  arquivos). `gerar.py` não escreve `perguntas.json`.
- `test-kits` (unittest + paridade kit == app) verde nos 5 motores após a mudança; o teste do
  acompanhamento agora afirma que **não** existe `perguntas.json` nem página de perguntas no HTML.
- Viewer: `latin` só — `viewer.css` de 391 KB para 291 KB (9 faces em vez de 18).

## Entradas
- Seed local: acompanhamento 39 regras/perguntas · debriefing 41 · criativos 37 · histórico 45 ·
  conversão 29 · análise livre 5. Total: 73 perguntas (dos `banks/`, com `Ordem:` do banco),
  63 definições extraídas dos guias e 12 escritas do know-how do `query_api` (decomposição do CPL,
  onde a piora concentra, impacto em receita, variação vs histórico, gap vs benchmark, saturação,
  compensar CPM, cruzamento de critérios).
- UI: aba **Perguntas** do debriefing lista as 17 entradas (título = pergunta; corpo = como
  aprofundar); `kit 9/10` conta perguntas pelas entradas; aba Regras sem perguntas.
- `obter_template` traz "## Perguntas norteadoras" das entradas; `perguntas.md` do zip idem;
  `regras.md` não as lista (teste `agente.test.ts`).

## Triagem
- `sugerir_regra` → `activity.evento = 'sugestao'` → card "[definição] CPA = CPL ÷ conversão paga"
  na fila "sem veredito" com **Aceitar como entrada** / **Descartar**; a revisão mostra "Sugestão
  do agente" com tipo, corpo e motivo.
- Aceitar no browser criou `cpa-cpl-conversao-paga` (tipo `definicao`, corpo "Use a conversão do
  pago… Sugerida pelo agente.") no rascunho do `acompanhamento-diario` e tirou o item da fila
  (2 → 1). Veredito gravado como `regra`.
- `registrar` recusa `edicao`; `salvar_template` aceita `regras` (ids e títulos validados).

## Seed idempotente
- 1ª rodada: 6 templates publicados. 2ª rodada, sem mudança: "igual à publicada (hash), pulado"
  nos 6, `templates publicados: 0`.

## Testes
- Vitest: 15 arquivos, **78** testes (5 novos em `test/agente.test.ts`).
- `test-kits`: 5 kits OK, paridade OK.

## Emenda — análise livre no design system (2026-09-11)
- Antes/depois no browser: o exemplo antigo era uma página `topnav` com 4 widgets; o novo tem
  sidebar com Panorama (2 bandas, 4 KPIs globais, 8 de volume, comparativo meta-bars, série no
  tempo), Canais (destaque, 4 gráficos, tabela, 3 achados) e One Pager (4 KPIs, 2 funis com
  MAIOR FURO, barras, 2 achados largos, 3 ações) — o mesmo esqueleto do debriefing.
- Zip da análise livre baixado do worker local (v6, 1,4 MB comprimido): `exemplo/relatorio.html`
  (986 KB), `exemplos/debriefing.html` (1,09 MB), `exemplos/acompanhamento-diario.html` (984 KB),
  `python/relatorio.py`, `python/exemplo/{calc_livre,build,make_fixture_csv}.py`.
- `test_relatorio.py` (6): esqueleto do Panorama e do One Pager, `_numeros` citável, valor em
  texto recusado, bind inexistente recusado, prosa com número solto não grava, "53.6%" aceito.
  `test-kits` verde nos 6 kits (o `_norm_num` mudou o validador de todos).
- `test/exemplos.test.ts` (2): `exemplos/<slug>.html` no zip e `/dl` resolvendo `exemplos_de`.

