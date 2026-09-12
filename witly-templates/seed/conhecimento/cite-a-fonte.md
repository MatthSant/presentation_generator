---
tipo: regra
dominio: comunicacao
nivel: tatico
escopo: geral
sempre: true
gatilho: [sempre, ao_escrever, ao_recomendar]
tags: [entrega, agente, conhecimento, comunicacao]
confianca: alta
fontes: [mediocrebrain/.claude/rules/comunicacao.md]
dados: {"forca": "sempre"}
---
# Toda regra aplicada cita a entrada do conhecimento que a embasa; sem entrada, diga que é inferência sua

Ao recomendar ou corrigir uma leitura, aponte o `id` da entrada (conhecimento://id) que sustenta a regra. Se a regra não existe no conhecimento, escreva "inferência" e proponha a entrada com `sugerir`. É o que separa regra do time de opinião do agente, e alimenta o `usadas` do registrar.
