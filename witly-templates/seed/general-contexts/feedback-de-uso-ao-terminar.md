# Ao fechar o trabalho com o consultor, registre o feedback de uso do kit: o que segurou, o que custou rodada (com prioridade e pedido), a medida por tipo e a nota
Tipo: regra

É o `registrar({evento: 'feedback', ...})`. Sem isso o kit não aprende: cada rodada que o
consultor pediu de novo é um defeito do template, do design ou do filtro que ninguém vai ver.

Como aplicar: `segurou` = o que funcionou e deve ficar (lista curta); `custou` = cada ajuste
que custou rodada, como `{item, prioridade: alta|media|baixa, pedido, rodadas}` — o `pedido` é
o que mudar no kit, escrito como regra; `medida` = quantas rodadas foram sobre apresentação,
filtro e análise (é a régua: "bom de dado, caro de aparência"); `nota` de 1 a 5. Sem nome de
cliente nem dado pessoal. O editor triagem cada item e o que virar regra entra no template.
