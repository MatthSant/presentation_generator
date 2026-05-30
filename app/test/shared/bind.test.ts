import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBind, BindError } from '../../src/shared/bind.js';
import type { DataMap } from '../../src/shared/types.js';

const datasets: DataMap = {
  receita_canal: {
    dims: ['mes'],
    filters: ['canal'],
    rows: [
      { mes: 'Jan', canal: 'Pago', receita: 1200, leads: 340 },
      { mes: 'Jan', canal: 'Organico', receita: 800, leads: 210 },
      { mes: 'Fev', canal: 'Pago', receita: 1500, leads: 360 },
      { mes: 'Fev', canal: 'Organico', receita: 900, leads: 240 },
    ],
  },
};

describe('resolveBind — errors', () => {
  test('throws when the dataset is missing', () => {
    assert.throws(() => resolveBind({ dataset: 'nope' }, datasets), BindError);
  });
  test('throws when x column is missing', () => {
    assert.throws(() => resolveBind({ dataset: 'receita_canal', x: 'ano', y: 'receita' }, datasets), BindError);
  });
  test('throws when y column is missing', () => {
    assert.throws(() => resolveBind({ dataset: 'receita_canal', x: 'mes', y: 'lucro' }, datasets), BindError);
  });
  test('throws when a metric column is missing', () => {
    assert.throws(() => resolveBind({ dataset: 'receita_canal', metrics: ['receita', 'nope'] }, datasets), BindError);
  });
});

describe('resolveBind — group-by single series', () => {
  test('sums y per category across filter values when no filter active', () => {
    const r = resolveBind({ dataset: 'receita_canal', x: 'mes', y: 'receita' }, datasets);
    assert.deepEqual(r.categories, ['Jan', 'Fev']);
    assert.equal(r.series.length, 1);
    assert.equal(r.series[0].name, 'receita');
    assert.deepEqual(r.series[0].data, [2000, 2400]); // Jan: 1200+800, Fev: 1500+900
  });

  test('respects an explicit series name', () => {
    const r = resolveBind({ dataset: 'receita_canal', x: 'mes', y: 'receita', name: 'Receita (R$)' }, datasets);
    assert.equal(r.series[0].name, 'Receita (R$)');
  });
});

describe('resolveBind — series split', () => {
  test('produces one series per distinct series value, aligned to categories', () => {
    const r = resolveBind({ dataset: 'receita_canal', x: 'mes', y: 'receita', series: 'canal' }, datasets);
    assert.deepEqual(r.categories, ['Jan', 'Fev']);
    const names = r.series.map(s => s.name).sort();
    assert.deepEqual(names, ['Organico', 'Pago']);
    const pago = r.series.find(s => s.name === 'Pago')!;
    assert.deepEqual(pago.data, [1200, 1500]);
  });
});

describe('resolveBind — filters', () => {
  test('narrows rows by an active filter declared on the table', () => {
    const r = resolveBind({ dataset: 'receita_canal', x: 'mes', y: 'receita' }, datasets, { canal: 'Pago' });
    assert.deepEqual(r.series[0].data, [1200, 1500]);
    assert.equal(r.rows.length, 2);
  });

  test('ignores active filters for columns the table does not declare', () => {
    const r = resolveBind({ dataset: 'receita_canal', x: 'mes', y: 'receita' }, datasets, { regiao: 'Sul' });
    assert.deepEqual(r.series[0].data, [2000, 2400]); // unchanged
  });

  test('a filter value matching no rows yields empty data (not silently all)', () => {
    const r = resolveBind({ dataset: 'receita_canal', x: 'mes', y: 'receita' }, datasets, { canal: 'Inexistente' });
    assert.equal(r.rows.length, 0);
    assert.deepEqual(r.categories, []);
  });
});

describe('resolveBind — aggregations', () => {
  const single: DataMap = {
    t: { dims: ['g'], rows: [
      { g: 'A', v: 10 }, { g: 'A', v: 30 }, { g: 'B', v: 5 },
    ] },
  };
  test('avg', () => {
    const r = resolveBind({ dataset: 't', x: 'g', y: 'v', agg: 'avg' }, single);
    assert.deepEqual(r.series[0].data, [20, 5]);
  });
  test('min / max', () => {
    assert.deepEqual(resolveBind({ dataset: 't', x: 'g', y: 'v', agg: 'min' }, single).series[0].data, [10, 5]);
    assert.deepEqual(resolveBind({ dataset: 't', x: 'g', y: 'v', agg: 'max' }, single).series[0].data, [30, 5]);
  });
  test('count', () => {
    assert.deepEqual(resolveBind({ dataset: 't', x: 'g', y: 'v', agg: 'count' }, single).series[0].data, [2, 1]);
  });
});

describe('resolveBind — totals (kpi)', () => {
  test('totals sum every numeric column over the filtered rows', () => {
    const r = resolveBind({ dataset: 'receita_canal', metrics: ['receita', 'leads'] }, datasets, { canal: 'Pago' });
    assert.equal(r.totals.receita, 2700); // 1200 + 1500
    assert.equal(r.totals.leads, 700);    // 340 + 360
    assert.equal(r.categories.length, 0); // no x/y → no series
  });
});
