/* criativos-controls.ts — controles NÍVEL-RELATÓRIO da análise de criativos, no FAB
 * (#filter-*): toggle de MODO (Resultado Final × Captação) + filtro de investimento
 * mínimo + filtro de temperatura. Persistem entre Panorama e fichas. Cada mudança
 * recalcula no servidor (debounced); o main faz o POST /render e re-renderiza. */

import type { ReportMeta } from '../shared/types.js';
import { el, group, opt, mountShell, fabSetPage, setBadge, debounce, type FabShell } from './controls-utils.js';

type Controls = NonNullable<ReportMeta['controls']>;
export interface CriativosOpts { mode: string; minInvest: number; temp: string | null; }
export interface CriativosHandlers { apply: (o: CriativosOpts) => void; }

export class CriativosControls {
  private shell: FabShell;
  private schedule: () => void;
  private mode: string;
  private minInvest = 0;
  private temp: string | null = null;

  constructor(private cfg: Controls, private h: CriativosHandlers) {
    this.shell = mountShell('criativos-controls', () => { this.minInvest = 0; this.temp = null; this.renderBody(); this.updateBadge(); this.schedule(); });
    const c = cfg as { mode?: string; modes?: Array<{ id: string }> };
    this.mode = c.mode || c.modes?.[0]?.id || 'resultado';
    this.schedule = debounce(() => this.h.apply({ mode: this.mode, minInvest: this.minInvest, temp: this.temp }), 250);

    this.renderBody();
    this.updateBadge();
  }

  /** O FAB de controle aparece em todas as páginas do relatório. */
  setPage(pageId: string): void { fabSetPage(this.shell, this.cfg.pages, pageId); }

  private renderBody(): void {
    this.shell.body.replaceChildren();
    const c = this.cfg as { modes?: Array<{ id: string; label: string }>; temps?: string[]; minInvestPresets?: number[] };

    // Modo (single-select)
    const gMode = group('Modo de análise');
    const segM = el('div', 'flt-seg');
    for (const m of (c.modes || [])) {
      const b = opt(m.label, this.mode === m.id);
      b.addEventListener('click', () => { this.mode = m.id; this.renderBody(); this.updateBadge(); this.schedule(); });
      segM.appendChild(b);
    }
    gMode.appendChild(segM);
    this.shell.body.appendChild(gMode);

    // Investimento mínimo (presets)
    const gInv = group('Investimento mínimo');
    const segI = el('div', 'flt-seg');
    const presets: Array<[string, number]> = [['Todos', 0], ...(c.minInvestPresets || [100, 500, 1000]).map((v) => [v >= 1000 ? `R$ ${v / 1000}k` : `R$ ${v}`, v] as [string, number])];
    for (const [label, val] of presets) {
      const b = opt(label, this.minInvest === val);
      b.addEventListener('click', () => { this.minInvest = val; this.renderBody(); this.updateBadge(); this.schedule(); });
      segI.appendChild(b);
    }
    gInv.appendChild(segI);
    this.shell.body.appendChild(gInv);

    // Temperatura (single-select) — só quando há temperaturas na base. Com uma única
    // temperatura, "Todas" é redundante: mostra apenas essa opção (informativa).
    if (c.temps && c.temps.length) {
      const gT = group('Temperatura');
      const segT = el('div', 'flt-seg');
      const single = c.temps.length === 1;
      if (!single) {
        const all = opt('Todas', this.temp === null);
        all.addEventListener('click', () => { this.temp = null; this.renderBody(); this.updateBadge(); this.schedule(); });
        segT.appendChild(all);
      }
      for (const t of c.temps) {
        const b = opt(t, single ? true : this.temp === t);
        if (!single) b.addEventListener('click', () => { this.temp = t; this.renderBody(); this.updateBadge(); this.schedule(); });
        segT.appendChild(b);
      }
      gT.appendChild(segT);
      this.shell.body.appendChild(gT);
    }
  }

  private updateBadge(): void {
    setBadge(this.shell, (this.minInvest > 0 ? 1 : 0) + (this.temp ? 1 : 0));
  }
}
