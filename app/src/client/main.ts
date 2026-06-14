/* main.ts — app bootstrap. Owns the Store and wires the modules together.
 *
 * URL shape: /report/:client/:slug[?<filter>=<value>…]. We load the three data
 * layers, build navigation, then render sections on demand. A section renders as
 * a CSS-grid Dashboard inside a [data-report-section] host; detalhamento modals
 * render as .ic-overlay dialogs in #modal-root. */

import { Api } from './api.js';
import { Store } from './store.js';
import { Navigation } from './navigation.js';
import { Filters } from './filters.js';
import { Dashboard } from './dashboard.js';
import { renderWidget, setCmpMode, type RenderCtx } from './renderer.js';
import { ChartManager, setChartExportMode, type ChartDef } from './charts.js';
import { PerguntasView } from './perguntas.js';
import { HistoricoFilters } from './historico-controls.js';
import { CriativosControls } from './criativos-controls.js';
import { resolveBind } from '../shared/bind.js';
import type { Bind, ResolvedBind, Modal, Section, LayoutItem, Pergunta } from '../shared/types.js';

const ROOT = document.getElementById('export-root')!;
const MODAL_ROOT = document.getElementById('modal-root')!;

class App {
  private store = new Store();
  private api: Api;
  private nav: Navigation;
  private filters: Filters | null = null;
  private dashboard: Dashboard | null = null;
  private modalCharts = new ChartManager();
  /** Chart defs per modal, mounted lazily the first time the modal opens (a chart
   *  mounted in a hidden/0-size dialog renders blank). */
  private modalChartDefs = new Map<string, { elId: string; def: ChartDef }[]>();
  private openedModals = new Set<string>();
  private editing = false;
  /** Modal id to auto-open after the next section (re)render — set by deepen. */
  private pendingModal: string | null = null;
  private perguntas: PerguntasView | null = null;
  private hist: HistoricoFilters | null = null;
  /** Current launch selection (null = full series) — drives the filtered-chart badge. */
  private histSel: string[] | null = null;
  private histLaunches: string[] | null = null;
  private histMetric = 'conv';
  /** Modo ativo da análise de criativos (resultado × captação) + filtros do FAB. */
  private histMode: string | undefined;
  private histMinInvest: number | undefined;
  private histTemp: string | null = null;
  private criativos: CriativosControls | null = null;
  private busyEl: HTMLElement | null = null;

  constructor(private client: string, private slug: string) {
    this.api = new Api(client, slug);
    this.nav = new Navigation(this.store, (p, s) => void this.go(p, s));
    this.wireModals();
    this.wireLayoutEditor();
    document.getElementById('export-html-btn')?.addEventListener('click', () => void this.exportHtml());
  }

  async start(): Promise<void> {
    let data, datasets, layout;
    try {
      [data, datasets, layout] = await Promise.all([
        this.api.getData(), this.api.getDataset().catch(() => ({})), this.api.getLayout().catch(() => ({ sections: {} })),
      ]);
    } catch (e) {
      ROOT.innerHTML = `<div style="padding:60px 56px"><p class="sm">Erro ao carregar relatório: ${(e as Error).message}</p></div>`;
      return;
    }
    this.store.data = data;
    this.store.datasets = datasets;
    this.store.layout = layout;

    document.title = data.meta?.title || data.meta?.client || 'Relatório';
    document.documentElement.dataset.theme = 'light';   // dark mode removido no redesign
    const brand = document.getElementById('tn-client');
    if (brand) {
      // breadcrumb DS Witly: Cliente / Tipo de análise / Campanha (3 níveis).
      const m = (data.meta || {}) as { client?: string; client_name?: string; campaign_label?: string; title?: string; controls?: { kind?: string } };
      const TYPE_LABELS: Record<string, string> = {
        'acompanhamento-lancamento': 'Acompanhamento de Campanha',
        'debriefing-lancamento': 'Debriefing de Lançamento',
        'historico-lancamentos': 'Histórico de Lançamentos',
        'conversao-perfil': 'Conversão por Perfil',
        'criativos': 'Análise de Criativos',
      };
      const cliente = m.client_name || m.client || '';
      const tipo = TYPE_LABELS[m.controls?.kind || ''] || '';
      const campanha = m.campaign_label || this.slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '';
      const crumbs = [cliente, tipo, campanha].filter(Boolean);
      brand.innerHTML = crumbs.length > 1
        ? crumbs.map((c, i) => i === crumbs.length - 1
            ? `<b class="tn-cur">${esc(c)}</b>`
            : `<span class="tn-crumb">${esc(c)}</span><span class="tn-sep">/</span>`).join('')
        : esc(crumbs[0] || '');
    }
    this.setupHistorico();
    // Cards clicáveis (link-card) → navegam para uma seção (ficha).
    document.addEventListener('goto-section', (e) => {
      const d = (e as CustomEvent<{ page?: string; section: string }>).detail;
      if (d?.section) void this.go(d.page || this.store.currentPageId, d.section);
    });

    this.nav.build();
    if (!this.hist && !this.criativos) { this.filters = new Filters(this.store, () => { this.dashboard?.applyFilters(); }); this.filters.init(); }
    this.watch();

    const first = this.store.allSections()[0];
    if (first) { await this.go(first.pageId, first.id); this.maybeShowFirstRunHint(); }
    else ROOT.innerHTML = '<div style="padding:60px 56px"><p class="sm">Relatório sem seções.</p></div>';

    void this.ensurePerguntasTab();
  }

  /** Probe /perguntas on load; if the analysis has guiding questions but the nav
   *  lacks the page (first open of a fresh analysis), add the tab. The server also
   *  persists it (ensurePerguntasPage) so later loads already include it. */
  private async ensurePerguntasTab(): Promise<void> {
    if (this.store.pages.some(p => p.kind === 'perguntas')) return;
    try {
      const r = await this.api.getPerguntas();
      if (!(r.perguntas || []).length) return;
      if (this.store.pages.some(p => p.kind === 'perguntas')) return;
      this.store.data.pages.push({ id: 'perguntas', label: 'Perguntas de aprofundamento', kind: 'perguntas',
        sections: [{ id: 'perguntas', label: 'Perguntas de aprofundamento' }] });
      this.nav.build();
      this.nav.setActive(this.store.currentPageId, this.store.currentSectionId);
    } catch { /* sem perguntas para este tipo — ok */ }
  }

  /** Surface the features a first-time consultant won't otherwise discover:
   *  "detalhar" a block (AI deepening) and the layout editor. A flat note on the
   *  paper, dismissed once and remembered — never a modal. */
  private maybeShowFirstRunHint(): void {
    let dismissed = false;
    try { dismissed = localStorage.getItem('rpt-hint-v1') === '1'; } catch { /* storage unavailable */ }
    if (dismissed) return;
    const main = document.getElementById('main');
    if (!main) return;
    const hint = document.createElement('div');
    hint.className = 'rpt-hint';
    hint.innerHTML =
      '<svg class="rpt-hint-ic svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11.5v4.5"/><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none"/></svg>'
      + '<div class="rpt-hint-body">Passe o mouse sobre um bloco e clique em <strong>detalhar</strong> para gerar um aprofundamento com IA (vira um link "↗ ver detalhamento" no bloco). Use o botão <strong>Layout</strong> na barra superior para reorganizar os blocos.</div>'
      + '<button class="rpt-hint-x" type="button" aria-label="Dispensar dica">&#215;</button>';
    hint.querySelector('.rpt-hint-x')?.addEventListener('click', () => {
      hint.remove();
      try { localStorage.setItem('rpt-hint-v1', '1'); } catch { /* ignore */ }
    });
    main.insertBefore(hint, ROOT);
  }

