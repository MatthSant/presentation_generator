# Identificar cliente, campanha e modo

Pergunte ou confirme: o **slug do cliente no Delfos** (Credentials), a **campanha ou lançamento** (nome como aparece na view e o período) e o **modo**: "roda o report" (etapas 0–1) ou "otimização" (todas).

Puxe `conhecimento({cliente: "<slug>"})` e `conhecimento({campanha: "<id>"})`: metas, tetos, funis, armadilhas de dado e as decisões pendentes. Se o cliente não existe no conhecimento, ofereça o roteiro `novo-cliente` antes de seguir. Não invente mapeamento de colunas.
