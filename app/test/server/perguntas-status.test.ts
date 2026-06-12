/* perguntas-status.test.ts — garante o fix do bug "detalhamento que não roda marca
 * a pergunta como feita". O 'seguir' é a INTENÇÃO, gravada ANTES da geração (logo
 * sobra sozinho quando o consultor CANCELA ou a geração FALHA). Só o 'detalhamento'
 * COM modal_id (seção persistida com sucesso) pode marcar 'seguida'. Estes testes
 * exercem o liveStatus do GET /perguntas — a garantia que o usuário vê. */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp, type CreatedApp } from '../../src/server/app.js';
import { openDb } from '../../src/server/db.js';

const CLIENT = 'inde';
const SLUG = 'demo';

let tmp: string;
let created: CreatedApp;
let db: ReturnType<typeof openDb>;

const PERGUNTAS = {
  perguntas: [{
    id: 'q1', pergunta: 'Pergunta de teste?', justificativa: 'x', kpis: [],
    deepen: { sectionId: 's01', blockId: 'b1', prompt: 'aprofunde' },
  }],
};

function fixture(name: string, value: unknown): void {
  const dir = path.join(tmp, CLIENT, SLUG);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value), 'utf8');
}

// Grava um registro no histórico de perguntas como a rota faz (record()).
function hist(acao: string, modalId = ''): void {
  db.prepare(`INSERT INTO perguntas_history
    (id, client, slug, pergunta_id, pergunta, acao, relevancia, nivel, section_id, block_id, modal_id, prompt, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    crypto.randomUUID(), CLIENT, SLUG, 'q1', 'Pergunta de teste?', acao,
    null, '', 's01', 'b1', modalId, 'aprofunde', new Date(Date.now() + hist.n++).toISOString());
}
hist.n = 0;

async function statusOfQ1(): Promise<string | undefined> {
  const res = await request(created.app).get(`/api/${CLIENT}/${SLUG}/perguntas`);
  const p = (res.body.perguntas as { id: string; status?: string }[]).find((x) => x.id === 'q1');
  return p?.status;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'perg-status-'));
  db = openDb(':memory:');
  created = createApp({ out: tmp, db });
  // SEM dataset.json de propósito: o GET só re-deriva quando há dataset — assim o
  // teste lê o perguntas.json do fixture sem spawnar Python.
  fixture('perguntas.json', PERGUNTAS);
  hist.n = 0;
});
afterEach(() => {
  created.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('intenção "seguir" sem detalhamento concluído NÃO marca a pergunta como feita', async () => {
  hist('seguir');
  assert.equal(await statusOfQ1(), undefined);
});

test('cancelar/falhar (várias intenções, nenhuma completa) mantém a pergunta NÃO-feita', async () => {
  hist('seguir');
  hist('seguir');
  hist('seguir');
  assert.equal(await statusOfQ1(), undefined);
});

test('só o "detalhamento" com modal_id (seção persistida) marca a pergunta como feita', async () => {
  hist('seguir');
  hist('detalhamento', 'det-q1-abc123');
  assert.equal(await statusOfQ1(), 'seguida');
});

test('"detalhamento" SEM modal_id (não persistiu) NÃO marca a pergunta como feita', async () => {
  hist('seguir');
  hist('detalhamento', '');
  assert.equal(await statusOfQ1(), undefined);
});

test('descartar depois de feita volta a pergunta para NÃO-feita', async () => {
  hist('seguir');
  hist('detalhamento', 'det-q1-abc123');
  hist('descartar');
  assert.equal(await statusOfQ1(), undefined);
});
