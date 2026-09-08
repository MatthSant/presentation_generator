/* standalone.ts — viewer offline: renderiza um relatório a partir de `window.__REPORT`
 * (data + dataset + sections + layout embutidos), sem servidor e sem api.ts.
 *
 * É o entry do bundle `viewer.js` usado pelos kits do witly-templates: o `gerar.py`
 * embute o JSON das 4 camadas num shell HTML e este código monta a página com os
 * MESMOS módulos do app (Store/Navigation/Dashboard/renderer/charts). Só leitura:
 * sem deepen, perguntas, edição de layout ou controles server-side. */

import type { ReportData, DataMap, Section, Layout } from '../shared/types.js';
import { Store } from './store.js';
import { Navigation } from './navigation.js';
import { Dashboard } from './dashboard.js';

/** Snapshot pré-calculado de um filtro do relatório (gerar.py → variantes.json). */
interface Variant { dataset: DataMap; sections: Record<string, Section>; layout: Layout }
interface VariantDim { label: string; values: Array<{ id: string; label: string }>; items: Record<string, Variant> }

export interface EmbeddedReport {
  data: ReportData;
  dataset: DataMap;
  sections: Record<string, Section>;
  layout: Layout;
  /** Filtros do relatório (meta.controls.filters) já recalculados por valor; um por vez. */
  variants?: Record<string, VariantDim>;
  /** Logo (data: URI) p/ a sidebar; opcional. */
  logo?: string;
}

declare global { interface Window { __REPORT?: EmbeddedReport } }

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);

class StandaloneApp {
  private store = new Store();
  private nav: Navigation;
  private dashboard: Dashboard | null = null;
  private root: HTMLElement;

  private active: { dim: string; value: string } | null = null;

  constructor(private report: EmbeddedReport) {
    // Páginas interativas (board de perguntas) não existem offline.
    const pages = (report.data.pages || []).filter((p) => (p as { kind?: string }).kind !== 'perguntas');
    const meta = { ...(report.data.meta || {}) } as ReportData['meta'] & { nav?: string };
    // Página única: sem árvore lateral (como no app o relatório de uma página fica só no topnav).
    if (pages.length <= 1) meta.nav = 'topnav';
    this.store.data = { ...report.data, meta, pages };
    this.store.datasets = report.dataset;
    this.store.layout = report.layout || { sections: {} };
    for (const s of Object.values(report.sections)) this.store.putSection(s);
    // Filtro de dataset começa no valor padrão (ex.: canal = Geral); sem isso as tabelas
    // com `filters` entrariam com todos os recortes misturados.
    for (const def of this.store.filterDefs) {
      const v = def.default ?? def.allValue ?? def.options[0];
      if (v != null) this.store.active[def.id] = v;
    }
    this.root = document.getElementById('export-root') as HTMLElement;
    this.nav = new Navigation(this.store, (p, s) => this.go(p, s));
  }

  boot(): void {
    const meta = (this.store.data.meta || {}) as { client?: string; client_name?: string; title?: string };
    document.title = meta.title || meta.client || 'Relatório';
    const tn = document.getElementById('tn-client');
    if (tn) tn.textContent = meta.client_name || meta.client || '';

    this.nav.build();
    // Offline: sem "/" nem "/assets" — o logo vem embutido e os links da marca viram inertes.
    for (const a of document.querySelectorAll<HTMLAnchorElement>('#sidenav a, #topnav a')) { a.href = '#'; a.addEventListener('click', (e) => e.preventDefault()); }
    const logo = document.querySelector<HTMLImageElement>('#sidenav img.sn-logo, #topnav img.tn-logo');
    if (logo) { if (this.report.logo) logo.src = this.report.logo; else logo.remove(); }

    const first = this.store.pages[0];
    const sec = first?.sections[0];
    // Uma página com uma seção: a barra de seções não acrescenta nada.
    if (this.store.pages.length === 1 && (first?.sections.length ?? 0) <= 1) {
      for (const id of ['section-bar', 'tn-pages']) { const el = document.getElementById(id); if (el) { el.hidden = true; el.style.display = 'none'; } }
    }
    if (first && sec) this.go(first.id, sec.id);
    else this.root.innerHTML = '<div style="padding:60px 56px"><p class="sm">Relatório sem páginas.</p></div>';
  }

  private go(pageId: string, sectionId: string): void {
    this.store.currentPageId = pageId;
    this.store.currentSectionId = sectionId;
    this.nav.setActive(pageId, sectionId);
    const section = this.store.getSection(sectionId);
    if (!section) { this.root.innerHTML = `<div style="padding:60px 56px"><p class="sm">Seção não encontrada: <code>${esc(sectionId)}</code></p></div>`; return; }
    this.renderSection(section, this.store.pages[0]?.id === pageId && this.store.pages[0]?.sections[0]?.id === sectionId);
    window.scrollTo({ top: 0 });
  }

