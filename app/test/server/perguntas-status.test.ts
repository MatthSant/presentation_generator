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

// Reprodução REAL do cancelamento mid-stream: sobe o servidor, dispara /seguir e
// aborta o request HTTP no MEIO da geração (simulada lenta via DEEPEN_TEST_DELAY_MS).
// O servidor deve detectar o disconnect (res.on('close') + !writableFinished) e NÃO
// persistir a seção nem gravar o registro 'detalhamento' — só sobra o 'seguir'.
test('cancelar o request HTTP no MEIO da geração não persiste nem marca feita (abort real)', async () => {
  const dir = path.join(tmp, CLIENT, SLUG);
  fs.mkdirSync(dir, { recursive: true });
  // dataset bindável + seção-fonte para o /seguir rodar em modo mock (sem API)
  fs.writeFileSync(path.join(dir, 'dataset.json'), JSON.stringify({
    t_grp: { dims: ['grupo'], filters: [], rows: [{ grupo: 'Alta', valor: 42 }, { grupo: 'Baixa', valor: 8 }] },
  }));
  fs.writeFileSync(path.join(dir, 's10.json'), JSON.stringify({
    id: 's10', header: { badge: 'X', title: 'X' },
    widgets: [{ id: 'b1', type: 'find-block', card: true, tag: 'T', tagColor: 'g', title: 'Achado', detail: 'x' }],
  }));
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ meta: { client: CLIENT }, pages: [] }));
  fs.writeFileSync(path.join(dir, 'perguntas.json'), JSON.stringify({
    perguntas: [{ id: 'q1', pergunta: 'Q?', justificativa: 'x', kpis: [], deepen: { sectionId: 's10', blockId: 'b1', prompt: 'aprofunde' } }],
  }));

  const prev = { mock: process.env.CLAUDE_MOCK, key: process.env.ANTHROPIC_API_KEY, delay: process.env.DEEPEN_TEST_DELAY_MS };
  process.env.CLAUDE_MOCK = '1';
  delete process.env.ANTHROPIC_API_KEY;
  process.env.DEEPEN_TEST_DELAY_MS = '400';                  // janela p/ abortar no meio
  const server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = (server.address() as import('node:net').AddressInfo).port;
  try {
    const ac = new AbortController();
    const req = fetch(`http://127.0.0.1:${port}/api/${CLIENT}/${SLUG}/perguntas/q1/seguir`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: ac.signal });
    setTimeout(() => ac.abort(), 100);                       // cancela MID-stream (geração leva 400ms)
    await req.then(() => null, () => null);                  // abort lança — ignorado de propósito
    await new Promise((r) => setTimeout(r, 700));            // deixa o servidor terminar pós-abort

    const dets = fs.readdirSync(dir).filter((f) => f.startsWith('det-'));
    assert.equal(dets.length, 0, 'cancelado: nenhuma seção det-*.json pode ser persistida');
    const nDet = (db.prepare("SELECT COUNT(*) n FROM perguntas_history WHERE acao='detalhamento'").get() as { n: number }).n;
    assert.equal(nDet, 0, "cancelado: não pode haver registro 'detalhamento'");
    const nSeg = (db.prepare("SELECT COUNT(*) n FROM perguntas_history WHERE acao='seguir'").get() as { n: number }).n;
    assert.equal(nSeg, 1, "a intenção 'seguir' foi registrada (mas não conta como feita)");
  } finally {
    server.close();
    if (prev.mock === undefined) delete process.env.CLAUDE_MOCK; else process.env.CLAUDE_MOCK = prev.mock;
    if (prev.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prev.key;
    if (prev.delay === undefined) delete process.env.DEEPEN_TEST_DELAY_MS; else process.env.DEEPEN_TEST_DELAY_MS = prev.delay;
  }
});
