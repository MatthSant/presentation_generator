# Dicionário de Dados — Análise de LTV

Tabela de origem: transacional — **uma linha por transação**.  
Dados de cliente e primeira compra são desnormalizados (repetidos em cada linha do mesmo `user_id`).

---

## Identificação

| Coluna | Tipo | Descrição | Observações |
|---|---|---|---|
| `user_id` | string | Identificador único do cliente | Chave para agrupar em nível de cliente |
| `transaction_id` | string | Identificador único da transação | Chave primária da tabela |

---

## Dados da compra atual

| Coluna | Tipo | Descrição | Observações |
|---|---|---|---|
| `data_pedido` | date | Data da transação | Formato a confirmar no CSV |
| `valor_venda` | float | Valor monetário da transação | Base para faturamento e LTV calculado |
| `nome_produto` | string | Nome do produto comprado | — |
| `oferta` | string | Oferta / SKU associado à compra | — |
| `quantidade_produto` | int | Quantidade de unidades na transação | Geralmente 1 em produtos digitais |
| `pais` | string | País do cliente | — |
| `estado` | string | Estado do cliente | — |
| `cidade` | string | Cidade do cliente | — |
| `classificacao_transacao` | string | Tipo/status da transação | ⚠️ **CONFIRMAR:** valores possíveis (ex: compra, reembolso, chargeback)? Filtramos apenas "compra" nos cálculos? |
| `field_payment_method` | string | Método de pagamento | — |
| `utm_source` | string | Fonte da compra | — |
| `utm_medium` | string | Mídia da compra | — |
| `utm_campaign` | string | Campanha da compra | — |
| `utm_term` | string | Termo da compra | — |
| `utm_content` | string | Conteúdo da compra | — |
| `purchase_conversion` | string | Evento de conversão da compra | — |

---

## Dados da primeira compra (desnormalizado por cliente)

| Coluna | Tipo | Descrição | Observações |
|---|---|---|---|
| `primeiro_produto` | string | Produto da primeira compra do cliente | Igual para todas as linhas do mesmo `user_id` |
| `data_primeira_compra` | date | Data da primeira compra | Usado para coortes e cálculo de recompra |
| `valor_primeira_compra` | float | Valor da primeira compra | — |
| `first_purchase_conversion` | string | Evento de conversão da primeira compra | — |
| `first_purchase_source` | string | Fonte da primeira compra | — |
| `first_purchase_medium` | string | Mídia da primeira compra | — |
| `first_purchase_campaign` | string | Campanha da primeira compra | — |
| `first_purchase_content` | string | Conteúdo da primeira compra | — |

---

## Dados da primeira captura como lead (desnormalizado por cliente)

| Coluna | Tipo | Descrição | Observações |
|---|---|---|---|
| `data_priemeira_captura` | date | Data da primeira captura como lead | ⚠️ Typo no nome da coluna (priemeira) — manter exatamente assim no código |
| `evento_primeira_captura` | string | Evento que gerou a captura | — |
| `origem_primeira_captura` | string | Origem da captura | — |
| `medium_primeira_captura` | string | Mídia da captura | — |
| `campanha_primeira_captura` | string | Campanha da captura | — |
| `content_primeira_captura` | string | Conteúdo da captura | — |

---

## Dados agregados do cliente (desnormalizado)

| Coluna | Tipo | Descrição | Observações |
|---|---|---|---|
| `num_transacoes` | int | Total de transações do cliente | Igual para todas as linhas do mesmo `user_id`. ⚠️ **CONFIRMAR:** conta apenas compras válidas ou inclui reembolsos? |
| `ltv_cliente` | float | LTV pré-calculado pela plataforma | ⚠️ **CONFIRMAR:** é soma de `valor_venda` ou tem outra lógica? Vamos recalcular independentemente para validação |

---

## Perfil do cliente (desnormalizado)

