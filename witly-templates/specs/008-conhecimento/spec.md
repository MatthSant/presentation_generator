# Spec 008 — Conhecimento: o cérebro Witly como entradas tipadas no banco, que o time edita e o MCP puxa rápido

**Estado**: desenho fechado em 2026-09-12; fases 1–2 (banco + MCP) no PR #68 e fase 3 (UI) no PR seguinte — ver `tasks.md`, `evidencias.md` e `evidencias-fase3.md`. Fases 4–5 pendentes.

## 1. O problema hoje
O Grimório tem "contexto" em três lugares e nenhum eixo claro:
- `general_contexts` (28 entradas em `#/gerais`): definição de métrica, regra de dado, regra de
  comunicação, método e processo do agente numa lista só, com 3 tipos que não separam *natureza* de
  *assunto* nem dizem *onde vale*.
- `template_rules` por versão do template: certo para o que é do template (fica assim — decisão 2).
- `design-system` como template `kind = design`: certo (galeria + regras do design).

Não existe lugar para: inteligência de análise (como pensar, o que um sintoma costuma significar),
benchmark, funil, cliente, campanha, caso real, teste, comunicação por entregável, padrão de design por
situação. E só o editor muda: o time não propõe, não vota, não vê o que está pendente. Também só existe
template de *análise* (gera HTML); a forma de otimizar tráfego pago vive numa skill local.

O mediocrebrain serviu de referência (tipo como campo, resumo de 1 linha, confiança, FCA-R,
supersessão, cliente = delta). **Não se importa nada dele agora** (decisão 5); o modelo abaixo é o que
serve ao Grimório: banco, MCP, UI, time e versão.

## 2. Princípios
1. **Entrada curta.** Título = a frase que o agente precisa (≤ 200 caracteres). Corpo = porquê + como
   aplicar (≤ 2.000 caracteres, limite duro). O que não cabe vira outra entrada e um link.
2. **Nome simples.** Uma tabela `conhecimento`. Uma tool `conhecimento`. Um resource `conhecimento://id`.
   Tipos de uma palavra, em português, agrupados em famílias.
3. **Rápido e coerente para o MCP.** Filtro por índice (família, tipo, domínio, escopo, tag) + busca de
   texto (FTS5). Resposta em 1 linha por entrada; corpo só do que o agente pedir.
4. **Fácil de mexer, por todo mundo.** Propor direto na entrada; votar; aprovação por editor ou por votos,
   com histórico do que entrou por votos e botão de reverter.
5. **Urgência tem caminho próprio** e o agente pergunta ao consultor antes de gerar.
6. **Tudo versionado, nada apagado**: supersessão + histórico.
7. **Dado pessoal nunca entra** (o mesmo filtro do `registrar`). Cliente e campanha entram como negócio
   agregado, nunca lead, e-mail, telefone.

## 3. O modelo: uma tabela, quatro eixos, seis famílias

### 3.1 Eixos
| Eixo | Pergunta que responde | Valores |
|---|---|---|
| `familia` → `tipo` | **que natureza** de conhecimento é | ver 3.2 |
| `dominio` | **de que assunto** trata | `analise` · `dados` · `midia` · `negocio` · `comunicacao` · `design` |
| `escopo` | **onde vale** | `geral` · `template:<slug>` · `funil:<tipo>` · `cliente:<slug>` · `campanha:<id>` |
| `nivel` | **em que altura da decisão** | `estrategico` (direção do negócio: canal dominante, oferta, LTV × CAC, metas) · `tatico` (como conduzir campanha e análise: report, escalonamento, teste, régua) · `operacional` (execução do dia: alavanca do Meta, SQL, armadilha do Delfos, formato do report) |
| `tags` | assunto fino, livre | `atribuicao`, `criativos`, `ltv`, `meta-ads`, … |

### 3.2 Famílias e tipos (17 tipos; a família é o que a UI mostra primeiro)
**Saber — o que as coisas são**
| tipo | é | título (exemplo) | campos (`dados_json`) |
|---|---|---|---|
| `conceito` | um fenômeno ou ideia **aplicado aos negócios que analisamos**: onde aparece, onde já aconteceu, o cuidado a tomar. **Não é enciclopédia**: a teoria fica em 1 linha e um link; o resto é o nosso contexto | "Paradoxo de Simpson: aparece quando se compara CPC/conversão/ROAS agregados de campanhas com mix de temperatura ou de canal diferente; já inverteu a leitura no B55 (ago/26); antes de concluir, segmente por temperatura e canal" | `o_que_e` (1 linha), `onde_aparece[]` (situações dos nossos negócios: funil, métrica, momento), `ja_aconteceu[]` (ids de `caso`), `cuidado[]` (o que fazer/evitar), `referencia` (link externo, opcional). Proposta sem `onde_aparece` e `cuidado` é recusada |
| `definicao` | vocabulário: uma palavra, um sentido | "budget = configurado; investimento = realizado" | `termos[]` |
| `metrica` | número com fórmula e leitura | "ROAS líquido = (receita − invest) ÷ invest" | `formula`, `unidade`, `melhor` (maior/menor), `onde` (view.coluna no Delfos), `armadilhas[]` |
| `benchmark` | número de referência com contexto | "Conversão de página: ~20% checkout → compra em perpétuo de ticket baixo" | `metrica_id`, `valor`, `faixa`, `contexto` (funil, nicho, ticket), `fonte`, `data` |

