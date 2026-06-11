/* db.ts — SQLite store for comments + block edits, plus CSV helpers.
 *
 * Comments and edits are genuinely relational/mutable, so they stay in SQLite
 * (content/dataset/layout live in versionable JSON files). */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DB_PATH } from './paths.js';

export type DB = Database.Database;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS block_edits (
    id            TEXT PRIMARY KEY,
    client        TEXT NOT NULL,
    slug          TEXT NOT NULL,
    section_id    TEXT NOT NULL,
    section_label TEXT NOT NULL DEFAULT '',
    block_id      TEXT NOT NULL DEFAULT '',
    block_type    TEXT NOT NULL DEFAULT '',
    action        TEXT NOT NULL,
    changes       TEXT NOT NULL DEFAULT '{}',
    snapshot      TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_be ON block_edits(client, slug);
  CREATE INDEX IF NOT EXISTS idx_be_action ON block_edits(action, created_at);

  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    pass_hash  TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sess_user ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS user_clients (
    user_id TEXT NOT NULL,
    client  TEXT NOT NULL,
    PRIMARY KEY (user_id, client)
  );

  CREATE TABLE IF NOT EXISTS perguntas_history (
    id          TEXT PRIMARY KEY,
    client      TEXT NOT NULL,
    slug        TEXT NOT NULL,
    pergunta_id TEXT NOT NULL,
    pergunta    TEXT NOT NULL DEFAULT '',
    acao        TEXT NOT NULL,
    relevancia  REAL,
    nivel       TEXT NOT NULL DEFAULT '',
    section_id  TEXT NOT NULL DEFAULT '',
    block_id    TEXT NOT NULL DEFAULT '',
    modal_id    TEXT NOT NULL DEFAULT '',
    prompt      TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ph ON perguntas_history(client, slug, created_at);
  CREATE INDEX IF NOT EXISTS idx_ph_q ON perguntas_history(client, slug, pergunta_id, created_at);

  CREATE TABLE IF NOT EXISTS deepen_history (
    id                TEXT PRIMARY KEY,
    client            TEXT NOT NULL,
    slug              TEXT NOT NULL,
    analysis_type     TEXT NOT NULL DEFAULT 'conversao-perfil',
    origem            TEXT NOT NULL,                -- 'card' | 'pergunta' | 'custom' | 'iteracao'
    section_id        TEXT NOT NULL DEFAULT '',
    block_id          TEXT NOT NULL DEFAULT '',
    modal_id          TEXT NOT NULL DEFAULT '',     -- modal id OU id da seção det-*
    prompt            TEXT NOT NULL,
    prev_modal_id     TEXT NOT NULL DEFAULT '',
    card_context      TEXT NOT NULL DEFAULT '{}',
    modal_json        TEXT NOT NULL DEFAULT '{}',
    validated_ok      INTEGER NOT NULL DEFAULT 1,
    validation_errors TEXT NOT NULL DEFAULT '[]',
    model             TEXT NOT NULL DEFAULT '',
    tokens_in         INTEGER,
    tokens_out        INTEGER,
    cost_usd          REAL,
    mocked            INTEGER NOT NULL DEFAULT 0,
    rating            INTEGER,                      -- 1–5, null = não avaliado
    feedback_text     TEXT,
    feedback_at       TEXT,
    status            TEXT NOT NULL DEFAULT 'pendente',  -- pendente | aprovado | revisado
    gate_attempts     INTEGER NOT NULL DEFAULT 1,        -- nº de tentativas do loop de qualidade
    gate_issues       TEXT NOT NULL DEFAULT '[]',        -- todas as issues encontradas/reparadas
    gate_residual     TEXT NOT NULL DEFAULT '[]',        -- pendências que sobraram na versão entregue
    created_at        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dh ON deepen_history(client, slug, created_at);
  CREATE INDEX IF NOT EXISTS idx_dh_fewshot ON deepen_history(analysis_type, rating, validated_ok, created_at);
`;

/** Open (and initialize) a SQLite store at the given path. `:memory:` works for tests. */
export function openDb(dbPath: string): DB {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const handle = new Database(dbPath);
  handle.pragma('journal_mode = WAL');
  handle.exec(SCHEMA);
  // Migrações aditivas (CREATE IF NOT EXISTS não altera tabelas existentes):
  // status do fluxo de revisão — 'pendente' | 'aprovado' | 'revisado'.
  try { handle.exec("ALTER TABLE deepen_history ADD COLUMN status TEXT NOT NULL DEFAULT 'pendente'"); }
  catch { /* coluna já existe */ }
  // Telemetria do gate de qualidade — para calibrar o motor ao longo do tempo.
  for (const col of [
    'gate_attempts INTEGER NOT NULL DEFAULT 1',
    "gate_issues TEXT NOT NULL DEFAULT '[]'",
    "gate_residual TEXT NOT NULL DEFAULT '[]'",
  ]) {
    try { handle.exec(`ALTER TABLE deepen_history ADD COLUMN ${col}`); }
    catch { /* coluna já existe */ }
  }
  return handle;
}

/** Process-wide store used by the running server. Tests open their own via openDb. */
export const db: DB = openDb(DB_PATH);

export function csvQuote(v: string | null | undefined): string {
  return '"' + (v || '').replace(/"/g, '""') + '"';
}

/* ── API serializer (snake_case row → camelCase shape the client expects) ── */

export interface EditRow {
  id: string; client: string; slug: string; section_id: string; section_label: string;
  block_id: string; block_type: string; action: string; changes: string; snapshot: string; created_at: string;
}
function tryParse(s: string): unknown { try { return JSON.parse(s); } catch { return s || {}; } }
export function toApiEdit(row: EditRow) {
  return {
    id: row.id, client: row.client, slug: row.slug,
    sectionId: row.section_id, sectionLabel: row.section_label,
    blockId: row.block_id, blockType: row.block_type, action: row.action,
    changes: tryParse(row.changes), snapshot: tryParse(row.snapshot), createdAt: row.created_at,
  };
}