| Coluna | Tipo | Descrição | Observações |
|---|---|---|---|
| `tempo_acompanhamento` | ? | Tempo como lead/cliente | ⚠️ **CONFIRMAR:** unidade (dias? meses?)? Contado a partir de quando (captura ou primeira compra)? |
| `escolaridade` | string | Nível de escolaridade | Campo de perfil — uso opcional na análise |
| `renda_mensal` | string/float | Faixa ou valor de renda mensal | Campo de perfil |
| `idade` | int/float | Idade do cliente | Campo de perfil |
| `genero` | string | Gênero do cliente | Campo de perfil |

---

## Campos customizados

Mapeamento confirmado pelo usuário. Campos não listados abaixo são ignorados.

### Perfil — Relação com autismo

| Coluna | Pergunta | Observações |
|---|---|---|
| `custom_field_1` | Parentesco com autista | Ex: mãe, pai, irmão, cuidador |
| `custom_field_3` | Qual a sua relação com autismo? | Visão geral — sobreposição com cf5 |
| `custom_field_5` | Qual é o seu papel principal em relação ao autismo? | **Principal segmentador** — familiar / terapeuta / educador / autista |
| `custom_field_6` | A criança/adolescente tem diagnóstico formal de autismo? | Booleano/texto |
| `custom_field_7` | Faixa etária da criança/adolescente | — |
| `custom_field_8` | A criança/adolescente realiza acompanhamento terapêutico? | — |
| `custom_field_9` | Você tem diagnóstico formal de autismo? | Pergunta ao próprio usuário |
| `custom_field_10` | Realiza algum acompanhamento terapêutico? | — |

### Perfil — Atuação profissional

| Coluna | Pergunta | Observações |
|---|---|---|
| `custom_field_2` | Área de atuação | Versão curta |
| `custom_field_11` | Em qual área você atua? | Versão longa — possível sobreposição com cf2 |
| `custom_field_12` | Qual é a sua formação principal? | — |
| `custom_field_13` | Qual é a sua função na educação? | Preenchido apenas por educadores |
| `custom_field_14` | Em qual área você atua? (2) | Segunda resposta / versão alternativa |
| `custom_field_25` | Qual é a sua ocupação principal? | — |

### Perfil — Demográfico

| Coluna | Pergunta | Observações |
|---|---|---|
| `custom_field_4` | Estado civil | — |
| `custom_field_24` | Renda familiar mensal | Faixa de renda — segmentação de poder aquisitivo |

### Perfil — Interesse e maturidade

| Coluna | Pergunta | Observações |
|---|---|---|
| `custom_field_16` | Principais desafios no dia a dia | Multi-seleção — difícil de agregar, uso limitado em LTV |
| `custom_field_17` | Quais temas você tem interesse em estudar ou atuar? | Multi-seleção |
| `custom_field_18` | Como você avalia sua maturidade no tema autismo? | **Segmentador relevante** — iniciante / intermediário / avançado |
| `custom_field_19` | Sobre quais faixas etárias você tem mais interesse | — |

### Engajamento com o produto

| Coluna | Pergunta | Observações |
|---|---|---|
| `custom_field_20` | Como você conheceu o Instituto Singular? | Canal de aquisição declarado — cruzar com UTM |
| `custom_field_21` | Afirmações sobre interação com o IS.T | Multi-seleção — nível de engajamento pré-compra |
| `custom_field_22` | Você já utilizou materiais gratuitos do Instituto Singular? | Sim/Não — proxy de nurturing |
| `custom_field_23` | Onde você prefere consumir conteúdo? | Canal preferido |

### Campos sem mapeamento confirmado

`custom_field_15`, `custom_field_26` a `custom_field_50` — não mapeados, ignorados na análise.

---

## Notas estruturais

- **Granularidade:** linha = transação. Para análises em nível de cliente, agrupar por `user_id` e desduplicar colunas desnormalizadas.
- **LTV próprio vs. plataforma:** calcularemos `sum(valor_venda) por user_id` e compararemos com `ltv_cliente` para validar.
- **Recompra:** derivada de `num_transacoes > 1` ou de `data_pedido != data_primeira_compra`.
- **Coorte:** mês/ano de `data_primeira_compra`.
