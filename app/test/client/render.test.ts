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

/* Minimal Gridstack stand-in. Like the real lib, init() attaches a live
 * `gridstackNode` (full x/y/w/h) to each item from the gs-* attrs Dashboard
 * wrote; tests simulate a drag/resize by mutating that node. save() deliberately
 * OMITS `h` to mirror real gridstack stripping any field equal to a default/min
 * — the behavior that used to collapse minH-sized charts to h=1. destroy() keeps
 * the DOM. */
class FakeGrid {
  constructor(private el: HTMLElement) {
    for (const t of this.el.querySelectorAll<HTMLElement>('.grid-stack-item')) {
      t.gridstackNode = {
        el: t,
        id: t.getAttribute('gs-id') || undefined,
        x: Number(t.getAttribute('gs-x')), y: Number(t.getAttribute('gs-y')),
        w: Number(t.getAttribute('gs-w')), h: Number(t.getAttribute('gs-h')),
      };
    }
  }
  on(): void { /* noop */ }
  makeWidget(): void { /* noop */ }
  removeAll(): void { /* noop */ }
  destroy(): void { /* keep DOM, matches destroy(false) */ }
  save(): GridStackNode[] {
    return Array.from(this.el.querySelectorAll<HTMLElement>('.grid-stack-item')).map(t => {
      const n = t.gridstackNode!;
      return { id: n.id, x: n.x, y: n.y, w: n.w }; // h omitted, as real gridstack does at minH
    });
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

test('buildOptions: scatter+trend becomes a line chart with an appended fitted series', () => {
  const opts = buildOptions(
    { type: 'scatter', trend: 'linear', series: [{ name: 'g', data: [[1, 2], [2, 4], [3, 6]] }] },
    'light',
  );
  assert.equal((opts.chart as Record<string, unknown>).type, 'line');
  const series = opts.series as { type?: string }[];
  assert.equal(series.length, 2);            // points + trend
  assert.equal(series[0].type, 'scatter');
  assert.equal(series[1].type, 'line');
  assert.deepEqual((opts.stroke as Record<string, unknown>).width, [0, 3]);
});

test('buildOptions: donutTotal enables the center total label', () => {
  const opts = buildOptions(
    { type: 'donut', series: [1, 2], labels: ['a', 'b'], donutTotal: true, totalLabel: 'clientes' },
    'dark',
  );
  const plot = opts.plotOptions as { pie: { donut: { labels?: { total?: { show?: boolean; label?: string } } } } };
  assert.equal(plot.pie.donut.labels?.total?.show, true);
  assert.equal(plot.pie.donut.labels?.total?.label, 'clientes');
});

test('buildOptions: showLabels survives the base re-merge that forces labels off', () => {
  const opts = buildOptions({ type: 'donut', series: [1, 2], labels: ['a', 'b'], showLabels: true }, 'light');
  assert.equal((opts.dataLabels as Record<string, unknown>).enabled, true);
});

test('buildOptions: mixed secondaryAxis builds an opposite right-hand axis + per-series stroke', () => {
  const opts = buildOptions({
    type: 'mixed', secondaryAxis: 1, secondaryAxisSuffix: '%',
    series: [{ name: 'rev', type: 'bar', data: [1, 2] }, { name: 'growth', type: 'line', data: [10, 20] }],
  }, 'light');
  const y = opts.yaxis as Array<Record<string, unknown>>;
  assert.ok(Array.isArray(y));
  assert.equal(y.length, 2);
  assert.equal((y[1] as { opposite?: boolean }).opposite, true);
  assert.deepEqual((opts.stroke as Record<string, unknown>).width, [0, 3]);
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

test('renderWidget: kpi reads its total by key and formats', () => {
  const resolved: ResolvedBind = { categories: [], series: [], rows: [], totals: { receita: 1500 } };
  const node = renderWidget(
    { id: 'k1', type: 'kpi', key: 'receita', label: 'Receita', format: 'R$', bind: { dataset: 'd' } } as Widget,
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

test('renderWidget: table auto-heats a Gap column, leaves volume plain', () => {
  const resolved: ResolvedBind = { categories: [], series: [], rows: [
    { ind: 'Hook', leads: '751', gap: '-30%' },
    { ind: 'CTR', leads: '295', gap: '+9%' },
  ], totals: {} };
  const node = renderWidget(
    { id: 't', type: 'table', cols: ['ind', 'leads', 'gap'], bind: { dataset: 'd' } } as Widget,
    ctxWith(resolved),
  );
  const bodyRows = [...node.querySelectorAll('tbody tr')];
  const heatOn = (i: number): boolean => bodyRows.some((tr) => [...tr.children[i].classList].some((c) => /^c[a-z]/.test(c)));
  assert.ok(heatOn(2), 'a coluna Gap deve pintar');
  assert.ok(!heatOn(1), 'a coluna de volume (Leads, só positivos sem sinal) não pinta');
  // sinal do heat: negativo → tom vermelho, positivo → verde
  assert.ok([...bodyRows[0].children[2].classList].some((c) => c.startsWith('cs') || c === 'cn' || c === 'cxn'), '-30% é vermelho');
  assert.ok([...bodyRows[1].children[2].classList].some((c) => c === 'cp' || c === 'cp2' || c === 'csp'), '+9% é verde');
});

test('renderWidget: def-step renders num, stats and HTML bullets', () => {
  const node = renderWidget({
    id: 'd1', type: 'def-step', num: '01', label: 'Base de dados', title: 'Universo analisado',
    stats: [{ value: 1500, label: 'clientes', color: 'p' }],
    bullets: ['Período <strong>jan–dez</strong>'],
  } as Widget, ctxWith(null));
  assert.ok(node.classList.contains('def-step'));
  assert.equal(node.querySelector('.def-step-num')?.textContent, '01');
  assert.ok(node.querySelector('.def-step-stat-n.c-p'));
  assert.ok(node.querySelector('.def-bullets li strong')); // inline HTML preserved
});

test('renderWidget: mdef-block renders tag, title and optional sub-classification', () => {
  const node = renderWidget({
    id: 'm1', type: 'mdef-block', tag: 'Valor do cliente', title: 'LTV',
    bullets: ['Receita acumulada'], subLabel: 'Variantes', subBullets: ['LTV 12m'],
  } as Widget, ctxWith(null));
  assert.equal(node.querySelector('.mdef-tag')?.textContent, 'Valor do cliente');
  assert.equal(node.querySelector('.mdef-title')?.textContent, 'LTV');
  assert.equal(node.querySelector('.mdef-sub-label')?.textContent, 'Variantes');
  assert.equal(node.querySelectorAll('.def-bullets').length, 2); // main + sub
});

test('renderWidget: grp-list auto-numbers items from 01', () => {
  const node = renderWidget({
    id: 'g1', type: 'grp-list', label: '3 grupos',
    items: [{ name: 'A', example: 'ex' }, { name: 'B' }, { name: 'C' }],
  } as Widget, ctxWith(null));
  const ns = [...node.querySelectorAll('.grp-n')].map(n => n.textContent);
  assert.deepEqual(ns, ['01', '02', '03']);
  assert.equal(node.querySelectorAll('.grp-item').length, 3);
  assert.equal(node.querySelectorAll('.grp-ex').length, 1); // only the one with an example
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
      { id: 'kpi', type: 'kpi', key: 'receita', label: 'Receita', bind: { dataset: 'vendas' } },
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
  // simulate the user dragging "tbl" to the right half (mutate the live node, as
  // real gridstack does on drag — not just the gs-x attribute)
  host.querySelector<HTMLElement>('[data-widget-id="tbl"]')!.gridstackNode!.x = 6;
  await dash.exitEditMode(true);

  assert.equal(dash.editing, false);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].sectionId, 's1');
  const tblItem = saved[0].items.find(i => i.id === 'tbl')!;
  assert.equal(tblItem.x, 6);
  assert.equal(tblItem.w, 6);
  // h must round-trip from the live node even though save() omits it (regression:
  // save()'s stripping used to collapse this to h=1).
  assert.equal(tblItem.h, 2);
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
