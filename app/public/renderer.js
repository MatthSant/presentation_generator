/* renderer.js — JSON typed blocks → DOM
   Único lugar que conhece classes do design system.
   API pública: Renderer.renderSection(section, container, onChart)
*/
(function (global) {

  /* ── createElement helper ── */
  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  /* ── dispatch ── */
  function renderBlock(block, onChart) {
    switch (block.type) {
      case 'kpi-row':    return renderKpiRow(block);
      case 'chart':      return renderChart(block, onChart);
      case 'find-block': return renderFindBlock(block);
      case 'find-note':  return renderFindNote(block);
      case 'highlight':  return renderHighlight(block);
      case 'ni':         return renderNi(block, onChart);
      case 'row':        return renderRow(block, onChart);
      case 'g2':         return renderGrid(block, 'g2', onChart);
      case 'g3':         return renderGrid(block, 'g3', onChart);
      case 'g4':         return renderGrid(block, 'g4', onChart);
      case 'heatmap':    return renderHeatmap(block);
      case 'table':      return renderTable(block);
      case 'label-sec':  return renderLabelSec(block);
      case 'content':    return renderContent(block, onChart);
      case 'hl':         return renderHighlight(block);   // alias
      default: {
        const d = el('div', 'sm');
        d.style.color = 'var(--amber)';
        d.textContent = `[bloco desconhecido: ${block.type}]`;
        return d;
      }
    }
  }

  /* ── KPI Row ── */
  function renderKpiRow(b) {
    const row = el('div', 'mr');
    (b.items || []).forEach(item => {
      const mi = el('div', 'mi');
      const mv = el('div', item.color ? `mv c-${item.color}` : 'mv');
      mv.textContent = item.value;
      const ml = el('div', 'ml');
      ml.textContent = item.label;
      mi.append(mv, ml);
      row.appendChild(mi);
    });
    return row;
  }

  /* ── Chart ── */
  function renderChart(b, onChart) {
    const wrap = el('div', '');
    if (b.chartTitle) {
      const t = el('div', 'chart-title');
      t.textContent = b.chartTitle;
      wrap.appendChild(t);
    }
    const cw = el('div', 'chart-wrap');
    cw.id = b.id;
    wrap.appendChild(cw);

    // defer rendering — element needs to be in DOM first
    if (onChart) {
      const def = { ...b, type: b.chartType || b.type };
      delete def.chartType;
      onChart({ elId: b.id, def });
    }
    return wrap;
  }

  /* ── Find Block ── */
  function renderFindBlock(b) {
    const div = el('div', 'find-block');
    if (b.modal) { div.dataset.modal = b.modal; div.style.cursor = 'pointer'; }

    const tag = el('span', `find-tag find-tag-${b.tagColor || 'p'}`);
    tag.textContent = b.tag || '';
    div.appendChild(tag);

    const title = el('div', 'find-title');
    title.textContent = b.title || '';
    div.appendChild(title);

    if (b.detail) {
      const sm = el('p', 'sm');
      sm.innerHTML = b.detail;
      div.appendChild(sm);
    }
    if (b.modal) {
      const more = el('span', 'fn-more');
      more.textContent = '↗ ver detalhamento';
      div.appendChild(more);
    }
    return div;
  }

  /* ── Find Note ── */
  function renderFindNote(b) {
    const p = el('p', `find-note find-note-${b.color || 'p'}`);
    p.innerHTML = b.text || '';
    if (b.modal) p.dataset.modal = b.modal;
    return p;
  }

  /* ── Highlight ── */
  function renderHighlight(b) {
    const div = el('div', b.color ? `hl hl-${b.color}` : 'hl');
    div.innerHTML = b.text || '';
    return div;
  }

  /* ── NI (numbered action) ── */
  function renderNi(b, onChart) {
    if (b.variant === 'vertical') return renderNiVertical(b, onChart);
    const div = el('div', 'ni');
    const nb  = el('div', `nb nb-${b.color || 'p'}`);
    nb.textContent = b.number || '';
    const nt = el('div', 'nt');
    nt.innerHTML = b.text || '';
    div.append(nb, nt);
    return div;
  }

  function renderNiVertical(b, onChart) {
    const div  = el('div', 'ni ni-v');
    const head = el('div', 'ni-head');
    const num  = el('div', 'ni-num');
    num.textContent = b.number || '';
    const title = el('div', 'ni-title');
    title.textContent = b.title || '';
    head.append(num, title);
    div.appendChild(head);
    (b.sections || []).forEach(s => {
      const sec = el('div', 'ni-section');
      const lbl = el('span', `ni-sl${s.color ? ' c-' + s.color : ''}`);
      lbl.textContent = s.label || '';
      const body = el('span', 'ni-sb');
      body.innerHTML = s.text || '';
      sec.append(lbl, body);
      div.appendChild(sec);
    });
    return div;
  }

  /* ── Row (flexbox) ── */
  function renderRow(b, onChart) {
    const row = el('div', 'row');
    (b.cols || []).forEach(col => {
      const c = el('div', 'col');
      if (col.flex != null) c.style.flex = col.flex;
      (col.blocks || []).forEach(child => c.appendChild(renderBlock(child, onChart)));
      row.appendChild(c);
    });
    return row;
  }

  /* ── Grid g2/g3/g4 ── */
  function renderGrid(b, cls, onChart) {
    const grid = el('div', cls);
    (b.items || []).forEach(item => {
      const cell = el('div', '');
      if (item.title) {
        const t = el('div', 'chart-title');
        t.textContent = item.title;
        cell.appendChild(t);
      }
      (item.blocks || []).forEach(child => cell.appendChild(renderBlock(child, onChart)));
      grid.appendChild(cell);
    });
    return grid;
  }

  /* ── Label section ── */
  function renderLabelSec(b) {
    const wrap = el('div', '');
    const p = el('p', 'label-sec');
    p.textContent = b.text || '';
    wrap.appendChild(p);
    if (b.divider !== false) wrap.appendChild(el('div', 'divl'));
    if (b.sub) {
      const sub = el('p', 'sm');
      sub.innerHTML = b.sub;
      wrap.appendChild(sub);
    }
    return wrap;
  }

  /* ── Heatmap ── */
  function renderHeatmap(b) {
    const wrap = el('div', 'hm-wrap');
    const grid = el('div', 'hm-grid');
    grid.style.setProperty('--hm-cols', b.cols.length);

    grid.appendChild(el('div', ''));  // corner vazio
    b.cols.forEach(c => {
      const th = el('div', 'hm-th');
      th.textContent = c;
      grid.appendChild(th);
    });
    b.rows.forEach(row => {
      const rh = el('div', 'hm-rh');
      rh.textContent = row.label;
      grid.appendChild(rh);
      row.cells.forEach(cell => {
        const td = el('div', `hm-cell ${cell.cls || 'hm-n'}`);
        td.textContent = cell.value;
        if (cell.title) td.title = cell.title;
        grid.appendChild(td);
      });
    });
    wrap.appendChild(grid);
    if (b.caption) {
      const cap = el('p', 'xs');
      cap.style.marginTop = '8px';
      cap.textContent = b.caption;
      wrap.appendChild(cap);
    }
    return wrap;
  }

  /* ── Table ── */
  function renderTable(b) {
    const wrap  = el('div', 'tw');
    const table = el('table', '');
    const thead = el('thead', '');
    const hrow  = el('tr', '');
    (b.headers || []).forEach(h => {
      const th = el('th', '');
      th.textContent = h;
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    const tbody = el('tbody', '');
    (b.rows || []).forEach(row => {
      const tr = el('tr', '');
      row.forEach(cell => {
        const td = el('td', '');
        if (typeof cell === 'object') {
          td.innerHTML = cell.html || cell.value || '';
          if (cell.color) td.classList.add('c-' + cell.color);
        } else {
          td.innerHTML = String(cell);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  /* ── Content wrapper ── */
  function renderContent(b, onChart) {
    const div = el('div', 'content');
    if (b.gap) div.style.gap = b.gap + 'px';
    (b.blocks || []).forEach(child => div.appendChild(renderBlock(child, onChart)));
    return div;
  }

  /* ── Modal overlay ── */
  function renderModal(modal, onChart) {
    const overlay = el('div', 'ic-overlay');
    overlay.id = modal.id;
    const dialog = el('div', 'ic-dialog');
    const hd     = el('div', 'ic-dialog-hd');
    const title  = el('div', 'ic-dialog-title');
    title.textContent = modal.title || '';
    const close  = el('button', 'ic-close');
    close.setAttribute('data-ic-close', '');
    close.innerHTML = '&times;';
    hd.append(title, close);
    dialog.appendChild(hd);
    (modal.blocks || []).forEach(b => dialog.appendChild(renderBlock(b, onChart)));
    overlay.appendChild(dialog);
    return overlay;
  }

  /* ── Section (public API) ── */
  function renderSection(section, container, onChart) {
    const pending = [];  // chart defs to render after DOM insertion

    const collectChart = (item) => pending.push(item);

    const div = el('div', 'card content');
    div.id = section.id;
    div.dataset.page        = section.page        || '';
    div.dataset.pageLabel   = section.pageLabel   || '';
    div.dataset.reportSection = section.sectionLabel || '';

    if (section.header) {
      const hd    = el('div', 'slide-hd');
      const badge = el('span', `badge badge-${section.header.badgeColor || 'p'}`);
      badge.textContent = section.header.badge || '';
      const h1 = el('h1', 'slide-title');
      if (section.header.titleEm) {
        h1.innerHTML = escHtml(section.header.title || '') + `<em>${escHtml(section.header.titleEm)}</em>`;
      } else {
        h1.textContent = section.header.title || '';
      }
      hd.append(badge, h1);
      div.appendChild(hd);
    }

    (section.blocks || []).forEach(b => div.appendChild(renderBlock(b, collectChart)));

    // sc-trigger (comment button — positioned by CSS)
    const trigger = el('div', 'sc-trigger');
    const addBtn  = el('button', 'sc-add');
    addBtn.title = 'Comentar';
    addBtn.dataset.secId    = section.id;
    addBtn.dataset.secLabel = section.sectionLabel || '';
    addBtn.textContent = '+';
    trigger.appendChild(addBtn);
    div.appendChild(trigger);

    container.appendChild(div);

    // modals go outside the section div
    (section.modals || []).forEach(m => container.appendChild(renderModal(m, collectChart)));

    // render charts now that elements are in the DOM
    pending.forEach(({ elId, def }) => {
      const chartEl = document.getElementById(elId);
      if (!chartEl || !window.buildOptions) return;
      const instance = new ApexCharts(chartEl, window.buildOptions(def));
      instance.render();
      if (onChart) onChart(instance);
    });
  }

  /* ── utils ── */
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  global.Renderer = { renderSection, renderBlock };

})(window);
