/* main.ts — app bootstrap. Owns the Store and wires the modules together.
 *
 * URL shape: /report/:client/:slug[?<filter>=<value>…]. We load the three data
 * layers, build navigation, then render sections on demand. A section renders as
 * a CSS-grid Dashboard inside a [data-report-section] host (so right-click
 * comments and the "+" trigger work); its modals render as .ic-overlay dialogs. */

import { Api } from './api.js';
import { Store } from './store.js';
import { Navigation } from './navigation.js';
import { Filters } from './filters.js';
import { Comments, type BlockMark } from './comments.js';
import { Dashboard } from './dashboard.js';
import { renderWidget, type RenderCtx } from './renderer.js';
import { ChartManager, type ChartDef } from './charts.js';
import { resolveBind } from '../shared/bind.js';
import type { Bind, ResolvedBind, Modal, Section, LayoutItem } from '../shared/types.js';

const ROOT = document.getElementById('export-root')!;
const MODAL_ROOT = document.getElementById('modal-root')!;

class App {
  private store = new Store();
  private api: Api;
  private nav: Navigation;
  private filters: Filters;
  private comments: Comments;
  private dashboard: Dashboard | null = null;
  private modalCharts = new ChartManager();
  private editing = false;

  constructor(client: string, slug: string) {
    this.api = new Api(client, slug);
    this.nav = new Navigation(this.store, (p, s) => void this.go(p, s));
    this.filters = new Filters(this.store, () => { this.dashboard?.applyFilters(); this.markBlocks(); });
    this.comments = new Comments(this.api, () => this.markBlocks());
    this.wireModals();
    this.wireLayoutEditor();
  }

  async start(): Promise<void> {
    let data, datasets, layout;
    try {
      [data, datasets, layout] = await Promise.all([
        this.api.getData(), this.api.getDataset().catch(() => ({})), this.api.getLayout().catch(() => ({ sections: {} })),
      ]);
    } catch (e) {
      ROOT.innerHTML = `<div style="padding:60px 56px"><p class="sm">Erro ao carregar relatório: ${(e as Error).message}</p></div>`;
      return;
    }
    this.store.data = data;
    this.store.datasets = datasets;
    this.store.layout = layout;

    document.title = data.meta?.title || data.meta?.client || 'Relatório';
    document.documentElement.dataset.theme = data.meta?.theme || 'light';
    const brand = document.getElementById('tn-client');
    if (brand) brand.textContent = data.meta?.client || data.meta?.title || '';

    this.nav.build();
    this.filters.init();
    await this.comments.load();
    this.watch();

    const first = this.store.allSections()[0];
    if (first) { await this.go(first.pageId, first.id); this.maybeShowFirstRunHint(); }
    else ROOT.innerHTML = '<div style="padding:60px 56px"><p class="sm">Relatório sem seções.</p></div>';
  }

  /** Surface the two features a first-time consultant won't otherwise discover:
   *  right-click-to-comment and the layout editor. A flat note on the paper,
   *  dismissed once and remembered — never a modal. */
  private maybeShowFirstRunHint(): void {
    let dismissed = false;
    try { dismissed = localStorage.getItem('rpt-hint-v1') === '1'; } catch { /* storage unavailable */ }
    if (dismissed) return;
    const main = document.getElementById('main');
    if (!main) return;
    const hint = document.createElement('div');
    hint.className = 'rpt-hint';
    hint.innerHTML =
      '<svg class="rpt-hint-ic svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11.5v4.5"/><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none"/></svg>'
      + '<div class="rpt-hint-body">Clique com o <strong>botão direito</strong> em qualquer bloco para anotar um comentário (uma marca fica fixada no bloco). Use o botão <strong>Layout</strong> na barra superior para reorganizar os blocos.</div>'
      + '<button class="rpt-hint-x" type="button" aria-label="Dispensar dica">&#215;</button>';
    hint.querySelector('.rpt-hint-x')?.addEventListener('click', () => {
      hint.remove();
      try { localStorage.setItem('rpt-hint-v1', '1'); } catch { /* ignore */ }
    });
    main.insertBefore(hint, ROOT);
  }

