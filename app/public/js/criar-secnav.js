// Navegação de seções das páginas de criação: scroll suave + destaque da seção visível.
(function () {
  const nav = document.querySelector('.secnav');
  if (!nav) return;
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const secs = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (!secs.length) return;

  links.forEach((a) => a.addEventListener('click', (e) => {
    const t = document.querySelector(a.getAttribute('href'));
    if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }));

  const setOn = (i) => links.forEach((l, j) => l.classList.toggle('on', j === i));
  setOn(0);
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) setOn(secs.indexOf(e.target)); });
  }, { rootMargin: '-80px 0px -65% 0px', threshold: 0 });
  secs.forEach((s) => obs.observe(s));
})();
