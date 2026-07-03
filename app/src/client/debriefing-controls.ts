/* debriefing-controls.ts — filtro NÍVEL-RELATÓRIO do debriefing, no FAB (#filter-*).
 * Multi-seleção por dimensão (tipo de tráfego · canal · temperatura · campanha · público
 * · criativo); AND entre dimensões, OR dentro de cada uma. Cada mudança recalcula no
 * servidor (debounced); o main faz POST /render e re-renderiza. Persiste entre páginas. */

import type { ReportMeta } from '../shared/types.js';
import { el, mountShell, fabSetPage, setBadge, debounce, type FabShell } from './controls-utils.js';

type Controls = NonNullable<ReportMeta['controls']>;
interface FilterDim { key: string; label: string; values: { id: string; label: string }[] }
export type DebFilters = Record<string, string[]>;
export interface DebriefingHandlers { apply: (f: DebFilters) => void; }

export class DebriefingControls {
  private shell: FabShell;
  private schedule: () => void;
  private dims: FilterDim[];
  private sel = new Map<string, Set<string>>();

  constructor(private cfg: Controls, private h: DebriefingHandlers) {
    this.shell = mountShell('debriefing-controls', () => { this.sel.clear(); this.renderBody(); this.updateBadge(); this.schedule(); });
    this.dims = ((cfg as { filters?: FilterDim[] }).filters || []).filter((d) => d.values && d.values.length);
    this.schedule = debounce(() => this.h.apply(this.payload()), 300);

    this.renderBody();
    this.updateBadge();
  }

  /** O FAB de filtro aparece em todas as páginas do relatório. */
  setPage(pageId: string): void { fabSetPage(this.shell, this.cfg.pages, pageId); }

  private openDim: string | null = null;

  private renderBody(): void {
    this.shell.body.replaceChildren();
    for (const d of this.dims) this.shell.body.appendChild(this.dropdown(d));
  }

  /** Um dropdown (accordion) por dimensão: cabeçalho com resumo + painel de checkboxes
   *  (com busca quando a lista é longa). Só um aberto por vez. */
  private dropdown(d: FilterDim): HTMLElement {
    const set = this.sel.get(d.key);
    const open = this.openDim === d.key;
    const dd = el('div', 'flt-dd' + (open ? ' is-open' : ''));
    const head = el('button', 'flt-dd-head') as HTMLButtonElement;
    head.type = 'button';
    const lbl = el('span', 'flt-dd-lbl'); lbl.textContent = d.label;
    const sum = el('span', 'flt-dd-sum'); sum.textContent = this.summary(d);
    const chev = el('span', 'flt-dd-chev'); chev.textContent = '⌄';
    head.append(lbl, sum, chev);
    head.addEventListener('click', () => { this.openDim = open ? null : d.key; this.renderBody(); });
    dd.appendChild(head);
    if (!open) return dd;

    const panel = el('div', 'flt-dd-panel');
    const items = el('div', 'flt-dd-items');
    if (d.values.length > 8) {
      const search = el('input', 'flt-dd-search') as HTMLInputElement;
      search.type = 'text'; search.placeholder = 'Buscar…';
      search.addEventListener('input', () => {
        const q = search.value.toLowerCase();
        for (const it of Array.from(items.children) as HTMLElement[]) it.style.display = (it.dataset.lbl || '').includes(q) ? '' : 'none';
      });
      panel.appendChild(search);
    }
    const act = el('div', 'flt-dd-act');
    const clr = el('button', 'flt-dd-clr') as HTMLButtonElement; clr.type = 'button'; clr.textContent = 'Limpar seleção';
    clr.addEventListener('click', () => { this.sel.delete(d.key); sum.textContent = this.summary(d); this.updateBadge(); this.schedule(); for (const it of Array.from(items.querySelectorAll('input'))) (it as HTMLInputElement).checked = false; });
    act.appendChild(clr);
    panel.appendChild(act);
    for (const v of d.values) {
      const row = el('label', 'flt-dd-item'); row.dataset.lbl = v.label.toLowerCase();
      const cb = el('input', '') as HTMLInputElement; cb.type = 'checkbox'; cb.checked = !!set && set.has(v.id);
      cb.addEventListener('change', () => { this.toggle(d.key, v.id); sum.textContent = this.summary(d); this.updateBadge(); this.schedule(); });
      const tx = el('span', 'flt-dd-itx'); tx.textContent = v.label; tx.title = v.label;
      row.append(cb, tx);
      items.appendChild(row);
    }
    panel.appendChild(items);
    dd.appendChild(panel);
    return dd;
  }

  private summary(d: FilterDim): string {
    const set = this.sel.get(d.key);
    if (!set || !set.size) return 'Todos';
    if (set.size === 1) { const v = d.values.find((x) => x.id === [...set][0]); return v ? v.label : '1 selecionado'; }
    return `${set.size} selecionados`;
  }

  private toggle(key: string, id: string): void {
    let set = this.sel.get(key);
    if (!set) { set = new Set(); this.sel.set(key, set); }
    if (set.has(id)) set.delete(id); else set.add(id);
    if (set.size === 0) this.sel.delete(key);
  }

  private updateBadge(): void { setBadge(this.shell, this.sel.size); }

  private payload(): DebFilters {
    const f: DebFilters = {};
    for (const [k, set] of this.sel) if (set.size) f[k] = [...set];
    return f;
  }
}
