# Guia da análise livre

Uma análise livre é uma pergunta de negócio respondida com os dados do cliente, no padrão dos relatórios Witly, sem motor pronto. O que muda: **você** escreve o cálculo. O que não muda: os contextos gerais (regras, definições, recomendações) e o design system.

## O ciclo
1. **Objetivo** (tarefa): a pergunta em uma frase e a decisão que ela alimenta. Sem decisão, não há análise: é curiosidade.
2. **Dados** (tarefa): de onde vem (Delfos: `Credentials` → `Tables_Views_Docs` → `Witly_Query`; ou CSV do consultor). Cheque PII antes de salvar qualquer arquivo. Salve a query em `queries/`.
3. **Estrutura** (tarefa): páginas e seções, e o que cada bloco responde. Combine com o consultor antes de calcular.
4. **Cálculo**: `python/calc_livre.py` (só stdlib) lê o CSV e grava `relatorio/dataset.json`. Cada tabela tem `dims`, `rows` com colunas numéricas cruas (não formatadas) e, se fizer sentido, uma linha "Geral" calculada por soma (nunca por média de taxas).
5. **Seções**: `relatorio/sNN.json` no contrato do `design-system.md`. Gráficos, tabelas e KPIs fazem `bind` às tabelas; a prosa cita só números que estão nelas.
6. **Montar**: `python python/montar.py --relatorio relatorio/ --out saida/`. O validador recusa widget fora do contrato, bind para coluna inexistente e número solto na prosa.
7. **Entregar**: resposta primeiro (highlight), comparação (tabela ou um gráfico), implicação, ação em FCA-R. Registre com `registrar`.

## Regras que valem aqui (as gerais, resumidas)
- Número nasce no seu script Python; o modelo não digita número, não faz média de cabeça e não soma taxas.
- Taxa, custo e ROAS: geral ponderado (Σ numerador ÷ Σ denominador).
- Base pequena (< ~30 eventos no denominador) é "sem evidência".
- Comparação só com o número de referência trazido do dado; meta só existe se o consultor deu.
- Dado pessoal nunca entra: e-mail, telefone, CPF, nome. Se o CSV traz, o `calc_livre.py` agrega e descarta.
- Todo número com janela e data do dado fechado.
- Linguagem do cliente: sem jargão estatístico, sem nome de tabela ou coluna no texto visível.

## O que NÃO concluir
- Causalidade a partir de correlação ou de um cruzamento; diga "associação" e o tamanho dela.
- Tendência com menos de 3 pontos.
- Que "não há dado" sem ter consultado as tabelas/views disponíveis (`Tables_Views_Docs`).

## Quando virar template
Se a mesma análise vai se repetir (outro cliente, outro mês): `salvar_template` com `calc_livre.py`, `queries/*.sql`, as seções e este guia adaptado. Um editor promove para todos na UI.
