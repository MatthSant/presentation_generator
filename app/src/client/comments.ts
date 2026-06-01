/* comments.ts — consultant annotations: drawer panel, creation modal, right-click
 * context menu, per-section "+" trigger, and section-tab badges.
 *
 * Server-backed through Api (SQLite). Optimistic UI: we mutate the local list and
 * re-render immediately, then persist; a failed write logs but never blocks. */

import type { Api, ApiComment } from './api.js';

type Filter = 'todos' | 'detalhar' | 'insight' | 'acao';
const TYPE_TEXT: Record<string, string> = { detalhar: 'Detalhar', insight: 'Insight', acao: 'Ação' };
/* Monoline icons matching the chrome (report.html). stroke=currentColor so the
   per-type color from .cp-type-* carries to the glyph. */
const TYPE_ICON: Record<string, string> = {
  detalhar: '<svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m20 20-5.2-5.2"/></svg>',
  insight: '<svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 17.5h5"/><path d="M10 20.5h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4.9 1 1 1.6h5c.1-.6.4-1.2 1-1.6A6 6 0 0 0 12 3Z"/></svg>',
  acao: '<svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.3 2.8 2.7 4.8-5.5"/></svg>',
};
const ANCHOR_SELECTORS = ['.find-title', '.mv', '.chart-title', '.find-tag', '.hl', '.label-sec', '.ml', 'td', 'th', '.find-note', '.sm'];

interface PendingCtx { sectionId: string; sectionLabel: string; anchor: string | null; }

export class Comments {
  private list: ApiComment[] = [];
  private filter: Filter = 'todos';
  private pending: PendingCtx | null = null;
  private selType: string | null = null;
  private ctxTarget: PendingCtx | null = null;

  constructor(
    private api: Api,
    private onBadges: (bySection: Map<string, Set<string>>) => void,
  ) {
    this.wirePanel();
    this.wireModal();
    this.wireContextMenu();
  }

  async load(): Promise<void> {
    try { this.list = await this.api.getComments(); } catch { this.list = []; }
    this.renderPanel();
    this.emitBadges();
  }

  /* ── badges ── */
  private emitBadges(): void {
    const by = new Map<string, Set<string>>();
    for (const c of this.list) {
      if (!by.has(c.sectionId)) by.set(c.sectionId, new Set());
      by.get(c.sectionId)!.add(c.type);
    }
    this.onBadges(by);
  }

