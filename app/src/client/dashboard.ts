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
  'kpi-row': 12, 'label-sec': 12, 'find-note': 12, 'xs': 12,
  'chart': 6, 'table': 6, 'highlight': 6, 'request': 6,
  'heatmap': 8, 'find-block': 4, 'ni': 4, 'ni-vertical': 4,
};
const BOUND = new Set(['kpi-row', 'chart', 'table', 'heatmap']);

interface TileRef { widget: Widget; tile: HTMLElement; chartElId?: string; }

export interface DashboardOpts {
  datasets: DataMap;
  getActive: () => ActiveFilters;
  layout?: LayoutItem[];
}

export class Dashboard {
  private charts = new ChartManager();
  private tiles: TileRef[] = [];
  private grid: HTMLElement;

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
    };
    return ctx;
  }

  private layoutFor(id: string): LayoutItem | undefined {
    return this.opts.layout?.find(l => l.id === id);
  }

  private buildTile(widget: Widget, ctx: RenderCtx): HTMLElement {
    const tile = document.createElement('div');
    tile.className = 'dash-tile';
    tile.dataset.widgetId = widget.id;
    tile.dataset.widgetType = widget.type;
    const li = this.layoutFor(widget.id);
    const w = li?.w ?? DEFAULT_W[widget.type] ?? 6;
    const x = li?.x;
    tile.style.gridColumn = (x != null ? `${x + 1} / span ${w}` : `span ${w}`);
    if (li) tile.style.order = String((li.y ?? 0) * 100 + (li.x ?? 0));

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
      // kpi-row / table / heatmap (and charts that had no live instance): full re-render
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

  destroy(): void {
    this.charts.destroyAll();
    this.grid.remove();
  }
}
