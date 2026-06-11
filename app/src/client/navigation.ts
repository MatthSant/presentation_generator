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
  /** Host opcional da navegação lateral — preenchido só no modo meta.nav==='sidebar'. */
  private sideHost: HTMLElement | null;

  constructor(
    private store: Store,
    private onSelect: (pageId: string, sectionId: string) => void,
  ) {
    this.pagesHost = must('tn-pages');
    this.tabsHost = must('sb-tabs');
    this.pageLabel = must('sb-page-label');
    this.sideHost = document.getElementById('sidenav');
  }

  /** Modo de nav é um recurso de PLATAFORMA: qualquer análise opta por
   *  data.json meta.nav. Default 'topnav' mantém o comportamento atual. */
  private navMode(): 'topnav' | 'sidebar' {
    return (this.store.data?.meta as { nav?: string } | undefined)?.nav === 'sidebar' ? 'sidebar' : 'topnav';
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
        sBtn.title = sec.label;   // título completo no hover quando o tab trunca (detalhamentos têm rótulos longos)
        sBtn.addEventListener('click', () => this.onSelect(page.id, sec.id));
        grp.appendChild(sBtn);
      }
      this.tabsHost.appendChild(grp);
    }

    this.buildSide();
    document.body.dataset.nav = this.navMode();
    if (this.sideHost) this.sideHost.hidden = this.navMode() !== 'sidebar';
  }

  /** Espelha páginas+seções numa árvore vertical no #sidenav (modo sidebar). */
  private buildSide(): void {
    if (!this.sideHost) return;
    this.sideHost.replaceChildren();
    if (this.navMode() !== 'sidebar') return;

    const brand = document.createElement('a');
    brand.className = 'sn-brand';
    brand.href = '/';
    brand.textContent = (this.store.data?.meta as { client?: string } | undefined)?.client || 'Relatório';
    this.sideHost.appendChild(brand);

    // Busca — filtra os itens (criativos/seções) por nome em tempo real.
    const search = document.createElement('input');
    search.className = 'sn-search';
    search.type = 'search';
    search.placeholder = 'Buscar…';
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const b of this.sideHost!.querySelectorAll<HTMLElement>('.sn-sec')) {
        const t = (b.querySelector('.sn-sec-lbl')?.textContent || '').toLowerCase();
        b.style.display = !q || t.includes(q) ? '' : 'none';
      }
    });
    this.sideHost.appendChild(search);

    // Ordenação dos itens (criativos): A-Z / Investimento / ROAS, com direção ↑↓.
    const sortable = this.store.pages.some((p) => p.sections.some((s) => (s as { inv?: number }).inv !== undefined));
    if (sortable) {
      const bar = document.createElement('div');
      bar.className = 'sn-sort';
      const defs: Array<[string, string]> = [['A-Z', 'name'], ['Investimento', 'inv'], ['ROAS', 'roas']];
      let curKey = 'roas';
      let dir = -1;
      const sort = (): void => {
        for (const grp of this.sideHost!.querySelectorAll<HTMLElement>('.sn-group')) {
          const secs = [...grp.querySelectorAll<HTMLElement>('.sn-sec')];
          if (secs.length < 2) continue;
          secs.sort((a, b) => curKey === 'name'
            ? dir * (a.querySelector('.sn-sec-lbl')?.textContent || '').localeCompare(b.querySelector('.sn-sec-lbl')?.textContent || '')
            : dir * ((Number(a.dataset[curKey]) || 0) - (Number(b.dataset[curKey]) || 0)));
          for (const s of secs) grp.appendChild(s);
        }
      };
      const paint = (): void => {
        for (const b of bar.querySelectorAll<HTMLElement>('.sn-sort-b')) {
          const on = b.dataset.key === curKey;
          const base = defs.find((d) => d[1] === b.dataset.key)?.[0] || '';
          b.classList.toggle('on', on);
          b.textContent = base + (on ? (dir < 0 ? ' ↓' : ' ↑') : '');
        }
      };
      for (const [label, key] of defs) {
        const b = document.createElement('button');
        b.className = 'sn-sort-b'; b.dataset.key = key; b.textContent = label;
        b.addEventListener('click', () => {
          if (curKey === key) dir = -dir; else { curKey = key; dir = key === 'name' ? 1 : -1; }
          paint(); sort();
        });
        bar.appendChild(b);
      }
      this.sideHost.appendChild(bar);
      setTimeout(() => { paint(); sort(); }, 0);   // ordena depois que os grupos montam
    }

    for (const page of this.store.pages) {
      const grp = document.createElement('div');
      grp.className = 'sn-group';
      grp.dataset.group = page.id;
      const pBtn = document.createElement('button');
      pBtn.className = 'sn-page';
      pBtn.dataset.pageId = page.id;
      pBtn.textContent = page.label;
      pBtn.addEventListener('click', () => {
        const first = page.sections[0];
        if (first) this.onSelect(page.id, first.id);
      });
      grp.appendChild(pBtn);
      for (const sec of page.sections) {
        const s = sec as { id: string; label: string; pill?: string; tone?: string; inv?: number; roas?: number };
        const sBtn = document.createElement('button');
        sBtn.className = 'sn-sec';
        sBtn.dataset.sectionId = s.id;
        sBtn.dataset.pageId = page.id;
        if (s.inv !== undefined) sBtn.dataset.inv = String(s.inv);
        if (s.roas !== undefined) sBtn.dataset.roas = String(s.roas);
        const lbl = document.createElement('span');
        lbl.className = 'sn-sec-lbl';
        lbl.textContent = s.label;
        sBtn.appendChild(lbl);
        if (s.pill) {
          const pill = document.createElement('span');
          pill.className = `sn-pill sn-pill-${s.tone || 'n'}`;
          pill.textContent = s.pill;
          sBtn.appendChild(pill);
        }
        sBtn.addEventListener('click', () => this.onSelect(page.id, s.id));
        grp.appendChild(sBtn);
      }
      this.sideHost.appendChild(grp);
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
    if (this.sideHost) {
      for (const g of this.sideHost.querySelectorAll<HTMLElement>('.sn-group')) {
        g.classList.toggle('sn-group-active', g.dataset.group === pageId);
      }
      for (const b of this.sideHost.querySelectorAll<HTMLElement>('.sn-page')) {
        b.classList.toggle('sn-page-active', b.dataset.pageId === pageId);
      }
      for (const b of this.sideHost.querySelectorAll<HTMLElement>('.sn-sec')) {
        b.classList.toggle('sn-sec-active', b.dataset.sectionId === sectionId && b.dataset.pageId === pageId);
      }
    }
  }
}

function must(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`navigation: missing #${id}`);
  return el;
}
