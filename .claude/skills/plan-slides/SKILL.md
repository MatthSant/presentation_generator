---
name: plan-slides
description: "Pipeline conversacional que transforma uma análise (arquivo MD/HTML em input/ ou URL) em um plano de slides estruturado. Percorre 4 fases: coleta de input → audiência e tom → mensagem inescapável + analise_summary.md → estrutura narrativa + slides_plan.md. Use quando o usuário invocar /plan-slides ou pedir para planejar/estruturar uma apresentação a partir de uma análise."
user-invocable: true
---

# plan-slides

Pipeline que transforma uma análise em um plano de slides pronto para o `/build-slides` executar.

## Visão geral das fases

```
Fase 0  → detectar input
Fase 1  → entender audiência e tom
Fase 2  → mensagem inescapável + gerar analise_summary.md (+ passe de completude)
Fase 3  → propor estrutura narrativa + horizontal flow test (iterar até aprovação)
Fase 4a → mapeamento de cobertura (cada item do sumário → destino explícito)
Fase 4  → gerar slides_plan.md + checklist de completude final (com autorização explícita)
```

Use `TodoWrite` para marcar cada fase conforme avança. Só passe para a próxima após concluir a atual.

---

## Fase 0 — Detectar input

1. Listar arquivos dentro de `input/` com `Glob("input/**/*")`.
2. **Se houver um arquivo:** informe o nome ao usuário e pergunte se deve usá-lo ou se prefere fornecer outro conteúdo.
3. **Se houver múltiplos arquivos:** use `AskUserQuestion` perguntando qual arquivo usar.
4. **Se a pasta estiver vazia:** use `AskUserQuestion` para pedir que o usuário:
   - Cole o conteúdo da análise diretamente no chat, ou
   - Forneça uma URL (você usará `WebFetch` para extrair), ou
   - Coloque um arquivo em `input/` e reexecute.
5. Após identificar a fonte: leia o conteúdo completo com `Read` (arquivo) ou `WebFetch` (URL). Armazene mentalmente como **[CONTEUDO_ANALISE]**.

---

## Fase 1 — Audiência e tom

Use `AskUserQuestion` com **duas perguntas simultâneas**:

**Pergunta 1 — Perfil do público:**
- C-Level / Diretoria (foco em impacto e decisão, sem detalhes técnicos)
- Gestão / Coordenação (equilíbrio entre números e operação)
- Equipe Técnica (profundidade metodológica e dados brutos)
- Misto (adaptar por seção)

**Pergunta 2 — Intenção da apresentação:**
- Que decisão ou ação esta apresentação deve provocar?
(campo de texto livre)

Registre mentalmente: **[PERFIL]** e **[DECISAO_ESPERADA]**.

---

## Fase 2 — Mensagem inescapável + analise_summary.md

### 2a. Perguntar a mensagem

Use `AskUserQuestion` (campo de texto livre):
> "Qual é a mensagem que o público não pode sair sem perceber? (não o que você vai mostrar — o que eles vão sentir ou entender ao final)"

Registre como **[MENSAGEM_INESCAPAVEL]**.

### 2b. Gerar o sumário

Com **[CONTEUDO_ANALISE]**, **[PERFIL]**, **[DECISAO_ESPERADA]** e **[MENSAGEM_INESCAPAVEL]** em mãos, analise profundamente o conteúdo e escreva `temp/analise_summary.md`:

```markdown
# Sumário da Análise

## Mensagem inescapável
[conforme usuário — 1 frase precisa]

## Audiência & Tom
- Perfil: [C-Level / Gestão / Técnico / Misto]
- Foco: [impacto financeiro / operação / metodologia]
- Decisão esperada: [...]

## Métricas-chave
[TODOS os KPIs com valores exatos encontrados na análise — sem omitir nenhum número relevante]

## Achados
[Cada achado com dado de suporte, ordenados por relevância para a mensagem inescapável.
Sem limite de quantidade — incluir tudo que for materialmente relevante.]

## Hipóteses / Ações identificadas
[Estimativas de impacto quando disponíveis na análise]

## Gaps de dados
[O que falta, foi estimado ou precisa de fonte externa]

## Dados para apêndice
[Lista NUMERADA — cada item obrigatoriamente inclui:
  1. Descrição do dado com valores exatos
  2. Tópico do slide principal ao qual se relaciona (ex: "→ Slide: Crescimento de receita")
Sem numeração não é válido. Sem linkage `→ Slide:` não é válido.
Incluir: tabelas completas de ranking, distribuições secundárias, metodologia detalhada, dados por subgrupo.]
```

