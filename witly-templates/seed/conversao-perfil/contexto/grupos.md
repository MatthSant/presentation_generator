# Grupos de cada critério: ordem, aliases, rótulos curtos

**Saída:** para cada critério, `order`, `aliases`, `short_labels`, `ordinal`, `cores`. **Confirmar com o consultor** com a tabela valor bruto → grupo final.

## Definição
As respostas da pesquisa vêm despadronizadas ("R$ 3 a 10 mil", "3-10k", " R$3.000 a R$10.000 "). Antes de agregar, o kit aplica `aliases` (bruto → canônico), depois match exato, depois por prefixo (`conv_calc.make_canon`). Valor sem match vira grupo próprio: **anomalia a reportar** e pedir o alias.

- **`order`** = os grupos canônicos na **sequência natural**: faixas ordinais (idade, renda, patrimônio, tempo) ascendentes, com "Prefiro não informar" por último (`ordinal: true`); nominais (gênero, perfil) na ordem que fizer sentido. Gráficos, heatmaps e tabelas seguem o `order`; só o ranking ordena por diff.
- **`short_labels`** = rótulo curto por grupo (eixo dos gráficos).
- **`cores`** = paleta (6 tons, do roxo ao verde).

## Query de apoio (Delfos)
```sql
SELECT renda_mensal AS valor, COUNT(*) AS leads
FROM "MAT_V2_inscricoes_geral_det"
WHERE renda_mensal IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC LIMIT 40;
```
(uma por critério.)

## Como executar
1. Para cada critério, rode a query e liste os valores distintos com volume.
2. Proponha os grupos canônicos e o mapeamento; valores com < 1 % dos leads podem virar alias de um grupo maior ou "Outros".
3. Mostre `bruto | leads | grupo final | ordem`. Confirme.
4. Grupos com menos de 3 % dos respondentes: o relatório marca "amostra pequena"; não os apague, mas não conclua sobre eles.

## Casos ambíguos
- Faixas que mudaram entre lançamentos (a pesquisa foi editada): mapeie as antigas para as novas quando houver correspondência inteira; senão, mantenha separadas e avise que o histórico tem quebra.

## Saída (formato exato, por critério)
```json
{ "id": "renda", "col": "renda_mensal", "label": "Renda mensal", "tab": "Renda", "abbr": "Renda", "ordinal": true,
  "order": ["Até R$ 3.000", "R$ 3.000 a R$ 10.000", "Acima de R$ 10.000", "Prefiro não informar"],
  "aliases": { "ate 3 mil": "Até R$ 3.000", "3-10k": "R$ 3.000 a R$ 10.000" },
  "short_labels": { "Até R$ 3.000": "<3k", "R$ 3.000 a R$ 10.000": "3–10k", "Acima de R$ 10.000": ">10k" },
  "cores": ["#4C1D95", "#7C3AED", "#3B82F6", "#0EA5E9", "#0D9488", "#10B981"] }
```
