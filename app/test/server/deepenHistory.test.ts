/* deepenHistory.test.ts — a telemetria do gate de qualidade fica SALVA no
 * histórico (tentativas, issues encontradas, pendências residuais) para calibrar
 * o motor ao longo do tempo. Round-trip: grava → lê via listHistory + getEntry. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../src/server/db.js';
import { recordDeepen, listHistory, getEntry } from '../../src/server/deepenHistory.js';

test('recordDeepen salva a telemetria do gate e listHistory a devolve', () => {
  const db = openDb(':memory:');
  const id = recordDeepen(db, {
    client: 'acme', slug: 'lcto', analysisType: 'historico-lancamentos', origem: 'pergunta',
    sectionId: 's01', blockId: 'b1', modalId: 'det-x-1', prompt: 'por que a conversão caiu?',
    validatedOk: true, mocked: false,
    gateAttempts: 3,
    gateIssues: ['"Inversão": tabela vazia (0 linhas)', 'número "18,9%" não confere com os dados'],
    gateResidual: ['gráfico com 7 séries (>6)'],
  });

  const list = listHistory(db, { client: 'acme', slug: 'lcto' }) as Array<Record<string, unknown>>;
  const row = list.find((r) => r.id === id)!;
  assert.equal(row.gate_attempts, 3);
  assert.deepEqual(JSON.parse(row.gate_issues as string), ['"Inversão": tabela vazia (0 linhas)', 'número "18,9%" não confere com os dados']);
  assert.deepEqual(JSON.parse(row.gate_residual as string), ['gráfico com 7 séries (>6)']);

  const entry = getEntry(db, id)!;
  assert.equal(entry.gate_attempts, 3);
});

test('telemetria default (geração limpa numa tentativa): 1 tentativa, sem issues', () => {
  const db = openDb(':memory:');
  const id = recordDeepen(db, {
    client: 'acme', slug: 'lcto', analysisType: 'conversao-perfil', origem: 'card',
    modalId: 'modal-1', prompt: 'detalhe', validatedOk: true, mocked: false,
  });
  const entry = getEntry(db, id)! as Record<string, unknown>;
  assert.equal(entry.gate_attempts, 1);
  assert.deepEqual(JSON.parse(entry.gate_issues as string), []);
  assert.deepEqual(JSON.parse(entry.gate_residual as string), []);
});
