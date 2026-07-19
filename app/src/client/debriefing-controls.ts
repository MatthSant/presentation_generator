/* debriefing-controls.ts — filtro NÍVEL-RELATÓRIO do debriefing, no FAB (#filter-*).
 * Multi-seleção por dimensão (tipo de tráfego · canal · temperatura · campanha · público
 * · criativo); AND entre dimensões, OR dentro de cada uma. Cada mudança recalcula no
 * servidor (debounced); o main faz POST /render e re-renderiza. Persiste entre páginas. */

import type { ReportMeta } from '../shared/types.js';
import { el, mountShell, fabSetPage, setBadge, debounce, type FabShell } from './controls-utils.js';

type Controls = NonNullable<ReportMeta['controls']>;
/** `kind` = como a dimensão se controla. 'list' (default) = checkboxes; 'range' =
 *  intervalo contínuo (de → até) com atalhos. Quem declara é a dimensão, não a
 *  classe: adivinhar pela chave ("é 'dia', então é data") amarra o controle ao nome. */
interface FilterDim { key: string; label: string; kind?: 'list' | 'range'; values: { id: string; label: string }[] }
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
    if (d.kind === 'range') { dd.appendChild(this.rangePanel(d, sum)); return dd; }

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

  /** INTERVALO — dois seletores (de → até) sobre os valores existentes, mais atalhos.
   *  Numa série temporal a seleção é quase sempre contígua ("últimos 3 dias", "desde
   *  que a mídia entrou"), e marcar dia a dia numa lista é trabalhoso e fácil de errar.
   *  Emite a MESMA lista de ids que o modo 'list' — o servidor não muda. */
  private rangePanel(d: FilterDim, sum: HTMLElement): HTMLElement {
    const ids = d.values.map((v) => v.id);
    const cur = this.sel.get(d.key);
    // seleção não-contígua (vinda de outra sessão) degrada para os extremos dela
    const marcados = cur ? ids.filter((i) => cur.has(i)) : [];
    let de = marcados.length ? ids.indexOf(marcados[0]) : 0;
    let ate = marcados.length ? ids.indexOf(marcados[marcados.length - 1]) : ids.length - 1;

    const panel = el('div', 'flt-dd-panel flt-range');
    const aplicar = (a: number, b: number): void => {
      de = Math.max(0, Math.min(a, ids.length - 1));
      ate = Math.max(de, Math.min(b, ids.length - 1));
      selDe.value = String(de); selAte.value = String(ate);
      const fatia = ids.slice(de, ate + 1);
      if (fatia.length === ids.length) this.sel.delete(d.key);
      else this.sel.set(d.key, new Set(fatia));
      sum.textContent = this.summary(d);
      this.updateBadge(); this.schedule();
    };

    const atalhos = el('div', 'flt-range-quick');
    const preset = (txt: string, fn: () => void): void => {
      const b = el('button', 'flt-range-btn') as HTMLButtonElement;
      b.type = 'button'; b.textContent = txt;
      b.addEventListener('click', fn); atalhos.appendChild(b);
    };
    preset('Tudo', () => aplicar(0, ids.length - 1));
    if (ids.length > 3) preset('Últimos 3 dias', () => aplicar(ids.length - 3, ids.length - 1));
    if (ids.length > 7) preset('Últimos 7 dias', () => aplicar(ids.length - 7, ids.length - 1));
    panel.appendChild(atalhos);

    const linha = el('div', 'flt-range-row');
    const mk = (lbl: string, idx: number): HTMLSelectElement => {
      const wrap = el('label', 'flt-range-f');
      const t = el('span', 'flt-range-lbl'); t.textContent = lbl; wrap.appendChild(t);
      const s = el('select', 'flt-range-sel') as HTMLSelectElement;
      d.values.forEach((v, i) => {
        const o = el('option', '') as HTMLOptionElement;
        o.value = String(i); o.textContent = v.label; s.appendChild(o);
      });
      s.value = String(idx);
      wrap.appendChild(s); linha.appendChild(wrap);
      return s;
    };
    const selDe = mk('De', de);
    const selAte = mk('Até', ate);
    // "de" depois de "até" arrasta o outro em vez de recusar — quem mexeu tem razão.
    selDe.addEventListener('change', () => aplicar(+selDe.value, Math.max(+selDe.value, ate)));
    selAte.addEventListener('change', () => aplicar(Math.min(de, +selAte.value), +selAte.value));
    panel.appendChild(linha);
    return panel;
  }

  private summary(d: FilterDim): string {
    const set = this.sel.get(d.key);
    if (!set || !set.size) return 'Todos';
    if (d.kind === 'range') {
      const sel = d.values.filter((v) => set.has(v.id));
      if (!sel.length) return 'Todos';
      return sel.length === 1 ? sel[0].label : `${sel[0].label} – ${sel[sel.length - 1].label}`;
    }
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
