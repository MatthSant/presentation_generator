# Metas do lançamento

**Saída:** `config.metas` (manual) **ou** `goals.csv` (tabela de launch goals; tem prioridade). **Confirmar com o consultor.**

## Definição
Sem metas o relatório não tem semáforo de desvio nem riscos: mostra os números, mas não diz se estão bons. As metas são do lançamento **inteiro**, não por canal ou temperatura.

| Chave | O que é | Clássico | Pago |
|---|---|---|---|
| `_leads_total` | leads (ou ingressos) esperados no lançamento todo | leads | ingressos |
| `_leads_td` | leads esperados até a data de corte | leads | ingressos |
| `cpl` | custo por lead | CPL | vira CAC (custo por ingresso) |
| `cpmql` | custo por lead qualificado | CPMQL | — |
| `taxa_resp` | % de leads que respondem a pesquisa | % | % |
| `taxa_qual` | % de respondentes qualificados (MQL / respostas) | % | % |

## Como levantar
1. Primeiro tente a tabela: rode `queries/goals.sql` (`montar_query` devolve preenchida). Se voltar linhas, salve como `goals.csv` e passe `--goals goals.csv` ao `gerar.py`; não preencha `config.metas`.
2. Se não houver launch goals, pergunte ao consultor os valores acima. Aceite "não sei" para as taxas: os benchmarks de funil (CTR 1%, Connect 80%, Conv. Página 40%) já entram como meta-padrão.
3. `_leads_td` = meta total × (dias decorridos ÷ dias da campanha) se o consultor não tiver a curva.

## Exemplos
- Consultor: "3.000 leads em 20 dias, CPL até 9, CPMQL até 25, resposta 40%, qualidade 40%" no dia 16 → `_leads_total: 3000, _leads_td: 2400, cpl: 9, cpmql: 25, taxa_resp: 40, taxa_qual: 40`.

## Casos ambíguos
- Meta em receita (pago): o motor deriva; passe `_leads_total` como ingressos e `cpl` como CAC-alvo.
- Metas diferentes por canal: não existe no template; use a global e registre a observação no documento.

## Saída (formato exato)
```json
"metas": { "cpl": 9, "cpmql": 25, "taxa_resp": 40, "taxa_qual": 40, "_leads_total": 3000, "_leads_td": 2400 }
```