**Pensar — a inteligência de análise (o que faltava na v1)**
| tipo | é | título (exemplo) | campos |
|---|---|---|---|
| `principio` | lógica de decisão que vale sempre, o "porquê" por trás das regras | "Canal com > 50% das vendas não se derruba: cresce-se outro enquanto ele segura" | `quando_falha`, `principios_relacionados[]` |
| `diagnostico` | sintoma → causa provável → o que checar, em ordem | "CPL subiu com CTR estável e CPM estável → conversão da página caiu; cheque velocidade e oferta antes do criativo" | `sintoma` (métrica + direção), `causas[]` (ordenadas, com `nivel`), `checar[]`, `funil` |
| `pergunta` | pergunta norteadora, o título é a pergunta | "Qual canal segura a conversão quando o CPL sobe?" | `como_aprofundar`, `metricas[]` |

**Fazer — como agir**
| tipo | é | título (exemplo) | campos |
|---|---|---|---|
| `regra` | quando X, faça Y | "Taxa sobre < 30 eventos no denominador é 'sem evidência'" | `forca` (`sempre` = obrigatória · `geralmente` = a recomendação de hoje), `sempre_no_contexto` (0/1) |
| `metodo` | passos para fazer algo (playbook, tipo de detalhamento). **`origem` separa metodologia Witly de framework específico**: `witly` = o nosso jeito (report 1d/3d/7d, FCA-R, escalonamento em camadas); `framework` = método nomeado de fora, com fonte (matriz CSD, STE-100, teste A/B validade-antes-da-estatística) | "Report 1d/3d/7d ancorado no dado fechado" (witly) · "Matriz CSD: certezas, suposições e dúvidas antes de decidir" (framework) | `origem` (witly · framework), `framework` (nome) e `fonte` quando framework, `quando`, `entrada`, `passos[]`, `saida`, `templates[]` |
| `padrao` | design/UX/UI de qualquer entregável: nesta situação, mostre assim | "Comparar canais no mesmo período: barras horizontais ordenadas, meta como linha" · "Slide analítico: 1 gráfico, 1 achado, número decisivo no título" | `entregavel` (dashboard · apresentação · one-pager · report · e-mail), `situacao`, `solucao`, `elemento_id` (galeria) ou `componente` (slides), `evite`, `exemplo` |

**Comunicar — como falar com o cliente (o que faltava)**
| tipo | é | título (exemplo) | campos |
|---|---|---|---|
| `estilo` | como escrever: tom, frase, palavras | "Frases até 20 palavras, voz ativa, sem jargão estatístico nem nome de tabela" | `publico` (consultor, cliente, C-level), `use[]`, `evite[]` |
| `formato` | estrutura de um entregável e o que o leitor lê | "Report diário no WhatsApp: 1 número decisivo, 3 linhas de FCA-R, pergunta no fim" | `entregavel`, `canal`, `secoes[]`, `tamanho`, `exemplo` |

**Contexto — onde vale**
| tipo | é | título (exemplo) | campos |
|---|---|---|---|
| `funil` | como um tipo de funil funciona e se decide | "Perpétuo: venda por first click em janela; decide por custo por checkout" | `fases[]`, `metricas_decisao[]`, `tetos`, `templates[]` |
| `cliente` | contexto de negócio de um cliente (o delta do genérico) | "Singular: perpétuo VSL, ticket R$ 497, meta CAC R$ 374" | `slug_delfos`, `modelo`, `funis[]`, `metas`, `canais[]`, `armadilhas_dado[]`, `templates[]` |
| `campanha` | histórico vivo de uma campanha ou lançamento (a nota `funis/<cliente>-<lançamento>.md` do brain) | "Vitalícia set/26 (Singular): captação 01–14/09, carrinho 15–19" | `cliente_id`, `funil` (tipo), `periodo`, `objetivo`, `metas`, `tetos`, `processo` (régua de teste/escala do cliente), `budgets` (snapshot configurado, com data), `pendencias[]` (lembretes com data), `linha_do_tempo[]` (ver 3.4) |

**Memória — o que aconteceu**
| tipo | é | título (exemplo) | campos |
|---|---|---|---|
| `caso` | FCA-R real, com resultado — o exemplo e a ação que funcionou (ou não) | "Régua com 100% de acerto era overfitting" | `situacao` {`funil`, `nivel`, `sintoma`, `metrica`}, `fato`, `causa`, `acao`, `resultado` (pendente/confirmado/refutado), `data`, `campanha_id`, `cliente_id` |
| `teste` | hipótese pré-registrada e o que deu | "Página B vs A: custo por checkout −15% (confirmado 12/08)" | `hipotese`, `metrica`, `inicio`, `fim`, `resultado`, `aprendizado`, `campanha_id` |

Notas de desenho:
- **Nada é enciclopédia.** Toda entrada, de qualquer tipo, responde "e daí, para os negócios que a gente
  analisa?". "Paradoxo de Simpson" só existe como `conceito` se disser onde aparece nos nossos funis
  (mix de temperatura, mix de canal, dia de pico × perpétuo), onde já aconteceu (`ja_aconteceu` → casos)
  e o cuidado (segmentar antes de concluir). A partir dele nascem a `regra` "antes de concluir sobre
  variação agregada, segmente por temperatura e canal" (`sustenta` → conceito) e o `diagnostico`
  "agregado contradiz os segmentos → cheque a mistura de volumes". O agente puxa a regra no nível 1 e o
  conceito só quando precisa explicar o porquê ao consultor (`ao_escrever`). Vale para todos os tipos: a
  Saúde acusa entrada sem `onde_aparece`/`cuidado`/`situacao`/`exemplo` conforme o tipo.
