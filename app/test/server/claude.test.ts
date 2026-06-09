/* claude.test.ts — offline (mock) paths of the Anthropic wrapper. Forces
 * CLAUDE_MOCK so it never hits the network even if a key is present. */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateInsights, generateModal, generateModalDeep, type DeepDeps } from '../../src/server/claude.js';
import type { Digest, DeepenCatalog } from '../../src/server/datasetCatalog.js';

let prevKey: string | undefined;
let prevMock: string | undefined;
before(() => {
  prevKey = process.env.ANTHROPIC_API_KEY;
  prevMock = process.env.CLAUDE_MOCK;
  delete process.env.ANTHROPIC_API_KEY;
  process.env.CLAUDE_MOCK = '1';
});
after(() => {
  if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prevKey;
  if (prevMock === undefined) delete process.env.CLAUDE_MOCK; else process.env.CLAUDE_MOCK = prevMock;
});

const DIGEST: Digest = {
  client: 'inde', title: 'Conversão',
  criterios: [
    { id: 'renda', label: 'Renda', grupos: 2, melhor: { grupo: 'Alta', diff_lcto: 42, conv_lcto: 8 }, pior: { grupo: 'Baixa', diff_lcto: -55, conv_lcto: 1 }, papel: 'qualificador', amplitude: '47%', independencia: '78%' },
    { id: 'assessor', label: 'Assessor', grupos: 2, melhor: { grupo: 'Sim', diff_lcto: 16, conv_lcto: 5 }, pior: { grupo: 'Não', diff_lcto: -8, conv_lcto: 3 }, papel: 'proxy de Tempo', amplitude: '16%', independencia: '42%' },
  ],
  codependencia: [
    { fator: 'Renda', amplitude: '47%', independencia: '78%', papel: 'qualificador' },
    { fator: 'Assessor', amplitude: '16%', independencia: '42%', papel: 'proxy de Tempo' },
  ],
};

const CATALOG: DeepenCatalog = {
  tables: [
    { name: 'crit_renda_grp', columns: ['canal', 'grupo', 'diff_lcto', 'conv_lcto'], filters: ['canal'], sample: [{ canal: 'Geral', grupo: 'Alta', diff_lcto: 42 }] },
    { name: 'crit_renda_rank', columns: ['canal', 'pos', 'grupo'], filters: ['canal'], sample: [] },
  ],
};

test('generateInsights (mock): valid content shape with non-empty cards', async () => {
  const { content, mocked } = await generateInsights(DIGEST);
  assert.equal(mocked, true);
  const c = content as { insights: { zones: Array<{ cards: Array<{ tag: string; title: string; detail: string }> }>; method: string } };
  assert.ok(Array.isArray(c.insights.zones) && c.insights.zones.length >= 1);
  assert.ok(c.insights.method.length > 0);
  const cards = c.insights.zones.flatMap((z) => z.cards);
  assert.ok(cards.length >= 1);
  for (const card of cards) {
    assert.ok(card.tag && card.title && card.detail, 'card fields non-empty');
  }
});

test('generateModal (mock): binds only to a catalog table that exists', async () => {
  const { modal, mocked } = await generateModal('aprofunde a renda', { title: 'Renda' }, CATALOG);
  assert.equal(mocked, true);
  const m = modal as { id: string; widgets: Array<{ type: string; text?: string; bind?: { dataset: string } }> };
  assert.ok(m.widgets.length >= 1);
  const names = new Set(CATALOG.tables.map((t) => t.name));
  for (const w of m.widgets) {
    if (w.bind) assert.ok(names.has(w.bind.dataset), `bind.dataset "${w.bind.dataset}" exists in catalog`);
    if (w.type === 'find-note') assert.ok((w.text || '').length > 0);
  }
});

test('generateModal (mock): empty catalog → prose only, no broken bind', async () => {
  const { modal } = await generateModal('x', { title: 'Y' }, { tables: [] });
  const m = modal as { widgets: Array<{ type: string; bind?: unknown }> };
  assert.ok(m.widgets.every((w) => !w.bind), 'no chart bind when no tables');
});

function fakeDeps(reply: { status: string; table?: unknown; motivo?: string }): { deps: DeepDeps; registered: unknown[]; calls: Array<{ fn: string; args: unknown }> } {
  const registered: unknown[] = [];
  const calls: Array<{ fn: string; args: unknown }> = [];
  const deps: DeepDeps = {
    meta: { criterios: [{ id: 'renda', label: 'Renda' }, { id: 'idade', label: 'Idade' }], canais: ['Geral'], metricas: ['diff'] },
    runQuery: async (fn, args) => { calls.push({ fn, args }); return reply as never; },
    registerTable: (table) => { registered.push(table); return `q-test-${registered.length - 1}`; },
  };
  return { deps, registered, calls };
}

test('generateModalDeep (mock): runs a query, registers the table, binds to it', async () => {
  const { deps, registered, calls } = fakeDeps({ status: 'ok', table: { dims: ['grupo', 'cruzar'], filters: [], rows: [{ grupo: 'A', cruzar: 'X', valor: 5 }] }, summary: 's' });
  const { modal, mocked } = await generateModalDeep('cruze renda com idade', { bind: { dataset: 'crit_renda_conv' } }, { tables: [] }, deps);
  assert.equal(mocked, true);
  assert.equal(calls[0].fn, 'crosstab');                 // the app was asked to compute a cut
  assert.equal(registered.length, 1);                    // and its result merged as a table
  const m = modal as { widgets: Array<{ type: string; bind?: { dataset: string } }> };
  const chart = m.widgets.find((w) => w.type === 'chart');
  assert.ok(chart && chart.bind?.dataset === 'q-test-0', 'chart binds to the registered key');
});

test('generateModalDeep (mock): nao_disponivel → prose only, no table registered', async () => {
  const { deps, registered } = fakeDeps({ status: 'nao_disponivel', motivo: 'sem respondentes' });
  const { modal } = await generateModalDeep('x', {}, { tables: [] }, deps);
  assert.equal(registered.length, 0);
  const m = modal as { widgets: Array<{ type: string; bind?: unknown }> };
  assert.ok(m.widgets.every((w) => !w.bind), 'no bind when the cut is unavailable');
});
