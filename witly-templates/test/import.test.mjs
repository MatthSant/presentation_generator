// node --test test/import.test.mjs — importador do deepen_history (spec 002 US5)
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importRows, mapRow, readHistory, respostaFromModal } from '../scripts/import-deepen-history.mjs';

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'witly-imp-'));
  const file = path.join(dir, 'comments.db');
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE deepen_history (id TEXT PRIMARY KEY, client TEXT, slug TEXT, analysis_type TEXT, origem TEXT, section_id TEXT, block_id TEXT, modal_id TEXT,
    prompt TEXT, prev_modal_id TEXT, card_context TEXT, modal_json TEXT, validated_ok INTEGER, validation_errors TEXT, model TEXT, tokens_in INTEGER, tokens_out INTEGER,
    cost_usd REAL, mocked INTEGER, rating INTEGER, feedback_text TEXT, feedback_at TEXT, status TEXT, gate_attempts INTEGER, gate_issues TEXT, gate_residual TEXT, created_at TEXT)`);
  const ins = db.prepare(`INSERT INTO deepen_history (id, client, slug, analysis_type, origem, section_id, prompt, modal_json, model, rating, feedback_text, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  ins.run('h1', 'enxoval', 'acomp', 'acompanhamento-lancamento', 'card', 's01', 'Por que o CPL subiu?', JSON.stringify({ title: 'CPL', widgets: [{ type: 'highlight', text: 'CPM subiu 30%.' }, { type: 'find-block', title: 'Leilão', detail: 'sem CTR' }] }), 'claude', 5, null, 'aprovado', '2026-08-01T10:00:00Z');
  ins.run('h2', 'enxoval', 'acomp', 'acompanhamento-lancamento', 'custom', 's01', 'Qual canal?', '{"widgets":[]}', 'claude', null, 'descartado: inventou meta por canal', 'descartado', '2026-08-02T10:00:00Z');
  ins.run('h3', 'inde', 'cp', 'conversao-perfil', 'card', 's02', 'Lead joao@gmail.com converte?', '{}', 'claude', null, null, 'pendente', '2026-08-03T10:00:00Z');
  ins.run('h4', 'inde', 'cp', 'conversao-perfil', 'card', 's02', '', '{}', 'claude', null, null, 'pendente', '2026-08-04T10:00:00Z');
  db.close();
  return { dir, file };
}

test('respostaFromModal extrai a prosa dos widgets', () => {
  assert.equal(respostaFromModal(JSON.stringify({ title: 'T', widgets: [{ type: 'highlight', text: 'a' }, { type: 'x' }] })), '# T\n- [highlight] a');
  assert.equal(respostaFromModal('não é json'), '');
});

test('mapRow: slug mapeado, descarte com motivo, rating', () => {
  const a = mapRow({ id: '1', analysis_type: 'acompanhamento-lancamento', client: 'c', prompt: 'p', modal_json: '{}', status: 'descartado', feedback_text: 'x · descartado: inventou', rating: 3, created_at: 't' });
  assert.equal(a.slug, 'acompanhamento-diario');
  assert.equal(a.descartado, true);
  assert.equal(a.motivo, 'inventou');
  assert.equal(a.avaliacao, 3);
  assert.equal(a.id, 'app-1');
});

test('readHistory + importRows: importa, pula PII e sem prompt, gera SQL', () => {
  const { dir, file } = fixture();
  try {
    const rows = readHistory(file);
    assert.equal(rows.length, 4);
    const r = importRows(rows);
    assert.equal(r.ok, 2);
    assert.deepEqual(r.skipped.map((s) => s.id).sort(), ['h3', 'h4']);
    assert.match(r.skipped.find((s) => s.id === 'h3').motivo, /PII: email/);
    assert.equal(r.sql.length, 2);
    assert.match(r.sql[0], /INSERT OR IGNORE INTO activity .*'app-h1', 'witly', 'app@import', 'aprofundamento', 'acompanhamento-diario'/s);
    assert.match(r.sql[1], /1, 'inventou meta por canal', 'app'/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
