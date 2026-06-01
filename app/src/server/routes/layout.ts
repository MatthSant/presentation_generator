/* layout.ts — GET/PUT/DELETE the grid layout (layer 3) for an analysis.
 *
 * Stored as output/[client]/[slug]/layout.json: { sections: { secId: LayoutItem[] } }.
 * PUT accepts either a full { sections } object or a per-section { sectionId, items }. */

import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import type { Ctx } from '../context.js';
import type { Layout, LayoutItem } from '../../shared/types.js';
import { analysisDir, readJson, writeJson } from '../fsutil.js';

const COLS = 12;
const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

function sanitizeItems(items: unknown): LayoutItem[] | null {
  if (!Array.isArray(items)) return null;
  const out: LayoutItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id) return null;
    out.push({
      id: r.id,
      ...(typeof r.type === 'string' ? { type: r.type } : {}),
      x: clampInt(r.x, 0, COLS - 1, 0),
      y: clampInt(r.y, 0, 100000, 0),
      w: clampInt(r.w, 1, COLS, 1),
      h: clampInt(r.h, 1, 100000, 1),
    });
  }
  return out;
}

export function registerLayout(app: Express, ctx: Ctx): void {
  const file = (client: string, slug: string): string | null => {
    const dir = analysisDir(ctx.out, client, slug);
    return dir && path.join(dir, 'layout.json');
  };

  app.get('/api/:client/:slug/layout', (req, res) => {
    const f = file(req.params.client, req.params.slug);
    if (!f) { res.status(400).json({ error: 'bad path' }); return; }
    const layout = readJson<Layout>(f) || { sections: {} };
    res.json(layout);
  });

  app.put('/api/:client/:slug/layout', (req, res) => {
    const f = file(req.params.client, req.params.slug);
    if (!f) { res.status(400).json({ error: 'bad path' }); return; }
    const body = req.body as Record<string, unknown>;
    if (!body || typeof body !== 'object') { res.status(400).json({ error: 'invalid body' }); return; }

    const layout = readJson<Layout>(f) || { sections: {} };

    if (typeof body.sectionId === 'string') {
      const items = sanitizeItems(body.items);
      if (!items) { res.status(400).json({ error: 'invalid items' }); return; }
      layout.sections[body.sectionId] = items;
    } else if (body.sections && typeof body.sections === 'object') {
      const next: Record<string, LayoutItem[]> = {};
      for (const [secId, items] of Object.entries(body.sections as Record<string, unknown>)) {
        const clean = sanitizeItems(items);
        if (!clean) { res.status(400).json({ error: `invalid items for ${secId}` }); return; }
        next[secId] = clean;
      }
      layout.sections = next;
    } else {
      res.status(400).json({ error: 'expected { sectionId, items } or { sections }' });
      return;
    }

    layout.updatedAt = new Date().toISOString();
    ctx.skipNextSSE.add('layout.json');
    writeJson(f, layout);
    res.json({ ok: true, layout });
  });

  app.delete('/api/:client/:slug/layout', (req, res) => {
    const f = file(req.params.client, req.params.slug);
    if (!f) { res.status(400).json({ error: 'bad path' }); return; }
    const section = typeof req.query.section === 'string' ? req.query.section : '';

    if (section) {
      const layout = readJson<Layout>(f);
      if (layout && layout.sections[section]) {
        delete layout.sections[section];
        ctx.skipNextSSE.add('layout.json');
        writeJson(f, layout);
      }
      res.json({ ok: true });
      return;
    }

    if (fs.existsSync(f)) { ctx.skipNextSSE.add('layout.json'); fs.unlinkSync(f); }
    res.json({ ok: true });
  });
}
