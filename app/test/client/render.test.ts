/* render.test.ts — client render path under jsdom (no ApexCharts, no network).
 *
 * Covers the pure option builder, the resolved→def adapter, the widget renderer's
 * empty/error/data branches, and the Dashboard's CSS-grid placement + in-place
 * filter re-resolution. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
(globalThis as unknown as { document: Document }).document = dom.window.document as unknown as Document;
(globalThis as unknown as { window: unknown }).window = dom.window;

const { buildOptions, defFromResolved } = await import('../../src/client/charts.js');
const { renderWidget } = await import('../../src/client/renderer.js');
const { Dashboard } = await import('../../src/client/dashboard.js');
import type { RenderCtx } from '../../src/client/renderer.js';
import type { DataMap, ResolvedBind, Section, Widget } from '../../src/shared/types.js';

/* ── charts.buildOptions (pure) ── */
test('buildOptions: bar chart resolves type + forces yaxis.min 0', () => {
  const opts = buildOptions({ type: 'bar', series: [{ name: 'a', data: [1, 2] }], categories: ['x', 'y'] }, 'light');
  const chart = opts.chart as Record<string, unknown>;
  assert.equal(chart.type, 'bar');
  assert.equal(chart.height, 300);
  assert.deepEqual((opts.xaxis as Record<string, unknown>).categories, ['x', 'y']);
  assert.equal((opts.yaxis as Record<string, unknown>).min, 0);
});

test('buildOptions: stacked sets chart.stacked, mixed/horizontal map to bar', () => {
  assert.equal((buildOptions({ type: 'stacked', series: [] }, 'dark').chart as Record<string, unknown>).stacked, true);
  assert.equal((buildOptions({ type: 'bar-horizontal', series: [] }).chart as Record<string, unknown>).type, 'bar');
});

test('defFromResolved: circular charts take first series data + labels', () => {
  const resolved = { categories: ['A', 'B'], series: [{ name: 's', data: [3, 4] }] };
  const donut = defFromResolved('donut', resolved);
  assert.deepEqual(donut.series, [3, 4]);
  assert.deepEqual(donut.labels, ['A', 'B']);
  const bar = defFromResolved('bar', resolved);
  assert.deepEqual(bar.series, resolved.series);
  assert.deepEqual(bar.categories, ['A', 'B']);
});

/* ── renderer ── */
function ctxWith(resolved: ResolvedBind | null): RenderCtx {
  return { charts: [], resolve: () => resolved };
}

test('renderWidget: kpi-row reads totals by key and formats', () => {
  const resolved: ResolvedBind = { categories: [], series: [], rows: [], totals: { receita: 1500 } };
  const node = renderWidget(
    { id: 'k1', type: 'kpi-row', items: [{ key: 'receita', label: 'Receita', format: 'R$' }], bind: { dataset: 'd' } } as Widget,
    ctxWith(resolved),
  );
  assert.match(node.textContent || '', /Receita/);
  assert.match(node.textContent || '', /1\.500|1,500|R\$/);
});

test('renderWidget: bound chart with no rows shows empty state', () => {
  const resolved: ResolvedBind = { categories: [], series: [], rows: [], totals: {} };
  const node = renderWidget(
    { id: 'c1', type: 'chart', chartType: 'bar', bind: { dataset: 'd' } } as Widget,
    ctxWith(resolved),
  );
  assert.ok(node.querySelector('.widget-empty'));
});

test('renderWidget: bound chart with data pushes a chart spec', () => {
  const resolved: ResolvedBind = { categories: ['A'], series: [{ name: 's', data: [1] }], rows: [], totals: {} };
  const ctx = ctxWith(resolved);
  const node = renderWidget(
    { id: 'c2', type: 'chart', chartType: 'bar', bind: { dataset: 'd' } } as Widget,
    ctx,
  );
  assert.ok(node.querySelector('.chart-wrap'));
  assert.equal(ctx.charts.length, 1);
  assert.equal(ctx.charts[0].elId, 'chart-c2');
});

test('renderWidget: unknown type renders an error card', () => {
  const node = renderWidget({ id: 'x', type: 'bogus' } as unknown as Widget, ctxWith(null));
  assert.ok(node.classList.contains('widget-error'));
});

/* ── Dashboard ── */
const DATASETS: DataMap = {
  vendas: {
    dims: ['mes'], filters: ['canal'],
    rows: [
      { mes: 'jan', canal: 'loja', receita: 100 },
      { mes: 'jan', canal: 'online', receita: 40 },
      { mes: 'fev', canal: 'loja', receita: 150 },
      { mes: 'fev', canal: 'online', receita: 60 },
    ],
  },
};

function section(): Section {
  return {
    id: 's1',
    header: { title: 'Vendas' },
    widgets: [
      { id: 'kpi', type: 'kpi-row', items: [{ key: 'receita', label: 'Receita' }], bind: { dataset: 'vendas' } },
      { id: 'tbl', type: 'table', cols: ['mes', 'receita'], bind: { dataset: 'vendas', x: 'mes', y: 'receita' } },
    ] as Widget[],
  };
}

test('Dashboard: lays out tiles into a 12-col grid with spans', () => {
  const host = document.createElement('div');
  const active: Record<string, string> = {};
  new Dashboard(section(), host, {
    datasets: DATASETS, getActive: () => active,
    layout: [{ id: 'kpi', x: 0, y: 0, w: 12, h: 1 }, { id: 'tbl', x: 0, y: 1, w: 6, h: 2 }],
  });
  const grid = host.querySelector('.dash-grid')!;
  assert.ok(grid);
  const tiles = grid.querySelectorAll('.dash-tile');
  assert.equal(tiles.length, 2);
  assert.equal((tiles[0] as HTMLElement).style.gridColumn, '1 / span 12');
  assert.equal((tiles[1] as HTMLElement).style.gridColumn, '1 / span 6');
});

test('Dashboard: applyFilters re-resolves bound widgets against active filters', () => {
  const host = document.createElement('div');
  const active: Record<string, string> = {};
  const dash = new Dashboard(section(), host, { datasets: DATASETS, getActive: () => active });

  const kpiText = () => host.querySelector('[data-widget-id="kpi"]')?.textContent || '';
  assert.match(kpiText(), /350/); // 100+40+150+60 unfiltered

  active.canal = 'loja';
  dash.applyFilters();
  assert.match(kpiText(), /250/); // 100+150 only
  assert.doesNotMatch(kpiText(), /350/);
});
