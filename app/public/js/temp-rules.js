// temp-rules.js — editor reutilizável de regras de temperatura (pattern→label com chips).
//
//   const ctl = window.mountTempRules(container, { rules, overwrite, showOverwrite });
//   ctl.getRules()  -> [{ contains: [termo,...], label }]   (descarta regras incompletas)
//   ctl.getOverwrite() -> bool
//   ctl.setRules(rules) / ctl.setOverwrite(bool)
//
// Termos viram chips (Enter/vírgula cria; × ou Backspace remove). Sem dependências.
(function () {
  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function makeChips(initial) {
    const box = el('div', 'tr-chips');
    const input = el('input', 'tr-chip-input');
    input.type = 'text';
    input.placeholder = 'termo + Enter';
    let chips = [];
    function render() {
      box.querySelectorAll('.tr-chip').forEach((c) => c.remove());
      chips.forEach((v, i) => {
        const chip = el('span', 'tr-chip', v);
        const x = el('button', 'tr-chip-x', '×');
        x.type = 'button';
        x.addEventListener('click', (e) => { e.stopPropagation(); chips.splice(i, 1); render(); input.focus(); });
        chip.appendChild(x);
        box.insertBefore(chip, input);
      });
    }
    function add(v) {
      v = String(v || '').trim();
      if (v && !chips.includes(v)) { chips.push(v); render(); }
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input.value); input.value = ''; }
      else if (e.key === 'Backspace' && !input.value && chips.length) { chips.pop(); render(); }
    });
    input.addEventListener('blur', () => { if (input.value.trim()) { add(input.value); input.value = ''; } });
    box.addEventListener('click', () => input.focus());
    box.appendChild(input);
    (initial || []).forEach(add);
    return { box, get: () => chips.slice(), set: (arr) => { chips = (arr || []).slice(); render(); } };
  }

  // Fallback geral (Configurações). Devolve { temp_rules, temp_overwrite }.
  window.fetchTempDefault = async function () {
    try { return await (await fetch('/api/temp-default')).json(); }
    catch (e) { return { temp_rules: [], temp_overwrite: false }; }
  };

  // Resolve as regras a usar: do cliente (se tiver) → fallback geral.
  window.tempForClient = function (clients, slug, fallback) {
    const c = (clients || []).find((x) => x.slug === slug);
    if (c && c.temp_rules && c.temp_rules.length) return { temp_rules: c.temp_rules, temp_overwrite: !!c.temp_overwrite };
    return fallback || { temp_rules: [], temp_overwrite: false };
  };

  window.mountTempRules = function (container, opts) {
    opts = opts || {};
    const showOver = opts.showOverwrite !== false;
    container.classList.add('tr-wrap');
    container.innerHTML = '';
    const list = el('div', 'tr-list');
    const rows = [];

    function addRow(rule) {
      rule = rule || { contains: [], label: '' };
      const row = el('div', 'tr-row');
      const chips = makeChips(rule.contains);
      const label = el('input', 'tr-label-in');
      label.type = 'text';
      label.placeholder = 'Temperatura (ex.: Frio)';
      label.value = rule.label || '';
      const del = el('button', 'tr-del', '×');
      del.type = 'button';
      del.title = 'Remover regra';
      const entry = { row, chips, label };
      del.addEventListener('click', () => {
        const i = rows.indexOf(entry);
        if (i >= 0) rows.splice(i, 1);
        row.remove();
        if (!rows.length) addRow();
      });
      row.appendChild(chips.box);
      row.appendChild(el('span', 'tr-arrow', '→'));
      row.appendChild(label);
      row.appendChild(del);
      rows.push(entry);
      list.appendChild(row);
      return entry;
    }

    const addBtn = el('button', 'tr-add');
    addBtn.type = 'button';
    addBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg> Adicionar regra';
    addBtn.addEventListener('click', () => { const e = addRow(); e.chips.box.querySelector('input').focus(); });

    container.appendChild(list);
    container.appendChild(addBtn);

    let overCb = null;
    if (showOver) {
      const ov = el('label', 'tr-over');
      overCb = el('input');
      overCb.type = 'checkbox';
      overCb.checked = !!opts.overwrite;
      ov.appendChild(overCb);
      ov.appendChild(el('span', null, 'Sobrescrever a temperatura já presente no CSV'));
      container.appendChild(ov);
    }

    function setRules(rules) {
      rows.length = 0;
      list.innerHTML = '';
      const r = (rules && rules.length) ? rules : [{ contains: [], label: '' }];
      r.forEach(addRow);
    }
    setRules(opts.rules);

    return {
      getRules() {
        return rows.map((r) => ({ contains: r.chips.get(), label: r.label.value.trim() }))
          .filter((r) => r.label && r.contains.length);
      },
      getOverwrite() { return overCb ? !!overCb.checked : false; },
      setRules,
      setOverwrite(v) { if (overCb) overCb.checked = !!v; },
    };
  };
})();
