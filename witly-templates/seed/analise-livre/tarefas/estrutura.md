# Estrutura: páginas, seções e o que cada bloco responde

**Saída:** o esqueleto do `build.py` — páginas, seções e o que cada bloco responde — combinado **antes** de calcular. **Confirmar com o consultor.**

## Definição
O documento tem a cara do debriefing/acompanhamento (abra `exemplos/debriefing.html`): **Panorama** (metas, indicadores, no tempo) → **a página da pergunta** (resposta, comparação, achados) → **One Pager** (KPIs, funil, alavancas, ações). Uma página só quando a pergunta cabe numa tela. O esqueleto define quais tabelas o `calc_livre.py` precisa gerar.

## Como executar
1. Liste as sub-perguntas (2 a 5). Cada uma vira uma seção (`p.secao(...)`) com título em forma de pergunta ou de afirmação; a principal ganha a própria página.
2. Para cada seção, decida as zonas com os builders: `eyebrow` → `kpi`/`banda` (com meta se o consultor deu) → `grafico`/`tabela` → `evolucao`/`funil` → `achado` → `acao` (só se pedido).
3. Derive as tabelas: cada `grafico`, `tabela` e `kpi` aponta uma tabela (nome, dimensões, colunas). Essa lista é o contrato do `calc_livre.py`.
4. Mostre o esqueleto ao consultor (títulos + blocos + tabelas) e ajuste antes de calcular.

## Casos ambíguos
- Mais de 5 seções: a pergunta é grande demais; corte ou divida em dois documentos.
- Bloco sem tabela que o sustente: ou entra uma tabela, ou o bloco sai.

## Saída (formato exato)
```json
[{ "id": "panorama", "label": "Panorama", "sections": [{ "id": "s01", "label": "Resposta" }, { "id": "s02", "label": "Por canal" }] }]
```
