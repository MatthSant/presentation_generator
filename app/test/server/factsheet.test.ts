/* factsheet.test.ts — o factsheet entregue ao critic carrega os NÚMEROS REAIS dos
 * binds (verdade-base da validação numérica). Resolve totais, séries e linhas certas. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFactsheet } from '../../src/server/deepenLoop.js';
import type { DataMap, Widget } from '../../src/shared/types.js';

const DS = {
  conv: {
    dims: ['grupo'], filters: [],
    rows: [
      { grupo: 'Cold', pago: 1.7, org: 14.3 },
      { grupo: 'Warm', pago: 3.0, org: 14.8 },
      { grupo: 'Hot', pago: 5.4, org: 14.6 },
    ],
  },
} as unknown as DataMap;

test('factsheet resolve os valores reais de um gráfico (categorias + série)', () => {
  const chart = { id: 'c', type: 'chart', chartType: 'bar', title: 'Conversão paga', bind: { dataset: 'conv', x: 'grupo', y: 'pago' } } as unknown as Widget;
  const sheet = buildFactsheet([chart], DS) as Array<{ categorias: string[]; series: Array<{ valores: number[] }> }>;
  assert.equal(sheet.length, 1);
  assert.deepEqual(sheet[0].categorias, ['Cold', 'Warm', 'Hot']);
  assert.deepEqual(sheet[0].series[0].valores, [1.7, 3.0, 5.4]);
});

test('factsheet traz as linhas reais de uma tabela (para conferir números da prosa)', () => {
  const table = { id: 't', type: 'table', title: 'Inversão', cols: ['grupo', 'pago', 'org'], bind: { dataset: 'conv' } } as unknown as Widget;
  const sheet = buildFactsheet([table], DS) as Array<{ linhas: Array<Record<string, unknown>> }>;
  assert.equal(sheet[0].linhas.length, 3);
  assert.equal(sheet[0].linhas[0].org, 14.3);
});

test('factsheet ignora widgets sem dado (highlight/find-note não entram)', () => {
  const prose = { id: 'h', type: 'highlight', text: 'CPA +35%' } as unknown as Widget;
  assert.deepEqual(buildFactsheet([prose], DS), []);
});

test('factsheet vazio quando a prosa cita números sem nenhuma tabela/gráfico', () => {
  const ws = [
    { id: 'h', type: 'highlight', text: 'Cold converte 1,7% no pago' },
    { id: 'n', type: 'find-note', text: 'gap de 4,6 p.p.' },
  ] as unknown as Widget[];
  // sem widget de dado → factsheet vazio → o critic deve cobrar a tabela que sustente os números
  assert.deepEqual(buildFactsheet(ws, DS), []);
});

test('factsheet NÃO dobra o total quando há linha agregada "Geral" (já é a soma)', () => {
  const ds = {
    esc: {
      dims: ['escopo'], filters: [],
      rows: [
        { escopo: 'Pago', Vendas: 249, Leads: 10114 },
        { escopo: 'Orgânico', Vendas: 552, Leads: 9108 },
        { escopo: 'Geral', Vendas: 801, Leads: 19222 },
      ],
    },
  } as unknown as DataMap;
  const ws = [{ id: 'c', type: 'chart', title: 'Vendas', bind: { dataset: 'esc', x: 'escopo', y: 'Vendas' } }] as unknown as Widget[];
  const fs = buildFactsheet(ws, ds)[0] as { totais: Record<string, number> };
  assert.equal(fs.totais.Vendas, 801);   // não 1602 (= 249+552+801)
  assert.equal(fs.totais.Leads, 19222);  // não 38444
});
