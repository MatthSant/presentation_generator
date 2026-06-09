/* analyses.ts — GET /api/analyses: walk output/[client]/[slug], one row per analysis. */

import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import type { Ctx } from '../context.js';
import type { ReportData } from '../../shared/types.js';
import { migrateCsv } from '../db.js';
import { clientsOf } from '../auth.js';
import type { AuthedRequest } from './authRoutes.js';

function listDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

export function registerAnalyses(app: Express, ctx: Ctx): void {
  app.get('/api/analyses', (req, res) => {
    const rows: Record<string, unknown>[] = [];
    // Multi-tenant: a consultant sees only the clients they own.
    const user = (req as AuthedRequest).user;
    const owned = ctx.auth && user ? clientsOf(ctx.db, user.id) : null;

    for (const client of listDirs(ctx.out)) {
      if (owned && !owned.has(client)) continue;
      for (const slug of listDirs(path.join(ctx.out, client))) {
        const dataFile = path.join(ctx.out, client, slug, 'data.json');
        if (!fs.existsSync(dataFile)) continue;
        try {
          const data = JSON.parse(fs.readFileSync(dataFile, 'utf8')) as ReportData;
          migrateCsv(ctx.db, ctx.out, client, slug);
          const commentCount = (ctx.db
            .prepare('SELECT COUNT(*) AS n FROM comments WHERE client = ? AND slug = ?')
            .get(client, slug) as { n: number }).n;
          const sectionCount = data.pages?.reduce((n, p) => n + (p.sections?.length || 0), 0) || 0;
          // Folder client/slug are the routing keys and must win over any meta.client.
          // Keep meta.client as the display name (clientName) for grouping on the home.
          rows.push({ ...data.meta, client, slug, clientName: data.meta?.client || client, sectionCount, commentCount });
        } catch { /* skip malformed data.json */ }
      }
    }

    rows.sort((a, b) =>
      String(b.created_at || '').localeCompare(String(a.created_at || '')));
    res.json(rows);
  });
}
