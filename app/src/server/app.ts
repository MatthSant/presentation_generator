/* app.ts — Express app factory. No listen() here so tests can mount it directly.
 *
 * createApp() builds the shared Ctx and registers every route module. The
 * returned `close` disposes fs watchers (and the db when this factory owns it). */

import express, { type Express } from 'express';
import { db as defaultDb, type DB } from './db.js';
import { OUT, PUBLIC } from './paths.js';
import type { Ctx } from './context.js';
import { registerContent } from './routes/content.js';
import { registerAnalyses } from './routes/analyses.js';
import { registerReport } from './routes/report.js';
import { registerGuia } from './routes/guia.js';
import { registerLayout } from './routes/layout.js';
import { registerBlocks } from './routes/blocks.js';
import { registerEdits } from './routes/edits.js';
import { registerWatch } from './routes/watch.js';
import { registerGenerate } from './routes/generate.js';
import { registerDeepen } from './routes/deepen.js';
import { registerPerguntas } from './routes/perguntas.js';
import { registerHistorico } from './routes/historico.js';
import { registerQuery } from './routes/query.js';
import { registerClients } from './routes/clients.js';
import { registerClaudeLog } from './routes/claudeLog.js';
import { installAuth } from './routes/authRoutes.js';

export interface CreateAppOptions {
  /** Output root holding [client]/[slug] files. Defaults to paths.OUT. */
  out?: string;
  /** SQLite store. Defaults to the process-wide db. When provided, the caller owns it. */
  db?: DB;
  /** Enforce auth + multi-tenant isolation. Off by default (tests); on in index.ts. */
  auth?: boolean;
}

export interface CreatedApp {
  app: Express;
  ctx: Ctx;
  /** Closes fs watchers (and the db only when createApp opened it). */
  close: () => void;
}

export function createApp(opts: CreateAppOptions = {}): CreatedApp {
  const ownsDb = !opts.db;
  const ctx: Ctx = {
    db: opts.db ?? defaultDb,
    out: opts.out ?? OUT,
    skipNextSSE: new Set<string>(),
    auth: opts.auth ?? false,
  };

  const app = express();
  app.use(express.json({ limit: '4mb' }));
  if (ctx.auth) installAuth(app, ctx);   // /auth/* routes + the session/tenant gate (before static)
  // no-cache so CSS/JS revalidate each load (ETag) — avoids stale assets after edits
  app.use(express.static(PUBLIC, { etag: true, lastModified: true, maxAge: 0, cacheControl: true,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));

  registerAnalyses(app, ctx);
  registerReport(app);
  registerGuia(app);
  registerContent(app, ctx);
  registerLayout(app, ctx);
  registerBlocks(app, ctx);
  registerEdits(app, ctx);
  registerGenerate(app, ctx);
  registerDeepen(app, ctx);
  registerPerguntas(app, ctx);
  registerHistorico(app, ctx);
  registerQuery(app, ctx);
  registerClients(app);
  registerClaudeLog(app, ctx);
  const closeWatch = registerWatch(app, ctx);

  return {
    app,
    ctx,
    close: () => {
      closeWatch();
      if (ownsDb) ctx.db.close();
    },
  };
}
