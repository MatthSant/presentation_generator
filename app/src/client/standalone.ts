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
import { el, mountShell, setBadge, type FabShell } from './controls-utils.js';

/** Snapshot pré-calculado de um filtro do relatório (gerar.py → variantes.json). */
interface Variant { dataset: DataMap; sections: Record<string, Section>; layout: Layout; pages?: ReportData['pages'] }
interface VariantDim { label: string; values: Array<{ id: string; label: string }>; items: Record<string, Variant> }

/** Cascata: dimensões hierárquicas + tuplas de utm (agregadas) + snapshots por seleção efetiva. */
interface CascadeSnap extends Variant { sels: Array<Record<string, string>>; tuples: number[] }
interface Cascade { kind: 'cascade'; dims: Array<{ key: string; label: string }>; tuples: string[][]; labels: Record<string, Record<string, string>>; snaps: CascadeSnap[] }

export interface EmbeddedReport {
  data: ReportData;
  dataset: DataMap;
  sections: Record<string, Section>;
  layout: Layout;
  /** Filtros do relatório já recalculados: por opção (criativos/histórico) ou em cascata (acompanhamento/debriefing). */
  variants?: Record<string, VariantDim> | Cascade;
  /** O mesmo, comprimido (gzip + base64) quando é grande; o viewer descomprime no boot. */
  variants_gz?: string;
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
  /** FAB de filtros (#filter-*): o mesmo chrome do app; offline as opções são snapshots. */
  private shell: FabShell | null = null;
  private openKey: string | null = null;
  /** Cascata: seleção atual (dim → valor) e índice snapshot por conjunto de tuplas. */
  private sel: Record<string, string> = {};
  private snapIndex = new Map<string, CascadeSnap>();

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

    this.buildNav();

