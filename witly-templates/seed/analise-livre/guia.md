# Guia da análise livre

Uma análise livre é uma pergunta de negócio respondida com os dados do cliente, no padrão dos relatórios Witly, sem motor pronto. O que muda: **você** escreve o cálculo. O que não muda: os contextos gerais (regras, definições, recomendações) e o design system.

## O ciclo
1. **Objetivo** (tarefa): a pergunta em uma frase e a decisão que ela alimenta. Sem decisão, não há análise: é curiosidade.
2. **Dados** (tarefa): de onde vem (Delfos: `Credentials` → `Tables_Views_Docs` → `Witly_Query`; ou CSV do consultor). Cheque PII antes de salvar qualquer arquivo. Salve a query em `queries/`.
3. **Estrutura** (tarefa): páginas e seções, e o que cada bloco responde. Combine com o consultor antes de calcular.
4. **Cálculo**: `python/minha-analise/calc_livre.py` (só stdlib) lê o CSV e devolve as tabelas — cada uma com `dims`, `rows` de colunas numéricas cruas e, se fizer sentido, uma linha "Geral" calculada por soma (nunca por média de taxas). Copie de `python/exemplo/calc_livre.py`.
5. **Composição**: `build.py` com `relatorio.py` — o mesmo esqueleto do debriefing e do acompanhamento: páginas com sidebar, eyebrows, grade de KPIs com meta, gráficos e tabelas por `bind`, série no tempo, funil, achados em card, ações. Copie de `python/exemplo/build.py`; abra `exemplo/relatorio.html` e `exemplos/debriefing.html` para ver o resultado esperado.
6. **Gerar**: `python python/minha-analise/build.py --csv dump.csv --out saida/`. O builder recusa valor digitado como texto (o número entra como número e ele formata), bind para coluna inexistente e prosa com número que não está numa tabela nem num card.
7. **Entregar**: Panorama (resposta em números), a página da pergunta (comparação + achados), One Pager (KPIs + funil + alavancas + ações em FCA-R). Registre com `registrar`.

## Regras que valem aqui (as gerais, resumidas)
- Número nasce no seu script Python; o modelo não digita número, não faz média de cabeça e não soma taxas.
- Taxa, custo e ROAS: geral ponderado (Σ numerador ÷ Σ denominador).
- Base pequena (< ~30 eventos no denominador) é "sem evidência".
- Comparação só com o número de referência trazido do dado; meta só existe se o consultor deu.
- Dado pessoal nunca entra: e-mail, telefone, CPF, nome. Se o CSV traz, o `calc_livre.py` agrega e descarta.
- Todo número com janela e data do dado fechado.
- Linguagem do cliente: sem jargão estatístico, sem nome de tabela ou coluna no texto visível.


## Quando virar template
Se a mesma análise vai se repetir (outro cliente, outro mês): `salvar_template` com `calc_livre.py`, `queries/*.sql`, as seções e este guia adaptado. Um editor promove para todos na UI.

## Regras desta análise
As regras (o que não concluir, os cuidados) são **entradas**, não texto solto: chegam no `obter_template` e no `regras.md` do kit, cada uma com o título dizendo a regra. Na plataforma ficam na aba **Regras**.