- `recomendacao` deixa de ser tipo: é `regra` com `forca = geralmente` (as 28 de hoje migram assim).
- **"Ações que funcionaram" não vira tipo nem regra** (decisão 7). É busca: `caso` tem `situacao`
  estruturada, e `conhecimento({tipo:'caso', situacao:{funil:'lancamento', sintoma:'cpl-subiu'},
  resultado:'confirmado'})` devolve o que já funcionou naquela situação. A UI tem a mesma busca
  ("O que funcionou quando…"). Promover a `regra` é decisão humana, por proposta.
- Design entra em três lugares: `padrao` (situação → widget, linka a galeria), `regra`/`principio` com
  `dominio = design` ("se tem meta, sempre compare com a meta"), e o design system (spec 006) segue
  dono dos elementos e do contrato.

### 3.3 Colunas comuns
`id` (slug curto, único) · `familia` · `tipo` · `dominio` · `escopo` · `tags` (json) · `titulo` ·
`nivel` · `corpo_md` · `dados_json` · `confianca` (alta/media/baixa) · `fontes` (json) · `status`
(ativo/rascunho/supersedido) · `supersedido_por` · `sempre` (0/1) · `gatilho` (json, ver 6.1) · `autor` ·
`criado_em` · `atualizado_em` · `versao`. `conhecimento_hist` (snapshot por versão) · `conhecimento_fts` (FTS5).

### 3.4 Campanha: o histórico que se escreve sozinho
`linha_do_tempo[]` = `{data, tipo: contexto | analise | achado | acao | resultado, texto, ref}`.
- `analise` entra sozinha: `registrar({evento:'geracao'|'aprofundamento', campanha: id})` anexa o evento
  com `ref` = id da atividade (é log, como a atividade; não passa por proposta).
- `achado` e `acao` propostos pelo agente entram como eventos **marcados "proposto"** na linha do tempo
  (visíveis já); confirmar/recusar é um clique na campanha. `resultado` é sempre humano.
- `caso` e `teste` apontam para a campanha; a campanha mostra os dela. Ao fechar a campanha, a UI
  sugere: "3 achados sem caso — virar caso?".
- O agente, ao pedir "olha o lançamento X", recebe o resumo da campanha + os últimos eventos no índice.
- **Paralelo com o brain** (é de lá que vem o desenho): hub do cliente → `cliente`; `funis/<slug>-<lançamento>.md`
  → `campanha` (período, tetos, processo); `reports/<funil>/AAAA-MM-DD_*.md` → eventos `analise` (o texto do
  report fica na atividade); `<slug>-decisoes.md` (FCA-R) → eventos `acao` com F/C/A/R e `resultado`;
  `trafego/<slug>-budgets.md` → `budgets`; `<slug>-lembretes.md` → `pendencias`; `inbox/` → `sugerir`.

## 4. Como o conhecimento entra e muda: propostas, votos, aprovação, urgência
Ninguém edita entrada ativa direto. Toda mudança é uma **proposta** na entrada (ou de entrada nova).

### 4.1 Proposta
`proposta`: `id` · `entrada_id` (nulo = nova) · `modo` (`nova` · `edicao` · `substituta` ·
`fechar_resultado` · `superseder`) · conteúdo proposto · `motivo` · `urgencia` (4.4) · `origem`
(`ui:<email>` · `mcp:<email>`) · `ocorrencias` · `estado` (`aberta` · `aprovada` · `recusada` ·
`fundida` · `revertida`) · `aprovada_por` (`editor:<email>` · `votos`) · `criado_em`.
- **UI**: "Propor" em toda entrada abre o editor preenchido; salvar cria a proposta. "Nova" = `modo nova`.
- **MCP**: `sugerir({tipo, ...campos, motivo, urgencia?})` (substitui `sugerir_regra`); `registrar` de
  aprofundamento/feedback pode anexar `casos[]`/`testes[]` propostos.
- **Parecida com uma existente?** A FTS procura entradas e propostas abertas com o mesmo assunto. Na UI
  mostra lado a lado: "é a mesma coisa" → voto + `ocorrencias += 1` na existente; "é melhor" → proposta
  `substituta`. Pelo MCP a checagem devolve os ids parecidos; idêntica só incrementa `ocorrencias`.

### 4.2 Voto
`voto`: `proposta_id` · `email` · `valor` (+1/−1) · `comentario`. Um por pessoa. Concorrentes sobre a
mesma entrada aparecem juntas, com o texto atual como opção zero.

### 4.3 Aprovação (decisão 3: editor **ou** N votos, com reversão)
- Um editor aprova/recusa a qualquer momento. Sem editor, N votos +1 líquidos aprovam; −N recusa.
- Aprovar = `versao + 1` + snapshot; `substituta` supersede a atual. `aprovada_por` guarda quem.
- **Aprovadas por votos (últimos 30 dias)**: painel próprio em Pendências, com diff e botão **Reverter**
  (restaura a versão anterior, marca a proposta `revertida`, avisa quem votou). É a rede de segurança
  para aprovação sem editor. `N` é configuração da org (proposta: 2).

### 4.4 Urgência
| `urgencia` | o que é | caminho |
|---|---|---|
| `urgente` | erro que contamina as próximas análises: cálculo errado, métrica com sentido errado, regra de dado quebrada | fila própria, banner, só editor aprova, **o agente pergunta ao consultor** |
| `normal` | conhecimento novo, melhoria | 4.3 |
| `baixa` | aparência, redação, exemplo | 4.3, pode esperar o lote |