  /** Capa do relatório (eyebrow + título + meta). NÃO aparece no app — o título já
   *  vive no topnav/header da seção; só entra na EXPORTAÇÃO HTML standalone, como
   *  masthead do documento. Retorna '' quando não há meta.cover. */
  private coverHtml(): string {
    const meta = this.store.data?.meta;
    const cover = meta?.cover;
    if (!cover) return '';
    const parts: string[] = [];
    if (cover.eyebrow) parts.push(`<div class="badge badge-p">${esc(cover.eyebrow)}</div>`);
    parts.push(`<h1 class="sec-title">${esc(meta?.title || '')}</h1>`);
    if (cover.meta?.length) {
      parts.push(`<div class="cover-meta">${cover.meta.map(esc).join('<span class="cm-dot">◆</span>')}</div>`);
    }
    parts.push('<div class="cover-rule"></div>');
    return `<header id="report-header">${parts.join('')}</header>`;
  }

  private async go(pageId: string, sectionId: string, keepScroll = false): Promise<void> {
    if (this.editing) this.abortEdit(); // tab switch during edit → drop edits, then navigate
    this.store.currentPageId = pageId;
    this.store.currentSectionId = sectionId;
    this.nav.setActive(pageId, sectionId);

    this.hist?.setPage(pageId);
    this.criativos?.setPage(pageId);

    if (this.store.page(pageId)?.kind === 'perguntas') {
      await this.renderPerguntas();
      window.scrollTo({ top: 0 });
      return;
    }

    let section = this.store.getSection(sectionId);
    if (!section) {
      ROOT.innerHTML = '<div style="padding:60px 56px 80px"><p class="sm" style="color:var(--gray2)">Carregando…</p></div>';
      try {
        section = await this.api.getSection(sectionId);
        this.store.putSection(section);
      } catch {
        ROOT.innerHTML = `<div style="padding:60px 56px"><p class="sm">Seção não encontrada: <code>${sectionId}</code></p></div>`;
        return;
      }
    }
    this.renderSection(section);
    if (!keepScroll) window.scrollTo({ top: 0 });
  }

  private renderSection(section: Section): void {
    this.dashboard?.destroy();
    this.modalCharts.destroyAll();
    this.modalChartDefs.clear();
    this.openedModals.clear();
    ROOT.replaceChildren();
    MODAL_ROOT.replaceChildren();

    const ref = this.store.sectionRef(section.id);
    const host = document.createElement('section');
    host.id = section.id;
    host.dataset.reportSection = ref?.label || section.header?.title || section.id;
    host.appendChild(this.headerEl(section));
    ROOT.appendChild(host);

    this.dashboard = new Dashboard(section, host, {
      datasets: this.store.datasets,
      getActive: () => this.store.active,
      getFilterDefs: () => this.store.filterDefs,
      layout: this.store.layoutFor(section.id),
      onSaveLayout: (id, items) => this.persistLayout(id, items),
      // botão "Remover outliers" por gráfico — disponível p/ QUALQUER tipo
      // (feature flag; desativável com meta.features.outliers = false)
      outlierToggle: this.store.data?.meta?.features?.outliers !== false,
      filterBadge: this.histSel ? `${this.histSel.length} de ${this.store.data?.meta?.controls?.launches.length ?? 0} lançamentos` : null,
    });

    for (const modal of section.modals || []) {
      this.renderModal(modal, section.widgets.find((w) => (w as { modal?: string }).modal === modal.id)?.id);
    }
    this.markDeepen(section);

    // Seções det-*: rodapé de revisão (aprovar / pedir revisão regenera a própria
    // seção / ★1–5). Seções antigas sem historyId não mostram nada.
    if (section.historyId) {
      const rt = this.buildRating(section.historyId, (c) => this.revisarDetSection(section.id, c), async () => {
        if (!window.confirm('Descartar este detalhamento? A seção será removida e não dá para desfazer.')) return;
        this.setBusy(true, 'Descartando…');
        try {
          await this.api.descartarDet(section.id);
          this.removeDetSection(section.id);
          this.toast('Detalhamento descartado.');
        } catch (e) {
          this.toast(`Falha ao descartar: ${(e as Error).message}`);
        } finally { this.setBusy(false); }
      });
      rt.classList.add('rate--section');
      host.appendChild(rt);
    }

    if (this.pendingModal && (section.modals || []).some(m => m.id === this.pendingModal)) {
      this.openModal(this.pendingModal);
      this.pendingModal = null;
    }
  }

  /** Após descartar uma seção det-*: tira-a do nav (e remove a página Detalhamentos
   *  se ela esvaziar) e navega para um destino seguro. */
  private removeDetSection(id: string): void {
    this.store.dropSection(id);
    const pages = this.store.data.pages || [];
    for (const p of pages) {
      const i = (p.sections || []).findIndex(s => s.id === id);
      if (i >= 0) { p.sections.splice(i, 1); break; }
    }
    const di = pages.findIndex(p => p.id === 'detalhamentos' && (p.sections || []).length === 0);
    if (di >= 0) pages.splice(di, 1);
    this.nav.build();

    const det = pages.find(p => p.id === 'detalhamentos');
    let target: { p: string; s: string } | null = det?.sections?.[0] ? { p: 'detalhamentos', s: det.sections[0].id } : null;
    if (!target) {
      const perg = pages.find(p => p.kind === 'perguntas');
      if (perg?.sections?.[0]) target = { p: perg.id, s: perg.sections[0].id };
    }
    if (!target) {
      const f = this.store.allSections()[0];
      if (f) target = { p: f.pageId, s: f.id };
    }
    if (target) void this.go(target.p, target.s);
  }

  /* ───────────────────────────  Histórico — vista interativa  ─────────────────────────── */

  /** Mount the launch/metric control bar above the report when meta.controls says so. */
  private setupHistorico(): void {
    const controls = this.store.data?.meta?.controls;
    // Dispatch por kind: cada tipo com controles interativos registra o seu setup
    // aqui. Hoje só o histórico; um tipo novo adiciona o seu ramo.
    if (!controls) return;
    // Feature de plataforma (qualquer tipo): toggle vs Meta / vs Histórico nos badges
    // de KPI que trazem `cmp`. Independe do `kind`.
    if ((controls as { compare?: string }).compare) this.setupCompare();
    // Criativos: único controle é o toggle de MODO (resultado × captação) — um
    // metric-toggle que dispara 'metric-change'; recompute server-side por modo.
    if (controls.kind === 'criativos') {
      const cc = controls as { mode?: string; modes?: Array<{ id: string }> };
      this.histMode = cc.mode || cc.modes?.[0]?.id || 'resultado';
      // Controles NÍVEL-RELATÓRIO no FAB: modo + investimento mínimo + temperatura.
      this.criativos = new CriativosControls(controls, {
        apply: (o) => {
          this.histMode = o.mode;
          this.histMinInvest = o.minInvest || undefined;
          this.histTemp = o.temp;
          void this.recompute();
        },
      });
      return;
    }
    if (controls.kind !== 'historico-lancamentos') return;
    this.histMetric = controls.metrics[0]?.id || 'conv';
    const total = controls.launches.length;
    this.hist = new HistoricoFilters(controls, {
      apply: (l) => { this.histLaunches = (l.length >= total || l.length === 0) ? null : l; void this.recompute(); },
    });
    // Indicator selector lives inline on the Panorama page (a metric-toggle widget);
    // changing it recomputes only the metric-driven breakdown below.
    document.addEventListener('metric-change', (e) => {
      this.histMetric = (e as CustomEvent<string>).detail;
      void this.recompute();
    });
  }