    if (this.report.variants_gz && !this.report.variants) {
      void inflate(this.report.variants_gz).then((v) => { this.report.variants = v as EmbeddedReport['variants']; this.mountFilters(); })
        .catch((e) => console.warn('filtros offline indisponíveis (gzip):', e));
    } else this.mountFilters();
    const first = this.store.pages[0];
    const sec = first?.sections[0];
    // Uma página com uma seção: a barra de seções não acrescenta nada.
    if (this.store.pages.length === 1 && (first?.sections.length ?? 0) <= 1) {
      for (const id of ['section-bar', 'tn-pages']) { const el = document.getElementById(id); if (el) { el.hidden = true; el.style.display = 'none'; } }
    }
    if (first && sec) this.go(first.id, sec.id);
    else this.root.innerHTML = '<div style="padding:60px 56px"><p class="sm">Relatório sem páginas.</p></div>';
  }

  /** Monta a navegação e a deixa offline: sem "/" nem "/assets" — o logo vem embutido e
   *  os links da marca viram inertes. Chamado no boot e sempre que as páginas mudam. */
  private buildNav(): void {
    this.nav.build();
    for (const a of document.querySelectorAll<HTMLAnchorElement>('#sidenav a, #topnav a')) { a.href = '#'; a.addEventListener('click', (e) => e.preventDefault()); }
    for (const logo of document.querySelectorAll<HTMLImageElement>('#sidenav img.sn-logo, #topnav img.tn-logo')) {
      if (this.report.logo) logo.src = this.report.logo; else logo.remove();
    }
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

  private cascade(): Cascade | null {
    const v = this.report.variants as Cascade | undefined;
    return v && v.kind === 'cascade' ? v : null;
  }
  private optVariants(): Record<string, VariantDim> {
    return this.cascade() ? {} : ((this.report.variants as Record<string, VariantDim>) || {});
  }
  /** Índices das tuplas que casam com uma seleção (AND entre dimensões). */
  private matchTuples(sel: Record<string, string>): number[] {
    const c = this.cascade(); if (!c) return [];
    const pos = new Map(c.dims.map((d, i) => [d.key, i]));
    const out: number[] = [];
    c.tuples.forEach((t, i) => { if (Object.entries(sel).every(([k, v]) => t[pos.get(k)!] === v)) out.push(i); });
    return out;
  }
  /** Snapshot que representa a seleção: `null` = relatório completo; `undefined` = não pré-calculado. */
  private snapFor(sel: Record<string, string>): CascadeSnap | null | undefined {
    const c = this.cascade(); if (!c) return undefined;
    if (!Object.keys(sel).length) return null;
    const m = this.matchTuples(sel);
    if (!m.length) return undefined;
    if (m.length === c.tuples.length) return null;
    return this.snapIndex.get(m.join(','));
  }

  /** Troca as 4 camadas por um snapshot (ou volta ao completo). */
  private applySnapshot(v: Variant | null): void {
    const src = v ?? this.report;
    this.store.datasets = src.dataset;
    this.store.layout = src.layout || { sections: {} };
    for (const sec of Object.values(src.sections)) this.store.putSection(sec);
    for (const sec of Object.values(this.report.sections)) if (!src.sections[sec.id]) this.store.putSection(sec);
    // Recortes que mudam QUAIS seções existem (fichas por temperatura; série sem um lançamento).
    const pages = (v?.pages ?? this.report.data.pages ?? []).filter((p) => (p as { kind?: string }).kind !== 'perguntas');
    this.store.data = { ...this.store.data, pages };
    this.buildNav();
  }

  private applyVariant(dim: string | null, value: string | null): void {
    const v = dim && value ? this.optVariants()[dim]?.items?.[value] : null;
    this.active = v ? { dim: dim!, value: value! } : null;
    this.applySnapshot(v ?? null);
  }

  private variantDims(): string[] { return Object.keys(this.optVariants()); }

  /** Liga o FAB (#filter-fab / #filter-modal) quando há filtros de dataset (`meta.filters`)
   *  ou snapshots pré-calculados (`variants`). Sem nenhum dos dois o botão fica oculto. */
  private mountFilters(): void {
    const c = this.cascade();
    if (c) { this.snapIndex.clear(); for (const sn of c.snaps) this.snapIndex.set(sn.tuples.join(','), sn); }
    const has = this.store.filterDefs.length > 0 || this.variantDims().length > 0 || !!c;
    if (!has || !document.getElementById('filter-fab') || this.shell) { if (this.shell) { this.renderFilterBody(); this.updateBadge(); } return; }
    try {
      this.shell = mountShell('offline-filters', () => this.clearFilters());
    } catch { this.shell = null; return; }
    this.shell.fab.hidden = false;
    this.renderFilterBody();
    this.updateBadge();
  }

  private clearFilters(): void {
    for (const def of this.store.filterDefs) {
      const v = def.default ?? def.allValue ?? def.options[0];
      if (v != null) this.store.active[def.id] = v; else delete this.store.active[def.id];
    }
    this.sel = {};
    this.applyVariant(null, null);
    this.afterFilterChange();
  }

  private afterFilterChange(): void {
    this.renderFilterBody();
    this.updateBadge();
    const secId = this.store.currentSectionId;
    const y = window.scrollY;
    const still = this.store.allSections().some((x) => x.id === secId);
    if (!still) { const f = this.store.pages[0]; const fs = f?.sections[0]; if (f && fs) this.go(f.id, fs.id); return; }
    this.nav.setActive(this.store.currentPageId, secId);
    const cur = this.store.getSection(secId);
    if (cur) this.renderSection(cur, false);
    window.scrollTo({ top: y });
  }

  private updateBadge(): void {
    if (!this.shell) return;
    let n = (this.active ? 1 : 0) + Object.keys(this.sel).length;
    for (const def of this.store.filterDefs) {
      const base = def.default ?? def.allValue ?? def.options[0];
      const v = this.store.active[def.id];
      if (v != null && v !== base) n++;
    }
    setBadge(this.shell, n);
  }

  private renderFilterBody(): void {
    if (!this.shell) return;
    const body = this.shell.body;
    body.replaceChildren();
    // Filtros de dataset (ex.: canal Geral/Pago/Orgânico): segmento, igual ao Filters do app.
    for (const def of this.store.filterDefs) {
      const g = el('div', 'flt-group');
      const l = el('div', 'flt-label'); l.textContent = def.label || def.id; g.appendChild(l);
      const seg = el('div', 'flt-seg');
      const cur = String(this.store.active[def.id] ?? def.default ?? def.allValue ?? def.options[0] ?? '');
      for (const o of def.options) {
        const b = el('button', 'flt-opt' + (o === cur ? ' flt-active' : '')) as HTMLButtonElement;
        b.type = 'button'; b.textContent = o;
        b.addEventListener('click', () => { this.store.active[def.id] = o; this.afterFilterChange(); });
        seg.appendChild(b);
      }
      g.appendChild(seg); body.appendChild(g);
    }
    // Cascata (acompanhamento/debriefing): cada dimensão só oferece os valores que coexistem com o
    // que já está selecionado; opção sem snapshot fica desabilitada (gere com --opts).
    const c = this.cascade();
    if (c) {
      for (const d of c.dims) {
        const open = this.openKey === d.key;
        const cur = this.sel[d.key];
        const dd = el('div', 'flt-dd' + (open ? ' is-open' : ''));
        const head = el('button', 'flt-dd-head') as HTMLButtonElement; head.type = 'button';
        const lbl = el('span', 'flt-dd-lbl'); lbl.textContent = d.label;
        const sum = el('span', 'flt-dd-sum'); sum.textContent = cur != null ? (c.labels[d.key]?.[cur] || cur || '(vazio)') : 'Todos';
        const chev = el('span', 'flt-dd-chev'); chev.textContent = '⌄';
        head.append(lbl, sum, chev);
        head.addEventListener('click', () => { this.openKey = open ? null : d.key; this.renderFilterBody(); });
        dd.appendChild(head);
        if (open) {
          const others: Record<string, string> = { ...this.sel }; delete others[d.key];
          const pos = c.dims.findIndex((x) => x.key === d.key);
          const present = new Set(this.matchTuples(others).map((i) => c.tuples[i][pos]));
          const panel = el('div', 'flt-dd-panel');
          const seg = el('div', 'flt-seg');
          const mk = (id: string | null, label: string): void => {
            const trial: Record<string, string> = { ...this.sel };
            if (id == null) delete trial[d.key]; else trial[d.key] = id;
            const snap = this.snapFor(trial);
            const ok = snap !== undefined;
            const isCur = id == null ? cur == null : cur === id;
            const b = el('button', 'flt-opt' + (isCur ? ' flt-active' : '') + (ok ? '' : ' is-off')) as HTMLButtonElement;
            b.type = 'button'; b.textContent = label;
            if (!ok) { b.disabled = true; b.title = 'Combinação não pré-calculada: gere com --opts'; }
            else b.addEventListener('click', () => { if (id == null) delete this.sel[d.key]; else this.sel[d.key] = id; this.applySnapshot(snap); this.afterFilterChange(); });
            seg.appendChild(b);
          };
          mk(null, 'Todos');
          for (const v of [...present].sort()) mk(v, c.labels[d.key]?.[v] || v || '(vazio)');
          panel.appendChild(seg);
          dd.appendChild(panel);
        }
        body.appendChild(dd);
      }
    }
    // Snapshots por opção (criativos/histórico): um dropdown-accordion por dimensão, um filtro por vez.
    const variants = this.optVariants();
    for (const dim of this.variantDims()) {
      const vd = variants[dim];
      const open = this.openKey === dim;
      const dd = el('div', 'flt-dd' + (open ? ' is-open' : ''));
      const head = el('button', 'flt-dd-head') as HTMLButtonElement; head.type = 'button';
      const lbl = el('span', 'flt-dd-lbl'); lbl.textContent = vd.label || dim;
      const sum = el('span', 'flt-dd-sum');
      const curV = this.active && this.active.dim === dim ? vd.values.find((v) => v.id === this.active!.value) : null;
      sum.textContent = curV ? (curV.label || curV.id) : 'Todos';
      const chev = el('span', 'flt-dd-chev'); chev.textContent = '⌄';
      head.append(lbl, sum, chev);
      head.addEventListener('click', () => { this.openKey = open ? null : dim; this.renderFilterBody(); });
      dd.appendChild(head);
      if (open) {
        const panel = el('div', 'flt-dd-panel');
        const seg = el('div', 'flt-seg');
        const opts = [{ id: '', label: 'Todos' }, ...vd.values];
        for (const o of opts) {
          const isCur = o.id ? (!!curV && curV.id === o.id) : !curV;
          const b = el('button', 'flt-opt' + (isCur ? ' flt-active' : '')) as HTMLButtonElement;
          b.type = 'button'; b.textContent = o.label || o.id;
          b.addEventListener('click', () => { this.applyVariant(o.id ? dim : null, o.id || null); this.afterFilterChange(); });
          seg.appendChild(b);
        }
        panel.appendChild(seg);
        if (this.variantDims().length > 1) { const n = el('div', 'flt-label'); n.style.marginTop = '8px'; n.textContent = 'Offline: um recorte por vez.'; panel.appendChild(n); }
        dd.appendChild(panel);
      }
      body.appendChild(dd);
    }
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

/** Descomprime `variants_gz` (gzip + base64) com o DecompressionStream do navegador. */
async function inflate(b64: string): Promise<unknown> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const DS = (window as unknown as { DecompressionStream?: new (f: string) => GenericTransformStream }).DecompressionStream;
  if (!DS) throw new Error('DecompressionStream indisponível');
  const stream = new Blob([bytes]).stream().pipeThrough(new DS('gzip'));
  return JSON.parse(await new Response(stream).text());
}

function start(): void {
  const report = window.__REPORT;
  if (!report) { document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Sem <code>window.__REPORT</code>.</p>'; return; }
  new StandaloneApp(report).boot();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