  private async go(pageId: string, sectionId: string): Promise<void> {
    if (this.editing) this.abortEdit(); // tab switch during edit → drop edits, then navigate
    this.store.currentPageId = pageId;
    this.store.currentSectionId = sectionId;
    this.nav.setActive(pageId, sectionId);

    let section = this.store.getSection(sectionId);
    if (!section) {
      ROOT.innerHTML = '<div style="padding:60px 56px 80px"><p class="sm" style="color:var(--gray2)">Carregando…</p></div>';
      try {
        section = await this.api.getSection(sectionId);
        this.store.putSection(section);
      } catch {
        ROOT.innerHTML = `<div style="padding:60px 56px"><p class="sm">Seção não encontrada: <code>${sectionId}</code></p></div>`;
        return;
      }
    }
    this.renderSection(section);
    window.scrollTo({ top: 0 });
  }

  private renderSection(section: Section): void {
    this.dashboard?.destroy();
    this.modalCharts.destroyAll();
    ROOT.replaceChildren();
    MODAL_ROOT.replaceChildren();

    const ref = this.store.sectionRef(section.id);
    const host = document.createElement('section');
    host.id = section.id;
    host.dataset.reportSection = ref?.label || section.header?.title || section.id;
    host.appendChild(this.headerEl(section));
    host.appendChild(this.triggerEl(section.id, host.dataset.reportSection));
    ROOT.appendChild(host);

    this.dashboard = new Dashboard(section, host, {
      datasets: this.store.datasets,
      getActive: () => this.store.active,
      layout: this.store.layoutFor(section.id),
      onSaveLayout: (id, items) => this.persistLayout(id, items),
    });

    for (const modal of section.modals || []) this.renderModal(modal);
    this.markBlocks();
  }

  /** Pin a comment marker on every block that carries annotations, so comments
   *  live on the block they reference instead of a section-tab badge. Re-run on
   *  every (re)render: filter changes and the layout editor rebuild the tiles. */
  private markBlocks(): void {
    const sectionId = this.store.currentSectionId;
    const marks = sectionId ? this.comments.markersFor(sectionId) : new Map<string, BlockMark>();
    for (const tile of ROOT.querySelectorAll<HTMLElement>('[data-widget-id]')) {
      tile.querySelector(':scope > .tile-cmark')?.remove();
      const mark = marks.get(tile.dataset.widgetId || '');
      tile.classList.toggle('has-comment', !!mark);
      if (mark) tile.appendChild(this.cmarkEl(mark));
    }
  }

