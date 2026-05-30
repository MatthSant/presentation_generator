import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDataset, validateSection, validateLayout, validateAnalysis,
} from '../../src/shared/validate.js';
import type { DataMap } from '../../src/shared/types.js';

const datasets: DataMap = {
  receita_canal: {
    dims: ['mes'], filters: ['canal'],
    rows: [{ mes: 'Jan', canal: 'Pago', receita: 1200, leads: 340 }],
  },
};

/* helper: assert at least one error matches path + message substring */
function hasError(errors: { path: string; message: string }[], path: string, msg?: string) {
  return errors.some(e => e.path === path && (msg === undefined || e.message.includes(msg)));
}

describe('validateDataset', () => {
  test('accepts a well-formed dataset', () => {
    assert.equal(validateDataset(datasets).length, 0);
  });
  test('rejects a non-object', () => {
    assert.ok(validateDataset(42).length > 0);
  });
  test('flags missing dims and rows', () => {
    const errs = validateDataset({ t: { rows: 'x' } });
    assert.ok(hasError(errs, 't.dims'));
    assert.ok(hasError(errs, 't.rows'));
  });
  test('flags a row missing a declared dimension', () => {
    const errs = validateDataset({ t: { dims: ['mes'], rows: [{ canal: 'Pago' }] } });
    assert.ok(hasError(errs, 't.rows[0]', 'mes'));
  });
});

describe('validateSection — structure', () => {
  const base = { id: 's01', header: { title: 'X' }, widgets: [] };
  test('accepts a minimal valid section', () => {
    assert.equal(validateSection(base).length, 0);
  });
  test('requires id and header.title', () => {
    const errs = validateSection({ header: {}, widgets: [] });
    assert.ok(hasError(errs, 'id'));
    assert.ok(hasError(errs, 'header.title'));
  });
  test('flags duplicate widget ids', () => {
    const errs = validateSection({
      ...base,
      widgets: [
        { id: 'a', type: 'xs', text: 'one' },
        { id: 'a', type: 'xs', text: 'two' },
      ],
    });
    assert.ok(hasError(errs, 'widgets[1].id', 'duplicate'));
  });
});

describe('validateSection — widget rules', () => {
  const wrap = (w: unknown) => validateSection({ id: 's', header: { title: 'T' }, widgets: [w] });

  test('unknown widget type', () => {
    assert.ok(hasError(wrap({ id: 'x', type: 'bogus' }), 'widgets[0].type', 'unknown'));
  });
  test('find-block requires title', () => {
    assert.ok(hasError(wrap({ id: 'x', type: 'find-block' }), 'widgets[0].title'));
  });
  test('find-block invalid tagColor', () => {
    assert.ok(hasError(wrap({ id: 'x', type: 'find-block', title: 'T', tagColor: 'z' }), 'widgets[0].tagColor'));
  });
  test('chart invalid chartType', () => {
    assert.ok(hasError(wrap({ id: 'x', type: 'chart', chartType: 'pyramid', series: [] }), 'widgets[0].chartType'));
  });
  test('chart without bind requires inline series', () => {
    assert.ok(hasError(wrap({ id: 'x', type: 'chart', chartType: 'bar' }), 'widgets[0].series'));
  });
  test('kpi item without bind requires value', () => {
    assert.ok(hasError(wrap({ id: 'x', type: 'kpi-row', items: [{ label: 'A' }] }), 'widgets[0].items[0].value'));
  });
  test('text widgets require text', () => {
    assert.ok(hasError(wrap({ id: 'x', type: 'label-sec' }), 'widgets[0].text'));
  });
  test('bind on a non-bindable type is rejected', () => {
    assert.ok(hasError(wrap({ id: 'x', type: 'xs', text: 'a', bind: { dataset: 'd' } }), 'widgets[0].bind'));
  });
});

describe('validateSection — bind against datasets', () => {
  const wrap = (w: unknown) => validateSection({ id: 's', header: { title: 'T' }, widgets: [w] }, datasets);

  test('accepts a bind to an existing dataset + columns', () => {
    const errs = wrap({ id: 'c', type: 'chart', chartType: 'bar', bind: { dataset: 'receita_canal', x: 'mes', y: 'receita' } });
    assert.equal(errs.length, 0);
  });
  test('rejects a bind to a missing dataset', () => {
    assert.ok(hasError(wrap({ id: 'c', type: 'chart', chartType: 'bar', bind: { dataset: 'ghost' } }), 'widgets[0].bind.dataset', 'does not exist'));
  });
  test('rejects a bind to a missing column', () => {
    assert.ok(hasError(wrap({ id: 'c', type: 'chart', chartType: 'bar', bind: { dataset: 'receita_canal', x: 'ano', y: 'receita' } }), 'widgets[0].bind.x'));
  });
});

describe('validateLayout', () => {
  test('accepts an empty layout', () => {
    assert.equal(validateLayout({}).length, 0);
    assert.equal(validateLayout({ sections: {} }).length, 0);
  });
  test('flags non-numeric coordinates', () => {
    const errs = validateLayout({ sections: { s01: [{ id: 'a', x: 'no', y: 0, w: 4, h: 2 }] } });
    assert.ok(hasError(errs, 'sections.s01[0].x'));
  });
  test('flags a missing item id', () => {
    const errs = validateLayout({ sections: { s01: [{ x: 0, y: 0, w: 4, h: 2 }] } });
    assert.ok(hasError(errs, 'sections.s01[0].id'));
  });
});

describe('validateAnalysis (combined)', () => {
  test('ok when all layers are valid', () => {
    const res = validateAnalysis({
      dataset: datasets,
      sections: [{ id: 's01', header: { title: 'T' }, widgets: [
        { id: 'c', type: 'chart', chartType: 'bar', bind: { dataset: 'receita_canal', x: 'mes', y: 'receita' } },
      ] }],
      layout: { sections: { s01: [{ id: 'c', x: 0, y: 0, w: 12, h: 6 }] } },
    });
    assert.equal(res.ok, true);
    assert.equal(res.errors.length, 0);
  });

  test('aggregates errors across layers and reports ok=false', () => {
    const res = validateAnalysis({
      dataset: { t: { rows: [] } },                                   // dims missing
      sections: [{ id: 's', header: { title: 'T' }, widgets: [{ id: 'x', type: 'bogus' }] }],
      layout: { sections: { s: 'nope' } },
    });
    assert.equal(res.ok, false);
    assert.ok(res.errors.some(e => e.layer === 'dataset'));
    assert.ok(res.errors.some(e => e.layer === 'view'));
    assert.ok(res.errors.some(e => e.layer === 'layout'));
  });
});
