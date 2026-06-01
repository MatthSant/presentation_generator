/* dashboard.ts — lay out a section's widgets as a 12-col CSS grid of tiles.
 *
 * Read path uses plain CSS grid (no Gridstack dependency to display). Tiles
 * honor saved layout coords (x/w) or fall back to a per-type default width.
 * Bound widgets are tracked so a filter change re-resolves them in place:
 * charts updateSeries (animated), kpi/table/heatmap re-render their tile. */

import type { Section, Widget, DataMap, ActiveFilters, LayoutItem, Bind, ResolvedBind } from '../shared/types.js';
import { resolveBind } from '../shared/bind.js';
import { renderWidget, type RenderCtx } from './renderer.js';
import { ChartManager, type ChartDef } from './charts.js';

const DEFAULT_W: Record<string, number> = {
  'label-sec': 12, 'find-note': 12, 'xs': 12,
  'chart': 6, 'table': 6, 'highlight': 6, 'request': 6,
  'heatmap': 8, 'find-block': 4, 'ni': 4, 'ni-vertical': 4,
  'kpi': 3,
};
const BOUND = new Set(['kpi', 'chart', 'table', 'heatmap']);

/** Row height (px) used only while the Gridstack editor is open. The read path
 *  uses content-sized tracks, so this just gives the editor a sane drag grid. */
const CELL_H = 80;

/** Resolve overlapping layout coords by letting gravity pull items down: any
 *  item that would overlap an already-placed one is pushed below it. This is a
 *  no-op on clean (editor-produced) layouts and repairs hand-authored ones that
 *  overlap, so the coordinate read path can never render tiles on top of each
 *  other. Pure + exported for unit testing. */
export function compactVertically(items: LayoutItem[]): LayoutItem[] {
  const sorted = [...items].sort((a, b) => ((a.y ?? 0) - (b.y ?? 0)) || ((a.x ?? 0) - (b.x ?? 0)));
  const placed: LayoutItem[] = [];
  for (const it of sorted) {
    const w = it.w ?? 1, h = it.h ?? 1;
    let y = it.y ?? 0;
    for (;;) {
      const hit = placed.find(p =>
        (it.x ?? 0) < p.x + p.w && p.x < (it.x ?? 0) + w &&  // columns overlap
        y < p.y + p.h && p.y < y + h);                        // rows overlap
      if (!hit) break;
      y = hit.y + hit.h;
    }
    placed.push({ ...it, y, w, h });
  }
  return placed;
}

interface TileRef { widget: Widget; tile: HTMLElement; chartElId?: string; }

export interface DashboardOpts {
  datasets: DataMap;
  getActive: () => ActiveFilters;
  layout?: LayoutItem[];
  /** Persist new grid coords on save. Throwing keeps the editor open (caller shows the error). */
  onSaveLayout?: (sectionId: string, items: LayoutItem[]) => Promise<void>;
}

export class Dashboard {
  private charts = new ChartManager();
  private tiles: TileRef[] = [];
  private grid: HTMLElement;
  private placed = new Map<string, LayoutItem>();
  private gridStack: GridStackInstance | null = null;
  private static gridStackLib?: Promise<void>;

  constructor(private section: Section, private host: HTMLElement, private opts: DashboardOpts) {
    this.grid = document.createElement('div');
    this.grid.className = 'dash-grid';
    this.render();
  }

  private resolveCtx(): RenderCtx {
    const charts: { elId: string; def: ChartDef }[] = [];
    const ctx: RenderCtx = {
      charts,
      resolve: (bind?: Bind): ResolvedBind | null =>
        bind ? resolveBind(bind, this.opts.datasets, this.opts.getActive()) : null,
      chartHeight: (id: string): number | undefined => this.chartHeightFor(id),
    };
    return ctx;
  }

  /** Pixel height for a chart's canvas on the read path, derived from its saved
   *  layout cell so the rendered size matches what the editor showed. Subtracts
   *  the renderer's own chrome (title + wrap padding) plus the elevated-card
   *  vertical padding (16px top + 16px bottom) from the cell budget. */
  private chartHeightFor(id: string): number | undefined {
    const item = this.placed.get(id) ?? this.layoutFor(id);
    const widget = this.section.widgets?.find(w => w.id === id);
    if (!item || widget?.type !== 'chart') return undefined;
    const cells = Math.max(1, item.h ?? 1);
    const chrome = (widget.title ? 21 : 8) + 32;
    return Math.max(120, cells * CELL_H - chrome);
  }

  private layoutFor(id: string): LayoutItem | undefined {
    return this.opts.layout?.find(l => l.id === id);
  }

