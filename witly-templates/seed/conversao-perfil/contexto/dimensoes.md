# Dimensões: quais critérios de perfil entram

**Saída:** a lista de colunas espelhada nos 4 pontos `[DIMS]` da query e `config.criterios[].{id, col, label, tab, abbr}`. **Confirmar com o consultor.**

## Definição
Cada coluna de perfil da base de inscrições pode virar um **critério** (uma página do relatório). Colunas padrão em `MAT_V2_inscricoes_geral_det`: `renda_mensal`, `idade`, `genero`, `tempo_acompanhamento`, `escolaridade`, `profissao` (cuidado: alto volume de valores). Flags: `cliente_inscrito`, `lead_novo`, `hotlead`. Campos próprios: `custom_field_1` … `custom_field_5`, cujo **significado varia por cliente e no tempo**: nunca presuma; pergunte.

Regra prática: 3 a 6 critérios. Cada critério a mais multiplica as linhas do dump (combinações) e o tempo da codependência.

## Query de apoio (Delfos)
```sql
SELECT
  COUNT(*) AS leads,
  COUNT(renda_mensal) AS renda, COUNT(idade) AS idade, COUNT(genero) AS genero,
  COUNT(tempo_acompanhamento) AS tempo, COUNT(escolaridade) AS escolaridade,
  COUNT(custom_field_1) AS cf1, COUNT(custom_field_2) AS cf2, COUNT(custom_field_3) AS cf3
FROM "MAT_V2_inscricoes_geral_det";
```
Depois, para cada `custom_field_N` com cobertura:
```sql
SELECT custom_field_1 AS valor, COUNT(*) FROM "MAT_V2_inscricoes_geral_det"
WHERE custom_field_1 IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 15;
```

## Como executar
1. Rode a cobertura; descarte colunas com menos de ~20 % de respostas (o benchmark fica pequeno).
2. Para cada `custom_field_N` com cobertura, mostre os valores e pergunte: "o que é este campo? qual rótulo curto?"
3. Monte a lista final e edite a query nos 4 pontos `[DIMS]` (SELECT de inscricoes; SELECT e GROUP BY de lead_conversoes; SELECT e GROUP BY final). Colunas fora da lista saem dos 4 lugares.
4. Para cada critério: `id` (slug curto), `col` (nome da coluna), `label` (nome completo), `tab` e `abbr` (nome curto da aba).

## Casos ambíguos
- `profissao` com centenas de valores: só entra depois de padronizada (tarefa grupos) ou não entra.
- Campo que mudou de significado entre lançamentos: não entra, ou entra com quebra declarada.

## Saída (formato exato)
```json
"criterios": [
  { "id": "renda", "col": "renda_mensal", "label": "Renda mensal", "tab": "Renda", "abbr": "Renda" },
  { "id": "idade", "col": "idade", "label": "Faixa etária", "tab": "Idade", "abbr": "Idade" },
  { "id": "objetivo", "col": "custom_field_2", "label": "Objetivo com o curso", "tab": "Objetivo", "abbr": "Objetivo" }
]
```
(`order`, `aliases`, `short_labels`, `ordinal`, `cores` vêm da tarefa "grupos".)
