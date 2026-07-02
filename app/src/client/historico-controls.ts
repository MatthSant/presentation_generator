/* historico-controls.ts — controles da vista interativa do histórico, montados
 * no FAB + modal padrão do app (#filter-*). Indicador (single-select segmentado)
 * + Lançamentos (multi-seleção). Cada mudança recalcula no servidor (debounced);
 * o main faz o POST e re-renderiza, marcando os gráficos filtrados. */

import type { ReportMeta } from '../shared/types.js';
import { el, group, opt, mini, mountShell, fabSetPage, setBadge, debounce, type FabShell } from './controls-utils.js';

type Controls = NonNullable<ReportMeta['controls']>;
export interface HistoricoHandlers { apply: (launches: string[]) => void; }

export class HistoricoFilters {
  private shell: FabShell;
  private launches: Set<string>;
  private schedule: () => void;

  constructor(private cfg: Controls, private h: HistoricoHandlers) {
    this.shell = mountShell('historico-filters', () => this.selectAll());
    this.launches = new Set(cfg.launches);
    this.schedule = debounce(() => this.h.apply([...this.launches]), 250);

    this.renderBody();
    this.updateBadge();
  }

  /** Show the FAB only on pages the controls apply to. */
  setPage(pageId: string): void { fabSetPage(this.shell, this.cfg.pages, pageId); }

  private renderBody(): void {
    this.shell.body.replaceChildren();

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
    this.shell.body.appendChild(gL);
  }

  private selectAll(): void { this.launches = new Set(this.cfg.launches); this.renderBody(); this.updateBadge(); this.schedule(); }
  private invert(): void {
    this.launches = new Set(this.cfg.launches.filter(l => !this.launches.has(l)));
    this.renderBody(); this.updateBadge(); this.schedule();
  }

  private updateBadge(): void {
    const n = this.launches.size;
    const narrowed = n > 0 && n < this.cfg.launches.length;
    setBadge(this.shell, narrowed ? n : 0);
  }
}