  /** A section with a saved layout renders as a true coordinate grid (honoring
   *  y/h) so the read path matches the editor exactly. Without one, tiles flow
   *  content-sized in document order at their default widths. */
  private hasCoordLayout(): boolean {
    return !!this.opts.layout && this.opts.layout.length > 0;
  }

  private buildTile(widget: Widget, ctx: RenderCtx): HTMLElement {
    const tile = document.createElement('div');
    tile.className = 'dash-tile';
    tile.dataset.widgetId = widget.id;
    tile.dataset.widgetType = widget.type;
    const li = this.layoutFor(widget.id);
    const p = this.placed.get(widget.id);
    const w = p?.w ?? li?.w ?? DEFAULT_W[widget.type] ?? 6;

    if (p) {
      // Coordinate placement against content-sized rows: tiles land at their
      // compacted x/y, and shared row boundaries auto-align adjacent columns.
      tile.style.gridColumn = `${(p.x ?? 0) + 1} / span ${w}`;
      tile.style.gridRow = `${(p.y ?? 0) + 1} / span ${Math.max(1, p.h ?? 1)}`;
    } else {
      tile.style.gridColumn = (li?.x != null ? `${li.x + 1} / span ${w}` : `span ${w}`);
      if (li) tile.style.order = String((li.y ?? 0) * 100 + (li.x ?? 0));
    }

    const beforeCharts = ctx.charts.length;
    tile.appendChild(renderWidget(widget, ctx));
    const newCharts = ctx.charts.slice(beforeCharts);
    this.tiles.push({ widget, tile, chartElId: newCharts[0]?.elId });
    return tile;
  }

  private render(): void {
    const ctx = this.resolveCtx();
    this.tiles = [];
    this.grid.innerHTML = '';
    const coords = this.hasCoordLayout();
    this.grid.classList.toggle('dash-grid--coords', coords);
    this.placed.clear();
    if (coords) for (const it of compactVertically(this.opts.layout!)) this.placed.set(it.id, it);
    for (const widget of this.section.widgets || []) {
      this.grid.appendChild(this.buildTile(widget, ctx));
    }
    this.host.appendChild(this.grid);
    for (const { elId, def } of ctx.charts) this.charts.create(elId, def);
  }

  /** Re-resolve every bound widget against the current filters, updating in place. */
  applyFilters(): void {
    for (const ref of this.tiles) {
      if (!BOUND.has(ref.widget.type)) continue;

      if (ref.widget.type === 'chart' && ref.chartElId && this.charts.has(ref.chartElId)) {
        const ctx = this.resolveCtx();
        const fresh = renderWidget(ref.widget, ctx);          // recompute def into ctx.charts
        const spec = ctx.charts[0];
        if (spec) {
          this.charts.update(ref.chartElId, spec.def);          // animated updateSeries
        } else {
          // became empty → swap to the empty-state element the renderer produced
          this.replaceTile(ref, fresh);
        }
        continue;
      }
      // kpi / table / heatmap (and charts that had no live instance): full re-render
      const ctx = this.resolveCtx();
      this.replaceTile(ref, renderWidget(ref.widget, ctx), ctx.charts[0]?.elId);
    }
  }

  private replaceTile(ref: TileRef, fresh: HTMLElement, newChartElId?: string): void {
    ref.tile.replaceChildren(fresh);
    ref.chartElId = newChartElId;
    if (newChartElId) {
      const ctx = this.resolveCtx();
      renderWidget(ref.widget, ctx);
      const spec = ctx.charts[0];
      if (spec) this.charts.create(spec.elId, spec.def);
    }
  }

  /* ───────────────────────────  Layout editor  ─────────────────────────── */

  get editing(): boolean { return this.gridStack != null; }

