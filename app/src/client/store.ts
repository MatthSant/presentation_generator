/* store.ts — the single source of mutable app state.
 *
 * Everything the UI modules need to read lives here; they never reach into each
 * other. Navigation/filters/comments take a Store reference plus callbacks, so
 * wiring stays one-directional (main owns the Store, hands it down). */

import type {
  ReportData, DataMap, Layout, ActiveFilters, Section, PageRef, FilterDef,
} from '../shared/types.js';

export interface SectionRef { id: string; label: string; pageId: string; pageLabel: string; }

export class Store {
  data: ReportData = { meta: {}, pages: [] };
  datasets: DataMap = {};
  layout: Layout = { sections: {} };
  active: ActiveFilters = {};
  currentPageId = '';
  currentSectionId = '';

  /** Loaded section views, keyed by section id. */
  private sectionCache = new Map<string, Section>();

  get pages(): PageRef[] { return this.data.pages || []; }
  get filterDefs(): FilterDef[] { return this.data.meta?.filters || []; }

  page(id: string): PageRef | undefined { return this.pages.find(p => p.id === id); }

  /** Flat list of every section across pages, in document order. */
  allSections(): SectionRef[] {
    const out: SectionRef[] = [];
    for (const p of this.pages) {
      for (const s of p.sections) out.push({ id: s.id, label: s.label, pageId: p.id, pageLabel: p.label });
    }
    return out;
  }

  sectionRef(id: string): SectionRef | undefined {
    return this.allSections().find(s => s.id === id);
  }

  layoutFor(sectionId: string): Layout['sections'][string] | undefined {
    return this.layout.sections?.[sectionId];
  }

  getSection(id: string): Section | undefined { return this.sectionCache.get(id); }
  putSection(s: Section): void { this.sectionCache.set(s.id, s); }
  dropSection(id: string): void { this.sectionCache.delete(id); }
}