  /** Toggle de plataforma "vs Meta / vs Histórico": injeta um segmented na barra
   *  superior e troca, ao vivo, os badges de KPI que trazem `cmp`. */
  private setupCompare(): void {
    const right = document.querySelector('.tn-right');
    if (!right || document.getElementById('cmp-toggle')) return;
    const wrap = document.createElement('div');
    wrap.id = 'cmp-toggle';
    wrap.className = 'cmp-toggle';
    for (const [mode, label] of [['meta', 'vs Meta'], ['hist', 'vs Histórico']] as const) {
      const b = document.createElement('button');
      b.className = 'cmp-btn' + (mode === 'meta' ? ' on' : '');
      b.textContent = label;
      b.addEventListener('click', () => {
        setCmpMode(mode);
        wrap.querySelectorAll('.cmp-btn').forEach((x) => x.classList.toggle('on', x === b));
      });
      wrap.appendChild(b);
    }
    right.insertBefore(wrap, right.firstChild);
  }

  /** Recompute the filtered/metric view server-side and re-render the current section. */
  private async recompute(): Promise<void> {
    this.histSel = this.histLaunches;
    const y = window.scrollY;
    try {
      const kind = (this.store.data?.meta?.controls as { kind?: string } | undefined)?.kind;
      const body = kind === 'criativos'
        ? { mode: this.histMode, min_invest: this.histMinInvest, temp: this.histTemp || undefined }
        : { launches: this.histLaunches, metric: this.histMetric };
      const r = await this.api.renderView(body);
      this.store.datasets = r.dataset;
      for (const sid of Object.keys(r.sections)) this.store.putSection(r.sections[sid]);
      this.store.layout = { ...this.store.layout, sections: { ...this.store.layout.sections, ...r.layout } };
      await this.go(this.store.currentPageId, this.store.currentSectionId, true);
      window.scrollTo({ top: y });
    } catch (e) {
      this.toast(`Falha ao recalcular: ${(e as Error).message}`);
    }
  }

  /* ───────────────────────────  Perguntas de aprofundamento  ─────────────────────────── */

  /** Render the guiding-questions board (a special page, not a section grid). */
  private async renderPerguntas(): Promise<void> {
    this.dashboard?.destroy(); this.dashboard = null;
    this.modalCharts.destroyAll();
    this.modalChartDefs.clear();
    this.openedModals.clear();
    MODAL_ROOT.replaceChildren();
    ROOT.replaceChildren();

    const host = document.createElement('section');
    host.id = 'perguntas-host';
    ROOT.appendChild(host);

    const view = new PerguntasView(host, {
      seguir: (p) => void this.seguirPergunta(p),
      ignorar: (p) => void this.ignorarPergunta(p),
      abrir: (p) => void this.abrirPergunta(p),
      adicionar: () => this.adicionarPergunta(),
    });
    this.perguntas = view;
    host.innerHTML = '<div class="pg-wrap"><p class="pg-loading">Carregando perguntas…</p></div>';
    try {
      const r = await this.api.getPerguntas();
      view.setData(r.perguntas || []);
    } catch (e) {
      host.innerHTML = `<div class="pg-wrap"><p class="pg-loading">Erro ao carregar perguntas: ${esc((e as Error).message)}</p></div>`;
    }
  }

