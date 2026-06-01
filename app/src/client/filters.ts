/* filters.ts — dashboard filter FAB (bottom-right) + filter modal.
 *
 * Filters are declared in data.meta.filters; each id is a dataset column name.
 * Selecting an option mutates store.active and fires onChange (the dashboard
 * re-resolves binds in place — no refetch). State round-trips through the URL
 * querystring so a filtered view is shareable. An option equal to allValue
 * means "no narrowing" and is dropped from active. */

import type { Store } from './store.js';
import type { FilterDef } from '../shared/types.js';

export class Filters {
  private fab: HTMLElement;
  private modal: HTMLElement;
  private body: HTMLElement;
  private count: HTMLElement;

  constructor(private store: Store, private onChange: () => void) {
    this.fab = must('filter-fab');
    this.modal = must('filter-modal');
    this.body = must('filter-body');
    this.count = must('filter-count');

    this.fab.addEventListener('click', () => this.open());
    must('filter-close').addEventListener('click', () => this.close());
    must('filter-clear').addEventListener('click', () => this.clear());
    this.modal.addEventListener('click', e => { if (e.target === this.modal) this.close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
  }

  /** Seed active from defaults then override from the URL, before first render. */
  init(): void {
    const defs = this.store.filterDefs;
    const params = new URLSearchParams(location.search);
    for (const def of defs) {
      const fromUrl = params.get(def.id);
      const value = fromUrl ?? def.default;
      if (value != null && value !== '' && value !== def.allValue) this.store.active[def.id] = value;
    }
    if (defs.length === 0) { this.fab.hidden = true; return; }
    this.fab.hidden = false;
    this.renderBody();
    this.updateBadge();
  }

  private selected(def: FilterDef): string {
    return this.store.active[def.id] ?? def.allValue ?? def.default ?? def.options[0] ?? '';
  }

  private renderBody(): void {
    this.body.replaceChildren();
    for (const def of this.store.filterDefs) {
      const group = document.createElement('div');
      group.className = 'flt-group';
      const label = document.createElement('div');
      label.className = 'flt-label';
      label.textContent = def.label;
      group.appendChild(label);

      const seg = document.createElement('div');
      seg.className = 'flt-seg';
      const options = def.allValue && !def.options.includes(def.allValue)
        ? [def.allValue, ...def.options] : def.options;
      for (const opt of options) {
        const btn = document.createElement('button');
        btn.className = 'flt-opt';
        btn.textContent = opt;
        btn.dataset.value = opt;
        btn.classList.toggle('flt-active', this.selected(def) === opt);
        btn.addEventListener('click', () => this.pick(def, opt));
        seg.appendChild(btn);
      }
      group.appendChild(seg);
      this.body.appendChild(group);
    }
  }

  private pick(def: FilterDef, value: string): void {
    if (value === def.allValue) delete this.store.active[def.id];
    else this.store.active[def.id] = value;
    this.refreshSeg(def);
    this.syncUrl();
    this.updateBadge();
    this.onChange();
  }

  private refreshSeg(def: FilterDef): void {
    const sel = this.selected(def);
    for (const g of this.body.querySelectorAll<HTMLElement>('.flt-group')) {
      const first = g.querySelector<HTMLElement>('.flt-label');
      if (first?.textContent !== def.label) continue;
      for (const b of g.querySelectorAll<HTMLElement>('.flt-opt')) {
        b.classList.toggle('flt-active', b.dataset.value === sel);
      }
    }
  }

  private clear(): void {
    this.store.active = {};
    this.renderBody();
    this.syncUrl();
    this.updateBadge();
    this.onChange();
  }

  private syncUrl(): void {
    const params = new URLSearchParams(location.search);
    for (const def of this.store.filterDefs) {
      const v = this.store.active[def.id];
      if (v != null) params.set(def.id, v); else params.delete(def.id);
    }
    const qs = params.toString();
    history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
  }

  private updateBadge(): void {
    const n = Object.keys(this.store.active).length;
    this.count.textContent = String(n);
    this.fab.classList.toggle('flt-has', n > 0);
  }

  private open(): void { this.modal.classList.add('open'); }
  private close(): void { this.modal.classList.remove('open'); }
}

function must(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`filters: missing #${id}`);
  return el;
}
