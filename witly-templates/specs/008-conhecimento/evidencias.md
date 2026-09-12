# Evidências — Spec 008, fases 1 e 2 (2026-09-12)

## Banco (migração 0011, seed local)
- FTS5 com `unicode61 remove_diacritics 2`, triggers de histórico e `json_object` funcionam no D1 do
  Vitest e no D1 local do wrangler: busca por `liquido` acha "ROAS é líquido"; cada gravação que muda
  conteúdo gera uma linha em `conhecimento_hist` (28 entradas → 56 linhas: v1 da migração, v2 do seed).
- Os 28 contextos gerais migraram como `sempre` e o seed os reclassificou (autor `seed`, versão 2):
  18 `regra` (11 operacionais, 7 táticas), 3 `metrica`, 3 `estilo`, 2 `definicao`, 1 `metodo` (witly),
  1 `padrao` de design. Re-rodar o seed sem mudança não gera versão nova (upsert com `WHERE ... IS NOT`).

## Browser (wrangler dev, `/ui/dev-login`)
- `#/gerais` continua funcionando sobre o conhecimento (rota compatível): a lista mostra as 28 com o
  rótulo antigo (REGRA/RECOMENDAÇÃO/DEFINIÇÃO derivado de tipo + força).
- `/api/conhecimento?tipo=metrica` devolve as 3 métricas com `dados.formula`, `melhor`, `armadilhas`,
  gatilhos e versão 2.
- `/api/conhecimento/saude`: por tipo, `sempre` 28/40 e **7,6 KB** — foi o que fez o orçamento do
  nível 0 subir de 3 KB para 10 KB (título + 1 linha de 40 entradas não cabe em 3 KB); 28 não
  verificadas; 0 propostas.
- `/api/config`: `votos: 2`, `dias_pendente: 30`, limites.

## MCP (Vitest, `test/conhecimento.test.ts`, 5 testes)
- Esquema: 17 tipos em 6 famílias; título > 200 recusado; `conceito` sem `onde_aparece`/`cuidado`
  recusado; `metodo` framework sem nome recusado; escopo e nível inválidos recusados; normalização
  (id do título, tags sem acento, enum minúsculo, gatilho `sempre`).
- Tool `conhecimento`: exige um filtro; índice em 1 linha (`id · tipo · nível · título — puxe …`,
  "(não verificada)"); filtros por tipo, nível estratégico, funil, `situacao` + `resultado` (o que
  funcionou) em `completo` com os campos; completo registra uso; `origem: framework` sem resultado.
- `obter_template`: nível 0 no topo com a urgente do editor e a instrução "pergunte ao consultor";
  urgente de leitor sem +1 de editor não aparece; `sempre` em 1 linha; índice só com o método
  escopado ao template (o de outro template fica fora); "Ao terminar" pede `usadas`.
  Resource `conhecimento://<id>` e alias `contexto://geral/<slug>`.
- Propostas: `sugerir` valida motivo, campos do tipo, evidência em urgente e dado pessoal; parecida
  listada na resposta; idêntica só conta ocorrência (2); 2 votos aprovam uma normal (`aprovada_por =
  votos`) e a entrada nasce; reverter (só editor) tira do ativo; edição aprovada = versão 2 e reverter
  volta o título (versão 3, histórico intacto); recusada é lembrada ("Já recusado em … : motivo");
  urgente com 2 confirmações no chat continua aberta, editor aprova na UI e a métrica vira `sempre`;
  `registrar` com `usadas` conta uso (id inexistente ignorado); saúde e `PUT /api/config`.

## Suíte
- Vitest: 19 arquivos, **90** testes (5 novos); `tools.test`/`api.test` ajustados ao novo bloco.
- Typecheck limpo.
