/* navigation.ts — topnav page tabs (#topnav .tnp-btn) + section bar (#sb-tabs).
 *
 * Pure DOM wiring over a Store: builds the buttons once, then toggles active
 * classes. Selecting anything calls back into main, which loads + renders the
 * section and updates the store. (Comments mark their own block, not the tab.) */

import type { Store } from './store.js';

export class Navigation {
  private pagesHost: HTMLElement;
  private tabsHost: HTMLElement;
  private pageLabel: HTMLElement;

  constructor(
    private store: Store,
    private onSelect: (pageId: string, sectionId: string) => void,
  ) {
    this.pagesHost = must('tn-pages');
    this.tabsHost = must('sb-tabs');
    this.pageLabel = must('sb-page-label');
  }

  build(): void {
    this.pagesHost.replaceChildren();
    this.tabsHost.replaceChildren();

    for (const page of this.store.pages) {
      const pBtn = document.createElement('button');
      pBtn.className = 'tnp-btn';
      pBtn.dataset.pageId = page.id;
      pBtn.textContent = page.label;
      pBtn.addEventListener('click', () => {
        const first = page.sections[0];
        if (first) this.onSelect(page.id, first.id);
      });
      this.pagesHost.appendChild(pBtn);

      const grp = document.createElement('div');
      grp.className = 'sb-page-group';
      grp.dataset.group = page.id;
      for (const sec of page.sections) {
        const sBtn = document.createElement('button');
        sBtn.className = 'sb-tab-btn';
        sBtn.dataset.sectionId = sec.id;
        sBtn.dataset.pageId = page.id;
        sBtn.dataset.label = sec.label;
        sBtn.textContent = sec.label;
        sBtn.addEventListener('click', () => this.onSelect(page.id, sec.id));
        grp.appendChild(sBtn);
      }
      this.tabsHost.appendChild(grp);
    }
  }

  setActive(pageId: string, sectionId: string): void {
    const page = this.store.page(pageId);
    this.pageLabel.textContent = page?.label || '';

    for (const b of this.pagesHost.querySelectorAll<HTMLElement>('.tnp-btn')) {
      b.classList.toggle('tnp-active', b.dataset.pageId === pageId);
    }
    for (const g of this.tabsHost.querySelectorAll<HTMLElement>('.sb-page-group')) {
      g.classList.toggle('sb-group-active', g.dataset.group === pageId);
    }
    for (const b of this.tabsHost.querySelectorAll<HTMLElement>('.sb-tab-btn')) {
      b.classList.toggle('sb-tab-active', b.dataset.sectionId === sectionId && b.dataset.pageId === pageId);
    }
  }
}

function must(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`navigation: missing #${id}`);
  return el;
}
