/* historico-controls.ts — controles da vista interativa do histórico, montados
 * no FAB + modal padrão do app (#filter-*). Indicador (single-select segmentado)
 * + Lançamentos (multi-seleção). Cada mudança recalcula no servidor (debounced);
 * o main faz o POST e re-renderiza, marcando os gráficos filtrados. */

import type { ReportMeta } from '../shared/types.js';

type Controls = NonNullable<ReportMeta['controls']>;
export interface HistoricoHandlers { apply: (launches: string[]) => void; }

export class HistoricoFilters {
  private fab: HTMLElement;
  private modal: HTMLElement;
  private body: HTMLElement;
  private count: HTMLElement;
  private launches: Set<string>;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private cfg: Controls, private h: HistoricoHandlers) {
    this.fab = must('filter-fab');
    this.modal = must('filter-modal');
    this.body = must('filter-body');
    this.count = must('filter-count');
    this.launches = new Set(cfg.launches);

    this.fab.addEventListener('click', () => this.modal.classList.add('open'));
    must('filter-close').addEventListener('click', () => this.modal.classList.remove('open'));
    must('filter-clear').addEventListener('click', () => this.selectAll());
    this.modal.addEventListener('click', e => { if (e.target === this.modal) this.modal.classList.remove('open'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.modal.classList.remove('open'); });

    this.renderBody();
    this.updateBadge();
  }

  /** Show the FAB only on pages the controls apply to. */
  setPage(pageId: string): void {
    const on = this.cfg.pages.includes(pageId);
    this.fab.hidden = !on;
    if (!on) this.modal.classList.remove('open');
  }

  private renderBody(): void {
    this.body.replaceChildren();

    const gL = group('Lançamentos');
    const tools = el('div', 'flt-tools');
    const allB = mini('Todos'); allB.addEventListener('click', () => this.selectAll());
    const invB = mini('Inverter'); invB.addEventListener('click', () => this.invert());
    tools.append(allB, invB);
    gL.appendChild(tools);
    const segL = el('div', 'flt-seg');
    for (const l of this.cfg.launches) {
      const b = opt(l, this.launches.has(l));
      b.addEventListener('click', () => {
        if (this.launches.has(l)) this.launches.delete(l); else this.launches.add(l);
        b.classList.toggle('flt-active', this.launches.has(l));
        this.updateBadge();
        this.schedule();
      });
      segL.appendChild(b);
    }
    gL.appendChild(segL);
    this.body.appendChild(gL);
  }

  private selectAll(): void { this.launches = new Set(this.cfg.launches); this.renderBody(); this.updateBadge(); this.schedule(); }
  private invert(): void {
    this.launches = new Set(this.cfg.launches.filter(l => !this.launches.has(l)));
    this.renderBody(); this.updateBadge(); this.schedule();
  }

  private updateBadge(): void {
    const n = this.launches.size;
    const narrowed = n > 0 && n < this.cfg.launches.length;
    this.count.textContent = String(narrowed ? n : 0);
    this.fab.classList.toggle('flt-has', narrowed);
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.h.apply([...this.launches]), 250);
  }
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
function group(label: string): HTMLElement {
  const g = el('div', 'flt-group');
  const l = el('div', 'flt-label');
  l.textContent = label;
  g.appendChild(l);
  return g;
}
function opt(label: string, active: boolean): HTMLElement {
  const b = el('button', 'flt-opt' + (active ? ' flt-active' : ''));
  (b as HTMLButtonElement).type = 'button';
  b.textContent = label;
  return b;
}
function mini(label: string): HTMLElement {
  const b = el('button', 'flt-mini');
  (b as HTMLButtonElement).type = 'button';
  b.textContent = label;
  return b;
}
function must(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`historico-filters: missing #${id}`);
  return e;
}
