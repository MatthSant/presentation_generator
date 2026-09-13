# Evidências — Spec 008, fase 5 (campanha e ações) — 2026-09-13

## O modelo
- A campanha é uma entrada de conhecimento (`tipo: campanha`); os eventos vivem em
  `dados.linha_do_tempo` e **não passam por proposta** — são log. O que passa por confirmação é o
  que o agente propõe: `achado` e `acao` entram com `proposto: true` e só contam como feitos
  depois que uma pessoa confirma na UI. `analise` entra direto (é registro do que foi entregue).
- Ação é genérica e serve a qualquer frente: `area` (trafego, crm, pagina, oferta, conteudo,
  dados, outro), `nivel`, `alvo`, `acao` (verbo), `valor`, `fato`, `causa` (com o motivo real do
  consultor), `resultado` (pendente/confirmado/refutado), `verificar_em`, `quem`. Os três primeiros
  são texto com sugestão, nunca enum fechado.

## MCP
- `registrar({..., campanha, eventos:[…]})` anexa na linha do tempo. A resposta diz o que entrou:
  `3 evento(s) na campanha vitalicia-set26 (3 no total); 2 entra(m) como PROPOSTO — uma pessoa
  confirma na UI para contar como feito`. `geracao` já anexa a análise sozinha, pelo título do
  resultado. Erros claros: `eventos` sem `campanha`, campanha inexistente, id que é de cliente
  ("é do tipo cliente, não campanha"), ação sem `alvo` ou sem verbo, e o filtro de dado pessoal.
- `conhecimento({campanha})` devolve o **resumo** (período, funil, objetivo, metas, tetos,
  processo, budgets, pendências), as **ações a verificar cuja data chegou** ("pergunte o resultado
  ANTES de olhar o dia" — é o que a etapa 0 do roteiro usa) e os últimos 10 eventos; proposta não
  confirmada em 14 dias sai do índice e fica no histórico.

## Browser (wrangler dev)
- `#/campanhas`: a campanha de exemplo com cliente, período, funil, contagem de eventos e ações e
  a pill "2 a confirmar".
- `#/campanhas/vitalicia-set26`: linha do tempo com análise, achado proposto e duas ações — a
  proposta pelo agente (com Confirmar/Descartar) e a já fechada, mostrando F/C/R. Ao lado,
  contexto (objetivo, metas, tetos, processo, budgets) e pendências.
- **Confirmei** a ação `desligar ad42` na campanha → ela passou a aparecer em `#/acoes`
  (2 ações), com a marca `VERIFICAR` porque a data de verificação já passou; `#/acoes?vencidas=1`
  isola 1. Filtros de área, nível, ação, resultado, cliente e campanha na URL; fechar o resultado
  ("Deu certo" / "Não deu") direto da tabela.
- `#/saude`: bloco **Ações** com 2 no total, 1 pendente, 1 a verificar, 1 a confirmar. Menu mostra
  o contador de ações vencidas.
- Console sem erros.

## Dois bugs achados pelos testes (corrigidos no código)
1. `normalizaEvento` usava `fato` como texto quando `texto` vinha vazio, e a ação nunca montava a
   frase "desligar ad42". O fallback saiu; a frase é montada do verbo + alvo + valor.
2. Registrar com um id de **cliente** em `campanha` dizia "não existe no conhecimento". Agora
   separa as duas mensagens e diz o tipo encontrado.

## Suíte
- Vitest: 21 arquivos, **95** testes (`test/campanha.test.ts` com 3). Typecheck limpo.
