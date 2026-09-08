# Objetivo: a pergunta, a decisão e o público

**Saída:** `relatorio/meta.json` com `client`, `client_name`, `title`, `pergunta` (uma frase) e `decisao` (o que muda com a resposta). **Perguntar ao consultor.**

## Definição
Análise livre começa pela pergunta de negócio e pela decisão que ela alimenta. "Como está o CPL por canal?" não é pergunta; "qual canal cortar para baixar o CPL sem perder volume?" é. O público (dono do negócio, gestor de tráfego, time interno) define a linguagem e o nível de detalhe.

## Como executar
1. Pergunte: "qual decisão você quer tomar com isso?" e "quem vai ler?".
2. Reescreva a pergunta em uma frase com o eixo explícito: nível (qual é maior), tendência (o que muda) ou causa (o que explica).
3. Confirme o título do documento e o cliente (slug do Delfos).

## Casos ambíguos
- Pergunta com dois eixos ("qual canal é melhor e por que caiu"): divida em duas seções, uma por eixo.
- Pergunta que cabe num template (acompanhamento, debriefing, criativos, histórico, conversão por perfil): use o template; diga isso ao consultor.

## Saída (formato exato)
```json
{ "client": "enxoval", "client_name": "Enxoval Inteligente",
  "title": "Enxoval Inteligente · CPL por canal no LX ago/26",
  "pergunta": "Qual canal cortar para baixar o CPL sem perder 20% do volume?",
  "decisao": "Realocação de verba entre canais na próxima semana" }
```
