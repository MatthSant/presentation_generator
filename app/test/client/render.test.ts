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
const { Dashboard, compactVertically } = await import('../../src/client/dashboard.js');
import type { RenderCtx } from '../../src/client/renderer.js';
import type { DataMap, ResolvedBind, Section, Widget, LayoutItem } from '../../src/shared/types.js';

/* Minimal Gridstack stand-in: init() returns an instance whose save() reads the
 * gs-* attributes Dashboard wrote onto the tiles, so tests can mutate an attr to
 * simulate a drag/resize and assert the persisted coords. destroy() keeps DOM. */
class FakeGrid {
  constructor(private el: HTMLElement) {}
  on(): void { /* noop */ }
  makeWidget(): void { /* noop */ }
  removeAll(): void { /* noop */ }
  destroy(): void { /* keep DOM, matches destroy(false) */ }
  save(): { id: string; x: number; y: number; w: number; h: number }[] {
    return Array.from(this.el.querySelectorAll<HTMLElement>('.grid-stack-item')).map(t => ({
      id: t.getAttribute('gs-id') || '',
      x: Number(t.getAttribute('gs-x')), y: Number(t.getAttribute('gs-y')),
      w: Number(t.getAttribute('gs-w')), h: Number(t.getAttribute('gs-h')),
    }));
  }
}
(globalThis as unknown as { GridStack: unknown }).GridStack = {
  init: (_opts: unknown, el: HTMLElement) => new FakeGrid(el),
};

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
  // a saved layout → coordinate mode: x/w/y/h all honored so the read path
  // matches the editor (tall neighbors can't push a tile down).
  assert.ok(grid.classList.contains('dash-grid--coords'));
  const tiles = grid.querySelectorAll('.dash-tile');
  assert.equal(tiles.length, 2);
  assert.equal((tiles[0] as HTMLElement).style.gridColumn, '1 / span 12');
  assert.equal((tiles[0] as HTMLElement).style.gridRow, '1 / span 1');
  assert.equal((tiles[1] as HTMLElement).style.gridColumn, '1 / span 6');
  assert.equal((tiles[1] as HTMLElement).style.gridRow, '2 / span 2');
});