  private cmarkEl(mark: BlockMark): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile-cmark';
    btn.title = `${mark.count} comentário${mark.count > 1 ? 's' : ''} neste bloco`;
    btn.setAttribute('aria-label', btn.title);
    btn.innerHTML =
      '<svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7 7 0 0 1-9.6 6.5L5 20l1.5-4A7 7 0 1 1 20 11.5Z"/></svg>'
      + `<span class="tile-cmark-n">${mark.count}</span>`;
    btn.addEventListener('click', e => { e.stopPropagation(); this.comments.openPanel(); });
    return btn;
  }

  private headerEl(section: Section): HTMLElement {
    const h = section.header || { title: '' };
    const wrap = document.createElement('header');
    wrap.className = 'sec-header';
    if (h.badge) { const b = document.createElement('div'); b.className = 'badge badge-p'; b.textContent = h.badge; wrap.appendChild(b); }
    const t = document.createElement('h1');
    t.className = 'sec-title';
    t.textContent = h.title || '';
    wrap.appendChild(t);
    if (h.sub) { const s = document.createElement('p'); s.className = 'sm'; s.innerHTML = h.sub; wrap.appendChild(s); }
    return wrap;
  }

  private triggerEl(secId: string, label: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'sc-trigger';
    const add = document.createElement('button');
    add.className = 'sc-add';
    add.dataset.secId = secId;
    add.dataset.secLabel = label;
    add.textContent = '+';
    add.title = 'Adicionar comentário';
    wrap.appendChild(add);
    return wrap;
  }

  private renderModal(modal: Modal): void {
    const overlay = document.createElement('div');
    overlay.className = 'ic-overlay';
    overlay.id = modal.id;
    const dialog = document.createElement('div');
    dialog.className = 'ic-dialog';
    const hd = document.createElement('div');
    hd.className = 'ic-dialog-hd';
    const title = document.createElement('div');
    title.className = 'ic-dialog-title';
    title.textContent = modal.title || '';
    const close = document.createElement('button');
    close.className = 'ic-close';
    close.dataset.icClose = '';
    close.innerHTML = '&#215;';
    hd.append(title, close);
    dialog.appendChild(hd);

    const ctx = this.resolveCtx();
    for (const w of modal.widgets || []) dialog.appendChild(renderWidget(w, ctx));
    overlay.appendChild(dialog);
    MODAL_ROOT.appendChild(overlay);
    for (const { elId, def } of ctx.charts) this.modalCharts.create(elId, def);
  }

  private resolveCtx(): RenderCtx {
    const charts: { elId: string; def: ChartDef }[] = [];
    return {
      charts,
      resolve: (bind?: Bind): ResolvedBind | null =>
        bind ? resolveBind(bind, this.store.datasets, this.store.active) : null,
    };
  }

  private wireModals(): void {
    document.addEventListener('click', e => {
      const opener = (e.target as HTMLElement).closest<HTMLElement>('[data-modal]');
      if (opener) {
        const m = document.getElementById(opener.dataset.modal!);
        if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
        return;
      }
      const closer = (e.target as HTMLElement).closest<HTMLElement>('[data-ic-close]');
      if (closer) { closeOverlay(closer.closest('.ic-overlay')); return; }
      if ((e.target as HTMLElement).classList.contains('ic-overlay')) closeOverlay(e.target as HTMLElement);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') for (const m of document.querySelectorAll('.ic-overlay.open')) closeOverlay(m);
    });
  }

  /* ───────────────────────────  Layout editor  ─────────────────────────── */

  private wireLayoutEditor(): void {
    document.getElementById('layout-edit-btn')?.addEventListener('click', () => void this.startEdit());
    document.getElementById('edit-save')?.addEventListener('click', () => void this.finishEdit(true));
    document.getElementById('edit-cancel')?.addEventListener('click', () => void this.finishEdit(false));
  }

  private async startEdit(): Promise<void> {
    if (!this.dashboard || this.editing) return;
    try {
      await this.dashboard.enterEditMode();
    } catch {
      this.toast('Não foi possível abrir o editor de layout');
      return;
    }
    this.editing = true;
    document.getElementById('edit-bar')?.removeAttribute('hidden');
    document.getElementById('layout-edit-btn')?.classList.add('active');
  }

  private async finishEdit(save: boolean): Promise<void> {
    if (!this.dashboard || !this.editing) return;
    const saveBtn = document.getElementById('edit-save') as HTMLButtonElement | null;
    if (save && saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }
    try {
      await this.dashboard.exitEditMode(save);
      this.clearEditUI();
      this.markBlocks(); // the editor rebuilt the tiles — re-pin the markers
      if (save) this.toast('Layout salvo');
    } catch {
      this.toast('Erro ao salvar layout'); // editor stays open so the user can retry
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar'; }
    }
  }

  /** Drop the editor silently (navigation away while editing). The dashboard is
   *  about to be destroyed by renderSection, so no rebuild is needed here. */
  private abortEdit(): void {
    void this.dashboard?.exitEditMode(false);
    this.clearEditUI();
  }

  private clearEditUI(): void {
    this.editing = false;
    document.getElementById('edit-bar')?.setAttribute('hidden', '');
    document.getElementById('layout-edit-btn')?.classList.remove('active');
  }

  private async persistLayout(sectionId: string, items: LayoutItem[]): Promise<void> {
    const res = await this.api.putLayout(sectionId, items);
    this.store.layout = res.layout;
  }

  private toast(msg: string): void {
    const el = document.createElement('div');
    el.className = 'app-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2200);
  }

  private watch(): void {
    this.api.watch(id => {
      this.store.dropSection(id);
      if (id === this.store.currentSectionId) void this.go(this.store.currentPageId, id);
    });
  }
}

function closeOverlay(node: Element | null): void {
  if (!node) return;
  node.classList.remove('open');
  document.body.style.overflow = '';
}

/* ── boot ── */
const parts = location.pathname.split('/').filter(Boolean); // ["report", client, slug]
const client = decodeURIComponent(parts[1] || '');
const slug = decodeURIComponent(parts[2] || '');
if (client && slug) void new App(client, slug).start();
else ROOT.innerHTML = '<div style="padding:60px 56px"><p class="sm">URL inválida. Use /report/&lt;cliente&gt;/&lt;análise&gt;.</p></div>';
