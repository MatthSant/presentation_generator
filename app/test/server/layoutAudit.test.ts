import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditLayout, normalizeRows, rowsToItems, packFallback, layW, type LayWidget, type LayoutCell } from '../../src/server/layoutAudit.ts';

const W: LayWidget[] = [
  { id: 'ans', type: 'highlight' },
  { id: 'k1', type: 'kpi' }, { id: 'k2', type: 'kpi' },
  { id: 'ch', type: 'chart' }, { id: 'tb', type: 'table' },
  { id: 'fb', type: 'find-block' },
];

test('auditLayout: linha que soma > 12 é HARD', () => {
  const rows: LayoutCell[][] = [[{ id: 'ch', w: 8 }, { id: 'tb', w: 6 }]];
  const a = auditLayout(rows, W);
  assert.ok(a.hard.some((m) => /soma 14/.test(m)), a.hard.join('|'));
});

test('auditLayout: widget faltando e repetido são HARD', () => {
  const rows: LayoutCell[][] = [[{ id: 'ans', w: 12 }], [{ id: 'k1', w: 3 }, { id: 'k1', w: 3 }]];
  const a = auditLayout(rows, W);
  assert.ok(a.hard.some((m) => /k1.*mais de uma vez/.test(m)));
  assert.ok(a.hard.some((m) => /faltou posicionar.*"ch"/.test(m)));
});

test('auditLayout: layout limpo e pareado não tem hard nem soft', () => {
  const rows: LayoutCell[][] = [
    [{ id: 'ans', w: 12, h: 2 }],
    [{ id: 'k1', w: 6, h: 2 }, { id: 'k2', w: 6, h: 2 }],     // kpis em linha própria, cheia
    [{ id: 'ch', w: 6, h: 4 }, { id: 'tb', w: 6, h: 4 }],
    [{ id: 'fb', w: 12, h: 3 }],
  ];
  const a = auditLayout(rows, W);
  assert.deepEqual(a.hard, []);
  assert.deepEqual(a.soft, [], a.soft.join('|'));
});

test('auditLayout: kpi na linha de um gráfico é SOFT (linha própria)', () => {
  const rows: LayoutCell[][] = [
    [{ id: 'ans', w: 12, h: 2 }],
    [{ id: 'k1', w: 3, h: 4 }, { id: 'k2', w: 3, h: 4 }, { id: 'ch', w: 6, h: 4 }],
    [{ id: 'fb', w: 4, h: 4 }, { id: 'tb', w: 8, h: 4 }],
  ];
  const a = auditLayout(rows, W);
  assert.ok(a.soft.some((m) => /linha própria/.test(m)), a.soft.join('|'));
});

test('auditLayout: linha só de kpis que não fecha 12 é SOFT', () => {
  const rows: LayoutCell[][] = [
    [{ id: 'ans', w: 12, h: 2 }],
    [{ id: 'k1', w: 3, h: 2 }, { id: 'k2', w: 3, h: 2 }],     // soma 6 — metade vazia
    [{ id: 'ch', w: 6, h: 4 }, { id: 'tb', w: 6, h: 4 }],
    [{ id: 'fb', w: 12, h: 3 }],
  ];
  const a = auditLayout(rows, W);
  assert.ok(a.soft.some((m) => /estique-os até fechar 12/.test(m)), a.soft.join('|'));
});

test('auditLayout: vão horizontal (linha rala) é SOFT', () => {
  const rows: LayoutCell[][] = [
    [{ id: 'ans', w: 12 }],
    [{ id: 'k1', w: 3 }],                    // sozinho, 9 colunas vazias
    [{ id: 'k2', w: 3, h: 4 }, { id: 'ch', w: 6, h: 4 }],
    [{ id: 'fb', w: 4, h: 4 }, { id: 'tb', w: 8, h: 4 }],
  ];
  const a = auditLayout(rows, W);
  assert.deepEqual(a.hard, []);
  assert.ok(a.soft.some((m) => /colunas vazias/.test(m)), a.soft.join('|'));
});