### 2c. Passe de completude após salvar

Após salvar `temp/analise_summary.md`, **leia o arquivo de volta** e verifique antes de informar o usuário:

1. **KPIs:** cada valor numérico relevante de [CONTEUDO_ANALISE] aparece em "Métricas-chave" ou "Dados para apêndice"? Se não, adicione.
2. **Achados:** cada achado material de [CONTEUDO_ANALISE] aparece em "Achados" ou "Hipóteses"? Se não, adicione.
3. **Dados para apêndice numerados:** cada item tem número e linkage `→ Slide:`? Se não, corrija o arquivo.

Só após o passe informe o usuário e mostre os principais achados no chat.

---

## Fase 3 — Estrutura narrativa

### 3a. Propor estrutura (SCR)

Com base no sumário, proponha no chat uma estrutura slide-a-slide seguindo o arco **SCR**:

> **Situação** (contexto atual) → **Complicação** (problema ou oportunidade) → **Resolução** (evidências + ações)

O deck deve sempre incluir, nesta ordem:
1. **Capa** — título e subtítulo
2. **Resumo executivo** — 3–4 claims em negrito com dados de suporte (slide independente; permite entender o deck sem ler o resto)
3. **Agenda** — lista dos temas/seções que serão apresentados
4. **Metodologia e Definições** — sempre dois slides consecutivos, **sempre no início do deck** (após Agenda):
   - `tipo: metodologia-recorte` — universo analisado (base, período, fonte, exclusões) + critério de classificação + lista de grupos/segmentos se aplicável
   - `tipo: metodologia-metricas` — definições dos termos e métricas usados na análise (ex: LTV, Positivação, Taxa de Retorno)
5. **Slides analíticos** — agrupados por seção, cada um com uma única mensagem
6. Breaks de seção quando mudar de bloco temático
7. **Slide de encerramento** — escolher conforme o objetivo detectado em Fase 1:
   - **Diagnóstico / Estratégia** → `tipo: plano-acao` — ações em 4 horizontes por impacto/esforço
   - **Debriefing / Retrospectiva de campanha** → `tipo: aprendizados` — o que funcionou, o que não funcionou, próximas hipóteses
8. **Contracapa** — último slide de qualquer deck; `tipo: contracapa`; apenas uma palavra ou frase curta (ex: "Obrigado." ou "Perguntas?") + nome da empresa/equipe opcional

Para cada slide sugerido, indique:
- Número e título (já escrito como action title — frase completa com o insight)
- Tipo (Capa / Resumo Executivo / Agenda / Break / Metodologia-Recorte / Metodologia-Métricas / Analítico / Plano de Ação / Aprendizados / Contracapa)
- Apêndices não aparecem na estrutura narrativa — são gerados automaticamente a partir dos campos `apendice:` nos slides analíticos e do bloco `## Apêndice` no final do arquivo
- Achados/KPIs que entrarão nesse slide
- Justificativa narrativa (por que este slide existe aqui)

### 3b. Horizontal flow test

Antes de apresentar a estrutura ao usuário, aplique o **teste de fluxo horizontal**:

> Liste apenas os títulos de todos os slides em sequência. Lendo só eles, o argumento completo da apresentação fica claro sem precisar ver o conteúdo?

Se a resposta for não — algum título é vago ou não carrega um insight —, reescreva o título problemático até que a sequência de títulos sozinha conte a história.

Só então apresente a estrutura ao usuário.

### 3c. Discutir com o usuário

Use `AskUserQuestion` para perguntar:
- "Essa estrutura reflete o objetivo da apresentação?"
- Opções: Aprovado / Ajustar ordem / Adicionar slide / Remover slide / Refazer do zero

Se o usuário pedir ajustes, aplique, refaça o horizontal flow test e reproponha. **Só avance para Fase 4a com aprovação explícita.**

