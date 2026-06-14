/* authRoutes.ts — login/logout/me + the auth gate (session + tenant ownership).
 *
 * installAuth() registers the /auth/* routes and a global middleware that:
 *  - lets public assets + /login.html + /auth/* through,
 *  - requires a session for everything else (401 for /api, redirect for pages),
 *  - on /api|/report/:client/:slug enforces that the session user owns :client
 *    (404 otherwise, so other tenants' analyses aren't even discoverable).
 * Generation to an unclaimed client is allowed (the route claims it on success). */

import type { Express, Request, Response, NextFunction } from 'express';
import type { Ctx } from '../context.js';
import {
  authenticate, createSession, sessionUser, destroySession,
  readSidCookie, setSidCookie, clearSidCookie, clientOwner, type User,
} from '../auth.js';

export interface AuthedRequest extends Request { user?: User }

const ASSET = /\.(css|js|map|png|jpe?g|svg|gif|woff2?|ttf|ico)$/i;
function isPublic(p: string): boolean {
  return p.startsWith('/auth/') || p === '/login.html' || ASSET.test(p) || /^\/(js|assets|fonts)\//.test(p);
}

// Rotas globais (não escopadas por cliente) com 2+ segmentos — o gate de tenant
// abaixo casa /api/:client/:slug e confundiria "claude-log" com um cliente (→ 404).
// Exigem sessão, mas não passam pela checagem de posse de cliente.
const GLOBAL_API = /^\/api\/claude-log(?:\/|$)/;

export function installAuth(app: Express, ctx: Ctx): void {
  app.post('/auth/login', (req, res) => {
    const { email, password } = (req.body || {}) as { email?: string; password?: string };
    if (!email || !password) { res.status(400).json({ error: 'email e senha obrigatórios' }); return; }
    const user = authenticate(ctx.db, email, password);
    if (!user) { res.status(401).json({ error: 'credenciais inválidas' }); return; }
    setSidCookie(res, createSession(ctx.db, user.id));
    res.json({ ok: true, user: { email: user.email } });
  });

  app.post('/auth/logout', (req, res) => {
    destroySession(ctx.db, readSidCookie(req));
    clearSidCookie(res);
    res.json({ ok: true });
  });

  app.get('/auth/me', (req, res) => {
    const user = sessionUser(ctx.db, readSidCookie(req));
    if (!user) { res.status(401).json({ error: 'not authenticated' }); return; }
    res.json({ email: user.email });
  });

  app.use((req: AuthedRequest, res: Response, next: NextFunction) => {
    const p = req.path;
    if (isPublic(p)) { next(); return; }

    const user = sessionUser(ctx.db, readSidCookie(req));
    if (!user) {
      if (p.startsWith('/api/')) { res.status(401).json({ error: 'auth required' }); return; }
      res.redirect('/login.html'); return;
    }
    req.user = user;

    const m = GLOBAL_API.test(p) ? null : p.match(/^\/(?:api|report)\/([^/]+)\/[^/]+/);
    if (m) {
      const client = decodeURIComponent(m[1]);
      const owner = clientOwner(ctx.db, client);
      const isGenerate = req.method === 'POST' && /\/generate$/.test(p);
      if (owner === null) {
        if (!isGenerate) { res.status(404).json({ error: 'not found' }); return; }
      } else if (owner !== user.id) {
        res.status(404).json({ error: 'not found' }); return;
      }
    }
    next();
  });
}
