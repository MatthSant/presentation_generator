/* page-chrome.js — injeta o conteúdo padrão da barra superior das páginas
 * utilitárias (voltar + logo + brand), a partir de data-attributes:
 *
 *   <header class="home-bar" data-sub="Clientes" data-back="/" data-back-label="Voltar">
 *     ...conteúdo extra da página (botões à direita) é preservado...
 *   </header>
 *   <script src="/js/page-chrome.js" defer></script>
 *
 * data-brand  — título (default "Witly Grimório")
 * data-sub    — subtítulo em caps (ex.: "Guia", "Clientes")
 * data-back   — href do link Voltar. Ausente: usa "/" automaticamente, exceto na
 *               home (pathname "/" ou .../index.html), onde não há voltar.
 * data-back-label — rótulo do link (default "Voltar")
 *
 * Ordem injetada (à ESQUERDA, antes do conteúdo da página):
 *   [← Voltar] [logo → /] [sep] [brand/sub]
 * O conteúdo já existente do header é mantido DEPOIS (ações da página). */
(function () {
  var bar = document.querySelector('header.home-bar');
  if (!bar || bar.dataset.chrome === 'done') return;
  bar.dataset.chrome = 'done';

  var brand = bar.dataset.brand || 'Witly Grimório';
  var sub = bar.dataset.sub || '';
  var path = location.pathname.replace(/\/+$/, '');
  var isHome = path === '' || /\/index\.html$/i.test(path);
  var back = bar.dataset.back || (isHome ? '' : '/');
  var backLabel = bar.dataset.backLabel || 'Voltar';

  var frag = document.createDocumentFragment();

  // Voltar — primeiro elemento, à esquerda (web-app padrão)
  if (back) {
    var a = document.createElement('a');
    a.className = 'bar-back';
    a.href = back;
    a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H6M11 6l-6 6 6 6"/></svg>' + backLabel;
    frag.appendChild(a);
  }

  // Logo grimório — link para a HOME
  var logoLink = document.createElement('a');
  logoLink.className = 'bar-logo-link';
  logoLink.href = '/';
  logoLink.title = 'Início';
  var logo = document.createElement('img');
  logo.className = 'bar-logo';
  logo.src = '/assets/witly-logo.png';
  logo.alt = 'Witly Grimório';
  logoLink.appendChild(logo);
  frag.appendChild(logoLink);

  var sep = document.createElement('span');
  sep.className = 'bar-logo-sep';
  frag.appendChild(sep);

  var b = document.createElement('span');
  b.className = 'home-brand';
  b.textContent = brand;
  if (sub) {
    var s = document.createElement('small');
    s.textContent = sub;
    b.appendChild(s);
  }
  frag.appendChild(b);

  bar.insertBefore(frag, bar.firstChild);
})();
