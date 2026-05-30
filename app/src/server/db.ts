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
  CREATE TABLE IF NOT EXISTS comments (
    id            TEXT PRIMARY KEY,
    client        TEXT NOT NULL,
    slug          TEXT NOT NULL,
    section_id    TEXT NOT NULL,
    section_label TEXT NOT NULL,
    type          TEXT NOT NULL,
    text          TEXT NOT NULL,
    anchor        TEXT DEFAULT '',
    status        TEXT DEFAULT 'novo',
    created_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cs ON comments(client, slug);

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

/* ── CSV helpers ── */

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  const re = /("(?:[^"]|"")*"|[^,]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index === re.lastIndex) { re.lastIndex++; continue; }
    let v = m[1];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/""/g, '"');
    result.push(v);
  }
  return result;
}

export function csvQuote(v: string | null | undefined): string {
  return '"' + (v || '').replace(/"/g, '""') + '"';
}

/* ── API serializers (snake_case row → camelCase shape the client expects) ── */

export interface CommentRow {
  id: string; client: string; slug: string; section_id: string; section_label: string;
  type: string; text: string; anchor: string; status: string; created_at: string;
}
export function toApiComment(row: CommentRow) {
  return {
    id: row.id, sectionId: row.section_id, sectionLabel: row.section_label,
    type: row.type, text: row.text, anchor: row.anchor, status: row.status, createdAt: row.created_at,
  };
}

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

/* ── Legacy comments.csv → SQLite migration (idempotent) ── */

export function migrateCsv(db: DB, out: string, client: string, slug: string): void {
  const csv = path.join(out, client, slug, 'comments.csv');
  if (!fs.existsSync(csv)) return;
  const lines = fs.readFileSync(csv, 'utf8').trim().split('\n').filter(Boolean);
  if (lines.length <= 1) return;

  const headers = parseCsvLine(lines[0]);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO comments
      (id, client, slug, section_id, section_label, type, text, anchor, status, created_at)
    VALUES
      (@id, @client, @slug, @section_id, @section_label, @type, @text, @anchor, @status, @created_at)
  `);
  const rows = lines.slice(1).map(line => {
    const v = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((h, i) => [h, v[i] ?? ''])) as Record<string, string>;
    return {
      id: row.id || '', client, slug,
      section_id: row.sectionId || '', section_label: row.sectionLabel || '',
      type: row.type || 'detalhar', text: row.text || '', anchor: row.anchor || '',
      status: row.status || 'novo', created_at: row.createdAt || new Date().toISOString(),
    };
  }).filter(r => r.id);

  if (rows.length) db.transaction((rs: typeof rows) => rs.forEach(r => insert.run(r)))(rows);
}
