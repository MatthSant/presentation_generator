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
import { ChartManager, setChartExportMode, chartCaptureStart, chartCaptureEnd, type ChartDef } from './charts.js';
import { PerguntasView } from './perguntas.js';
import { DeepenQueue } from './deepen-queue.js';
import { HistoricoFilters } from './historico-controls.js';
import { CriativosControls } from './criativos-controls.js';
import { DebriefingControls, type DebFilters } from './debriefing-controls.js';
import { resolveBind } from '../shared/bind.js';
import type { Bind, ResolvedBind, Modal, Section, LayoutItem, Pergunta, ReportMeta } from '../shared/types.js';

type ReportControls = NonNullable<ReportMeta['controls']>;
/** Contrato mínimo de um controle type-specific montado (o resto é interno à classe). */
interface TypeControls { setPage(pageId: string): void }

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
  private perguntas: PerguntasView | null = null;
  /** Instância do controle type-specific montado (registry por meta.controls.kind). */
  private typeControls: TypeControls | null = null;
  /** Current launch selection (null = full series) — drives the filtered-chart badge. */
  private histSel: string[] | null = null;
  private histLaunches: string[] | null = null;
  private histMetric = 'conv';
  /** Modo ativo da análise de criativos (resultado × captação) + filtros do FAB. */
  private histMode: string | undefined;
  private histMinInvest: number | undefined;
  private histTemp: string | null = null;
  /** Filtro nível-relatório do debriefing (FAB): tipo/canal/temp/campanha/publico/criativo. */
  private debFilters: DebFilters | null = null;
  /** Fila NÃO-bloqueante de aprofundamentos/detalhamentos (painel canto inf. esq.). */
  private queue: DeepenQueue;

  /** Registry dos controles interativos por meta.controls.kind (o kind vem do
   *  typeRegistry do servidor). Tipo novo com controles = classe *-controls.ts +
   *  UMA entrada aqui — mount instancia o FAB e body monta o payload do POST /render. */
  private readonly controlsRegistry: Record<string, {
    mount: (controls: ReportControls) => TypeControls | null;
    body: () => Record<string, unknown>;
  }> = {
    // Criativos: MODO (resultado × captação) é um toggle na navbar (como o compare
    // do debriefing); o FAB fica só com investimento mínimo + temperatura. O TIPO de
    // campanha não é filtro aqui: é escolhido na criação (a análise já nasce recortada).
    'criativos': {
      mount: (controls) => {
        const cc = controls as { mode?: string; modes?: Array<{ id: string; label: string }> };
        this.histMode = cc.mode || cc.modes?.[0]?.id || 'resultado';
        if (cc.modes?.length) this.setupNavToggle('mode-toggle', cc.modes, this.histMode, (id) => { this.histMode = id; void this.recompute(); });
        return new CriativosControls(controls, {
          apply: (o) => { this.histMinInvest = o.minInvest || undefined; this.histTemp = o.temp; void this.recompute(); },
        });
      },
      body: () => ({ mode: this.histMode, min_invest: this.histMinInvest, temp: this.histTemp || undefined }),
    },
    // Debriefing: filtro nível-relatório (multi-seleção por dimensão) → recompute.
    'debriefing-lancamento': {
      mount: (controls) => {
        if (!(controls as { filters?: unknown[] }).filters?.length) return null;
        return new DebriefingControls(controls, {
          apply: (f) => { this.debFilters = Object.keys(f).length ? f : null; void this.recompute(); },
        });
      },
      body: () => ({ filters: this.debFilters || {} }),
    },
    // Histórico: pílulas de lançamento + toggle de indicador (inline no Panorama).
    'historico-lancamentos': {
      mount: (controls) => {
        this.histMetric = controls.metrics[0]?.id || 'conv';
        const total = controls.launches.length;
        // Indicator selector lives inline on the Panorama page (a metric-toggle widget);
        // changing it recomputes only the metric-driven breakdown below.
        document.addEventListener('metric-change', (e) => {
          this.histMetric = (e as CustomEvent<string>).detail;
          void this.recompute();
        });
        return new HistoricoFilters(controls, {
          apply: (l) => { this.histLaunches = (l.length >= total || l.length === 0) ? null : l; void this.recompute(); },
        });
      },
      body: () => ({ launches: this.histLaunches, metric: this.histMetric }),
    },
  };

  constructor(private client: string, private slug: string) {
    this.api = new Api(client, slug);
    this.nav = new Navigation(this.store, (p, s) => void this.go(p, s));
    this.queue = new DeepenQueue({
      onToast: (m) => this.toast(m),
      onError: (e, retry) => this.showDeepenError(e, retry),
    });
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
      const m = (data.meta || {}) as { client?: string; client_name?: string; campaign_label?: string; title?: string; report_type?: string; controls?: { kind?: string } };
      const TYPE_LABELS: Record<string, string> = {
        'acompanhamento-lancamento': 'Acompanhamento de Campanha',
        'debriefing-lancamento': 'Debriefing de Lançamento',
        'historico-lancamentos': 'Histórico de Lançamentos',
        'conversao-perfil': 'Conversão por Perfil',
        'criativos': 'Análise de Criativos',
      };
      const cliente = m.client_name || m.client || '';
      const tipo = TYPE_LABELS[m.controls?.kind || ''] || TYPE_LABELS[m.report_type || ''] || '';
      const campanha = m.campaign_label || this.slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '';
      const crumbs = [cliente, tipo, campanha].filter(Boolean);
      brand.innerHTML = crumbs.length > 1
        ? crumbs.map((c, i) => i === crumbs.length - 1
            ? `<b class="tn-cur">${esc(c)}</b>`
            : `<span class="tn-crumb">${esc(c)}</span><span class="tn-sep">/</span>`).join('')
        : esc(crumbs[0] || '');
    }
    // Chip "Dados até DD/MM" na navbar (último dia de dado) — só quando o tipo informa.
    const dataAte = (data.meta as { data_ate?: string } | undefined)?.data_ate;
    const topnav = document.getElementById('topnav');
    document.getElementById('tn-live')?.remove();
    if (dataAte && topnav) {
      const live = document.createElement('span');
      live.id = 'tn-live'; live.className = 'tn-live';
      live.innerHTML = `<span class="tn-live-dot"></span>Dados até ${esc(dataAte)}`;
      topnav.insertBefore(live, topnav.querySelector('.tn-right'));
    }
    this.setupHistorico();
    // Cards clicáveis (link-card) → navegam para uma seção (ficha).
    document.addEventListener('goto-section', (e) => {
      const d = (e as CustomEvent<{ page?: string; section: string }>).detail;
      if (d?.section) void this.go(d.page || this.store.currentPageId, d.section);
    });

    this.nav.build();
    if (!this.typeControls) { this.filters = new Filters(this.store, () => { this.dashboard?.applyFilters(); }); this.filters.init(); }
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

    this.typeControls?.setPage(pageId);

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
      const rt = this.buildRating(section.historyId, (c) => this.revisarDetSection(section.id, c), async (motivo) => {
        try {
          await this.api.descartarDet(section.id, motivo);
          this.removeDetSection(section.id);
          this.toast('Aprofundamento descartado.');
        } catch (e) {
          this.toast(`Falha ao descartar: ${(e as Error).message}`);
        }
      }, undefined, 'aprofundamento');
      rt.classList.add('rate--section');
      host.appendChild(rt);
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

  /** Monta o controle interativo do tipo (registry por meta.controls.kind). */
  private setupHistorico(): void {
    const controls = this.store.data?.meta?.controls;
    if (!controls) return;
    // Feature de plataforma (qualquer tipo): toggle vs Meta / vs Histórico nos badges
    // de KPI que trazem `cmp`. Independe do `kind`.
    if ((controls as { compare?: string }).compare) this.setupCompare();
    this.typeControls = this.controlsRegistry[controls.kind || '']?.mount(controls) ?? null;
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

  /** Segmented genérico na navbar (mesmo visual do compare) que dispara `onChange`
   *  ao trocar de opção — recurso de plataforma. Usado pelo MODO de criativos. */
  private setupNavToggle(id: string, opts: Array<{ id: string; label: string }>, current: string, onChange: (id: string) => void): void {
    const right = document.querySelector('.tn-right');
    if (!right || document.getElementById(id)) return;
    const wrap = document.createElement('div');
    wrap.id = id;
    wrap.className = 'cmp-toggle';
    for (const o of opts) {
      const b = document.createElement('button');
      b.className = 'cmp-btn' + (o.id === current ? ' on' : '');
      b.textContent = o.label;
      b.addEventListener('click', () => {
        if (b.classList.contains('on')) return;
        wrap.querySelectorAll('.cmp-btn').forEach((x) => x.classList.toggle('on', x === b));
        onChange(o.id);
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
      const body = this.controlsRegistry[kind || '']?.body() ?? {};
      const r = await this.api.renderView(body);
      this.store.datasets = r.dataset;
      for (const sid of Object.keys(r.sections)) this.store.putSection(r.sections[sid]);
      this.store.layout = { ...this.store.layout, sections: { ...this.store.layout.sections, ...r.layout } };
      // O filtro pode mudar QUAIS seções existem (ex.: criativos fora do investimento
      // mínimo somem) → a nav precisa acompanhar. Mescla por id: as páginas que vivem
      // no disco (Aprofundamentos, Perguntas) não vêm do assemble e ficam como estão.
      if (r.pages?.length) {
        const fresh = new Map(r.pages.map((p) => [p.id, p]));
        this.store.data.pages = this.store.pages.map((p) => fresh.get(p.id) || p);
        this.nav.build();
      }
      // A seção aberta pode ter sumido no novo recorte — cai para a 1ª disponível.
      const cur = this.store.currentSectionId;
      const stillThere = this.store.pages.some((p) => p.sections.some((s) => s.id === cur));
      const target = stillThere ? cur : (this.store.page(this.store.currentPageId)?.sections[0]?.id || cur);
      await this.go(this.store.currentPageId, target, true);
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

  /** Diálogo de erro de um job REPROVADO da fila (não bloqueia): mesmo detalhamento
   *  de motivos/sugestões do overlay antigo, com "Rerodar". Aberto pelo botão
   *  "Detalhes" de um job com erro no painel da fila. */
  private showDeepenError(error: unknown, onRetry: () => void): void {
    const e = error as { message?: string; blocking?: string[]; suggestions?: string[]; code?: string };
    let inner: string;
    if (e?.code === 'no_credit') {
      inner = `<div class="busy-err-title">⚠ Sem crédito na API</div>
        <p class="busy-err-sub">${esc(e.message || 'Recarregue o crédito da API da Anthropic (Plans & Billing) para gerar conteúdo com IA.')}</p>`;
    } else {
      const msg = e?.message || String(error || '');
      const sep = msg.indexOf('—');
      const head = (sep >= 0 ? msg.slice(0, sep) : msg).trim();
      const blocking = (e?.blocking && e.blocking.length) ? e.blocking
        : (sep >= 0 ? msg.slice(sep + 1) : '').split(/;\s*/).map(s => s.trim()).filter(Boolean);
      const suggestions = e?.suggestions || [];
      inner = `<div class="busy-err-title">Não foi possível gerar com a IA</div>
        <p class="busy-err-sub">${esc(head || 'Falha na geração.')}</p>
        ${blocking.length ? `<div class="busy-err-block"><div class="busy-err-lbl busy-err-lbl-err">O que reprovou (erros)</div><ul class="busy-err-issues">${blocking.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>` : ''}
        ${suggestions.length ? `<div class="busy-err-sug"><div class="busy-err-lbl">Sugestões (não impediram a entrega)</div><ul class="busy-err-suglist">${suggestions.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>` : ''}`;
    }
    const dlg = document.createElement('dialog');
    dlg.className = 'deepen-dlg';
    dlg.innerHTML = `<div class="busy-err" style="border:none;box-shadow:none;padding:2px 2px 0;max-width:none">${inner}
      <div class="busy-err-actions"><button type="button" class="busy-err-close">Fechar</button><button type="button" class="busy-err-retry">↻ Rerodar</button></div></div>`;
    document.body.appendChild(dlg);
    dlg.querySelector<HTMLButtonElement>('.busy-err-close')!.onclick = () => dlg.close();
    dlg.querySelector<HTMLButtonElement>('.busy-err-retry')!.onclick = () => { dlg.close(); onRetry(); };
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
  }

  /** Follow a question: the server generates its detalhamento as a new section on
   *  the Detalhamentos page; the queue refreshes the nav; "Ver" jumps to it. */
  private seguirPergunta(p: Pergunta): void {
    const view = this.currentView();
    this.queue.add({
      kind: 'aprofundamento',
      label: 'Aprofundamento',
      sub: p.pergunta,
      run: async () => {
        const r = await this.api.seguirPergunta(p.id, view);
        // The nav map changed (new section, maybe a new page) → reload + rebuild,
        // mas SEM roubar a tela do usuário (só o botão "Ver" navega).
        this.store.data = await this.api.getData();
        this.store.datasets = await this.api.getDataset().catch(() => this.store.datasets);
        this.nav.build();
        this.nav.setActive(this.store.currentPageId, this.store.currentSectionId);
        if (this.store.page(this.store.currentPageId)?.kind === 'perguntas') void this.renderPerguntas();
        return {
          toast: r.mocked ? 'Aprofundamento criado (modo mock)' : 'Aprofundamento criado',
          view: () => void this.go(r.pageId, r.sectionId),
        };
      },
    });
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
      <div class="deepen-hd">
        <span class="deepen-hd-ic">${App.WAND}</span>
        <div class="deepen-hd-tx">
          <h3>Adicionar pergunta</h3>
          <p class="deepen-hd-sub">Vira um aprofundamento na hora, sobre a análise inteira (sem cálculo de relevância).</p>
        </div>
      </div>
      <label class="deepen-field">
        <span class="deepen-lbl">Sua pergunta</span>
        <textarea placeholder="Ex.: A receita de Online cresce mais rápido que a de Loja ao longo dos meses?"></textarea>
      </label>
      ${App.IMPROVE_ROW}
      <div class="deepen-actions">
        <button value="cancel" class="deepen-btn ghost" type="submit">Cancelar</button>
        <button value="go" class="deepen-btn" type="submit">Criar aprofundamento</button>
      </div></form>`;
    document.body.appendChild(dlg);
    const ta = dlg.querySelector('textarea')!;
    this.wireImprove(dlg, ta);   // pergunta da análise inteira (sem bloco)
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

  private criarPerguntaCustom(text: string): void {
    const view = this.currentView();
    this.queue.add({
      kind: 'aprofundamento',
      label: 'Aprofundamento',
      sub: text,
      run: async () => {
        const r = await this.api.addCustomPergunta(text, view);
        this.store.data = await this.api.getData();
        this.store.datasets = await this.api.getDataset().catch(() => this.store.datasets);
        this.nav.build();
        this.nav.setActive(this.store.currentPageId, this.store.currentSectionId);
        if (this.store.page(this.store.currentPageId)?.kind === 'perguntas') void this.renderPerguntas();
        return {
          toast: r.mocked ? 'Aprofundamento criado (modo mock)' : 'Aprofundamento criado',
          view: () => void this.go(r.pageId, r.sectionId),
        };
      },
    });
  }

  /** Content widget types worth deepening (skips eyebrows, notes, kpi strips). */
  // Todo widget que CARREGA DADO é detalhável (não os puramente textuais/rótulo:
  // highlight, find-note, ni, eyebrow, label-sec).
  private static DEEPENABLE = new Set(['find-block', 'chart', 'table', 'heatmap', 'rank-card',
    'heatmap-toggle', 'chart-toggle', 'chart-table', 'kpi', 'kpi-card', 'kpi-strip', 'qa-card',
    'funnel', 'evolution-picker', 'scatter-picker', 'metric-toggle', 'bar-list', 'cri-list', 'bullet-groups', 'quadrant-scatter']);
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
      // Assunto do bloco: title, senão label/ind/name (kpi-cards usam `label`, ex.:
      // "Atingimento · Leads") — sem isso a pill do composer fica vazia e o deepen perde a âncora.
      const wl = w as { title?: string; label?: string; ind?: string; name?: string };
      const title = wl.title || wl.label || wl.ind || wl.name || '';
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
      <div class="deepen-hd">
        <span class="deepen-hd-ic">${App.WAND}</span>
        <div class="deepen-hd-tx">
          <h3>Detalhar bloco</h3>
          <p class="deepen-hd-sub">Peça um aprofundamento com IA sobre este bloco.</p>
        </div>
      </div>
      ${cardTitle ? `<p class="deepen-card" data-lbl="Bloco">${esc(cardTitle)}</p>` : ''}
      <label class="deepen-field">
        <span class="deepen-lbl">O que você quer aprofundar?</span>
        <textarea placeholder="Ex.: mostre a variação por faixa de renda ao longo dos lançamentos."></textarea>
      </label>
      ${App.IMPROVE_ROW}
      <div class="deepen-actions">
        <button value="cancel" class="deepen-btn ghost" type="submit">Cancelar</button>
        <button value="go" class="deepen-btn" type="submit">Gerar detalhamento</button>
      </div></form>`;
    document.body.appendChild(dlg);
    const ta = dlg.querySelector('textarea')!;
    this.wireImprove(dlg, ta, secId, blockId);
    dlg.addEventListener('close', () => {
      const prompt = ta.value.trim();
      const go = dlg.returnValue === 'go';
      dlg.remove();
      if (!go || !prompt) return;
      this.runDeepen(secId, blockId, prompt, undefined, cardTitle);
    });
    dlg.showModal();
    ta.focus();
  }

  /** Linha de ferramentas dos composers: botão "Melhorar pergunta" + nota de status. */
  private static IMPROVE_ROW = '<div class="deepen-tools"><button type="button" class="deepen-improve">✨ Melhorar pergunta</button><span class="deepen-improve-note" hidden></span></div>';

  /** Liga o botão "✨ Melhorar": reescreve a pergunta atual (ancorada no bloco, se
   *  houver) via IA barata e substitui o textarea p/ o consultor revisar/editar
   *  antes de gerar. Passo opcional — não bloqueia o "Gerar". */
  private wireImprove(dlg: HTMLElement, ta: HTMLTextAreaElement, secId?: string, blockId?: string): void {
    const btn = dlg.querySelector<HTMLButtonElement>('.deepen-improve');
    const note = dlg.querySelector<HTMLElement>('.deepen-improve-note');
    if (!btn || !note) return;
    const setNote = (msg: string): void => { note.hidden = false; note.textContent = msg; };
    btn.addEventListener('click', async () => {
      const cur = ta.value.trim();
      if (!cur) { setNote('Escreva a pergunta primeiro.'); return; }
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = '✨ Melhorando…';
      note.hidden = true;
      try {
        const r = await this.api.rewriteDeepen(cur, secId, blockId);
        ta.value = r.rewritten;
        ta.focus();
        setNote(r.mocked ? 'Sugestão (mock) — revise e gere.' : 'Pergunta melhorada — revise e gere.');
      } catch {
        setNote('Não foi possível melhorar agora — gere com a sua pergunta.');
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });
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
      <div class="deepen-hd">
        <span class="deepen-hd-ic">${App.PENCIL}</span>
        <div class="deepen-hd-tx">
          <h3>Pedir revisão do bloco</h3>
          <p class="deepen-hd-sub">Ajuste escopado a este bloco — regenera com o seu pedido.</p>
        </div>
      </div>
      <p class="deepen-card" data-lbl="Bloco">${esc(blockTitle || 'este bloco')}</p>
      <label class="deepen-field">
        <span class="deepen-lbl">O que mudar neste bloco?</span>
        <textarea placeholder="Ex.: troque este gráfico por uma comparação X × Y ao longo dos dias."></textarea>
      </label>
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
  private revisarDetSection(sectionId: string, comentario: string): void {
    const pageId = this.store.currentPageId;
    this.queue.add({
      kind: 'revisao',
      label: 'Revisão do aprofundamento',
      sub: comentario,
      run: async () => {
        await this.api.revisarDet(sectionId, comentario);
        this.store.dropSection(sectionId);
        if (this.store.currentSectionId === sectionId) await this.go(this.store.currentPageId, sectionId, true);
        return { toast: 'Aprofundamento revisado', view: () => void this.go(pageId, sectionId) };
      },
    });
  }

  /** Enfileira um detalhamento de bloco. `sub` = rótulo humano (título do card).
   *  Não bloqueia: o job roda em 2º plano e o botão "Ver" abre o modal quando pronto. */
  /** Estado atual dos controles relevante pro deepen (fase da campanha etc.).
   *  Capturado na hora da PERGUNTA, não da execução — a fila pode rodar depois
   *  de o consultor trocar o toggle. */
  private currentView(): Record<string, unknown> | undefined {
    return this.histMode ? { mode: this.histMode } : undefined;
  }

  private runDeepen(secId: string, blockId: string, prompt: string, prev?: unknown, sub?: string): void {
    const pageId = this.store.currentPageId;
    const view = this.currentView();
    this.queue.add({
      kind: 'detalhamento',
      label: prev ? 'Ajuste de detalhamento' : 'Detalhamento',
      sub: sub || prompt,
      run: async () => {
        const r = await this.api.deepen(secId, blockId, prompt, prev, view);
        // Deep mode added new aggregate tables → refresh the dataset before re-render.
        if (r.datasetChanged) this.store.datasets = await this.api.getDataset();
        this.store.dropSection(secId);
        // Se o usuário está VENDO a seção do bloco, re-renderiza p/ a varinha virar
        // "ver detalhe" (sem abrir o modal — não rouba a leitura).
        if (this.store.currentSectionId === secId && this.store.currentPageId === pageId) {
          await this.go(pageId, secId, true);
        }
        return {
          toast: r.mocked ? 'Detalhamento criado (modo mock)' : 'Detalhamento criado',
          view: async () => { await this.go(pageId, secId); this.openModal(r.modal.id); },
        };
      },
    });
  }

  private headerEl(section: Section): HTMLElement {
    const h = section.header || { title: '' };
    const wrap = document.createElement('header');
    wrap.className = 'sec-header';
    // No modo sidebar o masthead some (contexto já no breadcrumb + item ativo) — mas isso
    // só vale quando o item do nav É o título. Quando o motor declara um `title` à parte,
    // o label é abreviação de nav e o título é CONTEÚDO: num aprofundamento ele é a
    // pergunta feita, e o sub é a resposta. Some do nav, tem de aparecer na página.
    if (this.store.sectionRef(section.id)?.title) wrap.classList.add('sec-header--keep');
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
      const secForModal = this.store.currentSectionId;
      dialog.appendChild(this.buildRating(modal.historyId,
        ownerBlockId ? async (c) => { await this.runDeepen(this.store.currentSectionId, ownerBlockId, c, modal); } : undefined,
        ownerBlockId ? async (motivo) => {
          try {
            await this.api.descartarModal(secForModal, ownerBlockId, motivo);
            closeOverlay(overlay);
            this.store.dropSection(secForModal);
            await this.go(this.store.currentPageId, secForModal, true);
            this.toast('Detalhamento descartado.');
          } catch (e) { this.toast(`Falha ao descartar: ${(e as Error).message}`); }
        } : undefined,
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
  // `noun` = "detalhamento" (bloco do relatório) ou "aprofundamento" (board de
  // perguntas) — o rodapé de rating serve os dois fluxos; a nomenclatura segue a origem.
  private buildRating(historyId: string, revisar?: (comentario: string) => void | Promise<void>, onDiscard?: (motivo: string) => void | Promise<void>, onApproved?: () => void, noun: 'detalhamento' | 'aprofundamento' = 'detalhamento'): HTMLElement {
    const Noun = noun[0].toUpperCase() + noun.slice(1);
    const wrap = document.createElement('div');
    wrap.className = 'rate';
    const lbl = document.createElement('span');
    lbl.className = 'rate-lbl';
    lbl.textContent = `Este ${noun} foi útil?`;

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
      try { await this.api.approveDeepen(historyId); setApproved(); this.toast(`${Noun} aprovado.`); }
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
      // Descartar SEMPRE pede o motivo (sinal de qualidade): abre um form curto;
      // sem motivo não descarta (o "porquê" é o ponto).
      const df = document.createElement('form');
      df.className = 'rate-fb rate-discard-fb';
      df.hidden = true;
      df.innerHTML = `<input type="text" placeholder="por que descartar? (ex.: fugiu do tema, dado errado, não acrescenta)" /><button type="submit" class="btn btn--sm rate-discard-go">Descartar</button>`;
      discard.addEventListener('click', () => { df.hidden = !df.hidden; if (!df.hidden) (df.querySelector('input') as HTMLInputElement).focus(); });
      df.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inp = df.querySelector('input') as HTMLInputElement;
        const motivo = inp.value.trim();
        if (!motivo) { inp.focus(); return; }
        df.hidden = true;
        await onDiscard(motivo);
      });
      wrap.append(discard, df);
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

      // O export é um app offline de uma seção por vez: sidebar de navegação
      // (páginas → seções), toggle de canal e GRÁFICOS INTERATIVOS. Cada seção é
      // pré-renderizada PELA VIA REAL uma vez por canal; capturamos o ChartDef de
      // cada gráfico (estrutura de dados com os valores JÁ resolvidos — sem dataset/
      // bind/cálculo) e embutimos um buildOptions empacotado + o ApexCharts real,
      // que remonta cada chart com hover/tooltip no HTML estático.
      const fdef = this.store.filterDefs[0];
      const variants: (string | null)[] = fdef ? fdef.options.slice() : [null];
      // Perguntas norteadoras são ferramenta de trabalho do app (gerar detalhamentos),
      // não conteúdo do relatório — fora do HTML exportado (tabs e páginas).
      const pages = this.store.pages.filter(p => p.kind !== 'perguntas');

      // Registro global de ChartDefs baked. serializeDef dropa funções (formatters
      // do dual-evolution) — o resto do def é JSON puro; buildOptions reconstrói os
      // formatters a partir de valueFormat/pct no runtime.
      const chartDefs: Record<string, unknown> = {};
      let chartSeq = 0;
      const serializeDef = (def: unknown): unknown =>
        JSON.parse(JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v)));
      // Marca cada elemento-host de chart no DOM VIVO (antes de clonar) com data-xc=N
      // + a altura medida, e guarda o def em chartDefs[N]. O clone herda os atributos.
      const stampCharts = (scope: HTMLElement, caps: Array<{ id: string; def: ChartDef }>): void => {
        for (const { id, def } of caps) {
          const live = scope.querySelector<HTMLElement>(`[id="${id}"]`);
          if (!live) continue;
          const n = String(chartSeq++);
          live.setAttribute('data-xc', n);
          const hh = Math.round(live.getBoundingClientRect().height);
          if (hh > 4) live.setAttribute('data-xh', String(hh));
          chartDefs[n] = serializeDef(def);
        }
      };
      // No clone: esvazia o SVG desenhado (o runtime remonta um ApexCharts real) e
      // fixa a altura medida p/ o container não colapsar antes do mount.
      const clearDrawn = (clone: HTMLElement): void => {
        clone.querySelectorAll<HTMLElement>('[data-xc]').forEach(e => {
          const h = Number(e.getAttribute('data-xh')) || (chartDefs[e.getAttribute('data-xc') || ''] as { height?: number } | undefined)?.height || 320;
          e.innerHTML = '';
          e.classList.remove('apexcharts-canvas');
          e.style.minHeight = `${h}px`;
        });
      };

      const pinHeights = (host: Element, clone: HTMLElement): void => {
        const lt = host.querySelectorAll('.dash-tile'); const ct = clone.querySelectorAll<HTMLElement>('.dash-tile');
        lt.forEach((l, i) => { const h = l.getBoundingClientRect().height; if (h > 0 && ct[i]) ct[i].style.minHeight = `${Math.round(h)}px`; });
        const lw = host.querySelectorAll('.chart-wrap'); const cw = clone.querySelectorAll<HTMLElement>('.chart-wrap');
        lw.forEach((l, i) => { const h = l.getBoundingClientRect().height; if (h > 4 && cw[i]) cw[i].style.height = `${Math.round(h)}px`; });
      };

      // Tira do clone as affordances interativas que NÃO funcionam num HTML estático
      // (só mostrariam botões mortos): remover-outliers, criar/revisar deepen, os toggles
      // de chart/heatmap (a pane ativa fica) e os seletores dos pickers. A varinha que
      // ABRE o modal (.tile-detail-link) é preservada — ela funciona via runtime.
      const stripControls = (root: HTMLElement): void => {
        root.querySelectorAll('.tile-outlier, .tile-deepen, .tile-revisar, .ic-deepen, .rate, .seg--soft, .sp-ctrls, .sp-sel, .sp-dimtog').forEach(n => n.remove());
        root.querySelectorAll('.seg:not(.seg--soft)').forEach(n => (n.closest('.dash-tile') || n).remove());   // metric-toggle
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
      const drawnCount = (root: ParentNode): number => {
        let n = 0;
        for (const c of root.querySelectorAll<HTMLElement>('.apexcharts-canvas')) {
          if (c.offsetParent === null) continue;
          n += c.querySelectorAll('.apexcharts-bar-area, .apexcharts-series path, .apexcharts-series rect').length;
        }
        return n;
      };
      const chartsReady = async (root: ParentNode = ROOT): Promise<void> => {
        const t0 = Date.now();
        let prev = -1, stable = 0;
        for (;;) {
          window.dispatchEvent(new Event('resize'));
          await delay(70);
          const visible = [...root.querySelectorAll<HTMLElement>('.apexcharts-canvas')].some(c => c.offsetParent !== null);
          if (!visible) { await delay(40); return; }
          const n = drawnCount(root);
          if (n > 0 && n === prev) { if (++stable >= 2) { await delay(40); return; } }
          else stable = 0;
          prev = n;
          if (Date.now() - t0 > 1200) return;
        }
      };

      const total = variants.length * this.store.allSections().length;
      let done = 0;
      // secHtml[canal][secId] = HTML clonado da seção; navList = ordem das seções
      // (montada no 1º canal) para a árvore lateral e as divs de conteúdo.
      const secHtml: Record<string, Record<string, string>> = {};
      const navList: Array<{ pageId: string; secId: string; label: string }> = [];
      // Detalhamentos de bloco (varinha → modal .ic-overlay). Capturados UMA vez (1º
      // canal) com os gráficos montados; a varinha é mantida e um runtime abre/fecha
      // o modal no HTML estático, como no app. Aprofundamentos da página entram como
      // seções normais (árvore lateral).
      const modalHtml: string[] = [];
      for (const val of variants) {
        if (fdef) this.store.active[fdef.id] = val ?? '';
        const key = String(val);
        secHtml[key] = {};
        for (const page of pages) {
          for (const sref of page.sections) {
            chartCaptureStart();
            await this.go(page.id, sref.id);
            await chartsReady();
            const caps = chartCaptureEnd();
            const host = ROOT.firstElementChild as HTMLElement | null;
            if (host) {
              stampCharts(host, caps);
              const clone = host.cloneNode(true) as HTMLElement;
              clone.classList.add('export-section');
              pinHeights(host, clone);
              stripControls(clone);   // mantém a varinha (.tile-detail-link → abre o modal)
              clearDrawn(clone);      // esvazia charts p/ o runtime remontar interativo
              secHtml[key][sref.id] = clone.outerHTML;
              if (val === variants[0]) navList.push({ pageId: page.id, secId: sref.id, label: sref.label });
            }
            // captura os modais da seção (só no 1º canal — o conteúdo é o mesmo).
            if (val === variants[0]) {
              for (const ov of MODAL_ROOT.querySelectorAll<HTMLElement>('.ic-overlay')) {
                chartCaptureStart();
                this.openModal(ov.id);
                await chartsReady(ov);
                const mcaps = chartCaptureEnd();
                stampCharts(ov, mcaps);
                const mc = ov.cloneNode(true) as HTMLElement;
                mc.classList.remove('open');
                pinHeights(ov, mc);
                stripControls(mc);
                clearDrawn(mc);
                modalHtml.push(mc.outerHTML);
                ov.classList.remove('open');
              }
              document.body.style.overflow = '';
            }
            if (label) label.textContent = `Gerando ${Math.round((++done / total) * 100)}%`;
          }
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
      // Tipografia da marca EMBUTIDA: o fonts.css é um @import do Google Fonts, que
      // exige internet — offline o relatório caía na fonte de fallback. No export
      // (online) buscamos o CSS do Google, filtramos os subsets latin/latin-ext e
      // embutimos cada woff2 como data: URI → fidelidade offline real. Fallback: o
      // @import original se algo falhar (CORS/offline no momento do export).
      const rawFontsCss = await fetch('/fonts.css').then(r => r.text()).catch(() => '');
      const embedFonts = async (): Promise<string> => {
        const im = rawFontsCss.match(/@import\s+url\(['"]?([^'")]+)['"]?\)/);
        if (!im) return rawFontsCss;
        try {
          const gcss = await fetch(im[1]).then(r => r.text());
          const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g;
          const faces: string[] = [];
          const jobs: Array<Promise<void>> = [];
          let mm: RegExpExecArray | null;
          while ((mm = re.exec(gcss))) {
            const subset = mm[1], face = mm[2];
            if (subset !== 'latin' && subset !== 'latin-ext') continue;   // pt-BR
            const um = face.match(/url\(([^)]+)\)/);
            if (!um) continue;
            const url = um[1].replace(/['"]/g, '');
            const idx = faces.length; faces.push('');
            jobs.push(fetch(url).then(r => r.blob()).then(blobToDataUrl)
              .then(dataUrl => { faces[idx] = `@font-face{${face.replace(/url\([^)]+\)/, `url(${dataUrl})`)}}`; })
              .catch(() => { faces[idx] = ''; }));
          }
          await Promise.all(jobs);
          const out = faces.filter(Boolean).join('\n');
          return out || rawFontsCss;
        } catch { return rawFontsCss; }
      };
      const fontsCss = await embedFonts();
      const apexCss = [...document.querySelectorAll('style')]
        .map(s => s.textContent || '').filter(t => /apexcharts/i.test(t)).join('\n');
      const logo = await fetch('/assets/witly-logo.png').then(r => r.blob()).then(blobToDataUrl).catch(() => '');
      // Gráficos interativos: empacota buildOptions (charts.js só depende de trend.js;
      // tipos são apagados) + o ApexCharts real. Strip de import/export → escopo do IIFE.
      const strip = (js: string): string => js.replace(/^\s*import[^\n]*\n/gm, '').replace(/^\s*export\s+/gm, '');
      const [chartsJs, trendJs, apexJs] = await Promise.all([
        fetch('/js/client/charts.js').then(r => r.text()).catch(() => ''),
        fetch('/js/client/trend.js').then(r => r.text()).catch(() => ''),
        fetch('/vendor/apexcharts.min.js').then(r => r.text()).catch(() => ''),
      ]);
      const noClose = (s: string): string => s.replace(/<\/script>/gi, '<\\/script>');
      const chartBundle = `(function(){\n${strip(trendJs)}\n${strip(chartsJs)}\nwindow.__buildOptions=buildOptions;\n})();`;

      const theme = document.documentElement.dataset.theme || 'light';
      const meta = this.store.data?.meta as { client?: string; client_name?: string; title?: string } || {};
      const title = meta.title || meta.client || 'Relatório';
      const clientName = meta.client_name || meta.client || '';
      const initials = clientName.split(/[-\s_]+/).map(s => s[0] || '').join('').slice(0, 2).toUpperCase() || 'W';
      // Sem filtro, variants = [null] → o canal padrão é "null" (casa com data-canal).
      const defCanal = String(fdef ? (fdef.default ?? fdef.options[0] ?? '') : variants[0]);
      const coverHtml = this.coverHtml();
      const defSec = coverHtml ? '__cover__' : (navList[0]?.secId || '');

      // ── Árvore lateral (reusa as classes vivas .sn-* → o style.css inlinado estiliza) ──
      const detPage = pages.find(p => p.id === 'detalhamentos');
      const reportPages = pages.filter(p => p.id !== 'detalhamentos');
      const secBtn = (pageId: string, s: { id: string; label: string }): string =>
        `<button class="sn-sec" data-nav-page="${esc(pageId)}" data-nav-sec="${esc(s.id)}"><span class="sn-sec-lbl">${esc(s.label)}</span></button>`;
      const pageGroup = (page: { id: string; label: string; sections: Array<{ id: string; label: string }> }, n: number): string =>
        `<div class="sn-group" data-group="${esc(page.id)}"><button class="sn-page" data-nav-page="${esc(page.id)}" data-nav-sec="${esc(page.sections[0]?.id || '')}"><span class="sn-num">${n}</span><span class="sn-page-lbl">${esc(page.label)}</span></button>${page.sections.length > 1 ? page.sections.map(s => secBtn(page.id, s)).join('') : ''}</div>`;
      const coverItem = coverHtml
        ? `<div class="sn-group"><button class="sn-page" data-nav-page="__cover__" data-nav-sec="__cover__"><span class="sn-num">◆</span><span class="sn-page-lbl">Capa</span></button></div>`
        : '';
      const sideTree = `${coverItem}<div class="sn-label">Relatório</div>${reportPages.map((p, i) => pageGroup(p, i + 1)).join('')}${detPage && detPage.sections.length ? `<div class="sn-label">Aprofundamentos</div><div class="sn-group" data-group="${esc(detPage.id)}">${detPage.sections.map(s => secBtn(detPage.id, s)).join('')}</div>` : ''}`;

      const sidenav = `<aside id="sidenav">
  <div class="sn-head"><a class="sn-brand" href="#">${logo ? `<span class="sn-logo-box"><img class="sn-logo" src="${logo}" alt="Witly"></span>` : ''}<span class="sn-brand-name">Witly Grimório</span></a><button class="sn-collapse" data-collapse aria-label="Minimizar menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button></div>
  <a class="sn-switcher" href="#"><span class="sn-pj">${esc(initials)}</span><span class="sn-sw-meta"><small>Cliente</small><b>${esc(clientName)}</b></span></a>
  ${sideTree}
</aside>
<button id="sn-expand" class="sn-expand" data-expand aria-label="Expandir menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>`;

      const navCanal = fdef
        ? `<div class="exp-canal">${variants.map(v => `<button class="exp-cbtn" data-canal-btn="${esc(String(v))}">${esc(String(v))}</button>`).join('')}</div>`
        : '';

      // Conteúdo: a capa (sem canal) + cada seção × canal, escondidas; o runtime mostra uma.
      const coverDiv = coverHtml ? `<div class="exp-sec exp-sec-cover" data-section="__cover__" hidden>${coverHtml}</div>` : '';
      const contentDivs = variants.map(val => {
        const key = String(val);
        return navList.map(s => `<div class="exp-sec export-section" data-section="${esc(s.secId)}" data-page="${esc(s.pageId)}" data-canal="${esc(key)}" hidden>${secHtml[key][s.secId] || ''}</div>`).join('\n');
      }).join('\n');

      const runtime = noClose(`(function(){var DEFS=window.__EXP_CHARTS||{};
function mountIn(scope){if(!scope)return;scope.querySelectorAll('[data-xc]').forEach(function(el){if(el.__m||el.offsetParent===null)return;var d=DEFS[el.getAttribute('data-xc')];if(!d||typeof window.__buildOptions!=='function'||typeof ApexCharts==='undefined')return;el.__m=1;try{new ApexCharts(el,window.__buildOptions(d)).render();}catch(e){}}); }
var sec=${JSON.stringify(defSec)},canal=${JSON.stringify(defCanal)};
function apply(){document.querySelectorAll('.exp-sec').forEach(function(s){var cover=s.getAttribute('data-section')==='__cover__';s.hidden=!(s.getAttribute('data-section')===sec&&(cover||s.getAttribute('data-canal')===canal));});
document.querySelectorAll('.sn-page,.sn-sec').forEach(function(b){var on=b.getAttribute('data-nav-sec')===sec;b.classList.toggle(b.classList.contains('sn-page')?'sn-page-active':'sn-sec-active',on);});
document.querySelectorAll('.sn-group').forEach(function(g){var on=[].some.call(g.querySelectorAll('[data-nav-sec]'),function(b){return b.getAttribute('data-nav-sec')===sec;});g.classList.toggle('sn-group-active',on);});
document.querySelectorAll('.exp-cbtn').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-canal-btn')===canal);});
mountIn(document.querySelector('.exp-sec:not([hidden])'));var m=document.getElementById('main');if(m)m.scrollTop=0;}
function closeM(ov){if(ov){ov.classList.remove('open');document.body.style.overflow='';}}
document.addEventListener('click',function(e){var t=e.target;
var nv=t.closest&&t.closest('[data-nav-sec]');if(nv){sec=nv.getAttribute('data-nav-sec');apply();return;}
var c=t.closest&&t.closest('.exp-cbtn');if(c){canal=c.getAttribute('data-canal-btn');apply();return;}
if(t.closest&&t.closest('[data-collapse]')){document.body.setAttribute('data-nav-collapsed','1');return;}
if(t.closest&&t.closest('[data-expand]')){document.body.setAttribute('data-nav-collapsed','');return;}
var op=t.closest&&t.closest('[data-modal]');if(op){var mo=document.getElementById(op.getAttribute('data-modal'));if(mo){mo.classList.add('open');document.body.style.overflow='hidden';mountIn(mo);}return;}
var cl=t.closest&&t.closest('[data-ic-close]');if(cl){closeM(cl.closest('.ic-overlay'));return;}
if(t.classList&&t.classList.contains('ic-overlay')){closeM(t);}});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){var o=document.querySelector('.ic-overlay.open');if(o)closeM(o);}});
apply();})();`);

      const doc = `<!doctype html>
<html lang="pt-BR" data-theme="${esc(theme)}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
${fontsCss}
${css}
${apexCss}
body{margin:0}
body[data-nav="sidebar"] #topnav{position:fixed;top:0;height:60px;display:flex;align-items:center;border-bottom:1px solid var(--border);z-index:30}
#topnav .tn-brand{display:flex;align-items:center;height:100%}
#topnav .tn-client{font-size:13px;font-weight:700;color:var(--fg)}
.exp-canal{display:flex;gap:2px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:2px}
.exp-cbtn{font-size:12px;font-weight:600;color:var(--gray);background:none;border:none;padding:5px 12px;border-radius:7px;cursor:pointer;font-family:inherit}
.exp-cbtn.on{color:#fff;background:var(--purple)}
.exp-sec[hidden]{display:none}
.export-section{margin:0}
.export-section .dash-tile{overflow:hidden}
.export-section .apexcharts-canvas,.export-section .apexcharts-canvas svg{max-width:100%}
body[data-nav="sidebar"] .exp-sec .sec-header{display:block}
.exp-sec-cover #report-header{padding:8px 0 18px}
</style>
</head>
<body data-nav="sidebar">
${sidenav}
<nav id="topnav">
  <div class="tn-brand"><span class="tn-client">${esc(clientName || 'Relatório')}</span></div>
  <div class="tn-pages"></div>
  <div class="tn-right">${navCanal}</div>
</nav>
<main id="main"><div id="export-root">
${coverDiv}
${contentDivs}
</div></main>
${modalHtml.join('\n')}
<script>${noClose(apexJs)}</script>
<script>${noClose(chartBundle)}</script>
<script>window.__EXP_CHARTS=${noClose(JSON.stringify(chartDefs))};
${runtime}</script>
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
    }, (msg) => this.queue.setStage(msg));
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
