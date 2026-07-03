/* deepen-queue.ts — fila NÃO-bloqueante de aprofundamentos/detalhamentos.
 *
 * Antes, pedir um deepen travava a tela inteira com um overlay até a IA
 * responder. Agora cada pedido vira um JOB nesta fila: o consultor segue usando
 * o relatório enquanto os jobs rodam em SÉRIE (um de cada vez — o servidor muta
 * os arquivos da análise e a API é cara; serial evita corrida). Um painel fixo
 * no canto inferior esquerdo mostra o andamento de cada job com "ver" quando
 * pronto e "rerodar/detalhes" quando falha.
 *
 * O módulo é agnóstico ao domínio: quem enfileira passa um `run()` que faz a
 * chamada + o pós-processamento e devolve um `DeepenOutcome` (toast + ação
 * "ver"). Erros ricos (reprovação da IA) sobem via hook `onError`. */

export interface DeepenOutcome {
  /** Ação do botão "ver" — navega até a seção nova / abre o modal do bloco. */
  view?: () => void | Promise<void>;
  /** Texto curto de sucesso (toast). */
  toast?: string;
}

export interface DeepenSpec {
  kind: 'aprofundamento' | 'detalhamento' | 'revisao';
  /** Linha principal (ex.: "Detalhamento"). */
  label: string;
  /** Linha secundária (título do card / texto da pergunta). */
  sub?: string;
  run: () => Promise<DeepenOutcome>;
}

export interface DeepenQueueHooks {
  onToast: (msg: string) => void;
  /** Abre o diálogo de erro detalhado (reprovação da IA) com opção de rerodar. */
  onError: (error: unknown, retry: () => void) => void;
}

type Status = 'queued' | 'running' | 'done' | 'error';

interface Job extends DeepenSpec {
  id: string;
  status: Status;
  stage?: string;
  outcome?: DeepenOutcome;
  error?: unknown;
}

const KIND_LABEL: Record<DeepenSpec['kind'], string> = {
  aprofundamento: 'Aprofundamento',
  detalhamento: 'Detalhamento',
  revisao: 'Revisão',
};

export class DeepenQueue {
  private jobs: Job[] = [];
  private running = false;
  private seq = 0;
  private collapsed = false;
  private panel!: HTMLElement;
  private listEl!: HTMLElement;
  private countEl!: HTMLElement;

  constructor(private hooks: DeepenQueueHooks) {
    this.build();
  }

  /** Enfileira um pedido e dispara o processamento (se ocioso). */
  add(spec: DeepenSpec): void {
    const job: Job = { id: `dq${++this.seq}`, status: 'queued', ...spec };
    this.jobs.push(job);
    this.collapsed = false;
    this.render();
    void this.pump();
  }

  /** Atualiza a linha de estágio (SSE) do job em execução. */
  setStage(msg: string): void {
    const r = this.jobs.find((j) => j.status === 'running');
    if (r) { r.stage = msg; this.render(); }
  }

  private nextQueued(): Job | undefined { return this.jobs.find((j) => j.status === 'queued'); }

  private async pump(): Promise<void> {
    if (this.running) return;
    let job = this.nextQueued();
    if (!job) return;
    this.running = true;
    while (job) {
      job.status = 'running'; job.stage = undefined; job.error = undefined;
      this.render();
      try {
        job.outcome = await job.run();
        job.status = 'done';
        if (job.outcome?.toast) this.hooks.onToast(job.outcome.toast);
      } catch (e) {
        job.error = e; job.status = 'error';
      }
      this.render();
      job = this.nextQueued();
    }
    this.running = false;
    this.render();
  }

  private retry(id: string): void {
    const j = this.jobs.find((x) => x.id === id);
    if (!j) return;
    j.status = 'queued'; j.error = undefined;
    this.render();
    void this.pump();
  }

  private dismiss(id: string): void {
    this.jobs = this.jobs.filter((x) => x.id !== id);
    this.render();
  }