Para `urgente`:
1. **O agente traz a pendência e pergunta antes de gerar.** `obter_template` e `guia` injetam no topo as
   urgentes abertas no escopo do pedido: `⚠ Pendente de aprovação (urgente, X, 12/09): ROAS deve ser
   líquido, não bruto`. Instrução: mostrar ao consultor, perguntar "isso está certo?"; sim → aplica e
   `confirmar(proposta_id, ok:true)`; não → segue a regra atual e `confirmar(..., ok:false, motivo)`.
   A confirmação é voto de quem está logado no MCP; se é editor, é **aprovação** na hora. Urgente de
   quem não é editor só aparece depois do primeiro +1 de um editor (UI ou chat).
2. Banner na UI, topo de Pendências, Saúde mostra "urgentes abertas há mais de 24 h".
3. Só editor aprova (votos não bastam). Ao aprovar, `metrica`/`regra` ganham `sempre = 1` se não tinham.
4. **Rastro de impacto**: a aprovação lista templates cujo kit cita a métrica/regra (escopo, tags, busca
   no `guia.md`/`documento.md`) e as análises geradas desde a data do erro (`activity`). Cada template
   afetado ganha uma sugestão na triagem dele ("atualizar regra/guia/Python").
5. `sugerir` aceita `urgencia`; o feedback aceita `urgencia` por item de `custou`.

### 4.5 Caso e teste têm ciclo
Nascem `pendente`; "fechar resultado" é proposta `fechar_resultado` (número + data). Pendente há mais de
N dias aparece em Saúde. Refutado baixa a `confianca` das entradas que o citam e avisa quem propôs.

## 5. Templates que não são análise: `kind = conversa` (decisão 8)
A skill `analise-trafego` (otimizar tráfego pago: report campanha → público → criativo em 1d/3d/7d,
custo por checkout, escalonamento, teste de página) é um **roteiro**, não um gerador de HTML. Vira
template `kind = conversa`, versionado e editável como os outros:
- Manifesto: `objetivo`, `quando_usar` (gatilhos), `entrada` (o que pedir ao consultor), `passos[]`
  (carregar contexto → rodar → recomendar → registrar), `ferramentas` (Delfos: `Credentials`,
  `Witly_Query`, `Log_Queries`), `saida` (report em texto, formato = entrada `formato`), `conhecimento`
  (filtros que o índice carrega: `escopo`, `tags`, tipos).
- `obter_template(slug)` devolve o roteiro + o índice de conhecimento dos filtros + as entradas `sempre`.
  Sem zip, sem Python. `registrar` funciona igual (geracao = report entregue; feedback ao fechar).
- `template_rules` e `context_tasks` valem para conversa também.
- Um roteiro é uma sequência de **etapas com checkpoint**: cada etapa tem `entrega` (o que o agente mostra),
  `espera` (a palavra do consultor que libera a próxima) e `registra` (o que anota antes de seguir). O agente
  **não faz tudo de uma vez**: entrega a etapa, pergunta, anota, e só então avança.
- **`otimizar-trafego`** (do agente `@trafego` + `rules/trafego.md` do brain). Etapas:
  | # | entrega | espera | registra | puxa (6.1) |
  |---|---|---|---|---|
  | 0 | cliente + campanha identificados, dado fechado (`Credentials`, `MAX(data)` por fonte), budgets e pendências da campanha | "ok" ou correção | — | cliente, campanha, urgentes |
  | 1 | **report geral da campanha**: funil/campanha em 1d/3d/7d, só o que gastou ontem, custo por checkout (ou CPL/CPMQL) em destaque, tendência, teto | "vai" | `registrar(geracao)` = evento `analise` | `formato` do report, `metrica`, `benchmark` do funil |
  | 2 | **report por temperatura** (1º token do nome da campanha `hot/warm/cold/adv`; sem marcador = avisa e pula) | "vai" | evento `achado` por temperatura que chamou atenção | `diagnostico` |
  | 3 | **visão campanha a campanha**: lista com o que merece olhar, ordenada | escolha da campanha | — | — |
  | 4 | **uma campanha por vez**: público → criativo, FCA-R, recomendação respeitando as alavancas (criativo só liga/desliga; verba no adset) | decisão do consultor: "desliga o ad42", "sobe 20% no adset X", "deixa" | **cada decisão vira evento `acao`** (3.4) com o motivo real dele e `resultado: pendente` + critério; budget novo → `budgets`; "olhar de novo em N dias" → `pendencias` | `caso` (o que funcionou nessa situação), `regra` das alavancas |
  | 5 | fechamento: resumo do que foi decidido, pendências, `Log_Queries` | — | `registrar(feedback)`; aprendizado que serve a outro cliente → `sugerir` | — |
  "Roda o report" sem mais nada = etapas 0–1 e para. "Otimização" = todas. Fim de semana/feriado e maturação
  são avisos antes de qualquer recomendação. As regras fixas ("só o que gastou ontem", "CPMQL é um só",
  "a Meta não desliga criativo", alavancas, maturação) viram `template_rules` do roteiro; o playbook (report
  1d/3d/7d, escalonamento, régua de corte) vira `metodo` com `escopo = template:otimizar-trafego`; o formato
  do report vira `formato`.
