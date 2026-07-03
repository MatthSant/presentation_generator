// gen-progress.js — overlay de progresso para operações longas de geração.
// A geração é um POST único (sem SSE — a análise ainda não existe), então não há
// progresso REAL do servidor; damos sensação de andamento girando as fases numa
// linha do tempo estimada. Uso:
//   const p = window.genProgress.start(['Calculando…', 'Gerando insights…', 'Montando…']);
//   try { ... } finally { p.done(); }   // ou p.fail() p/ estado de erro
(function () {
  if (window.genProgress) return;

  const css = `
  .genp-ov { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center;
    background: rgba(20,16,32,.55); backdrop-filter: blur(2px); animation: genp-in .18s ease; }
  @keyframes genp-in { from { opacity: 0 } to { opacity: 1 } }
  .genp-card { background: #fff; border: 1px solid var(--border, #e6e4ee); border-radius: 16px;
    padding: 30px 34px; max-width: 400px; width: calc(100% - 48px); text-align: center;
    box-shadow: 0 24px 60px -20px rgba(0,0,0,.4); }
  .genp-spin { width: 42px; height: 42px; margin: 0 auto 18px; border-radius: 50%;
    border: 3px solid rgba(124,58,237,.18); border-top-color: var(--purple, #7C3AED);
    animation: genp-rot .8s linear infinite; }
  @keyframes genp-rot { to { transform: rotate(360deg) } }
  .genp-title { font-family: var(--font-sans), sans-serif; font-size: 16px; font-weight: 800;
    color: var(--fg, #1a1725); letter-spacing: -.01em; }
  .genp-phase { font-family: var(--font-sans), sans-serif; font-size: 13.5px; font-weight: 600;
    color: var(--purple, #7C3AED); margin-top: 8px; min-height: 19px; transition: opacity .25s; }
  .genp-hint { font-family: var(--font-sans), sans-serif; font-size: 11.5px; color: var(--gray2, #8b8797);
    margin-top: 14px; line-height: 1.5; }
  .genp-steps { display: flex; justify-content: center; gap: 6px; margin-top: 16px; }
  .genp-dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(124,58,237,.2); transition: background .25s; }
  .genp-dot.on { background: var(--purple, #7C3AED); }
  .genp-card.err .genp-spin { display: none; }
  .genp-card.err .genp-phase { color: var(--red, #dc2626); }`;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  window.genProgress = {
    /** phases: string[] (mensagens giradas na ordem, segurando na última).
     *  Retorna { done(), fail(msg) }. */
    start(phases, opts) {
      const list = (phases && phases.length) ? phases : ['Processando no servidor…'];
      const o = opts || {};
      const ov = document.createElement('div');
      ov.className = 'genp-ov';
      ov.innerHTML = `<div class="genp-card">
        <div class="genp-spin"></div>
        <div class="genp-title">${o.title || 'Gerando a análise…'}</div>
        <div class="genp-phase"></div>
        <div class="genp-steps">${list.map(() => '<span class="genp-dot"></span>').join('')}</div>
        <div class="genp-hint">${o.hint || 'Isso pode levar de alguns segundos a ~1 minuto. Não feche a página.'}</div>
      </div>`;
      document.body.appendChild(ov);
      const phaseEl = ov.querySelector('.genp-phase');
      const dots = [...ov.querySelectorAll('.genp-dot')];
      let i = 0;
      const paint = () => {
        phaseEl.style.opacity = '0';
        setTimeout(() => { phaseEl.textContent = list[i]; phaseEl.style.opacity = '1'; }, 120);
        dots.forEach((d, k) => d.classList.toggle('on', k <= i));
      };
      paint();
      // avança e SEGURA na última fase (não volta ao começo — daria impressão de travar)
      const timer = setInterval(() => { if (i < list.length - 1) { i++; paint(); } }, o.everyMs || 2600);

      return {
        done() { clearInterval(timer); ov.remove(); },
        fail(msg) {
          clearInterval(timer);
          ov.querySelector('.genp-card').classList.add('err');
          ov.querySelector('.genp-title').textContent = 'Não foi possível gerar';
          phaseEl.textContent = msg || 'Tente novamente.';
          setTimeout(() => ov.remove(), 3200);
        },
      };
    },
  };
})();
