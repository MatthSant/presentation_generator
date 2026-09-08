# Dicionário de links dos criativos (opcional)

**Saída:** `dict.csv` (1ª coluna `field_ad_name`, 2ª coluna a URL). Não precisa confirmar.

## Definição
Liga cada criativo (nome do anúncio) ao post real, para o bloco de criativos do relatório abrir o anúncio. Sem ele o bloco mostra só o nome.

## Como levantar
1. Rode `queries/dict.sql` preenchida. Salve como `dict.csv`.
2. Passe `--dict dict.csv` ao `gerar.py`.

## Casos ambíguos
- Export com `;` como separador: o `calc.py` detecta o delimitador; não converta à mão.
- Nome de anúncio repetido em vários ad_id: a query já pega o mais recente.