- **Evento `acao` é genérico e estruturado** — serve a tráfego, CRM, página, oferta, conteúdo, dados, qualquer
  frente: `{data, area (trafego · crm · pagina · oferta · conteudo · dados · outro), nivel (livre: campanha,
  adset, criativo, fluxo, etapa, página…), alvo (nome/ID), acao (verbo curto: ligar, desligar, escalar,
  reduzir, trocar, criar, corrigir, manter…), valor, fato, causa, resultado: pendente|confirmado|refutado,
  verificar_em, quem, ref (atividade)}`. `area`/`nivel`/`acao` são texto com sugestões por roteiro (o de
  tráfego sugere campanha/adset/criativo e ligar/desligar/escalar), não enum fechado.
  A tela **Ações** (8) lista todas, de todos os clientes e frentes, com filtro por cliente, campanha, área,
  período, nível, ação, quem e resultado — o lugar de ver "o que foi feito" sem abrir campanha por campanha,
  e de fechar resultados pendentes (vencidos por `verificar_em` sobem ao topo e aparecem na Saúde).
  O mesmo mecanismo vale para qualquer roteiro futuro (CRM, lançamento, e-mail): etapas com checkpoint +
  ações estruturadas na campanha.
- **`novo-cliente`** (decisão 4): pede a página
  do cliente (URL ou texto colado) ou faz as perguntas de contexto — o que vende, modelo de negócio,
  ticket, público, funis ativos e tipo, canais e peso, metas (CAC/CPL/ROAS), slug no Delfos, armadilhas
  de dado conhecidas — e termina com `sugerir({tipo:'cliente', ...})`. A UI tem o mesmo assistente em
  "Novo cliente" (colar página ou responder as perguntas).

## 6. Como o MCP usa

### 6.1 Hierarquia de carga: o que puxa primeiro, o que puxa depois, e quando
O medo certo: "um festival de contexto que o agente puxa sempre". A regra é: **cada entrada declara quando
é puxada** (`gatilho`), e cada nível só entra quando o pedido o justifica.
| nível | quando entra | o que entra | tamanho |
|---|---|---|---|
| 0 · sempre | toda chamada de `obter_template`/`guia` | urgentes pendentes do escopo + entradas `sempre = 1` (título + 1 linha) | ≤ 3 KB |
| 1 · template | ao abrir um template ou roteiro | `template_rules` do kit + **índice** (só títulos) das entradas com `escopo` do template/funil e as tags do manifesto | ≤ 3 KB |
| 2 · cliente/campanha | só quando o pedido nomeia um cliente ou campanha (ou o roteiro chega à etapa que os identifica) | resumo do `cliente` + `campanha` (metas, tetos, budgets, pendências, últimos eventos) + índice das entradas com esse escopo | ≤ 3 KB |
| 3 · gatilho | quando a etapa do roteiro ou a situação pede — o agente chama `conhecimento({gatilho: …})` | corpo completo das entradas daquele gatilho, filtrado pelo escopo já conhecido | ≤ 20 entradas |

`gatilho` (campo de toda entrada, um ou mais): `sempre` · `ao_abrir` (template) · `ao_identificar` (cliente/
campanha) · `ao_consultar_dados` (antes de escrever SQL: armadilhas do Delfos, `metrica.onde`) ·
`ao_diagnosticar` (quando um número saiu da faixa: `diagnostico`, `benchmark`, `principio`) ·
`ao_recomendar` (antes de propor ação: `caso` da situação, `regra` de alavancas, `metodo`) ·
`ao_escrever` (antes de redigir a entrega: `estilo`, `formato`, `padrao`, `definicao`) · `ao_fechar`
(feedback, casos, testes pendentes). Cada etapa de um roteiro declara os gatilhos dela (coluna "puxa" em 5);
num template de análise, as tarefas de contexto e o bloco "Ao terminar" fazem o mesmo papel. Entrada sem
gatilho = só por busca explícita. A UI mostra o gatilho na entrada e a Saúde acusa `sempre` acima de 40.

1. `obter_template(slug)` injeta os níveis 0 e 1 (e o 2 se o pedido já trouxe cliente/campanha): kit
   (análise) ou roteiro (conversa) + urgentes pendentes do escopo (4.4) + entradas `sempre` (título +
   1 linha) + **índice** (1 linha por entrada) do conhecimento relevante.
2. **`conhecimento(filtro)`** — uma tool:
   `{ familia?, tipo?, dominio?, escopo?, tags?, q?, cliente?, campanha?, funil?, situacao?, resultado?,
   ids?, detalhe: 'indice' | 'completo', limite }`. Exemplos: `{cliente:'singular'}` antes de gerar;
   `{tipo:'diagnostico', q:'cpl subiu'}` ao interpretar; `{tipo:'caso', situacao:{funil:'lancamento',
   sintoma:'cpl-subiu'}, resultado:'confirmado'}` = o que funcionou; `{tipo:'formato', q:'whatsapp'}`
   antes de escrever o report; `{campanha:'vitalicia-set26'}` para o histórico.
3. `conhecimento://<id>` como resource (`contexto://geral/<slug>` vira alias por uma versão).
4. `sugerir(...)`, `confirmar(proposta_id, ok, motivo?)`, `registrar` com `campanha` e `casos[]`/`testes[]`.
5. Orçamento por chamada: urgentes + `sempre` ≤ 10 KB; índice ≤ 6 KB; corpo só via tool.

