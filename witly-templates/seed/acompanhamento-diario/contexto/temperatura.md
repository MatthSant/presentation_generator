# Temperatura das campanhas

**Saída:** `config.temp_rules` (lista de regras) e `config.temp_overwrite: true`. **Confirmar com o consultor** mostrando a tabela campanha → temperatura antes de gerar.

## Definição
Temperatura é o estágio do público que a campanha atinge:
- **Quente**: já conhece a marca — remarketing, envolvimento, lista, visitantes do site.
- **Morno**: parecido com quem já converteu — lookalike (LAL), públicos semelhantes.
- **Frio**: nunca viu a marca — interesses, público aberto, amplo.
- **Advantage**: a Meta decide (Advantage+ / ADV); tratar à parte porque mistura os três.

Por que importa: o CPMQL usa a **qualidade do tráfego pago**, e a qualidade cai do quente para o frio. Sem temperatura, a tabela "por temperatura" some e a leitura de custo vira média cega.

## Regra padrão (palavras-chave no nome da campanha, sem distinguir maiúsculas)
A **primeira** regra que casar vence; a ordem é a prioridade.

| Temperatura | Contém |
|---|---|
| Quente | `hot-`, `quente-`, `hot`, `rmkt`, `remarketing`, `envolvimento`, `engaj`, `lista`, `visitantes` |
| Morno | `warm-`, `morno-`, `warm`, `lal`, `lookalike`, `semelhante` |
| Frio | `cold-`, `frio-`, `cold`, `interesse`, `aberto`, `amplo`, `broad` |
| Advantage | `adv-`, `adv`, `advantage`, `asc` |

## Query de apoio (Delfos)
```sql
SELECT field_campaign_name, SUM(invest_total) AS invest, SUM(leads) AS leads
FROM "VW_V2_inscricoes_res_METRICAS"
WHERE field_conversion = '<field_conversion>' AND invest_total > 0
GROUP BY 1 ORDER BY 2 DESC;
```
(No pago, troque a view por `VW_V2_inscricoes_pago_res`.)

## Como executar
1. Rode a query de apoio e aplique a regra padrão a cada nome.
2. Monte a tabela `campanha | investimento | temperatura proposta` e mostre ao consultor.
3. Ajuste o que ele corrigir **acrescentando** palavras-chave às regras (não classifique à mão por campanha — a regra é o que vai no config e o que vale para os dias seguintes).
4. Só então gere.

## Exemplos
- `LCTO-SET26 | HOT-RMKT-ENVOLVIMENTO | 7d` → Quente
- `LCTO-SET26 | LAL 1% compradores` → Morno
- `LCTO-SET26 | COLD interesses maternidade` → Frio
- `LCTO-SET26 | ADV+ shopping` → Advantage
- Enganoso: `COLD-RMKT-teste` → a primeira regra que casa é **Quente** (`rmkt`); se o consultor disser que é frio, mova `rmkt` para depois ou adicione o nome exato à regra Frio.

## Casos ambíguos
- Nome sem nenhuma palavra-chave → cai em "Indefinido"; pergunte ao consultor e acrescente a palavra à regra certa.
- Campanha orgânica (sem investimento): não entra na tabela de temperatura; não pergunte.
- Cliente com convenção própria (ex.: `T1/T2/T3`): crie as regras dele; a regra padrão é ponto de partida, não lei.

## Saída (formato exato do calc.py)
```json
"temp_rules": [
  { "contains": ["hot-", "quente-", "hot", "rmkt", "remarketing"], "label": "Quente" },
  { "contains": ["warm-", "morno-", "warm", "lal", "lookalike"], "label": "Morno" },
  { "contains": ["cold-", "frio-", "cold", "interesse", "aberto"], "label": "Frio" },
  { "contains": ["adv-", "adv", "advantage"], "label": "Advantage" }
],
"temp_overwrite": true
```
