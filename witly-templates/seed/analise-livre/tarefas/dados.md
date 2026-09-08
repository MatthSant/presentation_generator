# Dados: fonte, query e dado pessoal

**Saída:** `queries/*.sql` próprias e `dump.csv` local sem dado pessoal. **Perguntar ao consultor** a fonte; a checagem de PII é obrigatória e não se pergunta.

## Definição
A fonte é o Delfos (banco do cliente) ou um CSV que o consultor tem. Tudo roda na sua máquina: o dump nunca sobe para a plataforma. Dado pessoal (e-mail, telefone, CPF, nome de lead) não entra em tabela, prosa nem `registrar`.

## Como executar
1. Pergunte a fonte. No Delfos: `Credentials(customer_slug)` → `Tables_Views_Docs` (o que existe) → `Search_Columns` (onde está a coluna) → `Witly_Query`.
2. Escreva a query **agregada** (GROUP BY nas dimensões da análise). Se a única forma de responder exige linha por pessoa, agregue dentro da query; nunca exporte e-mail.
3. Salve a query em `queries/<nome>.sql` com um comentário do que devolve. Rode e salve `dump.csv`.
4. Antes do cálculo, abra o cabeçalho do CSV: se houver coluna pessoal, remova-a no `calc_livre.py` na leitura (não a use nem a grave).
5. Registre no documento a janela dos dados e a data do dado fechado.

## Casos ambíguos
- Coluna com nome neutro mas conteúdo pessoal (ex.: `obs` com telefone): trate como pessoal.
- Consultor quer "a lista de leads": não é análise; entregue contagens e taxas por segmento.

## Saída
`queries/*.sql` + `dump.csv` (agregado) + nota no `meta.json` da janela e da data de corte.