  private headerEl(section: Section): HTMLElement {
    const h = section.header || { title: '' };
    const wrap = document.createElement('header');
    wrap.className = 'sec-header';
    const keep = !!this.store.sectionRef(section.id)?.title;
    if (keep) wrap.classList.add('sec-header--keep');
    if (h.badge) { const b = document.createElement('div'); b.className = 'badge badge-p'; b.textContent = h.badge; wrap.appendChild(b); }
    const t = document.createElement('h1'); t.className = 'sec-title'; t.textContent = h.title || ''; wrap.appendChild(t);
    if (h.sub && !keep) { const s = document.createElement('p'); s.className = 'sm'; s.innerHTML = h.sub; wrap.appendChild(s); }
    const filters = this.filtersEl(section);
    if (filters) wrap.appendChild(filters);
    return wrap;
  }

  /** Filtros de dataset do relatório (`meta.filters`, ex.: canal Geral/Pago/Orgânico).
   *  No app ficam no FAB; offline viram um seletor no cabeçalho da seção. A troca
   *  refaz a seção com o filtro ativo (mesmo `resolveBind` do app). */
  /** Troca as 4 camadas pelo snapshot de um filtro (ou volta ao completo). */
  private applyVariant(dim: string | null, value: string | null): void {
    const v = dim && value ? this.report.variants?.[dim]?.items?.[value] : null;
    const src = v ?? this.report;
    this.active = v ? { dim: dim!, value: value! } : null;
    this.store.datasets = src.dataset;
    this.store.layout = src.layout || { sections: {} };
    for (const sec of Object.values(this.report.sections)) this.store.putSection(src.sections[sec.id] ?? sec);
  }

  private filtersEl(section: Section): HTMLElement | null {
    const defs = this.store.filterDefs;
    const variants = this.report.variants || {};
    const dims = Object.keys(variants);
    if (!defs.length && !dims.length) return null;
    const box = document.createElement('div');
    box.className = 'sp-ctrls sa-filters';
    for (const dim of dims) {
      const vd = variants[dim];
      const lbl = document.createElement('span'); lbl.className = 'sp-lbl'; lbl.textContent = vd.label || dim;
      const sel = document.createElement('select'); sel.className = 'sp-sel';
      const all = document.createElement('option'); all.value = ''; all.textContent = 'Todos'; sel.appendChild(all);
      for (const v of vd.values) {
        const opt = document.createElement('option'); opt.value = v.id; opt.textContent = v.label || v.id;
        if (this.active && this.active.dim === dim && this.active.value === v.id) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.title = 'Recorte pré-calculado (offline): um filtro por vez.';
      sel.addEventListener('change', () => {
        this.applyVariant(sel.value ? dim : null, sel.value || null);
        const y = window.scrollY;
        const cur = this.store.getSection(section.id) || section;
        this.renderSection(cur, false);
        window.scrollTo({ top: y });
      });
      box.append(lbl, sel);
    }
    for (const def of defs) {
      const lbl = document.createElement('span'); lbl.className = 'sp-lbl'; lbl.textContent = def.label || def.id;
      const sel = document.createElement('select'); sel.className = 'sp-sel';
      const cur = String(this.store.active[def.id] ?? def.default ?? def.allValue ?? def.options[0] ?? '');
      for (const o of def.options) {
        const opt = document.createElement('option'); opt.value = o; opt.textContent = o; if (o === cur) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => {
        this.store.active[def.id] = sel.value;
        const y = window.scrollY;
        this.renderSection(section, false);
        window.scrollTo({ top: y });
      });
      box.append(lbl, sel);
    }
    return box;
  }

  private renderSection(section: Section, isFirst: boolean): void {
    this.dashboard?.destroy();
    this.root.replaceChildren();
    void isFirst;   // a capa (meta.cover) é só da exportação do app; o relatório não a mostra

    const ref = this.store.sectionRef(section.id);
    const host = document.createElement('section');
    host.id = section.id;
    host.dataset.reportSection = ref?.label || section.header?.title || section.id;
    host.appendChild(this.headerEl(section));
    this.root.appendChild(host);

    this.dashboard = new Dashboard(section, host, {
      datasets: this.store.datasets,
      getActive: () => this.store.active,
      getFilterDefs: () => this.store.filterDefs,
      layout: this.store.layoutFor(section.id),
      outlierToggle: false,
    });
  }
}

function start(): void {
  const report = window.__REPORT;
  if (!report) { document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Sem <code>window.__REPORT</code>.</p>'; return; }
  new StandaloneApp(report).boot();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
