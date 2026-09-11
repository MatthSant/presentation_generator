# Tarefas — Spec 006

- [x] T1 Migração 0009 (`templates.kind`); catálogo, MCP (`listar`, `obter`, resources), saúde e stats ignoram `kind = design`.
- [x] T2 `seed/design-system/`: manifesto, 12 regras iniciais, `galeria.py` (24 elementos via `relatorio.py`); seed monta `contrato.md` das fontes de hoje, não monta Python/exemplo para `kind = design`, apaga o `platform_docs` legado; guarda contra sobrescrever versão publicada por pessoa (`--force`).
- [x] T3 `src/kit/design.ts`: `elementos`, `designSystemMd`, `designReport` (foco + override), `renderReportHtml`, `parseElemento`; `db.getDesignKit`, `db.designSystemText`, `platformKitFiles` gera `design-system.md` do template.
- [x] T4 Rotas `GET/POST /design/preview` (sessão da UI; POST pré-visualiza elemento editado sem salvar).
- [x] T5 UI `#/design`: Galeria (iframe do viewer + lista por grupo + editor JSON com Pré-visualizar / Salvar / Excluir / + Elemento), Regras, Contrato, Versões; nav aponta para cá.
- [x] T6 Testes: `test/design.test.ts` (3) — fora do catálogo/MCP, texto gerado, galeria/foco/override, preview e edição via rota de template.
- [x] T7 Seed local + browser (galeria, editar KPI, pré-visualizar, salvar no rascunho, regras, versões) — ver `evidencias.md`; migração 0009 + seed remoto + deploy + PR.
