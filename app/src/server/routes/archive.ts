/* archive.ts — arquivar e renomear análises da home.
 *
 * ARQUIVAR: feature de plataforma reversível — uma flag por (client, slug) no DB. O
 * relatório continua acessível por URL direta (/report/...); a análise só some da home
 * — e um cliente cujas análises foram todas arquivadas desaparece do agrupamento.
 * RENOMEAR: troca só o `meta.title` do data.json (o rótulo exibido). O SLUG não muda —
 * ele é a pasta em disco e a URL do relatório; renomeá-lo quebraria links e o histórico
 * de deepen (que referencia client/slug). */

import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request } from 'express';
import type { Ctx } from '../context.js';
import { analysisDir, readJson, writeJson } from '../fsutil.js';
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

  // Renomeia o RÓTULO da análise (meta.title do data.json). Não mexe no slug: ele é a
  // pasta/URL e é referenciado pelo deepen_history — trocá-lo quebraria links e dados.
  app.post('/api/:client/:slug/rename', (req, res) => {
    const { client, slug } = req.params;
    const title = String((req.body ?? {}).title ?? '').trim();
    if (!title) { res.status(400).json({ error: 'título obrigatório' }); return; }
    if (title.length > 120) { res.status(400).json({ error: 'título muito longo (máx. 120)' }); return; }
    const owned = ownedOf(ctx, req);
    if (owned && !owned.has(client)) { res.status(403).json({ error: 'cliente não pertence ao usuário' }); return; }
    const dir = analysisDir(ctx.out, client, slug);
    if (!dir) { res.status(400).json({ error: 'bad path' }); return; }
    const file = path.join(dir, 'data.json');
    const data = readJson<{ meta?: Record<string, unknown> }>(file);
    if (!data?.meta) { res.status(404).json({ error: 'análise não encontrada' }); return; }
    data.meta.title = title;
    // A capa espelha o título; sem isso o relatório abriria com o nome antigo no topo.
    const cover = data.meta.cover as Record<string, unknown> | undefined;
    if (cover && typeof cover === 'object') cover.title = title;
    writeJson(file, data);
    res.json({ ok: true, title });
  });
}
