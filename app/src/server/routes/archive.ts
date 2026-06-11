/* archive.ts — arquivar análises da home (esconde da listagem, sem deletar arquivos).
 *
 * Feature de plataforma reversível: uma flag por (client, slug) no DB. O relatório
 * continua acessível por URL direta (/report/...); a análise só some da home — e um
 * cliente cujas análises foram todas arquivadas desaparece do agrupamento. */

import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request } from 'express';
import type { Ctx } from '../context.js';
import { clientsOf } from '../auth.js';
import type { AuthedRequest } from './authRoutes.js';

/** Conjunto de "client/slug" arquivados — consumido pelo filtro de /api/analyses. */
export function archivedKeys(db: Ctx['db']): Set<string> {
  const rows = db.prepare('SELECT client, slug FROM archived_analyses').all() as Array<{ client: string; slug: string }>;
  return new Set(rows.map((r) => `${r.client}/${r.slug}`));
}

/** Clientes que o usuário possui (multi-tenant); null quando auth está off (dev/testes). */
function ownedOf(ctx: Ctx, req: Request): Set<string> | null {
  const user = (req as AuthedRequest).user;
  return ctx.auth && user ? clientsOf(ctx.db, user.id) : null;
}

function listDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}

export function registerArchive(app: Express, ctx: Ctx): void {
  const archive = ctx.db.prepare('INSERT OR IGNORE INTO archived_analyses (client, slug, archived_at) VALUES (?, ?, ?)');
  const unarchive = ctx.db.prepare('DELETE FROM archived_analyses WHERE client = ? AND slug = ?');

  // Lista as arquivadas (alimenta o "Restaurar" da home).
  app.get('/api/archived', (req, res) => {
    const owned = ownedOf(ctx, req);
    const rows = ctx.db.prepare('SELECT client, slug, archived_at FROM archived_analyses ORDER BY archived_at DESC')
      .all() as Array<{ client: string; slug: string; archived_at: string }>;
    res.json(rows.filter((r) => !owned || owned.has(r.client)));
  });

  // Arquiva uma análise específica.
  app.post('/api/archive', (req, res) => {
    const { client, slug } = (req.body ?? {}) as { client?: string; slug?: string };
    if (!client || !slug) { res.status(400).json({ error: 'client e slug obrigatórios' }); return; }
    const owned = ownedOf(ctx, req);
    if (owned && !owned.has(client)) { res.status(403).json({ error: 'cliente não pertence ao usuário' }); return; }
    archive.run(client, slug, new Date().toISOString());
    res.json({ ok: true });
  });

  // Restaura uma análise — ou todas com { all: true }.
  app.post('/api/unarchive', (req, res) => {
    const { client, slug, all } = (req.body ?? {}) as { client?: string; slug?: string; all?: boolean };
    const owned = ownedOf(ctx, req);
    if (all) {
      const rows = ctx.db.prepare('SELECT client, slug FROM archived_analyses').all() as Array<{ client: string; slug: string }>;
      let restored = 0;
      for (const r of rows) if (!owned || owned.has(r.client)) { unarchive.run(r.client, r.slug); restored++; }
      res.json({ ok: true, restored });
      return;
    }
    if (!client || !slug) { res.status(400).json({ error: 'client e slug obrigatórios' }); return; }
    if (owned && !owned.has(client)) { res.status(403).json({ error: 'cliente não pertence ao usuário' }); return; }
    unarchive.run(client, slug);
    res.json({ ok: true });
  });

  // Arquiva tudo MENOS os clientes em "keep" (default: demo) — o botão "Arquivar testes".
  app.post('/api/archive-tests', (req, res) => {
    const raw = (req.body ?? {}) as { keep?: unknown };
    const keep = new Set<string>(Array.isArray(raw.keep) && raw.keep.length ? raw.keep.map(String) : ['demo']);
    const owned = ownedOf(ctx, req);
    const now = new Date().toISOString();
    let archived = 0;
    for (const client of listDirs(ctx.out)) {
      if (keep.has(client)) continue;
      if (owned && !owned.has(client)) continue;
      for (const slug of listDirs(path.join(ctx.out, client))) {
        if (!fs.existsSync(path.join(ctx.out, client, slug, 'data.json'))) continue;
        if (archive.run(client, slug, now).changes) archived++;
      }
    }
    res.json({ ok: true, archived, kept: [...keep] });
  });
}
