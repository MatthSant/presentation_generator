/* controls-utils.ts — primitivas compartilhadas dos controles type-specific do FAB
 * (#filter-*). Cada *-controls.ts monta o SEU corpo com estes helpers; o chrome de
 * abrir/fechar do modal vive em filters.ts (wireFilterShell). Controle novo = classe
 * própria usando isto + uma entrada no registry de controles do main.ts. */

import { wireFilterShell } from './filters.js';

export function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

/** Grupo com rótulo (flt-group + flt-label). */
export function group(label: string): HTMLElement {
  const g = el('div', 'flt-group');
  const l = el('div', 'flt-label');
  l.textContent = label;
  g.appendChild(l);
  return g;
}

/** Botão de opção (single/multi-select) com estado ativo. */
export function opt(label: string, active: boolean): HTMLElement {
  const b = el('button', 'flt-opt' + (active ? ' flt-active' : ''));
  (b as HTMLButtonElement).type = 'button';
  b.textContent = label;
  return b;
}

/** Mini-botão de ferramenta (ex.: "Todos" / "Inverter"). */
export function mini(label: string): HTMLElement {
  const b = el('button', 'flt-mini');
  (b as HTMLButtonElement).type = 'button';
  b.textContent = label;
  return b;
}

/** getElementById ou erro claro com o nome do controle. */
export function must(prefix: string, id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`${prefix}: missing #${id}`);
  return e;
}

export interface FabShell { fab: HTMLElement; modal: HTMLElement; body: HTMLElement; count: HTMLElement }

/** Adota os elementos #filter-* do shell, liga abrir/fechar/ESC e o botão Limpar. */
export function mountShell(prefix: string, onClear: () => void): FabShell {
  const fab = must(prefix, 'filter-fab');
  const modal = must(prefix, 'filter-modal');
  wireFilterShell(fab, modal, must(prefix, 'filter-close'));
  must(prefix, 'filter-clear').addEventListener('click', onClear);
  return { fab, modal, body: must(prefix, 'filter-body'), count: must(prefix, 'filter-count') };
}

/** Mostra o FAB só nas páginas em que o controle se aplica (fecha o modal ao sair). */
export function fabSetPage(shell: FabShell, pages: string[] | undefined, pageId: string): void {
  const on = (pages || []).includes(pageId);
  shell.fab.hidden = !on;
  if (!on) shell.modal.classList.remove('open');
}

/** Badge do FAB: nº de filtros ativos + realce flt-has quando > 0. */
export function setBadge(shell: FabShell, n: number): void {
  shell.count.textContent = String(n);
  shell.fab.classList.toggle('flt-has', n > 0);
}

/** Debounce do apply — cada mudança de filtro agenda um único recompute. */
export function debounce(fn: () => void, ms = 250): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}
