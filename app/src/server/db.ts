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
`;

/** Open (and initialize) a SQLite store at the given path. `:memory:` works for tests. */
export function openDb(dbPath: string): DB {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const handle = new Database(dbPath);
  handle.pragma('journal_mode = WAL');
  handle.exec(SCHEMA);
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
