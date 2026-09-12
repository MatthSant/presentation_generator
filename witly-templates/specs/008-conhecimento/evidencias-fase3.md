# Evidências — Spec 008, fase 3 (UI) — 2026-09-12

## Browser (wrangler dev, `/ui/dev-login`, editor)
- **Navegação** em três grupos: Plataforma (Templates, Pessoais, Conhecimento, Design system),
  Trabalho (Pendências com contador, Atividade, Saúde), Admin (Usuários, Configurações).
  `#/gerais` redireciona para `#/conhecimento?sempre=1`.
- **`#/conhecimento`**: as 28 entradas em 1 linha cada (pill do tipo na cor da família, nível,
  título, id, domínio, escopo quando não é geral, tags, versão, verificação). Segmentos de família
  com contagem (Saber 5 · Pensar 0 · Fazer 20 · Comunicar 3…), filtros de tipo (só os da família
  escolhida), domínio, nível, escopo (tipo + slug), status, "sempre", "não verificadas"; busca no
  servidor sem acento (`pagina` acha 3: o diagnóstico novo, CPA e "concentra ou é geral"). Tudo na
  URL: `#/conhecimento?familia=saber`, `?tipo=diagnostico`, `?q=pagina`.
- **`#/conhecimento/roas-liquido`**: corpo, campos da métrica (fórmula, unidade, melhor,
  armadilhas), tags, "Puxada: sempre, antes de escrever SQL, quando um número saiu da faixa, antes
  de redigir a entrega", v2 pelo seed, histórico v2/v1 com "ver" e "Restaurar", ações (propor
  edição, substituta, verificar, tirar do sempre, superseder), uso 0.
- **Propor entrada** (`#/conhecimento/novo?tipo=diagnostico`): formulário gerado do esquema — tipo
  agrupado por família com a definição de cada um, contadores 0/200 e 0/2000, campos do
  diagnóstico (sintoma, causas, checar, funil), domínio/nível/confiança, escopo, tags, gatilhos,
  "sempre" (editor), motivo, urgência com evidência. Ao digitar o título, o bloco **"Parecidas já
  existentes"** apareceu (CPA/CPL). Enviar → `#/pendencias/<id>` com a entrada proposta
  renderizada, motivo, votos vazios e a decisão.
- **Aprovar** na proposta → estado `aprovada`, id gerado do título
  (`cpl-subiu-com-ctr-e-cpm-estaveis-…`); `#/conhecimento?tipo=diagnostico` mostra a entrada
  (Pensar 1, v1, não verificada).
- **`#/pendencias`**: abas Propostas 0 · Aprovadas por votos 0 · Casos e testes pendentes 0 ·
  Triagem do agente 3 (link para a triagem da atividade). Menu mostra "Pendências 3".
- **`#/saude`**: bloco Conhecimento (28 ativas por tipo; sempre 28/40 e 7,4 KB de 10 com barra;
  propostas; 28 sem verificar; resultados a fechar) antes da tabela de templates.
- **`#/config`**: votos (2), dias para pendente (30), limites fixos.
- Console: sem erros do app (o único 401 é o `/api/me` antes do login).

## Testes
- Vitest: 90 (o teste de propostas ganhou a checagem de `/api/conhecimento/esquema`: 6 famílias,
  17 tipos, limites, rótulo do gatilho). Typecheck limpo.

## Tags e comunicação (mesmo dia, depois do PR #69)
- Vocabulário sugerido no esquema; formulário com datalist e chips por grupo; lista com filtro
  "tag" e contagem. `#/conhecimento?tag=trafego-pago` → 8 entradas (Saber 5, Fazer 3).
- Re-etiquetagem dos 28: `numeros` 9 · `entrega` 9 · `trafego-pago` 8 · `escrita` 6 · `dados` 6.
- `rules/comunicacao.md` do brain → 5 entradas novas em Comunicar/Fazer e 2 enriquecidas
  (frase-curta v4, vocabulário v4); 33 entradas, seed idempotente (segunda rodada sem versão nova).
