# Regras de Cálculo — Análise de LTV

---

## 1. Filtro base (aplicar em todas as análises)

```
valor_venda > 0
```

Transações com `valor_venda <= 0` são excluídas de todos os cálculos de faturamento, recompra e LTV.  
Motivo: representam reembolsos, cortesias ou registros de teste.

---

## 2. Classificação de transações

| Valor original | Tratamento |
|---|---|
| `Primeira Compra` | Primeira transação do cliente |
| `Recompra` | Compra subsequente — conta como recompra |
| `Renovação` | Tratada como recompra — equivalente para todos os cálculos |

Para fins analíticos, criar coluna derivada:
```
tipo_transacao = 'primeira' se classificacao_transacao == 'Primeira Compra'
                 'recompra'  se classificacao_transacao in ['Recompra', 'Renovação']
```

---

## 3. Deduplicação de "Primeira Compra"

48 clientes possuem mais de uma transação classificada como "Primeira Compra".  
**Regra:** manter apenas a transação com `data_pedido` mais antiga para cada `user_id`.  
As demais são reclassificadas como recompra ou descartadas da contagem de primeiras compras.

---

## 4. LTV do cliente

```
ltv_calculado = sum(valor_venda) por user_id
                onde valor_venda > 0
```

O campo `ltv_cliente` da base é a referência da plataforma — validamos contra `ltv_calculado`.  
Usar `ltv_calculado` como valor canônico na análise.

---

## 5. Upside de faturamento

```
upside_medio_abs = ltv_medio - ticket_medio_primeira_compra
upside_medio_pct = upside_medio_abs / ticket_medio_primeira_compra
```

Calculado no nível agregado (não a média de upside individuais por cliente).  
Interpretação: quanto cada cliente gera em média além da primeira venda.

---

## 6. Taxa de recompra

```
recomprador = True  se num_transacoes_validas >= 2
              False se num_transacoes_validas == 1

taxa_recompra = count(recomprador == True) / count(clientes únicos)
```

Onde `num_transacoes_validas` = transações com `valor_venda > 0` por `user_id`.

---

## 6. Coorte

```
coorte = ano-mês de data_primeira_compra (formato YYYY-MM)
```

Usado para agrupar clientes pela safra de entrada e calcular LTV acumulado ao longo do tempo.

---

## 7. Tempo entre compras (inter-purchase time)

```
dias_entre_compras = média de (data_pedido[n] - data_pedido[n-1]) por user_id
                     apenas para clientes recompradores
```

Calcular para cada par consecutivo de transações, ordenadas por `data_pedido`.

---

## 8. Comparações de recompra e LTV entre segmentos

Ao comparar taxa de recompra ou LTV entre produtos, canais, segmentos ou qualquer outra dimensão:

**Regra:** usar apenas clientes da **mesma safra** (mesmo ano ou mês de primeira compra) **ou** restringir a uma janela temporal fixa contada a partir da primeira compra de cada cliente (ex: primeiros 12 meses).

**Motivo:** clientes de safras mais recentes têm menos tempo disponível para recomprar. Comparar diretamente a taxa de recompra de um produto lançado em 2025 com um de 2020 é enviesado — a diferença pode ser apenas maturidade da safra, não comportamento distinto.

**Aplicação prática:**
```
# Janela fixa: só conta recompras até N dias após a 1ª compra
recompra_janela = transacoes onde (data_pedido - data_primeira_compra) <= N dias
                  e valor_venda > 0
                  e classificacao != 'Primeira Compra'

# Safra controlada: comparar apenas clientes com data_primeira_compra no mesmo período
segmento_A_filtrado = segmento_A onde safra == safra_referencia
segmento_B_filtrado = segmento_B onde safra == safra_referencia
```

**Janelas recomendadas para comparação:**
- 90 dias — recompra de curto prazo / upsell imediato
- 180 dias — ciclo semestral
- 12 meses — comparação padrão entre produtos/canais com histórico suficiente

Só usar janela `max` (sem restrição) ao analisar safras com maturidade comparável (ex: todas com ≥ 2 anos de histórico).

---

## 9. Campos que variam por análise

| Campo | Regra |
|---|---|
| `tempo_acompanhamento` | Campo de texto livre — mapear categorias antes de usar |
| `custom_field_*` | Solicitar mapeamento ao usuário antes de qualquer análise segmentada |