  /** Blocking loading overlay — shown while a detalhamento is generated server-side
   *  (the LLM call takes a few seconds), so the wait is explicit and clicks are
   *  locked until we navigate to the result. */
  private ensureBusy(): void {
    if (this.busyEl) return;
    const el = document.createElement('div');
    el.className = 'busy-overlay';
    el.hidden = true;
    el.innerHTML = `
      <div class="busy-box">
        <div class="busy-load"><div class="busy-spinner" aria-hidden="true"></div><div class="busy-msg"></div></div>
        <div class="busy-err" hidden>
          <div class="busy-err-title">Não foi possível gerar o detalhamento</div>
          <p class="busy-err-sub"></p>
          <div class="busy-err-block" hidden><div class="busy-err-lbl busy-err-lbl-err">O que reprovou (erros)</div><ul class="busy-err-issues"></ul></div>
          <div class="busy-err-sug" hidden><div class="busy-err-lbl">Sugestões (não impediram a entrega)</div><ul class="busy-err-suglist"></ul></div>
          <div class="busy-err-actions">
            <button type="button" class="busy-err-retry">↻ Rerodar</button>
            <button type="button" class="busy-err-close">Fechar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.busyEl = el;
  }

  private setBusy(on: boolean, msg = 'Carregando…'): void {
    this.ensureBusy();
    if (!this.busyEl) return;
    if (on) {
      this.busyEl.querySelector<HTMLElement>('.busy-load')!.hidden = false;
      this.busyEl.querySelector<HTMLElement>('.busy-err')!.hidden = true;
      const m = this.busyEl.querySelector('.busy-msg');
      if (m) m.textContent = msg;
      this.busyEl.hidden = false;
    } else {
      this.busyEl.hidden = true;
    }
  }

  /** Tela de erro no overlay quando o detalhamento é REPROVADO após todas as tentativas:
   *  explica em itens o que falhou e oferece "Rerodar" (re-executa a mesma geração). */
  private busyError(error: unknown, onRetry: () => void): void {
    this.ensureBusy();
    if (!this.busyEl) return;
    this.busyEl.querySelector<HTMLElement>('.busy-load')!.hidden = true;
    const err = this.busyEl.querySelector<HTMLElement>('.busy-err')!;
    const e = error as { message?: string; blocking?: string[]; suggestions?: string[]; code?: string };
    // Falta de crédito na API → tela própria (não é defeito do detalhamento).
    if (e?.code === 'no_credit') {
      err.querySelector<HTMLElement>('.busy-err-title')!.textContent = '⚠ Sem crédito na API';
      err.querySelector<HTMLElement>('.busy-err-sub')!.textContent = e.message || 'Recarregue o crédito da API da Anthropic (Plans & Billing) para gerar detalhamentos.';
      err.querySelector<HTMLElement>('.busy-err-block')!.hidden = true;
      err.querySelector<HTMLElement>('.busy-err-sug')!.hidden = true;
      err.querySelector<HTMLButtonElement>('.busy-err-retry')!.onclick = () => { this.setBusy(false); onRetry(); };
      err.querySelector<HTMLButtonElement>('.busy-err-close')!.onclick = () => this.setBusy(false);
      err.hidden = false; this.busyEl.hidden = false;
      return;
    }
    err.querySelector<HTMLElement>('.busy-err-title')!.textContent = 'Não foi possível gerar o detalhamento';
    const msg = e?.message || String(error || '');
    // motivo (antes do '—') no topo; ERROS (blocking) e SUGESTÕES em listas separadas.
    const sep = msg.indexOf('—');
    const head = (sep >= 0 ? msg.slice(0, sep) : msg).trim();
    const blocking = (e?.blocking && e.blocking.length) ? e.blocking
      : (sep >= 0 ? msg.slice(sep + 1) : '').split(/;\s*/).map(s => s.trim()).filter(Boolean);
    const suggestions = e?.suggestions || [];
    err.querySelector<HTMLElement>('.busy-err-sub')!.textContent = head || 'Falha na geração.';
    const blockBox = err.querySelector<HTMLElement>('.busy-err-block')!;
    blockBox.hidden = blocking.length === 0;
    err.querySelector<HTMLElement>('.busy-err-issues')!.innerHTML = blocking.map(i => `<li>${esc(i)}</li>`).join('');
    const sugBox = err.querySelector<HTMLElement>('.busy-err-sug')!;
    sugBox.hidden = suggestions.length === 0;
    err.querySelector<HTMLElement>('.busy-err-suglist')!.innerHTML = suggestions.map(i => `<li>${esc(i)}</li>`).join('');
    err.querySelector<HTMLButtonElement>('.busy-err-retry')!.onclick = () => { this.setBusy(false); onRetry(); };
    err.querySelector<HTMLButtonElement>('.busy-err-close')!.onclick = () => this.setBusy(false);
    err.hidden = false;
    this.busyEl.hidden = false;
  }

  /** Follow a question: the server generates its detalhamento as a new section on
   *  the Detalhamentos page; we refresh the nav and jump straight to it. */
  private async seguirPergunta(p: Pergunta): Promise<void> {
    this.setBusy(true, 'Gerando aprofundamento…');
    try {
      const r = await this.api.seguirPergunta(p.id);
      // The nav map changed (new section, maybe a new page) → reload + rebuild.
      this.store.data = await this.api.getData();
      this.store.datasets = await this.api.getDataset().catch(() => this.store.datasets);
      this.nav.build();
      await this.go(r.pageId, r.sectionId);
      this.toast(r.mocked ? 'Aprofundamento criado (modo mock)' : 'Aprofundamento criado');
      this.setBusy(false);
    } catch (e) {
      // Reprovado após as tentativas (ou erro) → tela de erro com as pendências + rerodar.
      this.busyError(e, () => void this.seguirPergunta(p));
    }
  }

  private async ignorarPergunta(p: Pergunta): Promise<void> {
    try {
      await this.api.ignorarPergunta(p.id);
      this.perguntas?.patch(p.id, { status: 'ignorada' });
    } catch (e) {
      this.toast(`Falha ao ignorar: ${(e as Error).message}`);
    }
  }

  /** Open an already-generated detalhamento: navigate to its section. */
  private async abrirPergunta(p: Pergunta): Promise<void> {
    if (!p.det) return;
    await this.go(p.det.pageId, p.det.sectionId);
  }

  /** Compose a custom question; the server saves it (no relevance calc) and
   *  generates its detalhamento right away. */
  private adicionarPergunta(): void {
    const dlg = document.createElement('dialog');
    dlg.className = 'deepen-dlg';
    dlg.innerHTML = `<form method="dialog" class="deepen-form">
      <h3>Adicionar pergunta</h3>
      <p class="deepen-card">Sua pergunta vira um detalhamento na hora (sem cálculo de relevância).</p>
      <textarea placeholder="Ex.: A receita de Online cresce mais rápido que a de Loja ao longo dos meses?"></textarea>
      <div class="deepen-actions">
        <button value="cancel" class="deepen-btn ghost" type="submit">Cancelar</button>
        <button value="go" class="deepen-btn" type="submit">Criar detalhamento</button>
      </div></form>`;
    document.body.appendChild(dlg);
    const ta = dlg.querySelector('textarea')!;
    dlg.addEventListener('close', () => {
      const text = ta.value.trim();
      const go = dlg.returnValue === 'go';
      dlg.remove();
      if (!go || !text) return;
      void this.criarPerguntaCustom(text);
    });
    dlg.showModal();
    ta.focus();
  }

  private async criarPerguntaCustom(text: string): Promise<void> {
    this.setBusy(true, 'Criando aprofundamento…');
    try {
      const r = await this.api.addCustomPergunta(text);
      this.store.data = await this.api.getData();
      this.store.datasets = await this.api.getDataset().catch(() => this.store.datasets);
      this.nav.build();
      await this.go(r.pageId, r.sectionId);
      this.toast(r.mocked ? 'Aprofundamento criado (modo mock)' : 'Aprofundamento criado');
    } catch (e) {
      this.toast(`Falha ao adicionar pergunta: ${(e as Error).message}`);
    } finally {
      this.setBusy(false);
    }
  }

  /** Content widget types worth deepening (skips eyebrows, notes, kpi strips). */
  // Todo widget que CARREGA DADO é detalhável (não os puramente textuais/rótulo:
  // highlight, find-note, ni, eyebrow, label-sec).
  private static DEEPENABLE = new Set(['find-block', 'chart', 'table', 'heatmap', 'rank-card',
    'heatmap-toggle', 'chart-toggle', 'chart-table', 'kpi', 'kpi-card', 'kpi-strip', 'qa-card',
    'funnel', 'evolution-picker', 'scatter-picker', 'metric-toggle', 'bar-list', 'cri-list']);
  // Span padrão (de 12) por tipo no grid do drawer quando a IA não define `w`.
  // kpi = 4 (3 por linha); blocos médios = 6 (2 por linha); o resto ocupa a linha.
  private static MODAL_SPAN: Record<string, number> = {
    kpi: 4, 'find-block': 6, ni: 6, 'ni-vertical': 6,
  };
  private static WAND = '<svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21l15 -15l-3 -3l-15 15l3 3"/><path d="M15 6l3 3"/><path d="M9 3a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2"/><path d="M19 13a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2"/></svg>';
  // lápis — "pedir revisão deste bloco" (dentro de detalhamento/aprofundamento)
  private static PENCIL = '<svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10.5 -10.5a1.5 1.5 0 0 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/></svg>';
  private static MODAL_REVISABLE = new Set(['chart', 'table', 'find-block', 'kpi', 'highlight', 'ni', 'ni-vertical']);

  /** Add a "detalhar" button to every content tile; "ver detalhe" once a modal
   *  is attached. Works across all pages/blocks, not just insight cards. */
  private markDeepen(section: Section): void {
    // seção de aprofundamento (det-*): NÃO se faz deepen aninhado nos blocos — em vez
    // da varinha, cada bloco ganha "pedir revisão deste bloco" (regenera a seção com
    // o pedido escopado ao bloco → ajuste mais assertivo).
    const isDet = !!section.historyId;
    for (const w of section.widgets) {
      if (!w.id || !App.DEEPENABLE.has(w.type)) continue;
      const tile = ROOT.querySelector<HTMLElement>(`[data-widget-id="${w.id}"]`);
      if (!tile || tile.querySelector(':scope > .tile-deepen, :scope > .tile-detail-link, :scope > .tile-revisar')) continue;
      const title = (w as { title?: string }).title || '';
      if (isDet) {
        tile.appendChild(this.revisarButton(title, (instr) => void this.revisarDetSection(section.id, instr)));
        continue;
      }
      // band kpi-card (atingimento de meta) é uma faixa horizontal com o % grande à
      // direita → a varinha fica no topo-direito como nos outros blocos; o CSS dá um
      // pequeno espaçamento p/ baixo no card (padding-top) p/ o % não colidir.
      const existing = (w as { modal?: string }).modal;
      if (existing) {
        // já tem detalhamento → varinha roxa cheia (abre o modal)
        const a = document.createElement('a');
        a.className = 'tile-detail-link';
        a.dataset.modal = existing;   // opened by wireModals
        a.title = 'Ver detalhamento';
        a.setAttribute('aria-label', 'Ver detalhamento');
        a.innerHTML = App.WAND;
        tile.appendChild(a);
      } else {
        // ainda sem detalhamento → varinha contorno (aparece no hover) p/ "detalhar"
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tile-deepen';
        btn.title = 'Detalhar com IA';
        btn.setAttribute('aria-label', 'Detalhar com IA');
        btn.innerHTML = App.WAND;
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openDeepenComposer(section.id, w.id!, title); });
        tile.appendChild(btn);
      }
    }
  }

  /** Prompt the consultant for what to deepen, call the API, then reload + open. */
  private openDeepenComposer(secId: string, blockId: string, cardTitle: string): void {
    const dlg = document.createElement('dialog');
    dlg.className = 'deepen-dlg';
    dlg.innerHTML = `<form method="dialog" class="deepen-form">
      <h3>Detalhar card</h3>
      <p class="deepen-card">${esc(cardTitle)}</p>
      <textarea placeholder="O que aprofundar? Ex.: mostre a variação por faixa de renda ao longo dos lançamentos."></textarea>
      <div class="deepen-actions">
        <button value="cancel" class="deepen-btn ghost" type="submit">Cancelar</button>
        <button value="go" class="deepen-btn" type="submit">Gerar detalhamento</button>
      </div></form>`;
    document.body.appendChild(dlg);
    const ta = dlg.querySelector('textarea')!;
    dlg.addEventListener('close', () => {
      const prompt = ta.value.trim();
      const go = dlg.returnValue === 'go';
      dlg.remove();
      if (!go || !prompt) return;
      void this.runDeepen(secId, blockId, prompt);
    });
    dlg.showModal();
    ta.focus();
  }

  /** Botão "pedir revisão deste bloco" (dentro de um detalhamento/aprofundamento).
   *  Escopa o pedido ao bloco — ex.: "Revisar o bloco X: troque por um gráfico Y". */
  private revisarButton(blockTitle: string, onSubmit: (instr: string) => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile-revisar';
    btn.title = 'Pedir revisão deste bloco';
    btn.setAttribute('aria-label', 'Pedir revisão deste bloco');
    btn.innerHTML = App.PENCIL;
    btn.addEventListener('click', (e) => { e.stopPropagation(); this.openBlockRevision(blockTitle, onSubmit); });
    return btn;
  }

  /** Diálogo de revisão escopado a um bloco. Prefixa o pedido com o bloco-alvo p/
   *  deixar o ajuste assertivo, depois chama o caminho de revisão (regenera). */
  private openBlockRevision(blockTitle: string, onSubmit: (instr: string) => void): void {
    const dlg = document.createElement('dialog');
    dlg.className = 'deepen-dlg';
    dlg.innerHTML = `<form method="dialog" class="deepen-form">
      <h3>Pedir revisão do bloco</h3>
      <p class="deepen-card">${esc(blockTitle || 'este bloco')}</p>
      <textarea placeholder="O que mudar NESTE bloco? Ex.: troque este gráfico por uma comparação X × Y ao longo dos dias."></textarea>
      <div class="deepen-actions">
        <button value="cancel" class="deepen-btn ghost" type="submit">Cancelar</button>
        <button value="go" class="deepen-btn" type="submit">Pedir revisão</button>
      </div></form>`;
    document.body.appendChild(dlg);
    const ta = dlg.querySelector('textarea')!;
    dlg.addEventListener('close', () => {
      const txt = ta.value.trim();
      const go = dlg.returnValue === 'go';
      dlg.remove();
      if (!go || !txt) return;
      onSubmit(blockTitle ? `Revisar o bloco "${blockTitle}": ${txt}` : `Revisar um bloco: ${txt}`);
    });
    dlg.showModal();
    ta.focus();
  }

  /** Revisão de uma seção det-* (aprofundamento): regenera a própria seção com o
   *  comentário. Compartilhado pelo rodapé geral e pelos botões por bloco. */
  private async revisarDetSection(sectionId: string, comentario: string): Promise<void> {
    this.setBusy(true, 'Revisando o detalhamento…');
    try {
      await this.api.revisarDet(sectionId, comentario);
      this.store.dropSection(sectionId);
      await this.go(this.store.currentPageId, sectionId, true);
      this.toast('Detalhamento revisado.');
    } catch (e) {
      this.toast(`Falha na revisão: ${(e as Error).message}`);
    } finally { this.setBusy(false); }
  }

  private async runDeepen(secId: string, blockId: string, prompt: string, prev?: unknown): Promise<void> {
    this.setBusy(true, prev ? 'Ajustando o detalhamento…' : 'Gerando detalhamento…');
    try {
      const r = await this.api.deepen(secId, blockId, prompt, prev);
      this.pendingModal = r.modal.id;
      // Deep mode added new aggregate tables → refresh the dataset before re-render.
      if (r.datasetChanged) this.store.datasets = await this.api.getDataset();
      this.store.dropSection(secId);
      await this.go(this.store.currentPageId, secId);
      this.toast(r.mocked ? 'Detalhamento criado (modo mock)' : 'Detalhamento criado');
      this.setBusy(false);
    } catch (e) {
      // Reprovado após as tentativas (ou erro) → tela de erro com as pendências + rerodar.
      this.busyError(e, () => void this.runDeepen(secId, blockId, prompt, prev));
    }
  }

  private headerEl(section: Section): HTMLElement {
    const h = section.header || { title: '' };
    const wrap = document.createElement('header');
    wrap.className = 'sec-header';
    if (h.badge) { const b = document.createElement('div'); b.className = 'badge badge-p'; b.textContent = h.badge; wrap.appendChild(b); }
    const t = document.createElement('h1');
    t.className = 'sec-title';
    t.textContent = h.title || '';
    wrap.appendChild(t);
    if (h.sub) { const s = document.createElement('p'); s.className = 'sm'; s.innerHTML = h.sub; wrap.appendChild(s); }
    return wrap;
  }

  private renderModal(modal: Modal, ownerBlockId?: string): void {
    const overlay = document.createElement('div');
    overlay.className = 'ic-overlay';
    overlay.id = modal.id;
    const dialog = document.createElement('div');
    dialog.className = 'ic-dialog';
    const hd = document.createElement('div');
    hd.className = 'ic-dialog-hd';
    const title = document.createElement('div');
    title.className = 'ic-dialog-title';
    title.textContent = modal.title || '';
    const close = document.createElement('button');
    close.className = 'ic-close';
    close.dataset.icClose = '';
    close.innerHTML = '&#215;';
    hd.append(title, close);
    dialog.appendChild(hd);

    const ctx = this.resolveCtx();
    // Grid de 12 colunas no corpo do drawer → blocos lado a lado. Cada widget usa
    // o span `w` que a IA definiu; sem ele, cai no padrão por tipo. Em drawer
    // estreito, a container-query no CSS colapsa tudo p/ uma coluna.
    const body = document.createElement('div');
    body.className = 'ic-body';
    for (const w of modal.widgets || []) {
      const node = renderWidget(w, ctx);
      const span = Math.max(1, Math.min(12, (w as { w?: number }).w ?? App.MODAL_SPAN[w.type] ?? 12));
      node.style.setProperty('--span', String(span));
      // botão "pedir revisão deste bloco" — escopa o ajuste ao bloco e regenera o modal
      if (ownerBlockId && App.MODAL_REVISABLE.has(w.type)) {
        node.style.position = 'relative';
        const t = (w as { title?: string }).title || modal.title || '';
        node.appendChild(this.revisarButton(t, (instr) => void this.runDeepen(this.store.currentSectionId, ownerBlockId, instr, modal)));
      }
      body.appendChild(node);
    }
    dialog.appendChild(body);

    // Iterate: ask the model to adjust or deepen THIS detalhamento further. Só
    // aparece DEPOIS de aprovar — antes disso, "Pedir revisão" (no bloco de
    // avaliação) é o caminho de ajuste. Sem fluxo de aprovação (legado, sem
    // historyId) já mostra. Construída antes do rating p/ o onApproved revelá-la.
    let foot: HTMLFormElement | null = null;
    if (ownerBlockId) {
      foot = document.createElement('form');
      foot.className = 'ic-deepen';
      foot.hidden = !!modal.historyId;
      foot.innerHTML = '<input type="text" placeholder="Ajustar ou aprofundar este detalhamento… (ex.: troque o gráfico, foque na faixa alta, cruze com patrimônio)" />'
        + '<button type="submit">Enviar</button>';
      foot.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inp = foot!.querySelector('input') as HTMLInputElement;
        const btn = foot!.querySelector('button') as HTMLButtonElement;
        const q = inp.value.trim();
        if (!q) return;
        btn.disabled = true; btn.textContent = '…';
        await this.runDeepen(this.store.currentSectionId, ownerBlockId, q, modal);
        if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Enviar'; } // only on failure (success re-renders)
      });
    }

    // Revisão: aprovar / pedir revisão (regenera via prev) / ★1–5 — tudo no histórico.
    if (modal.historyId) {
      dialog.appendChild(this.buildRating(modal.historyId,
        ownerBlockId ? async (c) => { await this.runDeepen(this.store.currentSectionId, ownerBlockId, c, modal); } : undefined,
        undefined,
        foot ? () => { foot!.hidden = false; } : undefined));
    }
    if (foot) dialog.appendChild(foot);

    overlay.appendChild(dialog);
    MODAL_ROOT.appendChild(overlay);
    // Defer chart creation until the modal first opens — mounting in a hidden
    // dialog draws a blank/0-size chart.
    this.modalChartDefs.set(modal.id, ctx.charts);
  }

  /** Bloco de REVISÃO do detalhamento: ✓ Aprovar · ✎ Pedir revisão (comentário →
   *  regenera) · ★1–5. Tudo gravado em deepen_history; estado salvo é rebuscado
   *  lazy nas reaberturas. `revisar` é o caminho de regeração do contexto (modal
   *  itera via prev; seção det-* regenera a própria seção). */
  private buildRating(historyId: string, revisar?: (comentario: string) => Promise<void>, onDiscard?: () => Promise<void>, onApproved?: () => void): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'rate';
    const lbl = document.createElement('span');
    lbl.className = 'rate-lbl';
    lbl.textContent = 'Este detalhamento foi útil?';

    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'btn btn--sm rate-approve';
    approve.textContent = '✓ Aprovar';
    const setApproved = (): void => {
      approve.textContent = '✓ Aprovado';
      approve.classList.add('on');
      approve.disabled = true;
      onApproved?.();   // revela a caixa "ajustar/aprofundar" (só após aprovar)
    };
    approve.addEventListener('click', async () => {
      try { await this.api.approveDeepen(historyId); setApproved(); this.toast('Detalhamento aprovado.'); }
      catch (e) { this.toast(`Falha ao aprovar: ${(e as Error).message}`); }
    });

    const askRev = document.createElement('button');
    askRev.type = 'button';
    askRev.className = 'btn btn--sm';
    askRev.textContent = '✎ Pedir revisão';
    const rev = document.createElement('form');
    rev.className = 'rate-fb';
    rev.hidden = true;
    rev.innerHTML = '<input type="text" placeholder="o que revisar? (ex.: foque na faixa alta, troque o gráfico, explique a queda de set/25)" /><button type="submit" class="btn btn--sm btn--primary">Revisar</button>';
    askRev.addEventListener('click', () => { rev.hidden = !rev.hidden; if (!rev.hidden) (rev.querySelector('input') as HTMLInputElement).focus(); });
    rev.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inp = rev.querySelector('input') as HTMLInputElement;
      const c = inp.value.trim();
      if (!c || !revisar) return;
      rev.hidden = true;
      await revisar(c);   // server marca esta versão como revisada e gera a nova
    });

    const stars = document.createElement('div');
    stars.className = 'rate-stars';
    const fb = document.createElement('form');
    fb.className = 'rate-fb';
    fb.hidden = true;
    fb.innerHTML = '<input type="text" placeholder="comentário (opcional) — o que melhorar?" /><button type="submit" class="btn btn--sm">Salvar</button>';
    let current = 0;
    const paint = (n: number): void => {
      [...stars.children].forEach((s, i) => s.classList.toggle('on', i < n));
    };
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rate-star';
      b.textContent = '★';
      b.title = `${i} de 5`;
      b.addEventListener('click', async () => {
        current = i;
        paint(i);
        fb.hidden = false;
        try { await this.api.rateDeepen(historyId, i); }
        catch (e) { this.toast(`Falha ao avaliar: ${(e as Error).message}`); }
      });
      stars.appendChild(b);
    }
    fb.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inp = fb.querySelector('input') as HTMLInputElement;
      try {
        await this.api.rateDeepen(historyId, current || 5, inp.value.trim() || undefined);
        this.toast('Avaliação registrada — obrigado!');
        fb.hidden = true;
      } catch (err) { this.toast(`Falha ao avaliar: ${(err as Error).message}`); }
    });

    // estado salvo (reaberturas): pinta estrelas e estado de aprovação
    void this.api.getDeepenRatings([historyId]).then((r) => {
      const e = r.entries.find((x) => x.id === historyId);
      if (e?.rating) { current = e.rating; paint(e.rating); }
      if (e?.status === 'aprovado') setApproved();
    }).catch(() => { /* sem estado ainda */ });

    wrap.append(lbl, approve);
    if (revisar) wrap.append(askRev, rev);
    wrap.append(stars, fb);
    if (onDiscard) {
      const discard = document.createElement('button');
      discard.type = 'button';
      discard.className = 'btn btn--sm rate-discard';
      discard.textContent = '🗑 Descartar';
      discard.addEventListener('click', () => { void onDiscard(); });
      wrap.append(discard);
    }
    return wrap;
  }

  /** Open a modal; mount its charts on first open (and reflow once visible). */
  private openModal(id: string): void {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (!this.openedModals.has(id)) {
      this.openedModals.add(id);
      for (const { elId, def } of this.modalChartDefs.get(id) || []) this.modalCharts.create(elId, def);
    }
    requestAnimationFrame(() => this.modalCharts.reflow());
  }

  private resolveCtx(): RenderCtx {
    const charts: { elId: string; def: ChartDef }[] = [];
    return {
      charts,
      resolve: (bind?: Bind): ResolvedBind | null =>
        bind ? resolveBind(bind, this.store.datasets, this.store.active) : null,
    };
  }

  private wireModals(): void {
    document.addEventListener('click', e => {
      const opener = (e.target as HTMLElement).closest<HTMLElement>('[data-modal]');
      if (opener) { this.openModal(opener.dataset.modal!); return; }
      const closer = (e.target as HTMLElement).closest<HTMLElement>('[data-ic-close]');
      if (closer) { closeOverlay(closer.closest('.ic-overlay')); return; }
      if ((e.target as HTMLElement).classList.contains('ic-overlay')) closeOverlay(e.target as HTMLElement);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') for (const m of document.querySelectorAll('.ic-overlay.open')) closeOverlay(m);
    });
  }

  /* ───────────────────────────  Layout editor  ─────────────────────────── */

  private wireLayoutEditor(): void {
    document.getElementById('layout-edit-btn')?.addEventListener('click', () => void this.startEdit());
    document.getElementById('tn-edit-save')?.addEventListener('click', () => void this.finishEdit(true));
    document.getElementById('tn-edit-cancel')?.addEventListener('click', () => void this.finishEdit(false));
  }

  private async startEdit(): Promise<void> {
    if (!this.dashboard || this.editing) return;
    try {
      await this.dashboard.enterEditMode();
    } catch {
      this.toast('Não foi possível abrir o editor de layout');
      return;
    }
    this.editing = true;
    document.getElementById('layout-edit-btn')?.setAttribute('hidden', '');
    document.getElementById('tn-edit-actions')?.removeAttribute('hidden');
  }

  private async finishEdit(save: boolean): Promise<void> {
    if (!this.dashboard || !this.editing) return;
    const saveBtn = document.getElementById('tn-edit-save') as HTMLButtonElement | null;
    if (save && saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }
    try {
      await this.dashboard.exitEditMode(save);
      this.clearEditUI();
      const cur = this.store.getSection(this.store.currentSectionId);
      if (cur) this.markDeepen(cur); // editor rebuilt the tiles — re-pin deepen affordances
      if (save) this.toast('Layout salvo');
    } catch {
      this.toast('Erro ao salvar layout'); // editor stays open so the user can retry
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar'; }
    }
  }

  /** Drop the editor silently (navigation away while editing). The dashboard is
   *  about to be destroyed by renderSection, so no rebuild is needed here. */
  private abortEdit(): void {
    void this.dashboard?.exitEditMode(false);
    this.clearEditUI();
  }

  private clearEditUI(): void {
    this.editing = false;
    document.getElementById('tn-edit-actions')?.setAttribute('hidden', '');
    document.getElementById('layout-edit-btn')?.removeAttribute('hidden');
    document.getElementById('layout-edit-btn')?.classList.remove('active');
  }

  private async persistLayout(sectionId: string, items: LayoutItem[]): Promise<void> {
    const res = await this.api.putLayout(sectionId, items);
    this.store.layout = res.layout;
  }

  private toast(msg: string): void {
    const el = document.createElement('div');
    el.className = 'app-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2200);
  }

  /* ───────────────────────────  Standalone HTML export  ─────────────────────────── */

  /** Snapshot every section through the real render path (so charts get correct
   *  tile widths and heights), clone each, pin the measured heights inline, and
   *  serialize into one self-contained .html with the stylesheet inlined — opens
   *  offline, no server. A static snapshot of the report at the current filter. */
  private async exportHtml(): Promise<void> {
    const btn = document.getElementById('export-html-btn') as HTMLButtonElement | null;
    const label = btn?.querySelector('span');
    const prevLabel = label?.textContent ?? 'HTML';
    if (btn) btn.disabled = true;
    if (label) label.textContent = 'Gerando…';

    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    const saved = { p: this.store.currentPageId, s: this.store.currentSectionId };

    try {
      // Pin the live render to the export document's content width so charts mount
      // at the width they'll occupy in the snapshot (1920 − 144 padding = 1776) —
      // mesma largura máxima da análise ao vivo.
      const savedActive = { ...this.store.active };
      ROOT.style.width = '1920px';
      ROOT.style.maxWidth = 'none';
      ROOT.style.margin = '0 auto';

      // The export is interactive offline: paginated (page tabs) and filterable by
      // channel. Since the only filter is the channel toggle (≤3 values), we
      // pre-render each section once PER channel as a static snapshot and switch
      // panes with a tiny inline script — no data layer or chart lib needed.
      const fdef = this.store.filterDefs[0];
      const variants: (string | null)[] = fdef ? fdef.options.slice() : [null];
      // Perguntas norteadoras são ferramenta de trabalho do app (gerar detalhamentos),
      // não conteúdo do relatório — fora do HTML exportado (tabs e páginas).
      const pages = this.store.pages.filter(p => p.kind !== 'perguntas');

      const pinHeights = (host: Element, clone: HTMLElement): void => {
        const lt = host.querySelectorAll('.dash-tile'); const ct = clone.querySelectorAll<HTMLElement>('.dash-tile');
        lt.forEach((l, i) => { const h = l.getBoundingClientRect().height; if (h > 0 && ct[i]) ct[i].style.minHeight = `${Math.round(h)}px`; });
        const lw = host.querySelectorAll('.chart-wrap'); const cw = clone.querySelectorAll<HTMLElement>('.chart-wrap');
        lw.forEach((l, i) => { const h = l.getBoundingClientRect().height; if (h > 4 && cw[i]) cw[i].style.height = `${Math.round(h)}px`; });
      };

      // Charts re-render once per (section × channel); disable ApexCharts animation
      // app-wide so each render settles instantly instead of running a ~400ms tween
      // (turns a multi-minute export into a few seconds).
      const apexWin = window as unknown as { Apex?: unknown };
      const apexPrev = apexWin.Apex;
      apexWin.Apex = { chart: { animations: { enabled: false } } };
      // buildOptions sets animations.enabled explicitly, which overrides the global
      // window.Apex above — so flip the export flag too, or the bars never paint.
      setChartExportMode(true);

      // Wait until every chart in the freshly rendered section has actually drawn
      // its series (a fixed delay clones chart-heavy sections like the Panorama
      // before the 8 bars exist). Polls + nudges a resize; fast for light sections.
      // Settle on the count of drawn series elements rather than "every chart drawn".
      // A page can legitimately hold an empty chart (a criterion with no data in one
      // channel), which never gets a series — requiring all of them would burn the
      // full timeout on most sections. Instead nudge a resize, count drawn bars/paths
      // among VISIBLE canvases (inactive toggle panes are display:none and skipped),
      // and return once that count stops growing for two polls.
      const drawnCount = (): number => {
        let n = 0;
        for (const c of ROOT.querySelectorAll<HTMLElement>('.apexcharts-canvas')) {
          if (c.offsetParent === null) continue;
          n += c.querySelectorAll('.apexcharts-bar-area, .apexcharts-series path, .apexcharts-series rect').length;
        }
        return n;
      };
      const chartsReady = async (): Promise<void> => {
        const t0 = Date.now();
        let prev = -1, stable = 0;
        for (;;) {
          window.dispatchEvent(new Event('resize'));
          await delay(70);
          const visible = [...ROOT.querySelectorAll<HTMLElement>('.apexcharts-canvas')].some(c => c.offsetParent !== null);
          if (!visible) { await delay(40); return; }
          const n = drawnCount();
          if (n > 0 && n === prev) { if (++stable >= 2) { await delay(40); return; } }
          else stable = 0;
          prev = n;
          if (Date.now() - t0 > 1200) return;
        }
      };

      const total = variants.length * this.store.allSections().length;
      let done = 0;
      const byVar: Record<string, Record<string, string[]>> = {};
      for (const val of variants) {
        if (fdef) this.store.active[fdef.id] = val ?? '';
        const key = String(val);
        byVar[key] = {};
        for (const page of pages) {
          const secs: string[] = [];
          for (const sref of page.sections) {
            await this.go(page.id, sref.id);
            await chartsReady();
            const host = ROOT.firstElementChild as HTMLElement | null;
            if (host) {
              const clone = host.cloneNode(true) as HTMLElement;
              clone.classList.add('export-section');
              pinHeights(host, clone);
              clone.querySelectorAll('.tile-deepen, .tile-detail-link').forEach(n => n.remove());
              secs.push(clone.outerHTML);
            }
            if (label) label.textContent = `Gerando ${Math.round((++done / total) * 100)}%`;
          }
          byVar[key][page.id] = secs;
        }
      }
      apexWin.Apex = apexPrev;
      setChartExportMode(false);

      // Restore live filters + width, return to the user's view.
      for (const k of Object.keys(this.store.active)) if (!(k in savedActive)) delete this.store.active[k];
      Object.assign(this.store.active, savedActive);
      ROOT.style.width = ''; ROOT.style.maxWidth = ''; ROOT.style.margin = '';
      await this.go(saved.p, saved.s);

      const css = await fetch('/style.css').then(r => r.text()).catch(() => '');
      const apexCss = [...document.querySelectorAll('style')]
        .map(s => s.textContent || '').filter(t => /apexcharts/i.test(t)).join('\n');
      const logo = await fetch('/assets/witly-logo.png').then(r => r.blob()).then(blobToDataUrl).catch(() => '');
      const theme = document.documentElement.dataset.theme || 'light';
      const meta = this.store.data?.meta || {};
      const title = meta.title || meta.client || 'Relatório';
      // Sem filtro, variants = [null] → as panes ficam com data-canal="null"; o canal
      // padrão precisa casar com isso (senão apply() esconde tudo → export em branco).
      const defCanal = String(fdef ? (fdef.default ?? fdef.options[0] ?? '') : variants[0]);
      const firstPage = pages[0]?.id || '';

      const navTabs = pages.map(p => `<button class="exp-tab" data-page="${esc(p.id)}">${esc(p.label)}</button>`).join('');
      const navCanal = fdef
        ? `<div class="exp-canal-toggle">${variants.map(v => `<button class="exp-cbtn" data-canal-btn="${esc(String(v))}">${esc(String(v))}</button>`).join('')}</div>`
        : '';
      const body = variants.map(val => `
  <div class="exp-canal-pane" data-canal="${esc(String(val))}">
    ${pages.map(p => `<section class="exp-page" data-page="${esc(p.id)}"><div class="exp-root">${(byVar[String(val)][p.id] || []).join('\n')}</div></section>`).join('')}
  </div>`).join('');
      const runtime = `(function(){var canal=${JSON.stringify(defCanal)},page=${JSON.stringify(firstPage)};
function apply(){document.querySelectorAll('.exp-canal-pane').forEach(function(c){c.hidden=c.getAttribute('data-canal')!==canal;});
document.querySelectorAll('.exp-page').forEach(function(p){p.hidden=p.getAttribute('data-page')!==page;});
document.querySelectorAll('.exp-tab').forEach(function(t){t.classList.toggle('on',t.getAttribute('data-page')===page);});
document.querySelectorAll('.exp-cbtn').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-canal-btn')===canal);});window.scrollTo(0,0);}
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('.exp-tab');if(t){page=t.getAttribute('data-page');apply();return;}
var c=e.target.closest&&e.target.closest('.exp-cbtn');if(c){canal=c.getAttribute('data-canal-btn');apply();return;}});apply();})();`;

      const doc = `<!doctype html>
<html lang="pt-BR" data-theme="${esc(theme)}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
${css}
${apexCss}
body{margin:0}
.exp-nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;height:54px;padding:0 24px;background:var(--bg);border-bottom:1px solid var(--border);overflow-x:auto}
.exp-logo{height:22px;width:auto;display:block;flex-shrink:0}
.exp-bar-sep{width:1px;height:20px;background:var(--border);flex-shrink:0}
.exp-client{font-size:14px;font-weight:700;white-space:nowrap}
.exp-tabs{display:flex;gap:2px;margin-left:6px}
.exp-tab{font-size:12.5px;font-weight:600;color:var(--gray);background:none;border:none;padding:7px 12px;border-radius:7px;cursor:pointer;white-space:nowrap;font-family:inherit}
.exp-tab:hover{color:var(--fg);background:var(--surface)}
.exp-tab.on{color:var(--purple);background:var(--purple-bg)}
.exp-canal-toggle{margin-left:auto;display:flex;gap:2px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:2px;flex-shrink:0}
.exp-cbtn{font-size:12px;font-weight:600;color:var(--gray);background:none;border:none;padding:5px 12px;border-radius:7px;cursor:pointer;font-family:inherit}
.exp-cbtn.on{color:#fff;background:var(--purple)}
.exp-canal-pane[hidden],.exp-page[hidden]{display:none}
.exp-root{width:1920px;max-width:100%;margin:0 auto;padding:22px 72px 72px}
.exp-cover{width:1920px;max-width:100%;margin:0 auto;padding:8px 72px 0}
.exp-cover #report-header{padding:36px 24px 18px}
.export-section{margin-bottom:48px}
.export-section .dash-tile{overflow:hidden}
.export-section .apexcharts-canvas,.export-section .apexcharts-canvas svg{max-width:100%}
.export-section .sec-header{margin-top:0}
</style>
</head>
<body>
<nav class="exp-nav">
  <div style="display:flex;align-items:center;gap:14px">${logo ? `<img class="exp-logo" src="${logo}" alt="Witly">` : ''}<span class="exp-bar-sep"></span><span class="exp-client">${esc(meta.client || 'Relatório')}</span></div>
  <div class="exp-tabs">${navTabs}</div>
  ${navCanal}
</nav>
<div class="exp-cover">${this.coverHtml()}</div>
${body}
<script>${runtime}</script>
</body>
</html>`;

      const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.client}-${this.slug}`.replace(/[^a-z0-9._-]+/gi, '-') + '.html';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      this.toast('HTML exportado');
    } catch {
      this.toast('Erro ao exportar HTML');
    } finally {
      setChartExportMode(false);
      ROOT.style.width = ''; ROOT.style.maxWidth = ''; ROOT.style.margin = '';
      if (btn) btn.disabled = false;
      if (label) label.textContent = prevLabel;
    }
  }

  private watch(): void {
    this.api.watch(id => {
      this.store.dropSection(id);
      if (id === this.store.currentSectionId) {
        // Re-render por SSE não pode roubar a tela: preserva o scroll e reabre a
        // modal que estava aberta (no Windows o fs.watch dispara em dobro e o
        // segundo evento escapa do skipNextSSE, fechando a modal recém-criada).
        const openModal = document.querySelector('.ic-overlay.open')?.id || null;
        void this.go(this.store.currentPageId, id, true).then(() => {
          if (openModal) this.openModal(openModal);
        });
      }
    }, (msg) => this.setBusyMsg(msg));
  }

  /** Atualiza só o texto da tela de carregamento (estágio do detalhamento, via SSE)
   *  sem mexer na visibilidade — ignorado se o overlay não está visível ou se a tela
   *  de erro está à mostra. */
  private setBusyMsg(msg: string): void {
    if (!this.busyEl || this.busyEl.hidden) return;
    const load = this.busyEl.querySelector<HTMLElement>('.busy-load');
    if (!load || load.hidden) return;   // tela de erro à mostra → não sobrescreve
    const m = this.busyEl.querySelector('.busy-msg');
    if (m) m.textContent = msg;
  }
}

function closeOverlay(node: Element | null): void {
  if (!node) return;
  node.classList.remove('open');
  document.body.style.overflow = '';
}

const ESC_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function esc(s: unknown): string { return String(s ?? '').replace(/[&<>"]/g, c => ESC_MAP[c]); }

/** Blob → data: URL (used to inline the logo into the standalone export). */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/* ── boot ── */
const parts = location.pathname.split('/').filter(Boolean); // ["report", client, slug]
const client = decodeURIComponent(parts[1] || '');
const slug = decodeURIComponent(parts[2] || '');
if (client && slug) void new App(client, slug).start();
else ROOT.innerHTML = '<div style="padding:60px 56px"><p class="sm">URL inválida. Use /report/&lt;cliente&gt;/&lt;análise&gt;.</p></div>';
