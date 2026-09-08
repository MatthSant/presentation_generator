# Dicionário de links (preview do anúncio) — opcional

**Saída:** `dict.csv` (`--dict`) ou nada. Não precisa confirmar.

## Definição
Um CSV `field_ad_name → URL do post` faz a ficha de cada criativo embutir o preview do Reels/anúncio. Sem ele, a ficha funciona, só sem preview. A 1ª coluna é a chave (nome exato do anúncio); a 2ª, a URL (qualquer nome de coluna).

## Como levantar
1. `montar_query('criativos', {...})` → a query `dict`. Rode no Delfos e salve como `dict.csv`.
2. Passe `--dict dict.csv`.
3. Se o export vier com `;`, tudo bem: o leitor detecta o delimitador.

## Casos ambíguos
- Conta sem `facebook_ads.creative_history` (Fivetran não sincroniza criativos): a query volta vazia; siga sem dicionário.
- URL nula para alguns anúncios: a ficha desses fica sem preview; normal.

## Saída
`dict.csv` com duas colunas: `field_ad_name, post_url`.