test('auditLayout: vão vertical (alturas díspares na linha) é SOFT', () => {
  const rows: LayoutCell[][] = [
    [{ id: 'ans', w: 12 }],
    [{ id: 'k1', w: 3, h: 2 }, { id: 'k2', w: 3, h: 2 }, { id: 'tb', w: 6, h: 6 }], // h2 vs h6
    [{ id: 'fb', w: 4, h: 4 }, { id: 'ch', w: 8, h: 4 }],
  ];
  const a = auditLayout(rows, W);
  assert.ok(a.soft.some((m) => /vão vertical/.test(m)), a.soft.join('|'));
});

test('auditLayout: gráfico longe de qualquer conclusão é SOFT', () => {
  const rows: LayoutCell[][] = [
    [{ id: 'ans', w: 12 }],
    [{ id: 'k1', w: 6, h: 4 }, { id: 'k2', w: 6, h: 4 }],
    [{ id: 'ch', w: 6, h: 4 }, { id: 'tb', w: 6, h: 4 }], // dado isolado dos textos
    [{ id: 'fb', w: 12, h: 3 }],
  ];
  auditLayout(rows, W);   // 'fb' (linha 4) é adjacente à linha 3 (ch/tb) → dados COM conclusão perto
  // monta um caso em que o gráfico fica realmente longe.
  const far: LayoutCell[][] = [
    [{ id: 'fb', w: 12, h: 3 }],
    [{ id: 'ans', w: 12 }],
    [{ id: 'k1', w: 6, h: 4 }, { id: 'k2', w: 6, h: 4 }],
    [{ id: 'ch', w: 6, h: 4 }, { id: 'tb', w: 6, h: 4 }],
  ];
  const b = auditLayout(far, W);
  assert.ok(b.soft.some((m) => /longe de qualquer conclusão/.test(m)), b.soft.join('|'));
});

test('packFallback: sempre produz linhas ≤ 12 e cobre todos os widgets', () => {
  const many: LayWidget[] = [
    { id: 'a', type: 'highlight' }, { id: 'b', type: 'kpi' }, { id: 'c', type: 'kpi' },
    { id: 'd', type: 'kpi' }, { id: 'e', type: 'table' }, { id: 'f', type: 'chart' },
    { id: 'g', type: 'find-block' }, { id: 'h', type: 'find-note' }, { id: 'i', type: 'ni-vertical' },
  ];
  const items = packFallback(many);
  assert.equal(items.length, many.length);
  const byY = new Map<number, number>();
  for (const it of items) byY.set(it.y, (byY.get(it.y) ?? 0) + it.w);
  for (const [, sum] of byY) assert.ok(sum <= 12, `linha soma ${sum} > 12`);
  // resposta de topo em largura cheia
  const ans = items.find((i) => i.id === 'a')!;
  assert.equal(ans.w, 12);
  assert.equal(ans.y, 0);
});

test('packFallback: toda linha soma exatamente 12 (sem "sobra 8")', () => {
  const many: LayWidget[] = [
    { id: 'a', type: 'highlight' }, { id: 'b', type: 'kpi' }, { id: 'c', type: 'kpi' },
    { id: 'd', type: 'chart' }, { id: 'e', type: 'table' },
    { id: 'f', type: 'find-block' }, { id: 'g', type: 'find-block' },
  ];
  const byY = new Map<number, number>();
  for (const it of packFallback(many)) byY.set(it.y, (byY.get(it.y) ?? 0) + it.w);
  for (const [yy, sum] of byY) assert.equal(sum, 12, `linha y=${yy} soma ${sum}`);
});

