/* trend.test.ts — regression helpers (pure math, no DOM). */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { buildTrendSeries, calcR2 } = await import('../../src/client/trend.js');
import type { Point } from '../../src/client/trend.js';

test('buildTrendSeries: linear fit recovers the line and a perfect R²', () => {
  const pts: Point[] = [[1, 3], [2, 5], [3, 7], [4, 9]]; // y = 2x + 1
  const s = buildTrendSeries(pts, 'linear');
  assert.ok(s);
  assert.equal(s!.type, 'line');
  assert.match(s!.name, /Linear \(R² = 1\.00\)/);
  assert.equal(s!.data[0][0], 1);                       // spans from xMin
  assert.ok(Math.abs(s!.data[0][1] - 3) < 1e-6);        // y(1) = 3
  const last = s!.data[s!.data.length - 1];
  assert.equal(last[0], 4);                             // …to xMax
  assert.ok(Math.abs(last[1] - 9) < 1e-6);              // y(4) = 9
});

test('buildTrendSeries: returns null with fewer than two points', () => {
  assert.equal(buildTrendSeries([[1, 1]], 'linear'), null);
  assert.equal(buildTrendSeries([], 'linear'), null);
});

test('calcR2: a perfect fit scores 1, a flat line under spread scores below 1', () => {
  assert.equal(calcR2([[0, 0], [1, 1], [2, 2]], x => x), 1);
  assert.ok(calcR2([[0, 0], [1, 2], [2, 1]], () => 1) < 1);
});
