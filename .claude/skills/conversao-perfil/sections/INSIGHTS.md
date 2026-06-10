# Seção — Insights (s10)

Análise interpretativa consolidada. **Autoral**: o LLM escreve a prosa a partir do
que os números mostraram (referenciando os já calculados — nunca inventa números).
Estática, não afetada pelo filtro de canal (escrita para o canal Geral).

## Estrutura — 3 zonas, cada uma com um `eyebrow` colorido + cards

| Zona | eyebrow | quando |
|---|---|---|
| Conclusões claras | `n:"✓" color:green` | achados com evidência forte (≥ ~7/9 lançamentos) e ação direta |
| Aprofundamento recomendado | `n:"↗" color:amber` | sintoma claro mas sem conclusão categórica; terminar com "Recomendado: …" |
| Pontos de atenção | `n:"!" color:red` | contexto estratégico / sinais a monitorar |

Cada card = `find-block` com `card:true`:
```json
{ "id":"ins-0-0","type":"find-block","card":true,"tag":"Oportunidade","tagColor":"g",
  "title":"Frase-conclusão direta","detail":"2–3 frases: o que os dados mostram + por que importa + <strong>Implicação:</strong> ação." }
```
`tagColor`: oportunidade `g` · problema `r` · aprofundar `a` · interessante `p`.
Fechar a seção com um `find-note` `ins-method` explicando o benchmark (respondentes,
não total de leads) e as fórmulas.

## Layout
eyebrow `12×1`; cards `find-block` `w:4` (3 por linha) ou `w:6` (quando 4 cards);
nota final `12×1`. Sem sobreposição (próxima linha em `y+h`).

## Como derivar os achados
Varrer os resultados por critério: grupos com 9/9 wins e diff alto → oportunidade;
grupos de alto volume e 0 wins → problema; padrões contra-intuitivos → aprofundar;
efeitos marginais ou de canal → atenção. **Os pontos levantados aqui alimentam a
página Detalhamentos** (cross-cuts).
