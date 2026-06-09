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
import { ChartManager, setChartExportMode, type ChartDef } from './charts.js';
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

  constructor(private client: string, private slug: string) {
    this.api = new Api(client, slug);
    this.nav = new Navigation(this.store, (p, s) => void this.go(p, s));
    this.filters = new Filters(this.store, () => { this.dashboard?.applyFilters(); this.markBlocks(); });
    this.comments = new Comments(this.api, () => this.markBlocks());
    this.wireModals();
    this.wireLayoutEditor();
    document.getElementById('export-html-btn')?.addEventListener('click', () => void this.exportHtml());
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
    this.renderCover();

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

  /** Report-level cover block, rendered once above the section content. Lives in
   *  #main (not #export-root), so it persists as sections navigate. */
  private renderCover(): void {
    const meta = this.store.data?.meta;
    const cover = meta?.cover;
    if (!cover) return;
    const main = document.getElementById('main');
    if (!main || document.getElementById('report-header')) return;
    const h = document.createElement('header');
    h.id = 'report-header';
    const parts: string[] = [];
    if (cover.eyebrow) parts.push(`<div class="badge badge-p">${esc(cover.eyebrow)}</div>`);
    parts.push(`<h1 class="sec-title">${esc(meta?.title || '')}</h1>`);
    if (cover.meta?.length) {
      parts.push(`<div class="cover-meta">${cover.meta.map(esc).join('<span class="cm-dot">◆</span>')}</div>`);
    }
    parts.push('<div class="cover-rule"></div>');
    h.innerHTML = parts.join('');
    main.insertBefore(h, ROOT);
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
      getFilterDefs: () => this.store.filterDefs,
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
    this.modalCharts.reflow();
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
    document.getElementById('tn-edit-save')?.addEventListener('click', () => void this.finishEdit(true));
    document.getElementById('tn-edit-cancel')?.addEventListener('click', () => void this.finishEdit(false));
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
    document.getElementById('layout-edit-btn')?.setAttribute('hidden', '');
    document.getElementById('tn-edit-actions')?.removeAttribute('hidden');
  }

  private async finishEdit(save: boolean): Promise<void> {
    if (!this.dashboard || !this.editing) return;
    const saveBtn = document.getElementById('tn-edit-save') as HTMLButtonElement | null;
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
    document.getElementById('tn-edit-actions')?.setAttribute('hidden', '');
    document.getElementById('layout-edit-btn')?.removeAttribute('hidden');
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

  /* ───────────────────────────  Standalone HTML export  ─────────────────────────── */

  /** Snapshot every section through the real render path (so charts get correct
   *  tile widths and heights), clone each, pin the measured heights inline, and
   *  serialize into one self-contained .html with the stylesheet inlined — opens
   *  offline, no server. A static snapshot of the report at the current filter. */
  private async exportHtml(): Promise<void> {
    const btn = document.getElementById('export-html-btn') as HTMLButtonElement | null;
    const label = btn?.querySelector('span');
    const prevLabel = label?.textContent ?? 'HTML';
    if (btn) btn.disabled = true;
    if (label) label.textContent = 'Gerando…';

    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    const saved = { p: this.store.currentPageId, s: this.store.currentSectionId };

    try {
      // Pin the live render to the export document's content width so charts mount
      // at the width they'll occupy in the snapshot (1180 − 144 padding = 1036).
      const savedActive = { ...this.store.active };
      ROOT.style.width = '1180px';
      ROOT.style.maxWidth = 'none';
      ROOT.style.margin = '0 auto';

      // The export is interactive offline: paginated (page tabs) and filterable by
      // channel. Since the only filter is the channel toggle (≤3 values), we
      // pre-render each section once PER channel as a static snapshot and switch
      // panes with a tiny inline script — no data layer or chart lib needed.
      const fdef = this.store.filterDefs[0];
      const variants: (string | null)[] = fdef ? fdef.options.slice() : [null];
      const pages = this.store.pages;

      const pinHeights = (host: Element, clone: HTMLElement): void => {
        const lt = host.querySelectorAll('.dash-tile'); const ct = clone.querySelectorAll<HTMLElement>('.dash-tile');
        lt.forEach((l, i) => { const h = l.getBoundingClientRect().height; if (h > 0 && ct[i]) ct[i].style.minHeight = `${Math.round(h)}px`; });
        const lw = host.querySelectorAll('.chart-wrap'); const cw = clone.querySelectorAll<HTMLElement>('.chart-wrap');
        lw.forEach((l, i) => { const h = l.getBoundingClientRect().height; if (h > 4 && cw[i]) cw[i].style.height = `${Math.round(h)}px`; });
      };

      // Charts re-render once per (section × channel); disable ApexCharts animation
      // app-wide so each render settles instantly instead of running a ~400ms tween
      // (turns a multi-minute export into a few seconds).
      const apexWin = window as unknown as { Apex?: unknown };
      const apexPrev = apexWin.Apex;
      apexWin.Apex = { chart: { animations: { enabled: false } } };
      // buildOptions sets animations.enabled explicitly, which overrides the global
      // window.Apex above — so flip the export flag too, or the bars never paint.
      setChartExportMode(true);

      // Wait until every chart in the freshly rendered section has actually drawn
      // its series (a fixed delay clones chart-heavy sections like the Panorama
      // before the 8 bars exist). Polls + nudges a resize; fast for light sections.
      // Settle on the count of drawn series elements rather than "every chart drawn".
      // A page can legitimately hold an empty chart (a criterion with no data in one
      // channel), which never gets a series — requiring all of them would burn the
      // full timeout on most sections. Instead nudge a resize, count drawn bars/paths
      // among VISIBLE canvases (inactive toggle panes are display:none and skipped),
      // and return once that count stops growing for two polls.
      const drawnCount = (): number => {
        let n = 0;
        for (const c of ROOT.querySelectorAll<HTMLElement>('.apexcharts-canvas')) {
          if (c.offsetParent === null) continue;
          n += c.querySelectorAll('.apexcharts-bar-area, .apexcharts-series path, .apexcharts-series rect').length;
        }
        return n;
      };
      const chartsReady = async (): Promise<void> => {
        const t0 = Date.now();
        let prev = -1, stable = 0;
        for (;;) {
          window.dispatchEvent(new Event('resize'));
          await delay(70);
          const visible = [...ROOT.querySelectorAll<HTMLElement>('.apexcharts-canvas')].some(c => c.offsetParent !== null);
          if (!visible) { await delay(40); return; }
          const n = drawnCount();
          if (n > 0 && n === prev) { if (++stable >= 2) { await delay(40); return; } }
          else stable = 0;
          prev = n;
          if (Date.now() - t0 > 1200) return;
        }
      };

      const total = variants.length * this.store.allSections().length;
      let done = 0;
      const byVar: Record<string, Record<string, string[]>> = {};
      for (const val of variants) {
        if (fdef) this.store.active[fdef.id] = val ?? '';
        const key = String(val);
        byVar[key] = {};
        for (const page of pages) {
          const secs: string[] = [];
          for (const sref of page.sections) {
            await this.go(page.id, sref.id);
            await chartsReady();
            const host = ROOT.firstElementChild as HTMLElement | null;
            if (host) {
              const clone = host.cloneNode(true) as HTMLElement;
              clone.classList.add('export-section');
              pinHeights(host, clone);
              clone.querySelectorAll('.sc-trigger, .tile-cmark').forEach(n => n.remove());
              clone.querySelectorAll('.has-comment').forEach(n => n.classList.remove('has-comment'));
              secs.push(clone.outerHTML);
            }
            if (label) label.textContent = `Gerando ${Math.round((++done / total) * 100)}%`;
          }
          byVar[key][page.id] = secs;
        }
      }
      apexWin.Apex = apexPrev;
      setChartExportMode(false);

      // Restore live filters + width, return to the user's view.
      for (const k of Object.keys(this.store.active)) if (!(k in savedActive)) delete this.store.active[k];
      Object.assign(this.store.active, savedActive);
      ROOT.style.width = ''; ROOT.style.maxWidth = ''; ROOT.style.margin = '';
      await this.go(saved.p, saved.s);

      const css = await fetch('/style.css').then(r => r.text()).catch(() => '');
      const apexCss = [...document.querySelectorAll('style')]
        .map(s => s.textContent || '').filter(t => /apexcharts/i.test(t)).join('\n');
      const logo = await fetch('/assets/witly-logo.png').then(r => r.blob()).then(blobToDataUrl).catch(() => '');
      const theme = document.documentElement.dataset.theme || 'light';
      const meta = this.store.data?.meta || {};
      const title = meta.title || meta.client || 'Relatório';
      const defCanal = fdef ? String(fdef.default ?? fdef.options[0] ?? '') : '';
      const firstPage = pages[0]?.id || '';

      const navTabs = pages.map(p => `<button class="exp-tab" data-page="${esc(p.id)}">${esc(p.label)}</button>`).join('');
      const navCanal = fdef
        ? `<div class="exp-canal-toggle">${variants.map(v => `<button class="exp-cbtn" data-canal-btn="${esc(String(v))}">${esc(String(v))}</button>`).join('')}</div>`
        : '';
      const body = variants.map(val => `
  <div class="exp-canal-pane" data-canal="${esc(String(val))}">
    ${pages.map(p => `<section class="exp-page" data-page="${esc(p.id)}"><div class="exp-root">${(byVar[String(val)][p.id] || []).join('\n')}</div></section>`).join('')}
  </div>`).join('');
      const runtime = `(function(){var canal=${JSON.stringify(defCanal)},page=${JSON.stringify(firstPage)};
function apply(){document.querySelectorAll('.exp-canal-pane').forEach(function(c){c.hidden=c.getAttribute('data-canal')!==canal;});
document.querySelectorAll('.exp-page').forEach(function(p){p.hidden=p.getAttribute('data-page')!==page;});
document.querySelectorAll('.exp-tab').forEach(function(t){t.classList.toggle('on',t.getAttribute('data-page')===page);});
document.querySelectorAll('.exp-cbtn').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-canal-btn')===canal);});window.scrollTo(0,0);}
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('.exp-tab');if(t){page=t.getAttribute('data-page');apply();return;}
var c=e.target.closest&&e.target.closest('.exp-cbtn');if(c){canal=c.getAttribute('data-canal-btn');apply();return;}});apply();})();`;

      const doc = `<!doctype html>
<html lang="pt-BR" data-theme="${esc(theme)}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
${css}
${apexCss}
body{margin:0}
.exp-nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;height:54px;padding:0 24px;background:var(--bg);border-bottom:1px solid var(--border);overflow-x:auto}
.exp-logo{height:22px;width:auto;display:block;flex-shrink:0}
.exp-bar-sep{width:1px;height:20px;background:var(--border);flex-shrink:0}
.exp-client{font-size:14px;font-weight:700;white-space:nowrap}
.exp-tabs{display:flex;gap:2px;margin-left:6px}
.exp-tab{font-size:12.5px;font-weight:600;color:var(--gray);background:none;border:none;padding:7px 12px;border-radius:7px;cursor:pointer;white-space:nowrap;font-family:inherit}
.exp-tab:hover{color:var(--fg);background:var(--surface)}
.exp-tab.on{color:var(--purple);background:var(--purple-bg)}
.exp-canal-toggle{margin-left:auto;display:flex;gap:2px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:2px;flex-shrink:0}
.exp-cbtn{font-size:12px;font-weight:600;color:var(--gray);background:none;border:none;padding:5px 12px;border-radius:7px;cursor:pointer;font-family:inherit}
.exp-cbtn.on{color:#fff;background:var(--purple)}
.exp-canal-pane[hidden],.exp-page[hidden]{display:none}
.exp-root{width:1180px;max-width:100%;margin:0 auto;padding:22px 72px 72px}
.export-section{margin-bottom:48px}
.export-section .dash-tile{overflow:hidden}
.export-section .apexcharts-canvas,.export-section .apexcharts-canvas svg{max-width:100%}
.export-section .sec-header{margin-top:0}
</style>
</head>
<body>
<nav class="exp-nav">
  <div style="display:flex;align-items:center;gap:14px">${logo ? `<img class="exp-logo" src="${logo}" alt="Witly">` : ''}<span class="exp-bar-sep"></span><span class="exp-client">${esc(meta.client || 'Relatório')}</span></div>
  <div class="exp-tabs">${navTabs}</div>
  ${navCanal}
</nav>
${body}
<script>${runtime}</script>
</body>
</html>`;

      const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.client}-${this.slug}`.replace(/[^a-z0-9._-]+/gi, '-') + '.html';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      this.toast('HTML exportado');
    } catch {
      this.toast('Erro ao exportar HTML');
    } finally {
      setChartExportMode(false);
      ROOT.style.width = ''; ROOT.style.maxWidth = ''; ROOT.style.margin = '';
      if (btn) btn.disabled = false;
      if (label) label.textContent = prevLabel;
    }
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

const ESC_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function esc(s: unknown): string { return String(s ?? '').replace(/[&<>"]/g, c => ESC_MAP[c]); }

/** Blob → data: URL (used to inline the logo into the standalone export). */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/* ── boot ── */
const parts = location.pathname.split('/').filter(Boolean); // ["report", client, slug]
const client = decodeURIComponent(parts[1] || '');
const slug = decodeURIComponent(parts[2] || '');
if (client && slug) void new App(client, slug).start();
else ROOT.innerHTML = '<div style="padding:60px 56px"><p class="sm">URL inválida. Use /report/&lt;cliente&gt;/&lt;análise&gt;.</p></div>';
