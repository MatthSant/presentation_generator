# Recorte do relatório (lançamento inteiro ou filtro)

**Saída:** `--opts '{"filters": {...}}'` ou nenhum. **Perguntar ao consultor antes de gerar.**

## Definição
No app, o debriefing tem um filtro no relatório (tipo pago/orgânico, canal, temperatura, campanha, público, criativo) recalculado no servidor. O HTML offline traz esses filtros **pré-calculados, um por vez** (o `gerar.py` gera um snapshot por valor de cada dimensão; `--sem-filtros` desliga). Para **combinar** dimensões (ex.: Facebook **e** quente) ou fixar um recorte como base do relatório, gere com `--opts`. O padrão é o lançamento inteiro.

## Como executar
1. Pergunte: "quer o debriefing do lançamento inteiro (com os filtros no HTML), ou já recortado (ex.: Facebook e quente juntos; só uma campanha)?"
2. Inteiro → não passe `--opts`.
3. Recorte → `--opts` com as chaves que o `render_view.py` aceita: `tipo` (`pago`|`organico`), `canal` (utm_source), `temp`, `campanha`, `publico`, `criativo`, cada uma como lista de valores:
   ```bash
   python python/gerar.py … --opts '{"filters":{"canal":["facebook"],"temp":["quente"]}}'
   ```
4. Quer dois recortes → gere duas vezes em pastas diferentes (`--out saida-fb`, `--out saida-quente`). Nomeie o HTML pelo recorte no chat.

## Casos ambíguos
- Recorte que zera o dado (ex.: temperatura só existe no pago): avise e sugira o inteiro.
- Metas continuam globais: num recorte, o atingimento vs meta deixa de fazer sentido; diga isso no documento.
