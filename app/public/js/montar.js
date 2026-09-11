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

  // Fallback de cópia p/ contexto INSEGURO (http, ex.: o VM em http://IP:3131), onde
  // navigator.clipboard é undefined. Usa uma textarea temporária + execCommand('copy'),
  // que não exige https — só o gesto do clique (que temos aqui).
  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  async function copyText(text) {
    text = String(text || '');
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return true; }
      catch (e) { /* cai no fallback */ }
    }
    return fallbackCopy(text);
  }

  // Toast flutuante de feedback (o usuário não vê o clipboard; precisa de confirmação).
  let toastTimer = null;
  window.showToast = function (msg, bad) {
    let t = document.getElementById('copy-toast');
    if (!t) { t = document.createElement('div'); t.id = 'copy-toast'; t.className = 'copy-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.toggle('bad', !!bad);
    t.classList.remove('show');
    void t.offsetWidth;   // reflow → garante a transição mesmo em aba throttled
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1700);
  };

  // Liga um botão de copiar ao texto cru de uma função/elemento. getText pode ser
  // string, função ou elemento (usa .dataset.raw ou .textContent).
  window.wireCopy = function (btn, getText) {
    btn.addEventListener('click', async () => {
      let txt = typeof getText === 'function' ? getText() : getText;
      if (txt && txt.nodeType) txt = txt.dataset.raw || txt.textContent;
      const ok = await copyText(txt);
      if (ok) {
        btn.classList.add('done');
        const label = btn.querySelector('.copy-label');
        const prev = label ? label.textContent : null;
        if (label) label.textContent = 'Copiado';
        setTimeout(() => { btn.classList.remove('done'); if (label) label.textContent = prev; }, 1600);
        window.showToast('Query copiada ✓');
      } else {
        window.showToast('Não foi possível copiar', true);
      }
    });
  };

  // Renderiza SQL realçado num <pre class="sql"> e guarda o texto cru em data-raw.
  window.renderSql = function (pre, sql) {
    pre.dataset.raw = sql;
    pre.innerHTML = window.sqlHighlight(sql);
  };

  // Colapso das saídas: a query nasce FECHADA — o uso normal é copiar, não ler, e
  // fechadas as saídas cabem todas na mesma tela. Enhancement automático sobre a
  // estrutura comum (.out > .out-hd + .code), então vale p/ TODOS os montadores sem
  // tocar em cada página. O Copiar segue no cabeçalho: copiar não exige expandir.
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.mq .out').forEach(function (out) {
      const hd = out.querySelector('.out-hd');
      const code = out.querySelector('.code');
      if (!hd || !code) return;
      out.classList.add('collapsible');
      const tg = document.createElement('button');
      tg.type = 'button';
      tg.className = 'out-toggle';
      tg.innerHTML = '<span class="lbl">Ver SQL</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
      hd.insertBefore(tg, hd.querySelector('.copy-btn'));
      tg.addEventListener('click', function () {
        const open = !out.classList.contains('is-open');
        out.classList.toggle('is-open', open);
        tg.querySelector('.lbl').textContent = open ? 'Ocultar' : 'Ver SQL';
      });
    });
  });

  // Atalho do montador → tela de criação da análise ("já extraí os dados, quero montar").
  // Deriva o tipo do data-back (/guia/<tipo>) e injeta o botão logo após a descrição,
  // então vale p/ TODOS os montadores sem tocar em cada página.
  const GERAR = {
    'conversao-perfil': '/gerar.html', 'historico-lancamentos': '/gerar-historico.html',
    'criativos': '/gerar-criativos.html', 'acompanhamento-lancamento': '/gerar-acompanhamento.html',
    'debriefing-lancamento': '/gerar-debriefing.html',
  };
  document.addEventListener('DOMContentLoaded', function () {
    const back = document.querySelector('.home-bar[data-back]');
    const m = back && (back.getAttribute('data-back') || '').match(/\/guia\/([a-z0-9-]+)/);
    const href = m && GERAR[m[1]];
    const page = document.querySelector('.mq-page');
    if (!href || !page) return;
    const el = document.createElement('div');
    el.className = 'mq-tolink';
    el.innerHTML = '<span class="tl-txt"><b>Já extraiu os dados?</b> Vá para a montagem da análise e envie o CSV.</span>' +
      '<a class="tl-go" href="' + href + '">Montar a análise <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>';
    const desc = page.querySelector('.desc');
    if (desc) desc.insertAdjacentElement('afterend', el);
    else page.insertBefore(el, page.firstChild);
  });
})();
