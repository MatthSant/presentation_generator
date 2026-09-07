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

export interface EmbeddedReport {
  data: ReportData;
  dataset: DataMap;
  sections: Record<string, Section>;
  layout: Layout;
  /** Logo (data: URI) p/ a sidebar; opcional. */
  logo?: string;
}

declare global { interface Window { __REPORT?: EmbeddedReport } }

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);

function coverHtml(meta: ReportData['meta']): string {
  const cover = meta?.cover;
  if (!cover) return '';
  const parts: string[] = [];
  if (cover.eyebrow) parts.push(`<div class="badge badge-p">${esc(cover.eyebrow)}</div>`);
  parts.push(`<h1 class="sec-title">${esc(meta?.title || '')}</h1>`);
  if (cover.meta?.length) parts.push(`<div class="cover-meta">${cover.meta.map(esc).join('<span class="cm-dot">◆</span>')}</div>`);
  parts.push('<div class="cover-rule"></div>');
  return `<header id="report-header">${parts.join('')}</header>`;
}

class StandaloneApp {
  private store = new Store();
  private nav: Navigation;
  private dashboard: Dashboard | null = null;
  private root: HTMLElement;

  constructor(private report: EmbeddedReport) {
    // Páginas interativas (board de perguntas) não existem offline.
    this.store.data = { ...report.data, pages: (report.data.pages || []).filter((p) => (p as { kind?: string }).kind !== 'perguntas') };
    this.store.datasets = report.dataset;
    this.store.layout = report.layout || { sections: {} };
    for (const s of Object.values(report.sections)) this.store.putSection(s);
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
    return wrap;
  }

  private renderSection(section: Section, isFirst: boolean): void {
    this.dashboard?.destroy();
    this.root.replaceChildren();
    if (isFirst) this.root.insertAdjacentHTML('beforeend', coverHtml(this.store.data.meta));

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
