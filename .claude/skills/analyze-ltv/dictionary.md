# Dicionário de Dados — Análise de LTV

Tabela de origem: transacional — **uma linha por transação**.  
Dados de cliente e primeira compra são desnormalizados (repetidos em cada linha do mesmo `user_id`).

> **Como usar este dicionário:** copie a seção "Campos customizados" para `temp/[nome-da-analise]/dicionario.md` e preencha o significado de cada `custom_field` de acordo com o negócio sendo analisado. Os demais campos são padrão entre análises.

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

Campos de perfil padrão — presentes na maioria das plataformas. Se ausentes, verificar nos campos customizados.

| Coluna | Tipo | Descrição | Observações |
|---|---|---|---|
| `tempo_acompanhamento` | ? | Tempo como lead/cliente | ⚠️ **CONFIRMAR:** unidade (dias? meses?)? Contado a partir de quando (captura ou primeira compra)? |
| `escolaridade` | string | Nível de escolaridade | Campo de perfil — uso opcional na análise |
| `renda_mensal` | string/float | Faixa ou valor de renda mensal | Campo de perfil |
| `idade` | int/float | Idade do cliente | Campo de perfil |
| `genero` | string | Gênero do cliente | Campo de perfil |

---

## Campos customizados

> **Instruções para o analista:** os campos abaixo variam por negócio. Antes de iniciar qualquer análise segmentada, criar `temp/[nome-da-analise]/dicionario.md` e preencher o mapeamento de cada `custom_field_N` que existir no CSV. Campos não mapeados são ignorados.

### Template de mapeamento (copiar para `temp/[analise]/dicionario.md`)

```markdown
# Dicionário — [Nome do Negócio / Análise]

## Metadados
- **Negócio:** [nome]
- **Data do CSV:** [data de extração]
- **Pasta da análise:** temp/[nome-da-analise]/

## Campos customizados mapeados

| Coluna | Pergunta / Significado | Tipo de resposta | Exemplos de valores | Relevância para LTV |
|---|---|---|---|---|
| `custom_field_1`  | [a preencher] | [texto livre / seleção única / múltipla] | [ex: valor1, valor2] | [alta / média / baixa / ignorar] |
| `custom_field_2`  | [a preencher] | — | — | — |
| `custom_field_3`  | [a preencher] | — | — | — |
| ...               | ...           | ...  | ... | ... |

## Campos ignorados
[Listar custom_fields presentes no CSV mas sem mapeamento ou sem relevância analítica]

## Campos de perfil padrão disponíveis
[Marcar quais dos campos padrão (genero, escolaridade, renda_mensal, idade) estão preenchidos no CSV]
```

---

## Notas estruturais

- **Granularidade:** linha = transação. Para análises em nível de cliente, agrupar por `user_id` e desduplicar colunas desnormalizadas.
- **LTV próprio vs. plataforma:** calcularemos `sum(valor_venda) por user_id` e compararemos com `ltv_cliente` para validar.
- **Recompra:** derivada de `num_transacoes > 1` ou de `data_pedido != data_primeira_compra`.
- **Coorte:** mês/ano de `data_primeira_compra`.
- **Campos customizados:** solicitar mapeamento ao usuário antes de qualquer análise segmentada — ver `temp/[analise]/dicionario.md`.
