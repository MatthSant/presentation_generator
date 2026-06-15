// montar.js — helpers dos montadores de query: realce de sintaxe SQL + copiar.
(function () {
  const KW = '(?:WITH|SELECT|FROM|WHERE|AND|OR|AS|CASE|WHEN|THEN|ELSE|END|LEFT|RIGHT|INNER|OUTER|FULL|JOIN|ON|USING|GROUP|BY|ORDER|PARTITION|OVER|SUM|MAX|MIN|AVG|COUNT|COALESCE|NULLIF|DISTINCT|INTERVAL|NUMERIC|INTEGER|DATE|TIMESTAMP|LOWER|UPPER|TRIM|CAST|LIKE|ILIKE|NOT|NULL|IS|IN|EXISTS|BETWEEN|DESC|ASC|HAVING|UNION|ALL|LIMIT|OFFSET|TRUE|FALSE)';
  const RE = new RegExp("(--[^\\n]*)|('(?:[^']|'')*')|\\b(\\d+(?:\\.\\d+)?)\\b|\\b" + KW + "\\b", 'gi');
  const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Tokenizador de passe único: comentário | string | número | palavra-chave.
  // Nada é re-destacado dentro de um token já capturado (seguro contra aninhamento).
  window.sqlHighlight = function (sql) {
    let out = '', last = 0, m;
    RE.lastIndex = 0;
    while ((m = RE.exec(sql))) {
      out += escHtml(sql.slice(last, m.index));
      const tok = m[0];
      const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : 'k';
      out += '<span class="' + cls + '">' + escHtml(tok) + '</span>';
      last = m.index + tok.length;
    }
    return out + escHtml(sql.slice(last));
  };

  // Liga um botão de copiar ao texto cru de uma função/elemento. getText pode ser
  // string, função ou elemento (usa .dataset.raw ou .textContent).
  window.wireCopy = function (btn, getText) {
    btn.addEventListener('click', async () => {
      let txt = typeof getText === 'function' ? getText() : getText;
      if (txt && txt.nodeType) txt = txt.dataset.raw || txt.textContent;
      try {
        await navigator.clipboard.writeText(String(txt || ''));
        btn.classList.add('done');
        const label = btn.querySelector('.copy-label');
        const prev = label ? label.textContent : null;
        if (label) label.textContent = 'Copiado';
        setTimeout(() => { btn.classList.remove('done'); if (label) label.textContent = prev; }, 1600);
      } catch (e) { /* clipboard indisponível */ }
    });
  };

  // Renderiza SQL realçado num <pre class="sql"> e guarda o texto cru em data-raw.
  window.renderSql = function (pre, sql) {
    pre.dataset.raw = sql;
    pre.innerHTML = window.sqlHighlight(sql);
  };
})();