  private clearDone(): void {
    this.jobs = this.jobs.filter((j) => j.status !== 'done');
    this.render();
  }

  /* ── DOM ── */

  private build(): void {
    const p = document.createElement('div');
    p.className = 'dq-panel';
    p.hidden = true;
    p.innerHTML = `
      <div class="dq-head">
        <span class="dq-dot" aria-hidden="true"></span>
        <span class="dq-title">Aprofundamentos</span>
        <span class="dq-count">0</span>
        <button class="dq-clear" type="button" title="Limpar concluídos">Limpar</button>
        <button class="dq-min" type="button" aria-label="Minimizar">▾</button>
      </div>
      <div class="dq-list"></div>`;
    document.body.appendChild(p);
    this.panel = p;
    this.listEl = p.querySelector('.dq-list')!;
    this.countEl = p.querySelector('.dq-count')!;
    p.querySelector('.dq-min')!.addEventListener('click', () => { this.collapsed = !this.collapsed; this.render(); });
    p.querySelector('.dq-head')!.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.dq-min, .dq-clear')) return;
      this.collapsed = !this.collapsed; this.render();
    });
    p.querySelector('.dq-clear')!.addEventListener('click', (e) => { e.stopPropagation(); this.clearDone(); });
  }

  private render(): void {
    if (!this.jobs.length) { this.panel.hidden = true; return; }
    this.panel.hidden = false;
    const active = this.jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;
    const doneN = this.jobs.filter((j) => j.status === 'done').length;
    const errN = this.jobs.filter((j) => j.status === 'error').length;
    this.countEl.textContent = active ? `${active} na fila` : (errN ? `${errN} com erro` : `${doneN} pronto${doneN > 1 ? 's' : ''}`);
    this.panel.classList.toggle('dq-collapsed', this.collapsed);
    this.panel.classList.toggle('dq-busy', this.running);
    this.panel.querySelector<HTMLElement>('.dq-clear')!.hidden = doneN === 0;

    this.listEl.replaceChildren();
    for (const job of this.jobs) this.listEl.appendChild(this.row(job));
  }

  private row(job: Job): HTMLElement {
    const el = document.createElement('div');
    el.className = `dq-job dq-${job.status}`;
    const ic = job.status === 'running'
      ? '<span class="dq-spin" aria-hidden="true"></span>'
      : `<span class="dq-badge">${job.status === 'done' ? '✓' : job.status === 'error' ? '!' : '•'}</span>`;
    const sub = job.status === 'running' && job.stage ? job.stage : (job.sub || KIND_LABEL[job.kind]);
    el.innerHTML = `${ic}
      <div class="dq-jbody">
        <div class="dq-jlbl">${esc(job.label)}</div>
        <div class="dq-jsub">${esc(sub)}</div>
      </div>
      <div class="dq-jacts"></div>`;
    const acts = el.querySelector('.dq-jacts')!;
    if (job.status === 'done' && job.outcome?.view) {
      acts.appendChild(btn('Ver', 'dq-b dq-b-go', () => void job.outcome!.view!()));
      acts.appendChild(iconBtn('×', 'Dispensar', () => this.dismiss(job.id)));
    } else if (job.status === 'error') {
      acts.appendChild(btn('↻', 'dq-b', () => this.retry(job.id), 'Rerodar'));
      acts.appendChild(btn('Detalhes', 'dq-b dq-b-ghost', () => this.hooks.onError(job.error, () => this.retry(job.id))));
      acts.appendChild(iconBtn('×', 'Dispensar', () => this.dismiss(job.id)));
    } else if (job.status === 'queued') {
      acts.appendChild(iconBtn('×', 'Remover da fila', () => this.dismiss(job.id)));
    }
    return el;
  }
}

function btn(label: string, cls: string, onClick: () => void, title?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button'; b.className = cls; b.textContent = label;
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}
function iconBtn(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = btn(label, 'dq-x', onClick, title);
  b.setAttribute('aria-label', title);
  return b;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function esc(s: unknown): string { return String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]); }