  /** Lazy-load the Gridstack UMD bundle once (it isn't needed on the read path). */
  private loadGridStack(): Promise<void> {
    if (typeof GridStack !== 'undefined') return Promise.resolve();
    if (!Dashboard.gridStackLib) {
      Dashboard.gridStackLib = new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/vendor/gridstack-all.js';
        s.onload = () => resolve();
        s.onerror = () => { Dashboard.gridStackLib = undefined; reject(new Error('Falha ao carregar Gridstack')); };
        document.head.appendChild(s);
      });
    }
    return Dashboard.gridStackLib;
  }

  /** Turn the read-path CSS grid into a draggable/resizable Gridstack. */
  async enterEditMode(): Promise<void> {
    if (this.gridStack) return;
    await this.loadGridStack();
    if (typeof GridStack === 'undefined') return;

    document.body.classList.add('edit-mode');
    this.grid.classList.add('grid-stack', 'grid-active');

    for (const ref of this.tiles) {
      const li = this.layoutFor(ref.widget.id);
      const w = li?.w ?? DEFAULT_W[ref.widget.type] ?? 6;
      const x = li?.x ?? 0;
      const y = li?.y ?? 0;
      // ceil (not round) so the cell never ends up shorter than the content,
      // which is what produced the in-editor scrollbars.
      const h = li?.h ?? Math.max(2, Math.ceil(ref.tile.offsetHeight / CELL_H));

      const content = document.createElement('div');
      content.className = 'grid-stack-item-content';
      while (ref.tile.firstChild) content.appendChild(ref.tile.firstChild);
      ref.tile.appendChild(content);

      ref.tile.classList.add('grid-stack-item');
      ref.tile.dataset.blockType = ref.widget.type;
      ref.tile.style.gridColumn = '';
      ref.tile.style.gridRow = '';
      ref.tile.style.order = '';
      ref.tile.setAttribute('gs-id', ref.widget.id);
      ref.tile.setAttribute('gs-x', String(x));
      ref.tile.setAttribute('gs-y', String(y));
      ref.tile.setAttribute('gs-w', String(w));
      ref.tile.setAttribute('gs-h', String(h));

      // Charts can't shrink below their natural size — the floor matches the
      // read-path render (the chart's own pixel height ≈ a few cells).
      if (ref.widget.type === 'chart') {
        const minH = Math.max(2, Math.ceil((ref.widget.height ?? 300) / CELL_H));
        ref.tile.setAttribute('gs-min-w', '3');
        ref.tile.setAttribute('gs-min-h', String(minH));
      }
    }

    // Per-axis margins mirror the read path's 24px column gap / 0 row gap so the
    // arrangement looks the same in edit mode as it does once saved.
    this.gridStack = GridStack.init(
      { column: 12, cellHeight: CELL_H, float: true, marginTop: 0, marginBottom: 0, marginLeft: 12, marginRight: 12 },
      this.grid,
    );

    // Gridstack only moves the tile; ApexCharts must be told to re-fit. Re-fit
    // live during the drag and once more on stop so width + height track the cell.
    const onResize = (...a: unknown[]) => this.refitChart(a[1] as HTMLElement);
    this.gridStack.on('resize', onResize);
    this.gridStack.on('resizestop', onResize);
  }

  /** Re-fit the chart in a resized grid item to fill the cell (minus its title). */
  private refitChart(itemEl: HTMLElement): void {
    const ref = this.tiles.find(t => t.tile === itemEl);
    if (!ref?.chartElId || !this.charts.has(ref.chartElId)) return;
    const content = itemEl.querySelector('.grid-stack-item-content') as HTMLElement | null;
    if (!content) return;
    const titleH = (content.querySelector('.chart-title') as HTMLElement | null)?.offsetHeight ?? 0;
    const height = Math.max(120, content.clientHeight - titleH - 8);
    this.charts.resize(ref.chartElId, height);
  }

  /** Leave edit mode. On save, persist coords (a throw keeps the editor open),
   *  then rebuild the read-path grid from the resulting layout. */
  async exitEditMode(save: boolean): Promise<void> {
    if (!this.gridStack) return;

    if (save) {
      const items = this.readGridLayout();
      if (this.opts.onSaveLayout) await this.opts.onSaveLayout(this.section.id, items);
      this.opts.layout = items;
    }

    this.gridStack.destroy(false);
    this.gridStack = null;
    document.body.classList.remove('edit-mode');
    this.grid.classList.remove('grid-stack', 'grid-active');
    this.charts.destroyAll();
    this.render();
  }

  /** Read coords from each tile's LIVE gridstack node, not save(): save() strips
   *  any field equal to a default or min constraint, so a chart sitting at its
   *  minH (4) comes back with no `h` — and a naive `?? 1` would persist h=1,
   *  collapsing the chart to its 120px floor on the next read-path render. */
  private readGridLayout(): LayoutItem[] {
    const items: LayoutItem[] = [];
    for (const ref of this.tiles) {
      const node = ref.tile.gridstackNode;
      if (!node) continue;
      const prev = this.layoutFor(ref.widget.id);
      items.push({
        id: ref.widget.id,
        type: ref.widget.type,
        x: node.x ?? prev?.x ?? 0,
        y: node.y ?? prev?.y ?? 0,
        w: node.w ?? node.minW ?? prev?.w ?? DEFAULT_W[ref.widget.type] ?? 6,
        h: node.h ?? node.minH ?? prev?.h ?? 1,
      });
    }
    return items;
  }

  destroy(): void {
    if (this.gridStack) {
      try { this.gridStack.destroy(false); } catch { /* noop */ }
      this.gridStack = null;
      document.body.classList.remove('edit-mode');
    }
    this.charts.destroyAll();
    this.grid.remove();
  }
}
