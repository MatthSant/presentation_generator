/* criativos-controls.ts — filtros NÍVEL-RELATÓRIO da análise de criativos, no FAB
 * (#filter-*): investimento mínimo + temperatura, como dropdowns-accordion (mesmo
 * visual do debriefing). O MODO (Resultado × Captação) NÃO fica aqui — é um toggle
 * na navbar (main.setupNavToggle). Cada mudança recalcula no servidor (debounced). */

import type { ReportMeta } from '../shared/types.js';
import { el, mountShell, fabSetPage, setBadge, debounce, type FabShell } from './controls-utils.js';

type Controls = NonNullable<ReportMeta['controls']>;
export interface CriativosOpts { minInvest: number; temp: string | null; }
export interface CriativosHandlers { apply: (o: CriativosOpts) => void; }

interface Dim { key: 'invest' | 'temp'; label: string; opts: Array<{ id: string; label: string }>; }

export class CriativosControls {
  private shell: FabShell;
  private schedule: () => void;
  private dims: Dim[];
  private minInvest = 0;
  private temp: string | null = null;
  private openKey: string | null = null;

  constructor(private cfg: Controls, private h: CriativosHandlers) {
    this.shell = mountShell('criativos-controls', () => { this.minInvest = 0; this.temp = null; this.renderBody(); this.updateBadge(); this.schedule(); });
    this.schedule = debounce(() => this.h.apply({ minInvest: this.minInvest, temp: this.temp }), 250);

    const c = cfg as { temps?: string[]; minInvestPresets?: number[] };
    const invOpts = [{ id: '0', label: 'Todos' }, ...(c.minInvestPresets || [100, 500, 1000]).map((v) => ({ id: String(v), label: v >= 1000 ? `R$ ${v / 1000}k` : `R$ ${v}` }))];
    this.dims = [{ key: 'invest', label: 'Investimento mínimo', opts: invOpts }];
    if (c.temps && c.temps.length) {
      const tOpts = c.temps.length === 1
        ? c.temps.map((t) => ({ id: t, label: t }))                              // única temperatura: informativa
        : [{ id: '', label: 'Todas' }, ...c.temps.map((t) => ({ id: t, label: t }))];
      this.dims.push({ key: 'temp', label: 'Temperatura', opts: tOpts });
      // temperatura única = informativa: não filtra (temp fica null) — só mostra qual é.
    }

    this.renderBody();
    this.updateBadge();
  }

  /** O FAB de filtro aparece em todas as páginas do relatório. */
  setPage(pageId: string): void { fabSetPage(this.shell, this.cfg.pages, pageId); }

  private cur(d: Dim): string {
    if (d.key === 'invest') return String(this.minInvest);
    if (d.opts.length === 1) return d.opts[0].id;   // temperatura única: sempre "ativa" (informativa)
    return this.temp || '';
  }
  private summary(d: Dim): string {
    const sel = d.opts.find((o) => o.id === this.cur(d));
    return sel ? sel.label : d.opts[0].label;
  }

  private renderBody(): void {
    this.shell.body.replaceChildren();
    for (const d of this.dims) this.shell.body.appendChild(this.dropdown(d));
  }

  /** Um dropdown (accordion) por filtro; painel com opções de SELEÇÃO ÚNICA. Só um
   *  aberto por vez — idêntico ao padrão do debriefing. */
  private dropdown(d: Dim): HTMLElement {
    const open = this.openKey === d.key;
    const dd = el('div', 'flt-dd' + (open ? ' is-open' : ''));
    const head = el('button', 'flt-dd-head') as HTMLButtonElement;
    head.type = 'button';
    const lbl = el('span', 'flt-dd-lbl'); lbl.textContent = d.label;
    const sum = el('span', 'flt-dd-sum'); sum.textContent = this.summary(d);
    const chev = el('span', 'flt-dd-chev'); chev.textContent = '⌄';
    head.append(lbl, sum, chev);
    head.addEventListener('click', () => { this.openKey = open ? null : d.key; this.renderBody(); });
    dd.appendChild(head);
    if (!open) return dd;

    const panel = el('div', 'flt-dd-panel');
    const seg = el('div', 'flt-seg');
    for (const o of d.opts) {
      const b = el('button', 'flt-opt' + (o.id === this.cur(d) ? ' flt-active' : '')) as HTMLButtonElement;
      b.type = 'button';
      b.textContent = o.label;
      // temperatura única = informativa (sem clique)
      if (!(d.key === 'temp' && d.opts.length === 1)) {
        b.addEventListener('click', () => {
          if (d.key === 'invest') this.minInvest = Number(o.id) || 0;
          else this.temp = o.id || null;
          this.renderBody(); this.updateBadge(); this.schedule();
        });
      }
      seg.appendChild(b);
    }
    panel.appendChild(seg);
    dd.appendChild(panel);
    return dd;
  }

  private updateBadge(): void {
    setBadge(this.shell, (this.minInvest > 0 ? 1 : 0) + (this.temp ? 1 : 0));
  }
}
