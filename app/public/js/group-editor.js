// group-editor.js — editor de grupos por chips (arrastar p/ reordenar, selecionar
// 2+ e Juntar, clicar no nome p/ renomear). Compartilhado por gerar.html (criar) e
// atualizar.html (editar). Autossuficiente (CSS próprio, namespace ge-*).
//
//   const ed = window.mountGroupEditor(hostEl, {
//     groups: [{ final, raws:[...] }],   // grupos na ordem de exibição
//     weights: { valorBruto: n } | null, // opcional: barra de representatividade
//     weightBy: 'leads' | 'linhas',
//     ordinal: bool,                     // mostra "Ordenar faixa"
//   });
//   ed.getGroups()  ->  [{ final, raws:[...] }]   (estado atual)
(function () {
  if (window.mountGroupEditor) return;

  const css = `
  .ge-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
  .ge-head > label { font-size:12px; font-weight:700; color:var(--fg); margin-right:auto; }
  .ge-tool { font-size:11.5px; font-weight:600; color:var(--purple); background:rgba(124,58,237,.08); border:1px solid rgba(124,58,237,.22); border-radius:6px; padding:4px 9px; cursor:pointer; font-family:inherit; }
  .ge-tool:hover { background:rgba(124,58,237,.15); }
  .ge-tool[disabled] { opacity:.4; cursor:default; }
  .ge-tool.merge { color:#fff; background:var(--purple); border-color:var(--purple); }
  .ge-groups { display:flex; flex-direction:column; gap:5px; }
  .ge-chip { display:flex; align-items:center; gap:9px; background:var(--card,#fff); border:1px solid var(--border); border-radius:8px; padding:7px 10px; cursor:pointer; transition:border-color .12s, background .12s; }
  .ge-chip:hover { border-color:var(--purple); }
  .ge-chip.sel { border-color:var(--purple); background:rgba(124,58,237,.06); box-shadow:inset 0 0 0 1px var(--purple); }
  .ge-chip.drag-over { border-color:var(--purple); border-style:dashed; }
  .ge-chip.dragging { opacity:.45; }
  .ge-grip { cursor:grab; color:var(--gray2); font-size:13px; line-height:1; flex-shrink:0; user-select:none; }
  .ge-name { flex:1 1 auto; min-width:120px; width:auto; box-sizing:border-box; font-family:inherit; font-size:13px; font-weight:600; color:var(--fg); background:var(--surface,#fff); border:1px solid var(--border); border-radius:6px; padding:7px 10px; outline:none; }
  .ge-name:focus { border-color:var(--purple); }
  .ge-merged { font-size:10.5px; color:var(--gray2); flex-shrink:0; white-space:nowrap; }
  .ge-split { border:none; background:none; color:var(--gray2); cursor:pointer; font-size:11px; padding:2px 5px; border-radius:4px; flex-shrink:0; font-family:inherit; }
  .ge-split:hover { color:var(--purple); background:rgba(124,58,237,.1); }
  .ge-tail { margin-left:auto; display:flex; align-items:center; gap:8px; flex-shrink:0; }
  .ge-w-bar { width:54px; height:6px; border-radius:3px; background:rgba(0,0,0,.06); overflow:hidden; }
  .ge-w-bar > i { display:block; height:100%; background:var(--purple); border-radius:3px; }
  .ge-w-n { font-size:10.5px; font-weight:700; color:var(--gray2); font-variant-numeric:tabular-nums; min-width:40px; text-align:right; }
  .ge-mv { border:none; background:none; color:var(--gray2); cursor:pointer; font-size:12px; line-height:1; padding:2px 3px; border-radius:4px; font-family:inherit; }
  .ge-mv:hover { color:var(--purple); background:rgba(124,58,237,.1); }`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const esc = (s) => (s == null ? '' : String(s)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtN = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',') + 'k' : String(Math.round(n));
  const rangeNum = (s) => { const m = String(s).match(/-?\d+([.,]\d+)?/); return m ? parseFloat(m[0].replace(',', '.')) : Infinity; };

  window.mountGroupEditor = function (host, opts) {
    const o = opts || {};
    let groups = (o.groups || []).map((g) => ({ final: g.final, raws: (g.raws || [g.final]).slice() }));
    const weights = o.weights || null;
    const hasW = !!weights && Object.keys(weights).length > 0;
    const sel = new Set();

    host.innerHTML = `<div class="ge-head">
      <label>Grupos${hasW ? ` <span style="font-weight:500;color:var(--gray2)">· ${o.weightBy === 'linhas' ? 'linhas' : 'leads'} por grupo</span>` : ''}</label>
      <button type="button" class="ge-tool merge" data-act="merge" disabled>Juntar</button>
      ${o.ordinal ? '<button type="button" class="ge-tool" data-act="sort-range">Ordenar faixa</button>' : ''}
      ${hasW ? '<button type="button" class="ge-tool" data-act="sort-size">Ordenar tamanho</button>' : ''}
    </div><div class="ge-groups"></div>`;
    const box = host.querySelector('.ge-groups');

    const groupW = (g) => g.raws.reduce((s, r) => s + ((weights && weights[r]) || 0), 0);
    const maxW = () => Math.max(1, ...groups.map(groupW));

    function render() {
      const mx = maxW();
      box.innerHTML = groups.map((g, i) => {
        const w = groupW(g);
        const merged = g.raws.length > 1
          ? `<span class="ge-merged" title="${esc(g.raws.join(' · '))}">↳ ${g.raws.length} juntos</span><button type="button" class="ge-split" data-split="${i}" title="Separar">separar</button>`
          : '';
        return `<div class="ge-chip${sel.has(i) ? ' sel' : ''}" draggable="true" data-i="${i}">
          <span class="ge-grip">⠿</span>
          <input class="ge-name" data-name="${i}" value="${esc(g.final)}" />
          ${merged}
          <span class="ge-tail">
            ${hasW ? `<span class="ge-w-bar"><i style="width:${Math.round(w / mx * 100)}%"></i></span><span class="ge-w-n">${fmtN(w)}</span>` : ''}
            <button type="button" class="ge-mv" data-mv="up:${i}" title="Subir">▲</button>
            <button type="button" class="ge-mv" data-mv="dn:${i}" title="Descer">▼</button>
          </span>
        </div>`;
      }).join('');
      host.querySelector('[data-act="merge"]').disabled = sel.size < 2;
    }

    let dragFrom = null;
    box.addEventListener('click', (e) => {
      const mv = e.target.closest('[data-mv]');
      if (mv) { const [d, i] = mv.dataset.mv.split(':'); const j = +i + (d === 'up' ? -1 : 1); if (j >= 0 && j < groups.length) { [groups[+i], groups[j]] = [groups[j], groups[+i]]; } sel.clear(); render(); return; }
      const sp = e.target.closest('[data-split]');
      if (sp) { const i = +sp.dataset.split; const g = groups[i]; groups.splice(i, 1, ...g.raws.map((r) => ({ final: r, raws: [r] }))); sel.clear(); render(); return; }
      if (e.target.closest('.ge-name')) return;
      const chip = e.target.closest('.ge-chip'); if (!chip) return;
      const i = +chip.dataset.i;
      if (sel.has(i)) sel.delete(i); else sel.add(i);
      render();
    });
    box.addEventListener('change', (e) => {
      const nm = e.target.closest('.ge-name');
      if (nm) { const i = +nm.dataset.name; groups[i].final = nm.value.trim() || groups[i].final; }
    });
    box.addEventListener('dragstart', (e) => { const c = e.target.closest('.ge-chip'); if (!c) return; dragFrom = +c.dataset.i; c.classList.add('dragging'); });
    box.addEventListener('dragend', (e) => { e.target.closest('.ge-chip')?.classList.remove('dragging'); box.querySelectorAll('.drag-over').forEach((n) => n.classList.remove('drag-over')); });
    box.addEventListener('dragover', (e) => { e.preventDefault(); const c = e.target.closest('.ge-chip'); box.querySelectorAll('.drag-over').forEach((n) => n.classList.remove('drag-over')); if (c) c.classList.add('drag-over'); });
    box.addEventListener('drop', (e) => {
      e.preventDefault();
      const c = e.target.closest('.ge-chip'); if (c == null || dragFrom == null) return;
      const [g] = groups.splice(dragFrom, 1); groups.splice(+c.dataset.i, 0, g);
      dragFrom = null; sel.clear(); render();
    });
    host.querySelector('[data-act="merge"]').addEventListener('click', () => {
      const idx = [...sel].sort((a, b) => a - b); if (idx.length < 2) return;
      const merged = { final: groups[idx[0]].final, raws: idx.flatMap((i) => groups[i].raws) };
      groups = groups.filter((_, i) => !sel.has(i));
      groups.splice(idx[0], 0, merged);
      sel.clear(); render();
    });
    host.querySelector('[data-act="sort-range"]')?.addEventListener('click', () => { groups.sort((a, b) => rangeNum(a.final) - rangeNum(b.final)); sel.clear(); render(); });
    host.querySelector('[data-act="sort-size"]')?.addEventListener('click', () => { groups.sort((a, b) => groupW(b) - groupW(a)); sel.clear(); render(); });

    render();
    return { getGroups: () => groups.map((g) => ({ final: g.final, raws: g.raws.slice() })) };
  };

  // Helpers de conversão config <-> grupos (compartilhados pelas duas telas).
  window.groupsFromConfig = function (order, aliases) {
    const by = {};
    (order || []).forEach((f) => { by[f] = { final: f, raws: [f] }; });
    for (const [raw, fin] of Object.entries(aliases || {})) {
      if (!by[fin]) by[fin] = { final: fin, raws: [fin] };
      if (!by[fin].raws.includes(raw)) by[fin].raws.push(raw);
    }
    return (order || []).map((f) => by[f]);
  };
  window.configFromGroups = function (groups) {
    const order = [], aliases = {};
    for (const g of groups) {
      const fin = (g.final || '').trim(); if (!fin) continue;
      if (!order.includes(fin)) order.push(fin);
      for (const raw of g.raws) if (raw !== fin) aliases[raw] = fin;
    }
    return { order, aliases };
  };
})();
