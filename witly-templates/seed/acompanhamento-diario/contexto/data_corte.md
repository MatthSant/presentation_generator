# Data de corte e data do report

**Saída:** `config.data_corte` (AAAA-MM-DD), `config.data_report` (AAAA-MM-DD). **Perguntar ao consultor antes de gerar**: proponha o padrão abaixo (corte = ontem, report = hoje) e peça confirmação; o consultor pode querer outro dia.

## Definição
- **Data de corte**: o último dia com dado **completo**. Criativos, funil dos últimos 3 dias e tendência respeitam o corte, não o último dia absoluto do dump.
- **Data do report**: o dia em que o documento é gerado (aparece no cabeçalho).

## Como levantar
1. `data_report` = hoje.
2. `data_corte` = **ontem**, salvo se o dump ainda não tiver o dia de ontem completo (mídia costuma fechar de madrugada). Regra prática: o último dia do dump cujo `invest_total` total não caiu mais de 50% em relação ao dia anterior.
3. Pergunte: "fecho o relatório em <ontem> com report de <hoje>? ou outra data?" Se o consultor pedir um corte específico ("fecha em 05/09"), use o dele.

## Exemplos
- Hoje 07/09, dump vai até 07/09 com investimento parcial → corte 06/09.
- Consultor quer o report "de sexta" numa segunda → corte = sexta, report = segunda.

## Casos ambíguos
- Dump com buracos (dia sem linha): o motor trata dia sem lead como zero; avise no documento se o buraco for de integração, não de campanha.

## Saída
```json
{ "data_corte": "2026-09-06", "data_report": "2026-09-07" }
```
