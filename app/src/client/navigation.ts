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
    const sidebar = this.navMode() === 'sidebar';

    for (const page of this.store.pages) {
      // Topnav recebe as page-tabs SÓ no modo topnav. No modo sidebar TUDO (inclusive
      // perguntas/detalhamentos) vai p/ a árvore lateral — o topnav fica sem tabs.
      if (!sidebar) {
        const pBtn = document.createElement('button');
        pBtn.className = 'tnp-btn';
        pBtn.dataset.pageId = page.id;
        pBtn.textContent = page.label;
        pBtn.addEventListener('click', () => {
          const first = page.sections[0];
          if (first) this.onSelect(page.id, first.id);
        });
        this.pagesHost.appendChild(pBtn);
      }

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

    // Brand: nosso logo do app num quadrado branco arredondado (a sidebar é plum escuro).
    const brand = document.createElement('a');
    brand.className = 'sn-brand';
    brand.href = '/';
    brand.title = 'Início';
    const logoBox = document.createElement('span');
    logoBox.className = 'sn-logo-box';
    const logo = document.createElement('img');
    logo.className = 'sn-logo';
    logo.src = '/assets/witly-logo.png';
    logo.alt = 'Witly Grimório';
    logoBox.appendChild(logo);
    const name = document.createElement('span');
    name.className = 'sn-brand-name';
    name.textContent = 'Witly Grimório';
    brand.append(logoBox, name);
    this.sideHost.appendChild(brand);

    // Switcher (visual): avatar com iniciais do cliente + título do relatório.
    const meta = (this.store.data?.meta || {}) as { client?: string; client_name?: string; title?: string };
    const clientName = meta.client_name || meta.client || '';
    const initials = clientName.split(/[-\s_]+/).map((s) => s[0] || '').join('').slice(0, 2).toUpperCase() || 'W';
    const sw = document.createElement('a');
    sw.className = 'sn-switcher'; sw.href = '/'; sw.title = 'Trocar análise';
    const pj = document.createElement('span'); pj.className = 'sn-pj'; pj.textContent = initials;
    const swm = document.createElement('span'); swm.className = 'sn-sw-meta';
    const swl = document.createElement('small'); swl.textContent = 'Cliente';
    const swb = document.createElement('b'); swb.textContent = clientName;
    swm.append(swl, swb);
    const chev = document.createElement('span'); chev.className = 'sn-chev'; chev.textContent = '▾';
    sw.append(pj, swm, chev);
    this.sideHost.appendChild(sw);

    // Busca — ícone + input + atalho ⌘K; filtra itens (nav-items/seções) em tempo real.
    const sbox = document.createElement('div');
    sbox.className = 'sn-searchbox';
    sbox.innerHTML = '<svg class="sn-search-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
    const search = document.createElement('input');
    search.className = 'sn-search';
    search.type = 'search';
    search.placeholder = 'Buscar…';
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const b of this.sideHost!.querySelectorAll<HTMLElement>('.sn-page, .sn-sec')) {
        const t = (b.textContent || '').toLowerCase();
        b.style.display = !q || t.includes(q) ? '' : 'none';
      }
      for (const l of this.sideHost!.querySelectorAll<HTMLElement>('.sn-label')) l.style.display = q ? 'none' : '';
    });
    const kbd = document.createElement('kbd'); kbd.className = 'sn-kbd'; kbd.textContent = '⌘K';
    sbox.append(search, kbd);
    this.sideHost.appendChild(sbox);

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

    // Árvore agrupada (DS Witly): "RELATÓRIO" = páginas do relatório + Perguntas;
    // "APROFUNDAMENTOS" = cada detalhamento gerado como item. Resolve a paginação.
    const label = (txt: string): void => {
      const d = document.createElement('div');
      d.className = 'sn-label';
      d.textContent = txt;
      this.sideHost!.appendChild(d);
    };
    const pageItem = (page: { id: string; label: string; sections: Array<{ id: string; label: string }> }): void => {
      const grp = document.createElement('div');
      grp.className = 'sn-group';
      grp.dataset.group = page.id;
      const pBtn = document.createElement('button');
      pBtn.className = 'sn-page';
      pBtn.dataset.pageId = page.id;
      pBtn.textContent = page.label;
      pBtn.addEventListener('click', () => { const f = page.sections[0]; if (f) this.onSelect(page.id, f.id); });
      grp.appendChild(pBtn);
      if (page.sections.length > 1) for (const sec of page.sections) this.appendSec(grp, page.id, sec);
      this.sideHost!.appendChild(grp);
    };

    const det = this.store.pages.find((p) => p.id === 'detalhamentos');
    const report = this.store.pages.filter((p) => p.id !== 'detalhamentos');

    label('Relatório');
    for (const page of report) pageItem(page);

    if (det && det.sections.length) {
      label('Aprofundamentos');
      const grp = document.createElement('div');
      grp.className = 'sn-group';
      grp.dataset.group = det.id;
      for (const sec of det.sections) this.appendSec(grp, det.id, sec);
      this.sideHost.appendChild(grp);
    }
  }

  /** Item de seção (sub-página / detalhamento) na árvore lateral. */
  private appendSec(grp: HTMLElement, pageId: string, sec: { id: string; label: string }): void {
    const s = sec as { id: string; label: string; pill?: string; tone?: string; inv?: number; roas?: number };
    const sBtn = document.createElement('button');
    sBtn.className = 'sn-sec';
    sBtn.dataset.sectionId = s.id;
    sBtn.dataset.pageId = pageId;
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
    sBtn.addEventListener('click', () => this.onSelect(pageId, s.id));
    grp.appendChild(sBtn);
  }

  setActive(pageId: string, sectionId: string): void {
    const page = this.store.page(pageId);
    this.pageLabel.textContent = page?.label || '';
    // Modo sidebar: NUNCA usa a section-bar — todas as seções (inclusive detalhamentos)
    // são itens da árvore lateral. A section-bar é exclusiva do modo topnav.
    document.body.dataset.secbar = '';

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
