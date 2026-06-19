# Tarefas — Análise de Criativos (tipo `criativos`)

Backlog vivo da integração do tipo **Criativos** no app. Marcar `[x]` ao concluir.
Contexto de arquitetura: ver [app/CLAUDE.md](CLAUDE.md). Procedimento de onboarding de
tipos: skill `/integrar-analise` (`.claude/skills/integrar-analise/`).

> **Regra do projeto:** toda feature nova entra como **recurso de plataforma**
> reutilizável (via `meta`/widget genérico), nunca hardcoded para o tipo `criativos`.
> **Testar na UI real** (cliques/screenshot), não só curl/mock, antes de cada commit.

---

## Concluído

- [x] Tipo `criativos` registrado em `src/server/typeRegistry.ts` (controlsKind, renderScript).
- [x] Motor `pysrc/criativos/{calc.py, build_report.py, render_view.py}` (engenharia reversa do JS).
- [x] Widgets novos de plataforma: `embed`, `link-card`, `scatter-picker` (types/validate/renderer/css).
- [x] FAB de controles `src/client/criativos-controls.ts` (Modo · Investimento mínimo · Temperatura).
- [x] Toggle de modo **a nível de relatório** (Resultado × Captação) via FAB + recompute `render_view.py`.
- [x] Scatter-picker com 2 dropdowns (X/Y) — usuário escolhe métrica por eixo.
- [x] Sidebar de navegação por entidade (`meta.nav='sidebar'`) com busca/ordenação/pílulas ROAS.
- [x] Fonte correta na sidebar (`'Exo 2'` forçada em button/input/a).
- [x] Evolução diária: métricas mudam por modo (captação=cpmql×invest, fallback cpl; resultado=invest×retorno).
- [x] Embed Instagram na proporção de Reels; corte de dias com investimento zerado nas pontas (`_trim_daily`).
- [x] Fichas: KPIs ao lado do embed (coords manuais, Grid é packer de linha única).
- [x] Scatter-picker dentro do card padrão (`.sp-wrap` na regra "Elevated data cards").

---

## Pendente

### Tarefa nova — KPI cards com casas decimais
- [x] **KPIs/strip com valores decimais.** ✅ Resolvido em `pysrc/common/fmt.py:9-16` —
      `money()` usa 2 casas para custos unitários de baixo valor (`R$ 14,27`) e mantém
      a abreviação M/k para valores grandes. Vale para todos os tipos (formatador único).

### #13 — Reestruturar navegação (3 grupos)
- [ ] Agrupar como **"Ficha de Criativos"**: Panorama + fichas individuais (navegação pela sidebar).
- [ ] Página **"Detalhamentos"** (vazia para iniciar — feature de deepen já existe na plataforma).
- [ ] Página **"Perguntas norteadoras"** com o banco do documento-fonte (Notion / `Perguntas Norteadoras.html`):
      - "O retorno dos anúncios está caindo de vez?"
      - "Tem época que vende melhor?"
      - "Faturar mais dependeu de investir mais?"
      - "Lead mais qualificado converte mais?"
      - [x] `pysrc/perguntas/banks/criativos.py` criado e registrado em `banks/__init__.py` (revisar cobertura/relevância via `/verificar-motor`).
- [ ] Corrigir a página de topo que hoje está quebrada.

### #14 — Completar as fichas individuais
- [ ] Seção **"Por temperatura"** (além de por campanha / por público).
- [ ] Bloco **"Dados do Criativo"** (área de vídeo) quando `is_video`: Views, Hook Rate, Hold Rate, Connect Rate — migrar CTR para lá.
- [ ] Tabelas em ambos os modos com as métricas faltantes: **Conversão de Página** e **Connect Rate**.

### #15 — UI de criação (fluxo `/generate`)
- [ ] Adicionar link `/gerar-criativos.html` em `public/index.html`.
- [ ] Criar `public/gerar-criativos.html` + `public/montador-criativos.html` (clonar os `*-historico`, ajustar campos do config).

---

## Notas

- **Caso real atual:** `output/[cliente]/[criativos-slug]/` — gerado por script, posse atribuída
  via `assignClient` (fora do fluxo `/generate`, senão fica órfão na home).
- **render_view.py** escreve em `sys.stdout.buffer` (UTF-8) por causa do `★` (cp1252 quebra no Windows).
- **JSON no shell:** usar `'{"mode":"captacao"}'` — escapar aspas (`\"`) invalida o JSON e cai no default.
- **Screenshots** de iframe/ApexCharts travam o `preview_screenshot`; verificar via `preview_eval` (medição DOM).