## 7. Limites (decisão 6 — o que vale para o quê)
| limite | vale para |
|---|---|
| título ≤ 200, corpo ≤ 2.000 caracteres | **toda entrada**, de qualquer tipo |
| `sempre` ≤ 40 entradas, bloco ≤ 10 KB | **global**: é o que entra em toda chamada, de qualquer template (análise, livre ou conversa). Medido na implementação: as 28 de hoje em título + 1 linha dão 7,6 KB — 3 KB era impossível; 10 KB é o teto (a Saúde acusa) |
| índice ≤ 40 linhas, ≤ 6 KB | **por chamada**, montado pelo escopo/tags daquele template + cliente/campanha |
| resposta da tool ≤ 20 entradas completas / 100 no índice | por chamada da tool |

## 8. UI (`#/gerais` → `#/conhecimento`)
- **Lista** por família (abas) → tipo, domínio, escopo, tag, confiança, status; busca; 1 linha por entrada
  com versão, propostas abertas, casos ligados.
- **Entrada**: formulário por tipo (métrica: fórmula/unidade/melhor; diagnóstico: sintoma/causas/checar;
  caso: situação + F/C/A/R; formato: seções/exemplo), fontes, histórico com diff/restaurar, aba
  **Propostas** (concorrentes lado a lado, votos, comentários).
- **Propor** em qualquer entrada ou "Nova"; detector de parecida (4.1).
- **Pendências**: urgentes · propostas (por ocorrências + votos) · aprovadas por votos (30 dias, Reverter)
  · casos/testes pendentes · triagem do agente (spec 007).
- **Campanhas**: lista por cliente, linha do tempo, eventos propostos para confirmar, fechar campanha.
- **Ações**: todas as ações registradas, de todos os clientes e frentes (tráfego, CRM, página…), com filtro por
  cliente, campanha, área, período, nível, ação, quem, resultado; pendentes vencidas no topo; fechar resultado
  ali mesmo. É a visão do gestor de tráfego (e de qualquer operador) sobre o que foi feito.
- **Clientes**: lista, "Novo cliente" (colar página ou perguntas), campanhas e casos do cliente.
- **O que funcionou**: busca de casos por situação.
- **Templates**: catálogo mostra `kind` (análise · conversa · design); editor de roteiro para conversa.
- **Saúde** e **Configurações** (N de votos, limites, dias para pendente vencido).

## 9. Migração
- 0011: `conhecimento`, `conhecimento_hist`, `conhecimento_fts`, `proposta`, `voto`, `org.config`
  (N, limites); `templates.kind` aceita `conversa`; copiar `general_contexts` → `conhecimento`
  (`escopo = geral`, `sempre = 1`, `regra` → `forca` por tipo antigo; definição de métrica → `metrica`;
  comunicação → `estilo`); `general_contexts` some em 0012.
- `listGeneralContexts` → `listarConhecimento({sempre: true})`; `sugerir_regra` → `sugerir` (alias).
- Seed: `seed/conhecimento/<familia>/<tipo>/<id>.md` com frontmatter; `seed/general-contexts/` migra;
  `seed/otimizar-trafego/` e `seed/novo-cliente/` como `kind = conversa`. Nada do brain (decisão 5).

## 10. Fases (um PR cada)
1. Banco + db + migração das 28 + seed + Vitest.
2. Tool `conhecimento`, índice no `obter_template`, resource, `sugerir`/`confirmar`, urgentes, parecida.
3. UI: lista por família, entrada por tipo, propor/votar/aprovar/reverter, pendências, saúde, config.
4. `kind = conversa`: manifesto, `obter_template`, editor; roteiros `otimizar-trafego` e `novo-cliente`.
5. Campanha: tipo, linha do tempo via `registrar`, tela de campanhas e clientes, "o que funcionou".
As fases 1–2 dão o MCP usando; 3 dá o time; 4 dá tráfego e cliente; 5 dá o histórico.

## 11. O que o Matheus pediu → onde já existe no brain → o que vira aqui
| Pedido | No brain | Aqui |
|---|---|---|
| contexto de inteligência | `conceito` de confiança alta (canal dominante, piso antes do teto, escalonamento, árvore de métricas, Simpson) | `principio` + `diagnostico` (família Pensar) |
| métricas | `wiki/marketing/metricas/*` (fórmula, leitura, armadilhas) | `metrica` + `benchmark` |
| tipos de detalhamento, metodologia | `playbook` | `metodo`, `pergunta` |
| regras de negócio | `regra` + `rules/trafego.md` | `regra` (`forca`) e `template_rules` do roteiro |
| contexto sobre funil | `wiki/marketing/funis/*` (lançamento, perpétuo, isca) | `funil` |
| contexto do cliente | hub `<slug>.md` + `<slug>-dados.md` | `cliente` (+ roteiro `novo-cliente`) |
| campanha: contexto, análises, pontos de atenção, ações, resultados | `funis/<slug>-<lançamento>.md` + `reports/` + `decisoes.md` + `budgets.md` + `lembretes.md` | `campanha` com linha do tempo (3.4) |
| cases / exemplos | `caso` (FCA-R) em `wiki/*/casos/` | `caso` com `situacao` + busca "o que funcionou" |
| testes e resultados | `documentacao-de-testes`, `teste-ab`, casos | `teste` |
| comunicação | `rules/comunicacao.md` (STE-100, dicionário, FCA-R, números com janela) + `_templates/report.md` | `estilo`, `formato`, `definicao` |
| design/UX/UI de apresentações e entregas | `apresentar-resultado` (playbook), design system do app, `tools-map.md` das skills de slides | `padrao` (por entregável) + `regra`/`principio` de `dominio = design`; elementos seguem no design system |
| skill/conversa de tráfego | `.claude/agents/trafego.md` + `skills/analise-trafego` | template `kind = conversa` `otimizar-trafego` |
| sugerir, votar, aprovar, reverter, urgência | `inbox/` → bibliotecário (uma pessoa) | propostas + votos + política + urgência (4) |

