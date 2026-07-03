/* historico-controls.ts — controle da vista interativa do histórico, no FAB
 * (#filter-*): Lançamentos como um dropdown-accordion multi-seleção (mesmo visual
 * do debriefing) — cabeçalho + resumo + chevron, painel com busca (quando há
 * muitos), ações Todos/Inverter e checkboxes. Cada mudança recalcula no servidor
 * (debounced); o main faz o POST e re-renderiza, marcando os gráficos filtrados. */

import type { ReportMeta } from '../shared/types.js';
import { el, mountShell, fabSetPage, setBadge, debounce, type FabShell } from './controls-utils.js';

type Controls = NonNullable<ReportMeta['controls']>;
export interface HistoricoHandlers { apply: (launches: string[]) => void; }

export class HistoricoFilters {
  private shell: FabShell;
  private launches: Set<string>;
  private schedule: () => void;
  private open = false;

  constructor(private cfg: Controls, private h: HistoricoHandlers) {
    this.shell = mountShell('historico-filters', () => this.selectAll());
    this.launches = new Set(cfg.launches);
    this.schedule = debounce(() => this.h.apply([...this.launches]), 250);

    this.renderBody();
    this.updateBadge();
  }

  /** Show the FAB only on pages the controls apply to. */
  setPage(pageId: string): void { fabSetPage(this.shell, this.cfg.pages, pageId); }

  private summary(): string {
    const n = this.launches.size, total = this.cfg.launches.length;
    return (n === 0 || n === total) ? 'Todos' : `${n} de ${total}`;
  }

  private renderBody(): void {
    this.shell.body.replaceChildren();
    this.shell.body.appendChild(this.dropdown());
  }

  /** Dropdown (accordion) de Lançamentos: multi-seleção com busca + Todos/Inverter,
   *  no mesmo padrão visual do debriefing. */
  private dropdown(): HTMLElement {
    const dd = el('div', 'flt-dd' + (this.open ? ' is-open' : ''));
    const head = el('button', 'flt-dd-head') as HTMLButtonElement;
    head.type = 'button';
    const lbl = el('span', 'flt-dd-lbl'); lbl.textContent = 'Lançamentos';
    const sum = el('span', 'flt-dd-sum'); sum.textContent = this.summary();
    const chev = el('span', 'flt-dd-chev'); chev.textContent = '⌄';
    head.append(lbl, sum, chev);
    head.addEventListener('click', () => { this.open = !this.open; this.renderBody(); });
    dd.appendChild(head);
    if (!this.open) return dd;

    const panel = el('div', 'flt-dd-panel');
    const items = el('div', 'flt-dd-items');
    if (this.cfg.launches.length > 8) {
      const search = el('input', 'flt-dd-search') as HTMLInputElement;
      search.type = 'text'; search.placeholder = 'Buscar lançamento…';
      search.addEventListener('input', () => {
        const q = search.value.toLowerCase();
        for (const it of Array.from(items.children) as HTMLElement[]) it.style.display = (it.dataset.lbl || '').includes(q) ? '' : 'none';
      });
      panel.appendChild(search);
    }
    // Ações rápidas: Todos · Inverter (reusa o slot de ações do dropdown do debriefing).
    const act = el('div', 'flt-dd-act');
    const todos = el('button', 'flt-dd-clr') as HTMLButtonElement; todos.type = 'button'; todos.textContent = 'Todos';
    todos.addEventListener('click', () => this.selectAll());
    const inv = el('button', 'flt-dd-clr') as HTMLButtonElement; inv.type = 'button'; inv.textContent = 'Inverter';
    inv.addEventListener('click', () => this.invert());
    act.append(todos, inv);
    panel.appendChild(act);

    for (const l of this.cfg.launches) {
      const row = el('label', 'flt-dd-item'); row.dataset.lbl = l.toLowerCase();
      const cb = el('input', '') as HTMLInputElement; cb.type = 'checkbox'; cb.checked = this.launches.has(l);
      cb.addEventListener('change', () => {
        if (cb.checked) this.launches.add(l); else this.launches.delete(l);
        sum.textContent = this.summary(); this.updateBadge(); this.schedule();
      });
      const tx = el('span', 'flt-dd-itx'); tx.textContent = l; tx.title = l;
      row.append(cb, tx);
      items.appendChild(row);
    }
    panel.appendChild(items);
    dd.appendChild(panel);
    return dd;
  }

  private selectAll(): void { this.launches = new Set(this.cfg.launches); this.renderBody(); this.updateBadge(); this.schedule(); }
  private invert(): void {
    this.launches = new Set(this.cfg.launches.filter((l) => !this.launches.has(l)));
    this.renderBody(); this.updateBadge(); this.schedule();
  }

  private updateBadge(): void {
    const n = this.launches.size;
    const narrowed = n > 0 && n < this.cfg.launches.length;
    setBadge(this.shell, narrowed ? n : 0);
  }
}