---

## Fase 4a — Mapeamento de Cobertura

Antes de escrever qualquer linha de `slides_plan.md`, construa mentalmente a **tabela de cobertura**. Nenhum item de `analise_summary.md` pode ficar sem destino explícito.

Para cada seção do sumário, classifique cada item em uma de três categorias:

| Item | Destino | ID / Slide |
|------|---------|-----------|
| Métrica ou achado X | slide principal N | Slide N |
| Item de "Dados para apêndice" Y | apêndice Ax | apendice-[slug] |
| Item sem encaixe possível | não incluído | documentar motivo |

**Regras de classificação:**

- **Métricas-chave e Achados:** devem ir para um slide principal. Se não couberem em nenhum slide aprovado, crie um novo slide analítico ou mescle ao mais próximo — não descarte silenciosamente.
- **Dados para apêndice (itens numerados):** cada item numerado no sumário → gera exatamente um bloco `## Apêndice Ax`. Correspondência 1-para-1 obrigatória.
- **Exec summary overflow (> 4 claims):** os excedentes vão para `## Apêndice A[x] — Dados de suporte — Resumo Executivo` com `referencia: slide 2` e campo `apendice:` no slide de exec summary.
- **Plano de ação overflow (> 4 ações por horizonte):** excedentes vão para `## Apêndice A[x] — Ações adicionais — [Horizonte]` com referência ao slide de plano de ação.
- **Itens não incluídos:** se um item genuinamente não tem encaixe (dado duplicado, irrelevante para a mensagem inescapável), documente-o na seção `## Dados não incluídos` ao final de `slides_plan.md` com uma frase de motivo por item.

Só avance para Fase 4 após concluir o mapeamento completo.

---

## Fase 4 — Gerar slides_plan.md

Com a estrutura aprovada, crie `temp/slides_plan.md`. O plano é **orientado a conteúdo e mensagem** — sem referências a componentes HTML ou classes CSS. O `/build-slides` decide como renderizar cada item.

### Validação MECE antes de escrever

Para cada slide analítico, verifique os achados:
- **Mutuamente exclusivos:** nenhum achado sobrepõe o argumento de outro no mesmo slide. Se houver overlap, mescle ou elimine o redundante.
- **Coletivamente exaustivos:** o conjunto de achados do slide cobre o argumento declarado no título. Se sobrar argumento não coberto, adicione um achado ou ajuste o título.

Só escreva o plano após essa validação.

### Cabeçalho obrigatório

```markdown
# Plano de Slides

## Contexto
- Audiência: [perfil]
- Tom: [foco da apresentação]
- Mensagem inescapável: [1 frase]
```

### Formato por tipo de slide

**Capa:**
```markdown
## Slide 1 — Capa
tipo: capa
título: "Título Principal"
subtítulo: "Subtítulo em destaque"
data: "MÊS/ANO"
background: "backgrounds/cover.svg"
```

**Resumo executivo:**
```markdown
## Slide 2 — Resumo Executivo
tipo: exec-summary
título: "Frase de impacto que resume o argumento central do deck"

claims:
  - claim: "Faturamento cresceu 52% em 4 anos — mas por ticket médio, não por volume de clientes"
    suporte:
      - "Base de clientes estável entre 160k–170k desde 2022"
      - "Ticket médio saltou de R$X para R$Y (+14% só em 2025)"

  - claim: "O modelo atual tem teto — crescimento via ticket depende de inflação de serviços"
    suporte:
      - "Grupos com maior elasticidade de preço concentram 60% da receita"
      - "Sem expansão de base, o crescimento nominal vai desacelerar"

  - claim: "Há ~R$2M/ano de potencial identificado em reativação e ativação"
    suporte:
      - "12k clientes inativos 90–180 dias com ticket médio histórico de R$110"
      - "Clientes com cesta no dia 1 têm retenção 2x maior — ponto de intervenção claro"
```

**Agenda:**
```markdown
## Slide 3 — Agenda
tipo: agenda
itens:
  - número: "M"   título: "Metodologia"          sub: "Universo analisado, grupos e métricas"
  - número: "1"   título: "Crescimento"           sub: "Volume vs. ticket — o que está puxando a receita"
  - número: "2"   título: "Ativação"              sub: "O que acontece no dia 1 e por que importa"
  - número: "3"   título: "Hipóteses e Potencial" sub: "Onde estão os R$2M identificados"
```

