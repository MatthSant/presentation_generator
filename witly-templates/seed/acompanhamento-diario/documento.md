# Documento: Acompanhamento diário de campanha

O que o `gerar.py` produz e onde cada número aparece. O relatório é **determinístico**:
nasce do `calc.py` e do `build_report.py`, sem prosa de modelo. O agente lê os números
em `numeros.json` (placeholders abaixo) e escreve por cima quando o consultor pedir.

## Cabeçalho
- Título: `{{numeros.nome}}` · dia `{{numeros.dia_campanha}}` de campanha · corte `{{numeros.corte_label}}` · emitido `{{numeros.report_date}}`.

## Seção única — página "Acompanhamento"

### Captação
- Leads captados acumulados por dia contra as linhas de meta (total `{{numeros.meta._leads_total}}` e to-date `{{numeros.meta._leads_td}}`).
- Atingimento: `{{numeros.tot.leads}}` leads (`{{numeros.meta_status.leads.dev}}`% vs meta to-date).
- Pago × Orgânico: `{{numeros.split.leads_pago}}` pagos (`{{numeros.split.pct_pago}}`%) · `{{numeros.split.leads_org}}` orgânicos.

### KPIs macro (geral · últimos 3 dias · tendência · desvio vs meta)
| KPI | Geral | Últimos 3 dias | Meta | Desvio |
|---|---|---|---|---|
| Investimento | `{{numeros.tot.investimento}}` | `{{numeros.d3.investimento}}` | `{{numeros.meta.investimento}}` | `{{numeros.meta_status.investimento.dev}}` |
| Leads | `{{numeros.tot.leads}}` | `{{numeros.d3.leads}}` | `{{numeros.meta.leads}}` | `{{numeros.meta_status.leads.dev}}` |
| CPL | `{{numeros.tot.cpl}}` | `{{numeros.d3.cpl}}` | `{{numeros.meta.cpl}}` | `{{numeros.meta_status.cpl.dev}}` |
| Taxa de resposta | `{{numeros.tot.taxa_resp}}` | `{{numeros.d3.taxa_resp}}` | `{{numeros.meta.taxa_resp}}` | `{{numeros.meta_status.taxa_resp.dev}}` |
| Taxa de qualidade | `{{numeros.tot.taxa_qual}}` | `{{numeros.d3.taxa_qual}}` | `{{numeros.meta.taxa_qual}}` | `{{numeros.meta_status.taxa_qual.dev}}` |
| CPMQL | `{{numeros.tot.cpmql}}` | `{{numeros.d3.cpmql}}` | `{{numeros.meta.cpmql}}` | `{{numeros.meta_status.cpmql.dev}}` |

Semáforo: `cls` = `ok` (dentro de 5%), `warn` (5–15%), `bad` (>15%); em custo, subir é pior.

### Principais riscos
- Até 2 KPIs macro fora da meta, com texto de impacto: `{{numeros.risks_macro}}` (lista; vazia = nenhum risco).

### Evolução diária
- Séries por dia em `{{numeros.days}}`: leads, investimento, CPL, taxa de qualidade, CPMQL (cada item tem `date`, `label`, `sums`).
- Tendência (média dos últimos 3 dias vs início): `{{numeros.trend}}`.

### Canais e audiência
- Origem do tráfego: `{{numeros.split}}` e canais orgânicos `{{numeros.canais_org}}`.
- Temperatura (só tráfego pago): `{{numeros.temp}}` — leads, investimento, CPL, CPMQL, qualidade por Quente/Morno/Frio/Advantage.
- Tipo de lead (novos × antigos × clientes): `{{numeros.tipo_lead}}`.
- Criativos (maior volume / maior qualificação, até o corte): `{{numeros.criativos}}`.

### Tráfego pago
- Indicadores: CPM `{{numeros.tot.cpm}}` · Hook `{{numeros.tot.hook}}` · Hold `{{numeros.tot.hold}}` · CTR `{{numeros.tot.ctr}}` · Connect `{{numeros.tot.connect}}` · Conv. de página `{{numeros.tot.conv_pag}}` — cada um com benchmark em `{{numeros.meta}}` e status em `{{numeros.meta_status}}`.
- Riscos de tráfego: `{{numeros.risks_traf}}`.
- Funil total `{{numeros.funnel_total}}` e últimos 3 dias `{{numeros.funnel_3d}}`: etapas com taxa, benchmark e o **maior furo** (maior queda relativa ao benchmark).

## Lançamento pago (`tipo_funil = lancamento-pago`)
Mesma estrutura; os KPIs macro passam a ser exposição de caixa, ingressos, CAC, ROAS, receita de ingresso e order bump, ticket médio. `{{numeros.pago}}` = true.

## Onde o agente pode escrever
- O HTML é a v0. Para acrescentar leitura, edite `s01.json` (widgets `find-block`/`find-note`, sempre citando o número de `numeros.json`) e rode de novo o `gerar.py` **sem** o `--csv` novo, ou edite o HTML diretamente.
- Para recortes que o relatório não mostra (CPL por dia só do Quente, decomposição do CPL, onde a piora se concentra): `python/query_api.py`.
