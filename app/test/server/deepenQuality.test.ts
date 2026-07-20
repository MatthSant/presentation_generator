/* deepenQuality.test.ts — verificações determinísticas de qualidade do detalhamento:
 * tabela vazia, gráfico de 1 categoria, séries demais e mais de um gráfico. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualityIssues, qualitySuggestions, missingAnswerWidget } from '../../src/server/deepenQuality.js';
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

test('detalhamento só com dados crus (chart+table, sem prosa) é sinalizado', () => {
  assert.ok(missingAnswerWidget([{ type: 'chart' }, { type: 'table' }] as Widget[]));
});

test('detalhamento com um widget de resposta (highlight/find-block) passa', () => {
  assert.equal(missingAnswerWidget([{ type: 'highlight' }, { type: 'chart' }] as Widget[]), null);
  assert.equal(missingAnswerWidget([{ type: 'table' }, { type: 'find-block' }] as Widget[]), null);
  assert.equal(missingAnswerWidget([] as Widget[]), null);
});

test('tabela de schema irregular: coluna presente só em ALGUMAS linhas é válida (não falso-positivo)', () => {
  // 1ª linha (orgânico) sem ROAS; outras têm — como em por_temperatura. Bindar ROAS deve passar.
  const ds = {
    temp: {
      dims: ['temperatura'], filters: [],
      rows: [
        { temperatura: 'N/C', Retorno: 82207, Invest: 0 },              // sem ROAS (sem mídia)
        { temperatura: 'Quente', Retorno: 22043, Invest: 11501, ROAS: 1.92 },
        { temperatura: 'Morno', Retorno: 590, Invest: 3723, ROAS: 0.16 },
      ],
    },
  } as unknown as DataMap;
  const w = { id: 't', type: 'table', title: 'Por temperatura', cols: ['temperatura', 'ROAS'], bind: { dataset: 'temp' } } as unknown as Widget;
  assert.deepEqual(qualityIssues([w], ds), []);
});

// ── unverifiedKpiValues: aviso NEUTRO ao critic, nunca reprovação direta ─────
import { unverifiedKpiValues } from '../../src/server/deepenQuality.js';

const DSK = {
  fatos: { dims: ['origem'], filters: [], rows: [
    { origem: 'Pago', cliques: 4614, invest: 14271.53, receita: 9902.03 },
    { origem: 'Geral', cliques: 4614, invest: 14271.53, receita: 16307.07 },
  ] },
} as unknown as DataMap;
const kpi = (label: string, value: string): Widget =>
  ({ id: `k-${label}`, type: 'kpi', label, value }) as unknown as Widget;
const boundTable = (): Widget =>
  ({ id: 't', type: 'table', title: 'T', bind: { dataset: 'fatos' } }) as unknown as Widget;

test('kpi sem bind com número inventado (58.180 vs 4.614 real) entra no aviso', () => {
  const avisos = unverifiedKpiValues([boundTable(), kpi('Cliques', '58.180')], DSK);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /Cliques/);
});

test('kpi cujo número ESTÁ nos dados (com formatação pt-BR) não gera aviso', () => {
  assert.deepEqual(unverifiedKpiValues([boundTable(), kpi('Investimento', 'R$ 14.271,53')], DSK), []);
});

test('derivação por diferença (receita orgânica = total − pago) não gera aviso', () => {
  // 16307.07 − 9902.03 = 6405.04 → "R$ 6.405,04" é derivável, não suspeito
  assert.deepEqual(unverifiedKpiValues([boundTable(), kpi('Receita orgânica', 'R$ 6.405,04')], DSK), []);
});

test('arredondamento do dado real não gera aviso (tolerância)', () => {
  assert.deepEqual(unverifiedKpiValues([boundTable(), kpi('Investimento', 'R$ 14.272')], DSK), []);
});

test('sem NENHUM widget de dado resolvível, não há base de comparação — sem aviso', () => {
  assert.deepEqual(unverifiedKpiValues([kpi('Cliques', '58.180')], DSK), []);
});

test('kpi COM bind não entra no aviso (o bind já é a verificação)', () => {
  const k = { id: 'k', type: 'kpi', label: 'Cliques', value: '99.999', bind: { dataset: 'fatos', metrics: ['cliques'] } } as unknown as Widget;
  assert.deepEqual(unverifiedKpiValues([boundTable(), k], DSK), []);
});