**Break (divisor de seção):**
```markdown
## Slide N — [Nome da Seção]
tipo: break
seção: "Rótulo curto (ex: Seção 1)"
título: "Título de impacto da seção"
```

**Slide analítico:**
```markdown
## Slide N — [Action title resumido para navegação]
tipo: analítico
seção: "Nome da seção temática"
título: "Frase completa e declarativa com o insight — este é o action title que aparece no slide"

métricas:
  - ~165k clientes ativos/ano (média 2022–2025)
  - +6,5% crescimento de volume 2024→2025
  - +14% crescimento de ticket 2024→2025
  - R$48M receita total 2025

dados para visualização:
  - Receita anual 2022–2025 (R$M): 32.1 / 37.4 / 42.8 / 48.8
  - Ticket médio por ano: descrever tendência ou fornecer valores

achados:
  - O ticket médio cresceu +14% enquanto a base ficou estável entre 160k–170k
  - O modelo de crescimento depende de inflação de serviços — sem novos clientes, há um teto

hipótese/ação (se identificada na análise):
  - O quê: campanha de reativação para clientes inativos 90–180 dias
  - Impacto estimado: ~R$2M/ano
  - Lógica: 12k inativos × 15% conversão × R$110 ticket médio
  - Fonte: benchmark de reativação via SMS 12–18% (McKinsey 2023) — não testado na rede
```

**Slides de metodologia e definições** — sempre dois slides separados:

Slide A — recorte dos dados e classificação (universo + grupos):
```markdown
## Slide N — Recorte dos dados e agrupamento
tipo: metodologia-recorte
seção: "Definições"
título: "Frase declarativa — ex: Análise cobre 152k clientes em 26 meses classificados por grupo de entrada"

universo:
  - base: "152.261 clientes únicos"
  - receita: "R$ 48,8M"
  - período: "Jan/2024 – Mar/2026"
  - fonte: "CRM + sistema de faturamento"
  - exclusões: "Histórico anterior a 2024 excluído em análises comparativas — janelas de observação comparáveis entre coortes"

classificação:
  - critério: "Cliente classificado pelo grupo da 1ª compra"
  - lógica: "Comportamento (retorno, positivação) medido a partir desse ponto"

grupos (quando a análise segmenta por grupos/categorias — omitir se não aplicável):
  - número: "01"   nome: "Exames e Diagnóstico"      exemplo: "Ecografia, laboratorial, imagem"
  - número: "02"   nome: "Especialidades Médicas"    exemplo: "Oftalmo, Cardio, Neuro, Dermato"
  - número: "03"   nome: "Cuidados Preventivos"      exemplo: "Clínico Geral, check-ups"
```

Slide B — métricas e termos definidos na análise:
```markdown
## Slide N+1 — Métricas e definições-chave
tipo: metodologia-metricas
seção: "Definições"
título: "Frase declarativa — ex: Três métricas orientam toda a análise: LTV, Positivação e Taxa de Retorno"

definições:
  - categoria: "Comportamento no dia 1"
    termo: "Cesta / Basket"
    bullets:
      - "Compra em mais de um grupo no mesmo dia da 1ª compra"
      - "Conta como positivação — comportamento multi-serviço imediato"
      - "Taxa atual: 32,2% dos clientes"
    sub-rótulo: "Classificação das compras"         ← omitir se não houver sub-rótulo
    sub-bullets:
      - "Entrada — dia 1, mesmo grupo"
      - "Fidelização — pós-dia 1, mesmo grupo"
      - "Positivação — grupo diferente, qualquer dia"

  - categoria: "Valor do cliente"
    termo: "LTV por Primeiro Grupo"
    bullets:
      - "LTV (1D) — receita do dia da 1ª compra"
      - "LTV (3M / 12M) — receita acumulada até 3 ou 12 meses"
      - "Taxa de Retorno — % com ≥1 compra após dia 1"

  - categoria: "Expansão de base"
    termo: "Positivação"
    bullets:
      - "Qualquer compra em grupo diferente do de entrada"
      - "Taxa — % que comprou em ≥1 grupo diferente"
      - "Janela temporal — quando ocorreu (dia 1, D+1–30, D+31–90…)"

referencia (opcional — link para análise completa):
  texto: "Análise completa com gráficos e tabelas disponível em:"
  link: "URL ou localização do documento de referência"
```

