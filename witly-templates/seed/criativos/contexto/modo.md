# Modo, temperatura e investimento mínimo (recorte do relatório)

**Saída:** `--opts '{"mode": "resultado"|"captacao", "temp": "<temperatura>", "min_invest": <valor>}'` ou nenhum. **Perguntar ao consultor antes de gerar.**

## Definição
No app o relatório tem um toggle de **modo** e filtros de **temperatura** e **investimento mínimo** recalculados no servidor. O HTML offline traz os três **pré-calculados, um por vez** (o `gerar.py` gera um snapshot por opção; `--sem-filtros` desliga). Para **combinar** (ex.: Captação **e** só Frio) ou fixar o recorte como base, gere com `--opts`.
- **Resultado Final** (`resultado`, padrão): a campanha fechou; o veredito é ROAS líquido, retorno e CAC. As métricas de captação explicam o *como*.
- **Captação** (`captacao`): a venda ainda não fechou; o veredito é CPMQL projetado e a qualidade da captação (CPL, CPM, CTR, hook/hold, taxa de resposta, qualificação). **Não** julgue ROAS/CAC nesse modo.
- `temp`: restringe tudo a uma temperatura (KPIs, ranking, fichas).
- `min_invest`: criativos abaixo do valor saem dos totais/médias (tira ruído de testes de R$ 5).

## Como executar
1. Pergunte: "a campanha já fechou (Resultado Final) ou está captando (Captação)?" Se estiver em curso, o modo é Captação.
2. Pergunte se quer uma temperatura só e um piso de investimento (sugira o piso quando houver muitos criativos com gasto ínfimo: veja `numeros.json → criativos[].m.invest`).
3. Os dois modos já ficam no HTML (seletor Modo). Quer um recorte combinado → gere com `--opts` numa pasta à parte.

## Casos ambíguos
- Modo Resultado com vendas zeradas em todos os criativos: provavelmente a venda ainda não fechou; sugira Captação.
- `temp` que não existe nos dados: o kit ignora o filtro; confira `numeros.json → temps`.
