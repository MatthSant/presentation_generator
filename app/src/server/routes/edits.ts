/* edits.ts — read the block_edits audit log (per-analysis, global, CSV export). */

import type { Express } from 'express';
import type { Ctx } from '../context.js';
import { toApiEdit, csvQuote, type EditRow } from '../db.js';

function toCsv(rows: EditRow[]): string {
  const header = 'id,client,slug,sectionId,sectionLabel,blockId,blockType,action,changes,snapshot,createdAt';
  const lines = rows.map(r => [
    r.id, r.client, r.slug, r.section_id, csvQuote(r.section_label),
    r.block_id, r.block_type, r.action, csvQuote(r.changes), csvQuote(r.snapshot), r.created_at,
  ].join(','));
  return [header, ...lines].join('\n');
}

export function registerEdits(app: Express, ctx: Ctx): void {
  const { db } = ctx;

  app.get('/api/edits', (_req, res) => {
    const rows = db.prepare('SELECT * FROM block_edits ORDER BY created_at DESC').all() as EditRow[];
    res.json(rows.map(toApiEdit));
  });

  app.get('/api/edits.csv', (_req, res) => {
    const rows = db.prepare('SELECT * FROM block_edits ORDER BY created_at DESC').all() as EditRow[];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="block-edits.csv"');
    res.send(toCsv(rows));
  });

  app.get('/api/:client/:slug/edits', (req, res) => {
    const { client, slug } = req.params;
    const rows = db.prepare(
      'SELECT * FROM block_edits WHERE client = ? AND slug = ? ORDER BY created_at DESC',
    ).all(client, slug) as EditRow[];
    res.json(rows.map(toApiEdit));
  });

  app.get('/api/:client/:slug/edits.csv', (req, res) => {
    const { client, slug } = req.params;
    const rows = db.prepare(
      'SELECT * FROM block_edits WHERE client = ? AND slug = ? ORDER BY created_at DESC',
    ).all(client, slug) as EditRow[];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="edits-${client}-${slug}.csv"`);
    res.send(toCsv(rows));
  });
}
