/* client-picker.js — popula um <select> com os clientes do registro (GET /api/clients).
 * Os geradores ESCOLHEM um cliente cadastrado em vez de digitar nome/slug — o app
 * cuida do id. window.mountClientSelect(selectEl, { emptyHint }) → Promise<clients[]>. */
(function () {
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m];
    });
  }
  window.mountClientSelect = async function (select, opts) {
    opts = opts || {};
    let clients = [];
    try { const d = await fetch('/api/clients').then(function (r) { return r.json(); }); clients = d.clients || []; }
    catch (e) { clients = []; }
    if (!clients.length) {
      select.innerHTML = '<option value="">— nenhum cliente cadastrado —</option>';
      select.disabled = true;
      if (opts.emptyHint) opts.emptyHint.hidden = false;
    } else {
      select.disabled = false;
      if (opts.emptyHint) opts.emptyHint.hidden = true;
      select.innerHTML = clients.map(function (c) {
        return '<option value="' + esc(c.slug) + '">' + esc(c.name) + '</option>';
      }).join('');
    }
    return clients;
  };
})();