## 12. Decisões fechadas na v1 → v2
1 tipos: refeito em famílias, com Pensar/Comunicar/Contexto novos · 2 regras de template ficam ·
3 editor ou N votos + reversão · 4 `novo-cliente` (roteiro + assistente na UI) · 5 sem importar o brain ·
6 limites explicados por alcance (7) · 7 caso com situação + busca, sem promoção automática ·
8 `kind = conversa` · 9 `campanha` com linha do tempo · 10 `estilo` e `formato` · design: `padrao` +
regras/princípios de design.

## 13. Riscos e desdobramentos no uso (e o que o desenho faz com cada um)
| # | O que pode dar errado | Como aparece | Mitigação no desenho |
|---|---|---|---|
| R1 | **Taxonomia erode**: 16 tipos, gente classifica diferente; a mesma ideia entra como `regra`, `principio` e `diagnostico` | duplicatas, busca acha 3 versões | detector de parecida cruza tipos; "não sabe o tipo? proponha como `regra`, o editor reclassifica" (reclassificar é 1 clique, sem nova proposta); Saúde lista entradas sem gatilho/escopo e pares parecidos |
| R2 | **Contexto incha mesmo com hierarquia**: todo mundo marca `sempre` ou `urgente` para ser ouvido | bloco 0 bate 3 KB, agente lê 40 regras antes de qualquer análise | `sempre` só por editor; orçamento em KB medido por chamada e mostrado na Saúde; `usage_log` conta quantas vezes cada entrada foi puxada — nunca puxada em 60 dias = candidata a descer de nível |
| R3 | **Agente não puxa no gatilho** e responde de cabeça | erro que o conhecimento já cobria | gatilhos escritos na etapa do roteiro e no "Ao terminar"; o `registrar` de feedback leva `usadas: [ids]`; Saúde mostra entradas nunca lidas; teste de kit garante a instrução |
| R4 | **Urgente vira ruído**: tudo é urgente, o agente pergunta "isso está certo?" a toda hora | consultor cansa, ignora | urgente só para cálculo/métrica/regra de dado (checkbox "afeta números já entregues?"); no máximo 3 urgentes por chamada; pergunta uma vez por conversa; urgente sem editor em 48 h cai para normal com aviso |
| R5 | **Aprovação por votos em time pequeno**: 2 votos aprovam bobagem | regra errada ativa | reversão em 30 dias; aprovada por votos entra com `confianca = media` e marcada "por votos" até um editor tocar; digest semanal ao editor |
| R6 | **Confirmar no chat = aprovar** no meio de uma análise, sem ler direito | editor aprova sem querer | **proposta de ajuste**: `confirmar` no chat aplica na análise e vale como voto; a aprovação definitiva de urgente continua na UI (um clique, já com o voto contado). Se você preferir aprovar no chat mesmo, fica como está em 4.4 |
| R7 | **Linha do tempo da campanha vira lixão**: 30 reports = 30 eventos; achados "propostos" que ninguém confirma | ninguém lê | índice mostra só os últimos 10 + pendências; evento proposto sem confirmação em 14 dias vira "não confirmado" (some do índice, fica no histórico); fechar campanha exige triagem dos propostos |
| R8 | **Ação pendente nunca fecha**: sem resultado, não se sabe se foi acerto ou sorte | "confirmado" some, aprendizado não nasce | `verificar_em` obrigatório; a etapa 0 do roteiro traz as pendências vencidas da campanha e pede para fechar **antes** de olhar o dia ("o que decidimos dia 5 deu certo?"); Ações e Saúde mostram vencidas |
| R9 | **Duas verdades**: `template_rules` (versão do kit) × conhecimento escopado ao template (versão própria) contradizem | agente vê regra velha no kit e nova no índice | regra: conhecimento mais novo ganha e diz "difere do kit"; o publish do template lista "conhecimento escopado mudou desde a v anterior" para alinhar |
| R10 | **Brain × Grimório divergem**: Matheus escreve no vault, time no Grimório | conteúdo diferente nos dois | decisão explícita: vault = pessoal e referência; Grimório = time e MCP; sincronização é spec própria; a skill de tráfego vira ponteiro para o roteiro quando ele publicar |
| R11 | **UI cresce demais** (16 formulários, propostas, votos, campanhas, ações, clientes) | pesada de construir e de usar | um **esquema por tipo** (JSON) gera o formulário, a validação, o texto do MCP e o seed; famílias como abas; fases separadas; nada de tela que não tenha uso na fase |
| R12 | **Mais chamadas de tool** por análise (gatilhos) → latência e tokens | análise mais lenta | índice de nível 1 evita busca cega; filtros combinados numa chamada; `usage_log` mede chamadas por análise; meta ≤ 4 chamadas de `conhecimento` numa análise típica |
| R13 | **FTS5 no D1**: triggers para manter o índice, tamanho, acento | busca não acha "cpl" em "CPL" | FTS5 com `unicode61 remove_diacritics`; triggers de insert/update/delete; fallback `LIKE` no título se o FTS falhar; teste de busca com acento |
| R14 | **Confidencialidade entre clientes**: consultor de um cliente vê metas de outro | vazamento interno | org única hoje; `cliente`/`campanha` só com negócio agregado; filtro de dado pessoal em todo texto; visibilidade por cliente (`acl`) é spec futura se o time crescer |
| R15 | **Ações propostas pelo agente parecem feitas** | operador acha que o ad foi desligado | evento proposto tem selo "proposto pelo agente" e nunca entra na tela Ações até confirmado; só ação confirmada por pessoa é "feita" |

