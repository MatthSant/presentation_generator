/* cardContext.ts — contexto do bloco de origem passado ao Claude num deepen.
 *
 * Mesma montagem usada pelo deepen por card (modal) e pelo detalhamento de
 * pergunta (seção própria): o que o bloco mostra (binds/tabs), a página e o
 * critério inferido do prefixo do id ("renda-reptoggle" → "renda"). */

import type { Section, Widget } from '../shared/types.js';
import type { DeepenCatalog } from './datasetCatalog.js';

export interface CardContext {
  title?: string;
  detail?: string;
  type?: string;
  bind?: unknown;
  tabs?: Array<{ label: unknown; dataset: string | undefined }>;
  pagina?: string;
  criterio?: string;
}

export function buildCardContext(section: Section | null | undefined, blockId: string, catalog: DeepenCatalog): CardContext {
  const card = section?.widgets.find((w) => w.id === blockId);
  const critIds = new Set<string>();
  for (const t of catalog.tables) { const mm = t.name.match(/^crit_([a-z0-9]+)_/i); if (mm) critIds.add(mm[1]); }
  const prefix = blockId.includes('-') ? blockId.slice(0, blockId.indexOf('-')) : '';
  const rawTabs = (card as { tabs?: Array<Record<string, unknown>> } | undefined)?.tabs;
  const tabs = Array.isArray(rawTabs)
    ? rawTabs
        .map((t) => ({ label: t.label, dataset: (t.bind as { dataset?: string })?.dataset ?? (t.chart as { bind?: { dataset?: string } })?.bind?.dataset }))
        .filter((t) => t.dataset)
    : undefined;
  // O "assunto" do bloco pode vir de campos diferentes por tipo de widget:
  // find-block/chart/table usam `title`; kpi-card usa `label` (ex.: "Atingimento ·
  // Leads"); alguns usam `ind`/`name`. Sem esse fallback, o `objetivo` do deepen
  // (cardCtx.title || prompt) ficava VAZIO em kpi-cards e o detalhamento derivava
  // p/ outro bloco (ex.: leads → vendas). detail cai p/ `sub` (subtítulo do kpi).
  const c = card as { title?: string; label?: string; ind?: string; name?: string; detail?: string; sub?: string } | undefined;
  return {
    title: c?.title || c?.label || c?.ind || c?.name,
    detail: c?.detail || c?.sub,
    type: (card as Widget | undefined)?.type,
    bind: (card as { bind?: unknown } | undefined)?.bind,
    tabs,
    pagina: section?.header?.title,
    criterio: critIds.has(prefix) ? prefix : undefined,
  };
}
