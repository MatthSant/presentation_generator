# Benchmarks do funil de anúncio

**Saída:** `config.tipo_funil`, `config.funnel_bench`. **Confirmar com o consultor.**

## Definição
Os indicadores de anúncio (Hook, Hold, CTR, Connect, Conversão de página) só têm veredito contra um **benchmark**. O kit compara cada um ao alvo e pinta o desvio (rodapé "Bench X · ±%"). O alvo depende do tipo de funil (lançamento padrão, perpétuo, pago…) e do histórico do cliente.

| Chave | Indicador | Padrão |
|---|---|---|
| `hook` | Hook Rate = views totais ÷ impressões | 30 % |
| `hold` | Hold Rate = views 100 % ÷ views totais | 30 % |
| `ctr` | CTR = cliques ÷ impressões | 1,5 % |
| `connect` | Connect Rate = pageviews ÷ cliques | 80 % |
| `conv_pag` | Conversão de página = leads ÷ pageviews | 40 % |

## Como executar
1. Pergunte o tipo de funil. Se o consultor tiver benchmarks próprios do cliente (de lançamentos anteriores), use-os.
2. Sem benchmark próprio, use o padrão e **diga isso** no documento.
3. Chaves ausentes caem no padrão; não invente valores.

## Casos ambíguos
- Base sem vídeo: Hook/Hold ficam vazios; não julgue.
- Pageviews zerados (pixel sem landing_page_views): Connect e Conv. de página não existem; diga isso.

## Saída (formato exato)
```json
"tipo_funil": "lancamento-padrao",
"funnel_bench": { "hook": 30, "hold": 30, "ctr": 1.5, "connect": 80, "conv_pag": 40 }
```
