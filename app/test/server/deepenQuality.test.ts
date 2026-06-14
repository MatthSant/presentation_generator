/* deepenQuality.test.ts — verificações determinísticas de qualidade do detalhamento:
 * tabela vazia, gráfico de 1 categoria, séries demais e mais de um gráfico. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualityIssues, qualitySuggestions } from '../../src/server/deepenQuality.js';
import type { DataMap, Widget } from '../../src/shared/types.js';

const manyRows: Array<Record<string, unknown>> = [];
for (const g of ['A', 'B']) for (let i = 1; i <= 7; i++) manyRows.push({ g, s: `s${i}`, v: i });

const DS = {
  one: { dims: ['g'], filters: [], rows: [{ g: 'Geral', v: 9 }] },
  multi: { dims: ['g'], filters: [], rows: [{ g: 'A', v: 1 }, { g: 'B', v: 2 }, { g: 'C', v: 3 }] },
  many: { dims: ['g', 's'], filters: [], rows: manyRows },
  vazia: { dims: ['g'], filters: [], rows: [] },
} as unknown as DataMap;

const chart = (dataset: string, extra: Record<string, unknown> = {}): Widget =>
  ({ id: 'c', type: 'chart', chartType: 'bar', title: 'G', bind: { dataset, x: 'g', y: 'v', ...extra } }) as unknown as Widget;
const table = (dataset: string): Widget =>
  ({ id: 't', type: 'table', title: 'T', cols: ['g', 'v'], bind: { dataset } }) as unknown as Widget;

test('gráfico de 1 categoria (a barra "Geral" sozinha) é sinalizado', () => {
  const issues = qualityIssues([chart('one')], DS);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /1 categoria/);
});

test('gráfico com 2+ categorias é aceito', () => {
  assert.deepEqual(qualityIssues([chart('multi')], DS), []);
});

test('gráfico com séries demais (>6) é sinalizado', () => {
  const issues = qualityIssues([chart('many', { series: 's' })], DS);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /séries/);
});

test('tabela vazia (0 linhas) é sinalizada', () => {
  const issues = qualityIssues([table('vazia')], DS);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /vazia/);
});

test('tabela com linhas é aceita', () => {
  assert.deepEqual(qualityIssues([table('multi')], DS), []);
});

test('2 gráficos NÃO bloqueiam (só erro reprova)', () => {
  const issues = qualityIssues([chart('multi'), { ...chart('multi'), id: 'c2' } as Widget], DS);
  assert.deepEqual(issues, []);
});

test('3+ gráficos viram SUGESTÃO (não bloqueante), 2 não', () => {
  const two = [chart('multi'), { ...chart('multi'), id: 'c2' } as Widget];
  assert.deepEqual(qualitySuggestions(two), []);
  const three = [...two, { ...chart('multi'), id: 'c3' } as Widget];
  assert.ok(qualitySuggestions(three).some((i) => /gráfico/.test(i)));
});

test('detalhamento limpo não gera pendências', () => {
  const ws = [table('multi'), chart('multi')] as Widget[];
  assert.deepEqual(qualityIssues(ws, DS), []);
});