  /* ── panel ── */
  private wirePanel(): void {
    el('comment-toggle-btn').addEventListener('click', () => {
      const panel = el('comment-panel');
      const open = panel.classList.toggle('open');
      el('comment-toggle-btn').classList.toggle('ctb-on', open);
    });
    el('cp-close-btn').addEventListener('click', () => {
      el('comment-panel').classList.remove('open');
      el('comment-toggle-btn').classList.remove('ctb-on');
    });
    for (const b of document.querySelectorAll<HTMLElement>('.cp-filter')) {
      b.addEventListener('click', () => {
        this.filter = (b.dataset.filter as Filter) || 'todos';
        for (const x of document.querySelectorAll<HTMLElement>('.cp-filter')) x.classList.toggle('cp-active', x === b);
        this.renderPanel();
      });
    }
    el('cp-list').addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-del]');
      if (btn) void this.remove(btn.dataset.del!);
    });
    el('cp-export-btn').addEventListener('click', () => {
      window.open(this.api.commentsCsvUrl(), '_blank');
    });
  }

  private renderPanel(): void {
    const shown = this.filter === 'todos' ? this.list : this.list.filter(c => c.type === this.filter);
    const total = this.list.length;
    el('cp-total').textContent = String(total);
    el('ctb-n').textContent = String(total);
    el('comment-toggle-btn').classList.toggle('ctb-has', total > 0);

    const host = el('cp-list');
    host.replaceChildren();
    if (shown.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cp-empty';
      empty.innerHTML = `Nenhum comentário${this.filter !== 'todos' ? ' deste tipo' : ''}.<br>Clique com o <strong>botão direito</strong> em qualquer parte do relatório.`;
      host.appendChild(empty);
      return;
    }
    for (const c of shown) host.appendChild(this.itemEl(c));
  }

  private itemEl(c: ApiComment): HTMLElement {
    const item = document.createElement('div');
    item.className = 'cp-item';
    const hd = document.createElement('div');
    hd.className = 'cp-item-hd';
    const type = document.createElement('span');
    type.className = `cp-type cp-type-${c.type}`;
    type.innerHTML = (TYPE_ICON[c.type] || '') + (TYPE_TEXT[c.type] || c.type);
    hd.append(type, span('cp-sec', c.sectionLabel));
    item.appendChild(hd);
    if (c.anchor) item.appendChild(span('cp-anchor', `"${c.anchor}"`));
    item.appendChild(span('cp-text', c.text));
    item.appendChild(span('cp-date', fmtDate(c.createdAt)));
    const del = document.createElement('button');
    del.className = 'cp-del';
    del.dataset.del = c.id;
    del.innerHTML = '&#215;';
    item.appendChild(del);
    return item;
  }

  /* ── modal ── */
  private wireModal(): void {
    for (const b of document.querySelectorAll<HTMLElement>('.cm-type')) {
      b.addEventListener('click', () => {
        this.selType = b.dataset.type || null;
        for (const x of document.querySelectorAll<HTMLElement>('.cm-type')) x.className = 'cm-type';
        if (this.selType) b.classList.add(`sel-${this.selType}`);
      });
    }
    el('cm-save').addEventListener('click', () => void this.save());
    (el('cm-ta') as HTMLTextAreaElement).addEventListener('keydown', e => {
      if ((e as KeyboardEvent).ctrlKey && (e as KeyboardEvent).key === 'Enter') void this.save();
    });
    el('cm-cancel').addEventListener('click', () => this.closeModal());
    el('cm-x').addEventListener('click', () => this.closeModal());
  }

  private openModal(ctx: PendingCtx): void {
    this.pending = ctx;
    this.selType = null;
    el('cm-sec-lbl').textContent = ctx.sectionLabel || '';
    for (const b of document.querySelectorAll<HTMLElement>('.cm-type')) b.className = 'cm-type';
    (el('cm-ta') as HTMLTextAreaElement).value = '';
    const anchor = el('cm-anchor-block');
    if (ctx.anchor) { anchor.classList.add('visible'); el('cm-anchor-txt').textContent = ctx.anchor; }
    else anchor.classList.remove('visible');
    el('comment-modal').classList.add('open');
    (el('cm-ta') as HTMLTextAreaElement).focus();
  }

  private closeModal(): void { el('comment-modal').classList.remove('open'); }

  private async save(): Promise<void> {
    const text = (el('cm-ta') as HTMLTextAreaElement).value.trim();
    if (!text || !this.selType || !this.pending) return;
    const optimistic: ApiComment = {
      id: `tmp-${Date.now()}`, sectionId: this.pending.sectionId, sectionLabel: this.pending.sectionLabel,
      type: this.selType, text, anchor: this.pending.anchor || '', status: 'novo', createdAt: new Date().toISOString(),
    };
    this.list.push(optimistic);
    this.renderPanel();
    this.emitBadges();
    this.closeModal();
    try {
      const saved = await this.api.postComment(optimistic);
      const i = this.list.findIndex(c => c.id === optimistic.id);
      if (i >= 0) this.list[i] = saved;
      this.emitBadges();
    } catch (e) { console.error('save comment failed', e); }
  }

  private async remove(id: string): Promise<void> {
    this.list = this.list.filter(c => c.id !== id);
    this.renderPanel();
    this.emitBadges();
    try { await this.api.deleteComment(id); } catch (e) { console.error('delete comment failed', e); }
  }

  /* ── right-click + section "+" trigger ── */
  private wireContextMenu(): void {
    const menu = el('ctx-menu');
    document.addEventListener('contextmenu', e => {
      const sec = (e.target as HTMLElement).closest<HTMLElement>('[data-report-section]');
      if (!sec) { menu.classList.remove('open'); return; }
      e.preventDefault();
      this.ctxTarget = {
        sectionId: sec.id,
        sectionLabel: sec.dataset.reportSection || '',
        anchor: captureContext(e.target as HTMLElement),
      };
      menu.style.left = `${(e as MouseEvent).clientX}px`;
      menu.style.top = `${(e as MouseEvent).clientY}px`;
      menu.classList.add('open');
    });
    document.addEventListener('click', () => menu.classList.remove('open'));
    el('ctx-comment').addEventListener('click', () => { if (this.ctxTarget) this.openModal(this.ctxTarget); });

    document.addEventListener('click', e => {
      const add = (e.target as HTMLElement).closest<HTMLElement>('.sc-add');
      if (add) this.openModal({ sectionId: add.dataset.secId || '', sectionLabel: add.dataset.secLabel || '', anchor: null });
    });
  }
}

/* ── helpers ── */
function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`comments: missing #${id}`);
  return node;
}
function span(cls: string, text: string): HTMLElement {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
function captureContext(start: HTMLElement): string | null {
  let node: HTMLElement | null = start;
  while (node && node !== document.body) {
    for (const sel of ANCHOR_SELECTORS) {
      if (node.matches?.(sel)) {
        const t = node.textContent?.trim().replace(/\s+/g, ' ');
        if (t && t.length > 3) return t.slice(0, 180);
      }
    }
    node = node.parentElement;
  }
  const t = start.textContent?.trim().replace(/\s+/g, ' ');
  return t && t.length > 3 && t.length < 200 ? t.slice(0, 180) : null;
}
