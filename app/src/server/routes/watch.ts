/* watch.ts — Server-Sent Events: push a section id when its JSON file changes.
 *
 * Ignores our own writes (filenames staged in ctx.skipNextSSE) and the
 * non-section files (data/dataset/layout). Returns a disposer that closes all
 * fs watchers — used by tests and graceful shutdown. */

import fs from 'node:fs';
import type { Response } from 'express';
import type { Express } from 'express';
import type { Ctx } from '../context.js';
import { analysisDir } from '../fsutil.js';

const IGNORED = new Set(['data.json', 'dataset.json', 'layout.json']);

export function registerWatch(app: Express, ctx: Ctx): () => void {
  const clients = new Map<string, Set<Response>>();
  const watchers = new Map<string, fs.FSWatcher>();

  // Transient deepen-progress lines piggyback on the same SSE channel, prefixed
  // so the client routes them to the busy overlay instead of a section reload.
  ctx.emitProgress = (client, slug, msg) => {
    clients.get(`${client}/${slug}`)?.forEach((c) => {
      try { c.write(`data: progress:${msg.replace(/\n/g, ' ')}\n\n`); } catch { /* client gone */ }
    });
  };

  app.get('/api/:client/:slug/watch', (req, res) => {
    const { client, slug } = req.params;
    const dir = analysisDir(ctx.out, client, slug);
    if (!dir) { res.status(400).end(); return; }
    const key = `${client}/${slug}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write('data: connected\n\n');

    let set = clients.get(key);
    if (!set) { set = new Set(); clients.set(key, set); }
    set.add(res);
    req.on('close', () => set?.delete(res));

    if (!watchers.has(key) && fs.existsSync(dir)) {
      // No Windows o fs.watch dispara 2+ eventos por write; o skipNextSSE engole
      // só o primeiro. O cooldown ignora os ecos do MESMO write suprimido — sem
      // ele, o eco re-renderiza a seção e fecha a modal recém-aberta no client.
      const recentlySkipped = new Map<string, number>();
      const w = fs.watch(dir, (_evt, filename) => {
        if (!filename || !filename.endsWith('.json') || IGNORED.has(filename)) return;
        if (ctx.skipNextSSE.has(filename)) {
          ctx.skipNextSSE.delete(filename);
          recentlySkipped.set(filename, Date.now());
          return;
        }
        const t = recentlySkipped.get(filename);
        if (t && Date.now() - t < 1500) return;   // eco do write suprimido
        const id = filename.replace(/\.json$/, '');
        clients.get(key)?.forEach(c => { try { c.write(`data: ${id}\n\n`); } catch { /* client gone */ } });
      });
      watchers.set(key, w);
    }
  });

  return () => {
    for (const w of watchers.values()) w.close();
    watchers.clear();
    for (const set of clients.values()) { for (const r of set) { try { r.end(); } catch { /* noop */ } } }
    clients.clear();
  };
}
