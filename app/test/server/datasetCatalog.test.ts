/* datasetCatalog.test.ts — digest + catalog builders (pure, no I/O). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigest, buildCatalog } from '../../src/server/datasetCatalog.js';

const CONFIG = {
  client: 'inde', title: 'Conversão',
  criterios: [
    { id: 'renda', label: 'Renda', abbr: 'Renda' },
    { id: 'idade', label: 'Idade', abbr: 'Idade' },
  ],
};

const DATASET = {
  crit_renda_grp: {
    dims: ['grupo'], filters: ['canal'],
    rows: [
      { canal: 'Geral', grupo: 'Alta', diff_lcto: 42.3, conv_lcto: 8.1 },
      { canal: 'Geral', grupo: 'Baixa', diff_lcto: -55.8, conv_lcto: 1.2 },
      { canal: 'Pago', grupo: 'Alta', diff_lcto: 30, conv_lcto: 6 },
    ],
  },
  crit_idade_grp: {
    dims: ['grupo'], filters: ['canal'],
    rows: [{ canal: 'Geral', grupo: '45-54', diff_lcto: 5, conv_lcto: 3 }],
  },
  cod_fatores: {
    dims: ['Fator'], filters: ['canal'],
    rows: [
      { canal: 'Geral', Fator: 'Renda', Amplitude: '47%', 'Independ.': '78%', Papel: 'qualificador' },
      { canal: 'Geral', Fator: 'Idade', Amplitude: '6%', 'Independ.': '96%', Papel: 'baixo impacto' },
      { canal: 'Pago', Fator: 'Renda', Amplitude: '50%', 'Independ.': '80%', Papel: 'qualificador' },
    ],
  },
};

test('buildDigest: best/worst group by diff_lcto on Geral + codependency role', () => {
  const d = buildDigest(CONFIG, DATASET);
  assert.equal(d.client, 'inde');
  assert.equal(d.criterios.length, 2);

  const renda = d.criterios[0];
  assert.equal(renda.melhor?.grupo, 'Alta');
  assert.equal(renda.pior?.grupo, 'Baixa');
  assert.equal(renda.grupos, 2);            // only Geral rows counted
  assert.equal(renda.papel, 'qualificador');
  assert.equal(renda.amplitude, '47%');
  assert.equal(renda.independencia, '78%');
});

test('buildDigest: codependencia summary is Geral-only', () => {
  const d = buildDigest(CONFIG, DATASET);
  assert.equal(d.codependencia.length, 2); // Geral rows only, not Pago
  assert.ok(d.codependencia.every((r) => typeof r.papel === 'string'));
});

test('buildDigest: criterion with no grp table degrades gracefully', () => {
  const d = buildDigest({ criterios: [{ id: 'ausente', label: 'X' }] }, DATASET);
  assert.equal(d.criterios[0].melhor, null);
  assert.equal(d.criterios[0].grupos, 0);
});

test('buildCatalog: every table → name + columns + sample (≤2 rows)', () => {
  const cat = buildCatalog(DATASET);
  const renda = cat.tables.find((t) => t.name === 'crit_renda_grp');
  assert.ok(renda);
  assert.deepEqual(renda.columns, ['canal', 'grupo', 'diff_lcto', 'conv_lcto']);
  assert.deepEqual(renda.filters, ['canal']);
  assert.equal(renda.sample.length, 2);
});
