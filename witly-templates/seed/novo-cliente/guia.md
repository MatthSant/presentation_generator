# Guia: novo cliente

O contexto do cliente é o **delta do genérico**: o que só vale para ele (modelo, ticket, funis, metas, armadilhas de dado). O que é regra da casa já está no conhecimento; não repita.

## O que a entrada `cliente` precisa ter
- Título: "<Cliente>: <modelo> · <funil principal> · ticket R$ X · meta <métrica> R$ Y" (≤ 200 caracteres).
- Corpo: quem é em 3 linhas, o que a Witly faz aqui, ciclo (semestral/anual) e entregáveis recorrentes.
- Campos: `slug_delfos`, `modelo` (partner/estudo; infoproduto lançamento, perpétuo, produto digital recorrente…), `funis[]` (nome · tipo · métrica de decisão · teto), `metas` (CAC/CPL/CPMQL/ROAS alvo, de onde vêm), `canais[]` (com peso aproximado), `armadilhas_dado[]` (view principal, campo de checkout, filtros obrigatórios, o que já enganou), `templates[]` (quais templates o cliente usa).

## Nunca
- E-mail, telefone, CPF ou nome de lead. Nome de pessoa da equipe do cliente também não: papel ("o gestor de tráfego").
- Número inventado: sem meta informada, escreva "meta não informada".
