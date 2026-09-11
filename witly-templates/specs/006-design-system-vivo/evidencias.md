# Evidências — Spec 006 (2026-09-11)

## Seed local
- `design-system` publicado como template `kind = design` v1.0.0: 25 arquivos (`contrato.md` +
  24 `elementos/*.json` gerados pelo `galeria.py` com o `relatorio.py`) e 12 regras iniciais.
  `platform_docs` ficou sem o design system (agora é gerado da versão publicada).
- Guarda do seed: publicada por pessoa (autor ≠ `seed`) não é sobrescrita sem `--force`.

## Browser (`#/design`)
- **Galeria**: lista de 24 elementos por grupo; o iframe renderiza o grupo do elemento em foco
  pelo viewer dos relatórios (KPI de custo: "CPL R$ 7,97 · Meta R$ 6,50 · +23% ✕"). Sem a
  sidebar do viewer: uma página por grupo em foco, a lista é a da UI.
- **Interativo**: editei o JSON do elemento (`label` → "CPL EDITADO", meta → "R$ 9,00") e
  **Pré-visualizar** renderizou na hora sem salvar (POST `/design/preview`, `srcdoc`).
  **Salvar no rascunho** criou o rascunho nº 2 e a galeria passou a mostrar o rascunho
  (`state=draft`) com o elemento editado.
- **Regras**: 12 entradas (mesmo pane dos templates). **Versões**: rascunho nº 2 + v1.0.0, com
  "comparar com…" e Restaurar — o mesmo fluxo dos templates.

## Kit e MCP
- `platformKitFiles` gera `design-system.md` da versão publicada: contrato + "Regras do design
  system" + "Elementos: a chamada e o que ela produz" (teste `design.test.ts`).
- `contrato://widgets` e o `obter_template` usam o mesmo texto; `listar_templates`/`obter_template`
  e o catálogo não veem o `design-system`.

## Testes
- Vitest: 17 arquivos, **83** testes (3 novos em `test/design.test.ts`).
- `test-kits` pula o kit de design (sem Python); os 6 kits seguem verdes.