## 14. O que a pesquisa mudou no desenho (2026-09-12)
Pesquisa sobre `akitaonrails/ai-memory` e 15 sistemas parecidos (Karpathy LLM Wiki, Anthropic Skills,
Claude Code memory, Cursor Rules, Hermes, Zep/Graphiti, Mem0, Letta, LangMem, A-MEM, Cognee, Guru/Slite,
basic-memory, arXiv 2607.26637, arXiv 2606.17591, ReasoningBank). Ninguém tem o conjunto: tipos com campos
próprios + propostas com votos + urgência confirmada no chat + escopo cliente/campanha + ações com resultado.
Onde alguém resolveu melhor, adotamos:
| # | Mudança | De onde |
|---|---|---|
| P1 | **Esquema fixo; o agente só propõe, nunca reorganiza.** Confirmado: reorganização por agente erode e não melhora resposta. | arXiv 2607.26637 |
| P2 | **Nível 0 com limite duro e erro, não corte silencioso.** Se `sempre` + urgentes passam de 3 KB, a promoção é recusada e a Saúde mostra "% do orçamento"; o `quem_sou` mostra o mesmo. | Claude Code memory (200 linhas/25 KB), Hermes |
| P3 | **Índice de nível 1 = título + "quando usar" em 1 linha.** O gatilho vai escrito na linha do índice, como a `description` de uma skill. | Anthropic Agent Skills (3 níveis com custo tabelado) |
| P4 | **Relações tipadas, vocabulário fechado**: `supersede` · `contradiz` · `corrige` · `sustenta` (caso → regra). "Parecida" gera `supersede` explícito, não fusão; `contradiz` aberta vira item de lint na Saúde sem LLM. | ai-memory `typed-edges.md`, Graphiti |
| P5 | **Deprecar, nunca apagar, e guardar evidência por entrada**: tabela `conhecimento_uso` (entrada, atividade, data, `ajudou` sim/não/nulo). O `registrar` de feedback leva `usadas: [{id, ajudou}]`. Entrada com evidência negativa repetida vira proposta de revisão automática. | arXiv 2606.17591 (evidence log por regra), Cognee (`feedback_weight` por nó usado) |
| P6 | **Verificação com dono e prazo**: `verificado_por`, `verificado_em`, `verificar_ate`. O MCP devolve o status na linha ("verificada 01/09 por X" / "não verificada"); vencida aparece na Saúde e o agente vê "vence em…". `confianca` fica como rótulo humano; verificação é o que o time e o agente olham. | Guru (verifier + intervalo), Slite |
| P7 | **Proposta do MCP com formato validado e filtros negativos**: exige `motivo` e `evidencia` (ref da atividade + trecho com número); recusa proposta sem número, "one-off" (uma sessão só, sem generalização), falha transitória de ferramenta. | ai-memory `auto-improvement-loop.md` |
| P8 | **Recusas alimentam o futuro**: proposta recusada guarda o motivo; `sugerir` checa parecida também entre recusadas e devolve "já recusado em 05/09: <motivo>" em vez de reabrir. | ai-memory *rejection buffer* |
| P9 | **Feedback por entrada usada, não só por sessão** (P5); "o que segurou / o que custou" referencia ids. | Cognee, ai-memory (`acesso` ≠ `ajudou`) |
| P10 | **Promoção ao "sempre" é subtrativa e humana**: orçamento de 40; com a cota cheia, promover pede "qual sai?" (evict-to-admit); uso zero em 60 dias só rebaixa o rank, nunca remove sozinho. | ai-memory `design-rules-promotion.md` |
Não adotado, de propósito: decadência numérica de memória (fórmulas de esquecimento — servem a memória
episódica de código, não a regra de negócio), datação "tempo-de-mundo" por LLM (Graphiti; caro e frágil),
evolução automática de notas (A-MEM; corrompe em silêncio), gravação automática por hook sem revisão.

## 15. Decisões fechadas em 2026-09-12 ("segue com o plano e sugestões")
1. 17 tipos em 6 famílias, como em 3.2. 2. `N = 2` votos; qualquer usuário logado vota; urgente só editor.
3. Ações/achados do agente entram na campanha já visíveis com selo "proposto" (nunca na tela Ações até
confirmados). 4. Ordem 1-2-3-4-5; fases 1+2 no mesmo PR (o MCP usando). 5. R6: `confirmar` no chat aplica na
análise e vale como voto; aprovação definitiva de urgente é na UI. 6. R9: conhecimento mais novo ganha e
avisa que difere do kit. 7. P1–P10 da seção 14 entram nas fases correspondentes.

## 16. Ainda em aberto (antes)
1. Os 17 tipos em 6 famílias estão certos? Algum sobra ou falta (ex.: `glossario` do cliente, `oferta`)?
2. `N` de votos = 2? Quem vota: qualquer usuário logado?
3. Eventos `achado`/`acao` do agente entram na campanha já visíveis como "proposto" (sem esperar
   aprovação), ou só depois de confirmados?
4. Ordem das fases: 1-2-3-4-5, ou `conversa` (4) antes da UI (3) para o `otimizar-trafego` sair do vault
   mais cedo?