test('packFallback: papéis não se misturam na mesma linha (alturas casam)', () => {
  const many: LayWidget[] = [
    { id: 'a', type: 'highlight' },
    { id: 'k1', type: 'kpi' }, { id: 'k2', type: 'kpi' },
    { id: 'fb', type: 'find-block' },   // h3 — não pode cair na linha dos kpi (h2)
    { id: 'ch', type: 'chart' },
  ];
  const items = packFallback(many);
  const rowOf = new Map<number, string[]>();
  for (const it of items) (rowOf.get(it.y) ?? rowOf.set(it.y, []).get(it.y)!).push(it.type);
  for (const [, types] of rowOf) {
    const kinds = new Set(types.map((t) => (t === 'kpi' ? 'metric' : t === 'find-block' ? 'concl' : t)));
    assert.ok(kinds.size === 1, `linha mistura papéis: ${types.join(',')}`);
  }
});

test('packFallback: run de 5 métricas balanceia 3+2, não 4+1', () => {
  const many: LayWidget[] = [
    { id: 'k1', type: 'kpi' }, { id: 'k2', type: 'kpi' }, { id: 'k3', type: 'kpi' },
    { id: 'k4', type: 'kpi' }, { id: 'k5', type: 'kpi' },
  ];
  const items = packFallback(many);
  const rows = [...new Set(items.map((i) => i.y))].map((yy) => items.filter((i) => i.y === yy));
  assert.deepEqual(rows.map((r) => r.length).sort(), [2, 3]);
  for (const r of rows) assert.equal(r.reduce((s, i) => s + i.w, 0), 12);
});

test('rowsToItems: converte rows em coordenadas contíguas sem estourar', () => {
  const typeOf = new Map(W.map((w) => [w.id, w.type]));
  const rows: LayoutCell[][] = [
    [{ id: 'ans', w: 12, h: 2 }],
    [{ id: 'k1', w: 3, h: 3 }, { id: 'ch', w: 9, h: 4 }],
  ];
  const items = rowsToItems(rows, typeOf);
  assert.equal(items.find((i) => i.id === 'ans')!.y, 0);
  assert.equal(items.find((i) => i.id === 'k1')!.y, 2);     // y avança pela altura da 1ª linha
  assert.equal(items.find((i) => i.id === 'ch')!.x, 3);     // encosta após o kpi
  assert.equal(layW('chart'), 6);
});

/* normalizeRows — a garantia determinística do que o prompt pede e o modelo ignora. */
test('normalizeRows: a resposta sai de junto do gráfico e vira linha própria em w12', () => {
  // o erro real do agente: highlight (h2) espremido ao lado do chart (h4) → meia tela vazia
  const rows: LayoutCell[][] = [[{ id: 'ans', w: 6, h: 2 }, { id: 'ch', w: 6, h: 4 }], [{ id: 'tb', w: 12, h: 4 }]];
  const out = normalizeRows(rows, W);
  assert.deepEqual(out[0], [{ id: 'ans', w: 12, h: 2 }]);
  assert.deepEqual(out[1], [{ id: 'ch', w: 6, h: 4 }]);   // o gráfico segue na ordem, sem a resposta
  assert.equal(out.length, 3);
});

test('normalizeRows: não mexe quando o 1º widget não é a resposta', () => {
  const outros: LayWidget[] = [{ id: 'ch', type: 'chart' }, { id: 'tb', type: 'table' }];
  const rows: LayoutCell[][] = [[{ id: 'ch', w: 6, h: 4 }, { id: 'tb', w: 6, h: 4 }]];
  assert.deepEqual(normalizeRows(rows, outros), rows);
});

test('normalizeRows: agente esqueceu a resposta -> devolve como veio (o audit acusa)', () => {
  const rows: LayoutCell[][] = [[{ id: 'ch', w: 6, h: 4 }]];
  assert.deepEqual(normalizeRows(rows, W), rows);
});

test('vão vertical: h2 ao lado de h4 é sinalizado (o tile estica e sobra vazio)', () => {
  const a = auditLayout([[{ id: 'k1', w: 6, h: 2 }, { id: 'ch', w: 6, h: 4 }]], [W[1], W[3]]);
  assert.ok(a.soft.some((s) => /vão vertical/.test(s)), a.soft.join(' | '));
});
