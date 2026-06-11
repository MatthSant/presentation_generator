/* page-chrome.js — injeta o conteúdo padrão da barra superior das páginas
 * utilitárias (logo + brand + link voltar), a partir de data-attributes:
 *
 *   <header class="home-bar" data-sub="Clientes" data-back="/" data-back-label="Voltar">
 *     ...conteúdo extra da página (botões à direita) é preservado...
 *   </header>
 *   <script src="/js/page-chrome.js" defer></script>
 *
 * data-brand  — título (default "Dossiê do Consultor")
 * data-sub    — subtítulo em caps (ex.: "Guia", "Clientes")
 * data-back   — href do link Voltar (omitir = sem link)
 * data-back-label — rótulo do link (default "Voltar")
 *
 * O conteúdo já existente do header é mantido DEPOIS do brand (ações da página);
 * o link Voltar entra por último (margin-left:auto). */
(function () {
  var bar = document.querySelector('header.home-bar');
  if (!bar || bar.dataset.chrome === 'done') return;
  bar.dataset.chrome = 'done';

  var brand = bar.dataset.brand || 'Dossiê do Consultor';
  var sub = bar.dataset.sub || '';
  var back = bar.dataset.back;
  var backLabel = bar.dataset.backLabel || 'Voltar';

  var frag = document.createDocumentFragment();

  var logo = document.createElement('img');
  logo.className = 'bar-logo';
  logo.src = '/assets/witly-logo.png';
  logo.alt = 'Witly';
  // Logo é link para a HOME — sem isso, páginas utilitárias (montadores de query,
  // gerar) ficavam só com "Voltar ao guia" e o menu de navegação parecia ter sumido.
  var logoLink = document.createElement('a');
  logoLink.className = 'bar-logo-link';
  logoLink.href = '/';
  logoLink.title = 'Início';
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

  if (back) {
    var a = document.createElement('a');
    a.className = 'bar-back';
    a.href = back;
    a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H6M11 6l-6 6 6 6"/></svg>' + backLabel;
    bar.appendChild(a);
  }
})();
