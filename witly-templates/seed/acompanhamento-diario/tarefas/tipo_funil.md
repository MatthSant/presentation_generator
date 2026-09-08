# Tipo de funil: clássico ou pago

**Saída:** `config.tipo_funil` = `lancamento-padrao` | `lancamento-pago`. **Confirmar com o consultor.** Decide QUAL query rodar (`dump` ou `dump_pago`) e qual mecânica o relatório usa.

## Definição
- **Clássico (`lancamento-padrao`)**: o lead entra de graça na captação; a venda acontece depois. O que manda é **CPL** (custo por lead), **CPMQL** (custo por lead qualificado) e as taxas de resposta/qualidade da pesquisa.
- **Pago (`lancamento-pago`)**: o lead **compra o ingresso** já na captação (evento pago, com order bump). Há receita desde o dia 1, então o que manda é **exposição de caixa** (investimento − receita), **ROAS**, **CAC** (custo por ingresso) e ticket médio. Não é um toggle de leitura: o lançamento é pago ou não é.

## Como levantar
1. Pergunte ao consultor: "o lead paga para entrar (ingresso) ou a captação é gratuita?"
2. Sinais na base, se precisar checar: no `wtl_campaign_definition` o `field_type`; na view pago (`VW_V2_inscricoes_pago_res`) há linhas com `receita_ingresso`/`bumps` para o lançamento.

## Exemplos
- Lançamento com lista de espera gratuita + evento ao vivo → clássico.
- "Semana X" com ingresso de R$ 47 e order bump → pago.

## Casos ambíguos
- Ingresso simbólico (R$ 1–5) ainda é **pago**: a mecânica de exposição vale.
- Captação gratuita com upsell na hora: continua **clássico**; o upsell é venda, não ingresso.

## Saída
`"tipo_funil": "lancamento-padrao"` ou `"tipo_funil": "lancamento-pago"`. Nunca outro valor.
