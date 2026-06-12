/* criativos-controls.ts — controles NÍVEL-RELATÓRIO da análise de criativos, no FAB
 * (#filter-*): toggle de MODO (Resultado Final × Captação) + filtro de investimento
 * mínimo + filtro de temperatura. Persistem entre Panorama e fichas. Cada mudança
 * recalcula no servidor (debounced); o main faz o POST /render e re-renderiza. */

import type { ReportMeta } from '../shared/types.js';
import { wireFilterShell } from './filters.js';

type Controls = NonNullable<ReportMeta['controls']>;
export interface CriativosOpts { mode: string; minInvest: number; temp: string | null; }
export interface CriativosHandlers { apply: (o: CriativosOpts) => void; }

export class CriativosControls {
  private fab: HTMLElement;
  private modal: HTMLElement;
  private body: HTMLElement;
  private count: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private mode: string;
  private minInvest = 0;
  private temp: string | null = null;

  constructor(private cfg: Controls, private h: CriativosHandlers) {
    this.fab = must('filter-fab');
    this.modal = must('filter-modal');
    this.body = must('filter-body');
    this.count = must('filter-count');
    const c = cfg as { mode?: string; modes?: Array<{ id: string }> };
    this.mode = c.mode || c.modes?.[0]?.id || 'resultado';

    wireFilterShell(this.fab, this.modal, must('filter-close'));
    must('filter-clear').addEventListener('click', () => { this.minInvest = 0; this.temp = null; this.renderBody(); this.updateBadge(); this.schedule(); });

    this.renderBody();
    this.updateBadge();
  }

  /** O FAB de controle aparece em todas as páginas do relatório. */
  setPage(pageId: string): void {
    const on = (this.cfg.pages || []).includes(pageId);
    this.fab.hidden = !on;
    if (!on) this.modal.classList.remove('open');
  }

  private renderBody(): void {
    this.body.replaceChildren();
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
    this.body.appendChild(gMode);

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
    this.body.appendChild(gInv);

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
      this.body.appendChild(gT);
    }
  }

  private updateBadge(): void {
    const n = (this.minInvest > 0 ? 1 : 0) + (this.temp ? 1 : 0);
    this.count.textContent = String(n);
    this.fab.classList.toggle('flt-has', n > 0);
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.h.apply({ mode: this.mode, minInvest: this.minInvest, temp: this.temp }), 250);
  }
}

function el(tag: string, cls: string): HTMLElement { const e = document.createElement(tag); e.className = cls; return e; }
function group(label: string): HTMLElement {
  const g = el('div', 'flt-group');
  const l = el('div', 'flt-label'); l.textContent = label; g.appendChild(l);
  return g;
}
function opt(label: string, active: boolean): HTMLElement {
  const b = el('button', 'flt-opt' + (active ? ' flt-active' : ''));
  (b as HTMLButtonElement).type = 'button'; b.textContent = label;
  return b;
}
function must(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`criativos-controls: missing #${id}`);
  return e;
}