test('Dashboard: without a layout, tiles flow content-sized (no coordinate rows)', () => {
  const host = document.createElement('div');
  new Dashboard(section(), host, { datasets: DATASETS, getActive: () => ({}) });
  const grid = host.querySelector('.dash-grid')!;
  assert.ok(!grid.classList.contains('dash-grid--coords'));
  const tbl = host.querySelector<HTMLElement>('[data-widget-id="tbl"]')!;
  assert.equal(tbl.style.gridRow, ''); // no fixed-row coordinate
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

/* ── compactVertically (overlap repair) ── */
test('compactVertically: leaves a clean non-overlapping layout untouched', () => {
  const clean: LayoutItem[] = [
    { id: 'donut', x: 0, y: 0, w: 6, h: 6 },
    { id: 'fb1', x: 6, y: 0, w: 6, h: 2 },
    { id: 'catbar', x: 6, y: 2, w: 6, h: 4 },
    { id: 'note', x: 6, y: 6, w: 6, h: 1 },
  ];
  assert.deepEqual(compactVertically(clean).map(i => ({ id: i.id, y: i.y })),
    clean.map(i => ({ id: i.id, y: i.y })));
});

test('compactVertically: pushes an overlapping hand-authored tile below its neighbors', () => {
  // s01-style bug: tbl (y=2) overlaps rev/ord (y=1,h=3 → occupy rows 1-3)
  const messy: LayoutItem[] = [
    { id: 'kpi', x: 0, y: 0, w: 12, h: 1 },
    { id: 'rev', x: 0, y: 1, w: 6, h: 3 },
    { id: 'ord', x: 6, y: 1, w: 6, h: 3 },
    { id: 'tbl', x: 0, y: 2, w: 12, h: 3 },
  ];
  const byId = Object.fromEntries(compactVertically(messy).map(i => [i.id, i]));
  assert.equal(byId.kpi.y, 0);
  assert.equal(byId.rev.y, 1);
  assert.equal(byId.ord.y, 1);
  assert.equal(byId.tbl.y, 4); // dropped below rev/ord (which end at row 4)
});

/* ── Dashboard: layout editor ── */
const EDIT_LAYOUT: LayoutItem[] = [
  { id: 'kpi', x: 0, y: 0, w: 12, h: 1 },
  { id: 'tbl', x: 0, y: 1, w: 6, h: 2 },
];

test('enterEditMode: marks the grid editable and seeds gs-* coords from layout', async () => {
  const host = document.createElement('div');
  const dash = new Dashboard(section(), host, { datasets: DATASETS, getActive: () => ({}), layout: EDIT_LAYOUT });

  await dash.enterEditMode();
  assert.equal(dash.editing, true);

  const grid = host.querySelector('.dash-grid')!;
  assert.ok(grid.classList.contains('grid-stack'));
  assert.ok(grid.classList.contains('grid-active'));
  assert.ok(document.body.classList.contains('edit-mode'));

  const tbl = host.querySelector<HTMLElement>('[data-widget-id="tbl"]')!;
  assert.ok(tbl.classList.contains('grid-stack-item'));
  assert.ok(tbl.querySelector('.grid-stack-item-content'));
  assert.equal(tbl.getAttribute('gs-id'), 'tbl');
  assert.equal(tbl.getAttribute('gs-x'), '0');
  assert.equal(tbl.getAttribute('gs-w'), '6');
  assert.equal(tbl.getAttribute('gs-h'), '2');

  await dash.exitEditMode(false); // cleanup body class for sibling tests
});

test('exitEditMode(true): persists moved coords then rebuilds the read grid', async () => {
  const host = document.createElement('div');
  const saved: { sectionId: string; items: LayoutItem[] }[] = [];
  const dash = new Dashboard(section(), host, {
    datasets: DATASETS, getActive: () => ({}), layout: EDIT_LAYOUT,
    onSaveLayout: async (sectionId, items) => { saved.push({ sectionId, items }); },
  });

  await dash.enterEditMode();
  // simulate the user dragging "tbl" to the right half
  host.querySelector('[data-widget-id="tbl"]')!.setAttribute('gs-x', '6');
  await dash.exitEditMode(true);

  assert.equal(dash.editing, false);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].sectionId, 's1');
  const tblItem = saved[0].items.find(i => i.id === 'tbl')!;
  assert.equal(tblItem.x, 6);
  assert.equal(tblItem.w, 6);
  assert.equal(tblItem.type, 'table'); // widget type carried into the layout item

  // read grid is rebuilt and reflects the new x
  const tbl = host.querySelector<HTMLElement>('[data-widget-id="tbl"]')!;
  assert.equal(tbl.style.gridColumn, '7 / span 6');
  assert.ok(!tbl.classList.contains('grid-stack-item'));
  assert.ok(!document.body.classList.contains('edit-mode'));
});

test('exitEditMode(false): does not persist and keeps the original layout', async () => {
  const host = document.createElement('div');
  let calls = 0;
  const dash = new Dashboard(section(), host, {
    datasets: DATASETS, getActive: () => ({}), layout: EDIT_LAYOUT,
    onSaveLayout: async () => { calls++; },
  });

  await dash.enterEditMode();
  host.querySelector('[data-widget-id="tbl"]')!.setAttribute('gs-x', '6'); // discarded
  await dash.exitEditMode(false);

  assert.equal(calls, 0);
  const tbl = host.querySelector<HTMLElement>('[data-widget-id="tbl"]')!;
  assert.equal(tbl.style.gridColumn, '1 / span 6'); // original x preserved
});

test('exitEditMode(true): a save failure keeps the editor open for retry', async () => {
  const host = document.createElement('div');
  const dash = new Dashboard(section(), host, {
    datasets: DATASETS, getActive: () => ({}), layout: EDIT_LAYOUT,
    onSaveLayout: async () => { throw new Error('network'); },
  });

  await dash.enterEditMode();
  await assert.rejects(() => dash.exitEditMode(true));
  assert.equal(dash.editing, true); // still editing after a failed save

  await dash.exitEditMode(false); // cleanup
});