**Slide de aprendizados:**
```markdown
## Slide N — Aprendizados
tipo: aprendizados
seção: "Aprendizados"
título: "Frase declarativa com o meta-aprendizado central — ex: A campanha confirmou que urgência dobra conversão, mas canal SMS é inviável para esta base"

aprendizados:
  - categoria: O que funcionou
    cor: g
    itens:
      - título: "Mensagem de urgência dobrou a taxa de abertura"
        dado: "CTR: 8,2% vs. 4,1% baseline"
        implicação: "Manter gatilho de escassez nas próximas campanhas"
      - título: "..."
        dado: "..."
        implicação: "..."

  - categoria: O que não funcionou
    cor: r
    itens:
      - título: "Canal SMS gerou 60% de opt-out"
        dado: "Opt-out: 18% — 3× acima do benchmark"
        implicação: "Substituir por push notification"

  - categoria: Próximas hipóteses
    cor: a
    itens:
      - título: "Segmentar por histórico pode aumentar conversão em 2×"
        dado: "Clientes com ≥ 3 compras têm CTR 12% vs. 5% geral"
        implicação: "A/B test com segmentação por frequência no próximo ciclo"
```

**Regras do slide de aprendizados:**
- Máximo 3 itens por categoria — priorize os de maior impacto ou maior surpresa
- `dado` deve ser o número exato da campanha — não estimativa
- `implicação` é a decisão que o aprendizado gera para o próximo ciclo
- Se houver métricas globais da campanha (investimento, alcance, conversão total), adicioná-las como `métricas:` antes das categorias

**Slide de plano de ação:**
```markdown
## Slide N — Plano de Ação
tipo: plano-acao
seção: "Plano de Ação"
título: "Frase declarativa com o argumento central — ex: R$Xm priorizados em 4 horizontes, começando pelas vitórias rápidas"

impacto-total: "~R$Xm/ano"

horizontes:
  - horizonte: Imediato
    prazo: "< 30 dias"
    cor: r
    critério: "alto impacto + baixo esforço — vitórias rápidas sem investimento estrutural"
    ações:
      - id: A1
        título: "Descrição curta e acionável da iniciativa"
        impacto: "~R$Xk/ano"
        esforço: baixo
        racional: "Dado da análise que justifica por que esta ação é prioritária"

  - horizonte: Curto Prazo
    prazo: "1–3 meses"
    cor: a
    critério: "alto impacto + médio esforço — requerem processo ou integração simples"
    ações:
      - id: A2
        título: "..."
        impacto: "~R$Xk/ano"
        esforço: médio
        racional: "..."

  - horizonte: Médio Prazo
    prazo: "3–6 meses"
    cor: p
    critério: "médio impacto + esforço estrutural — mudanças de protocolo ou sistema"
    ações:
      - id: A3
        ...

  - horizonte: Longo Prazo
    prazo: "6–12 meses"
    cor: g
    critério: "transformacional — alto esforço, mudança cultural ou tecnológica"
    ações:
      - id: A4
        ...
```

**Regras do plano de ação:**
- **Classificação obrigatória por impacto × esforço:** vitórias rápidas (alto impacto, baixo esforço) → Imediato; transformações estruturais (alto esforço) → Longo Prazo
- **Esforço:** `baixo` (< 2 semanas, sem custo adicional), `médio` (1–3 meses, integração simples), `alto` (> 3 meses, mudança de processo ou sistema)
- **Máximo 3–4 ações por horizonte** — se houver mais, priorize pelas de maior impacto/esforço; excedentes vão obrigatoriamente para `## Apêndice Ax — Ações adicionais — [Horizonte]` (ver regras de overflow em Fase 4a)
- O `racional` deve ser extraído dos achados da análise — não inventar justificativas
- O `impacto` deve ter estimativa quando disponível na análise; se indisponível, indicar "não estimado"
- **Quando há muitas ações:** usar um slide de visão geral (`tipo: plano-acao`) + slides de detalhe por horizonte (`tipo: analítico` com `block-ni.html`) — um por horizonte

