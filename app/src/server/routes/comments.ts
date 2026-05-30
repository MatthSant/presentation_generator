/* comments.ts — consultant annotations (SQLite-backed) + CSV export. */

import crypto from 'node:crypto';
import type { Express } from 'express';
import type { Ctx } from '../context.js';
import { migrateCsv, toApiComment, csvQuote, type CommentRow } from '../db.js';

const STATUSES = new Set(['novo', 'andamento', 'resolvido', 'descartado']);

export function registerComments(app: Express, ctx: Ctx): void {
  const { db } = ctx;

  app.get('/api/:client/:slug/comments', (req, res) => {
    const { client, slug } = req.params;
    migrateCsv(db, ctx.out, client, slug);
    const rows = db.prepare(
      'SELECT * FROM comments WHERE client = ? AND slug = ? ORDER BY created_at',
    ).all(client, slug) as CommentRow[];
    res.json(rows.map(toApiComment));
  });

  app.post('/api/:client/:slug/comments', (req, res) => {
    const { client, slug } = req.params;
    const b = (req.body || {}) as Record<string, unknown>;
    if (typeof b.text !== 'string' || !b.text.trim()) { res.status(400).json({ error: 'text required' }); return; }

    const row: CommentRow = {
      id: typeof b.id === 'string' && b.id ? b.id : crypto.randomUUID(),
      client, slug,
      section_id: String(b.sectionId ?? ''),
      section_label: String(b.sectionLabel ?? ''),
      type: String(b.type ?? 'detalhar'),
      text: String(b.text),
      anchor: String(b.anchor ?? ''),
      status: STATUSES.has(String(b.status)) ? String(b.status) : 'novo',
      created_at: new Date().toISOString(),
    };
    db.prepare(`
      INSERT OR REPLACE INTO comments
        (id, client, slug, section_id, section_label, type, text, anchor, status, created_at)
      VALUES (@id, @client, @slug, @section_id, @section_label, @type, @text, @anchor, @status, @created_at)
    `).run(row);
    res.json(toApiComment(row));
  });

  app.patch('/api/:client/:slug/comments/:id', (req, res) => {
    const { client, slug, id } = req.params;
    const b = (req.body || {}) as Record<string, unknown>;
    if (b.status !== undefined && !STATUSES.has(String(b.status))) {
      res.status(400).json({ error: 'invalid status' }); return;
    }
    const existing = db.prepare(
      'SELECT * FROM comments WHERE id = ? AND client = ? AND slug = ?',
    ).get(id, client, slug) as CommentRow | undefined;
    if (!existing) { res.status(404).json({ error: 'not found' }); return; }

    const status = b.status !== undefined ? String(b.status) : existing.status;
    const text = b.text !== undefined ? String(b.text) : existing.text;
    db.prepare('UPDATE comments SET status = ?, text = ? WHERE id = ?').run(status, text, id);
    res.json(toApiComment({ ...existing, status, text }));
  });

  app.delete('/api/:client/:slug/comments/:id', (req, res) => {
    const { client, slug, id } = req.params;
    db.prepare('DELETE FROM comments WHERE id = ? AND client = ? AND slug = ?').run(id, client, slug);
    res.json({ ok: true });
  });

  app.get('/api/:client/:slug/comments.csv', (req, res) => {
    const { client, slug } = req.params;
    migrateCsv(db, ctx.out, client, slug);
    const rows = db.prepare(
      'SELECT * FROM comments WHERE client = ? AND slug = ? ORDER BY created_at',
    ).all(client, slug) as CommentRow[];
    const header = 'id,sectionId,sectionLabel,type,text,anchor,status,createdAt';
    const lines = rows.map(r => [
      r.id, r.section_id, csvQuote(r.section_label), r.type,
      csvQuote(r.text), csvQuote(r.anchor), r.status, r.created_at,
    ].join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="comments-${client}-${slug}.csv"`);
    res.send([header, ...lines].join('\n'));
  });
}
