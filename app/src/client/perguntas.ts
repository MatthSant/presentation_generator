/* perguntas.ts — the "Perguntas de aprofundamento" board.
 *
 * A page (not a section grid): a ranked list of guiding questions whose
 * relevance is computed in Python. The consultant picks which to deepen
 * ("Adicionar" → Claude detalhamento) or dismisses ("Ignorar"). Every choice is
 * recorded server-side so the question set can be refined later. */

import type { Pergunta, PerguntaNivel } from '../shared/types.js';

export interface PerguntasHandlers {
  /** Follow a question: record + generate its Claude detalhamento, then open it. */
  seguir: (p: Pergunta) => void;
  /** Dismiss a question (recorded). */
  ignorar: (p: Pergunta) => void;
  /** Open an already-generated detalhamento (navigates to its section first). */
  abrir: (p: Pergunta) => void;
  /** Add a custom question (no relevance calc) and generate its detalhamento. */
  adicionar: () => void;
}

const NIVEL: Record<PerguntaNivel, { label: string; cls: string }> = {
  alta: { label: 'Relevante', cls: 'pg-tag-alta' },
  media: { label: 'Moderada', cls: 'pg-tag-media' },
  baixa: { label: 'Exploratória', cls: 'pg-tag-baixa' },
};

export class PerguntasView {
  private perguntas: Pergunta[] = [];

  constructor(private host: HTMLElement, private h: PerguntasHandlers) {}

  setData(perguntas: Pergunta[]): void {
    this.perguntas = perguntas;
    this.render();
  }

  /** Optimistically reflect a status change without a refetch. */
  patch(id: string, change: Partial<Pergunta>): void {
    this.perguntas = this.perguntas.map((p) => (p.id === id ? { ...p, ...change } : p));
    this.render();
  }

  private render(): void {
    const pendentes = this.perguntas.filter((p) => p.status !== 'ignorada');
    const ignoradas = this.perguntas.filter((p) => p.status === 'ignorada');

    const head = `
      <header class="pg-head">
        <div class="pg-eyebrow">Perguntas de aprofundamento</div>
        <div class="pg-head-row">
          <h1 class="pg-title">O que vale aprofundar primeiro?</h1>
          <button type="button" class="pg-add" title="Adicionar uma pergunta sua e gerar o detalhamento">+ Adicionar pergunta</button>
        </div>
        <p class="pg-sub">Ordenadas por relevância (cálculo fixo sobre os dados). Siga as que importam — cada uma vira um detalhamento — ou descarte as que não fazem sentido.</p>
      </header>`;

    const grid = pendentes.length
      ? `<div class="pg-grid">${pendentes.map((p) => this.card(p)).join('')}</div>`
      : `<div class="pg-empty">Nenhuma pergunta pendente. ${ignoradas.length ? 'Veja as descartadas abaixo.' : 'Gere a análise para popular as perguntas.'}</div>`;

    const dropped = ignoradas.length
      ? `<details class="pg-dropped"><summary>${ignoradas.length} descartada(s)</summary>
           <div class="pg-grid">${ignoradas.map((p) => this.card(p)).join('')}</div></details>`
      : '';

    this.host.innerHTML = `<div class="pg-wrap">${head}${grid}${dropped}</div>`;
    this.wire();
  }

  private card(p: Pergunta): string {
    const isCustom = !!p.custom;
    const niv = (p.nivel && NIVEL[p.nivel]) || NIVEL.media;
    const tag = isCustom ? { label: 'Sua pergunta', cls: 'pg-tag-custom' } : niv;
    const rel = isCustom || p.relevancia == null ? '' : `<span class="pg-rel" title="Relevância calculada">${Math.round(p.relevancia)}</span>`;
    // Perguntas do banco têm id interno (ex.: "cp-sustain") sem significado para o
    // consultor — não exibir o código cru. Só o marcador "✎" de pergunta própria.
    const pid = isCustom ? '✎' : '';
    const kpis = (p.kpis || []).slice(0, 3).map((k) => `
      <div class="pg-kpi"><div class="pg-kpi-v">${esc(k.value)}</div><div class="pg-kpi-l">${esc(k.label)}</div></div>`).join('');
    const kpisBlock = kpis ? `<div class="pg-kpis">${kpis}</div>` : '';

    let actions: string;
    if (p.status === 'ignorada') {
      actions = `<button type="button" class="pg-btn ghost" data-act="seguir" data-id="${esc(p.id)}">Reconsiderar</button>`;
    } else if (p.status === 'seguida') {
      const open = p.det
        ? `<button type="button" class="pg-btn" data-act="abrir" data-id="${esc(p.id)}">↗ Ver detalhamento</button>`
        : `<span class="pg-done">Detalhamento gerado</span>`;
      actions = `${open}<button type="button" class="pg-btn ghost" data-act="ignorar" data-id="${esc(p.id)}">Ignorar</button>`;
    } else {
      actions = `<button type="button" class="pg-btn" data-act="seguir" data-id="${esc(p.id)}">Adicionar</button>
                 <button type="button" class="pg-btn ghost" data-act="ignorar" data-id="${esc(p.id)}">Ignorar</button>`;
    }

    return `
      <article class="pg-card${p.status === 'ignorada' ? ' is-dropped' : ''}">
        <div class="pg-card-top">
          <span class="pg-tag ${tag.cls}">${esc(tag.label)}</span>
          ${rel}
          ${pid ? `<span class="pg-pid">${pid}</span>` : ''}
        </div>
        <h2 class="pg-q">${esc(p.pergunta)}</h2>
        <p class="pg-just">${esc(p.justificativa)}</p>
        ${kpisBlock}
        <div class="pg-actions">${actions}</div>
      </article>`;
  }

  private wire(): void {
    this.host.querySelector<HTMLElement>('.pg-add')?.addEventListener('click', () => this.h.adicionar());
    for (const btn of this.host.querySelectorAll<HTMLElement>('[data-act]')) {
      btn.addEventListener('click', () => {
        const p = this.perguntas.find((x) => x.id === btn.dataset.id);
        if (!p) return;
        if (btn.dataset.act === 'abrir') this.h.abrir(p);
        else if (btn.dataset.act === 'seguir') this.h.seguir(p);
        else if (btn.dataset.act === 'ignorar') this.h.ignorar(p);
      });
    }
  }
}

const ESC_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function esc(s: unknown): string { return String(s ?? '').replace(/[&<>"]/g, (c) => ESC_MAP[c]); }