---

### Regras de conteúdo ao gerar o plano

**Action title (obrigatório em todos os slides analíticos):**
- O `título:` deve ser uma frase declarativa completa que carrega o insight — não um rótulo de tópico
- Errado: `"Crescimento de Receita"` / Certo: `"A receita cresceu 52% em 4 anos mas por ticket, não por volume"`
- O executivo que ler só os títulos dos slides deve entender o argumento completo

**Uma mensagem por slide:**
- Se um slide analítico tiver dois insights distintos, divida em dois slides
- Achados são fatos com dado de suporte — sem meta-comentários ("isso mostra que...")

**Sourcing obrigatório:**
- Toda estimativa ou taxa externa: incluir fonte de benchmark
- Hipóteses sem estimativa: incluir lógica de cálculo plausível sugerida

**Dados reais:**
- `dados para visualização` deve ter os números da análise, não descrições vagas

**Tabelas brutas vão para o apêndice, não para slides principais:**
- Se um dado só faz sentido como tabela (muitas linhas, referência para consulta) → mandar para o apêndice
- No slide principal, usar o gráfico que melhor comunica o insight; no apêndice, o dado completo
- Exceção: quando a comparação exata de 2–3 valores em colunas é o próprio ponto do slide

**Slide analítico com apêndice:**
Quando um slide principal tem dados complementares que ficaram no sumário em "Dados para apêndice", adicionar o campo `apendice:` com o ID do apêndice correspondente:

```markdown
## Slide N — [Action title]
tipo: analítico
seção: "..."
título: "..."
apendice: "apendice-distribuicao-grupos"   ← ID do slide de apêndice correspondente

métricas: ...
dados para visualização: ...
achados: ...
```

**Contracapa:**
```markdown
## Slide N — Contracapa
tipo: contracapa
texto: "Obrigado."
autor: "Nome da equipe ou empresa"    ← omitir se não aplicável
```

### Bloco de apêndice (ao final do arquivo, após todos os slides principais)

```markdown
---

## Apêndice

## Apêndice A1 — Distribuição completa por grupo
id: "apendice-distribuicao-grupos"
referencia: slide 5                        ← número do slide principal de origem
título: "Distribuição de receita por grupo de serviço — detalhamento completo"

dados:
  - Tabela ou gráfico com dados completos que não couberam no slide principal
  - Incluir todos os subgrupos, categorias ou períodos omitidos do slide principal
  - Contexto adicional que enriquece sem sobrecarregar o slide principal
```

**Regras do apêndice:**
- Cada apêndice deve ter um `id` único em kebab-case começando com `apendice-`
- A `referencia:` deve apontar para o número exato do slide principal
- O apêndice é auto-suficiente: alguém que ir direto para ele deve entender o contexto sem ver o slide principal
- Dados sem relevância para nenhum slide principal não vão para o apêndice — são descartados, mas documentados em `## Dados não incluídos`
- Sequência de numeração: A1, A2, A3... (independente da seção)

### Checklist de completude — obrigatório antes de salvar

Antes de fechar `slides_plan.md`, verifique cada item:

- [ ] Cada item numerado em "Dados para apêndice" do sumário tem um bloco `## Apêndice Ax` correspondente no arquivo.
- [ ] Cada slide com campo `apendice:` tem um bloco de apêndice com `id:` correspondente.
- [ ] Nenhum valor em `métricas:` ou `dados para visualização:` é uma descrição vaga — todos são números reais extraídos da análise.
- [ ] Se houver itens descartados, a seção `## Dados não incluídos` existe ao final do arquivo com motivo por item.

Se algum item falhar, corrija antes de salvar.

Após salvar, informe o usuário que `temp/slides_plan.md` foi criado. Se a seção `## Dados não incluídos` existir no arquivo, **liste-a explicitamente no chat** e pergunte ao usuário se concorda com os descartes ou se algum item deve ser incluído. Só então indique que pode executar `/build-slides`.
