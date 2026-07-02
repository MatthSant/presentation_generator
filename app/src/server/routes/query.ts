/* query.ts — Fase 3b: the closed query catalog as an HTTP endpoint.
 *
 * POST /api/:client/:slug/query { fn, ...args }
 *   → runs query_api over the RETAINED base dump → returns ONLY aggregates.
 *   404 when the analysis has no retained base (deep crossings unavailable).
 *
 * A whitelist de fns vem do REGISTRY (buildDeepenMeta do tipo da análise), não de
 * um Set hardcoded — mesma fonte que o deep deepen anuncia ao modelo. `meta`
 * (introspecção do catálogo) é sempre permitida.
 *
 * Gated + tenant-scoped by the auth middleware (it's an /api/:client/:slug route). */

import type { Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { Ctx } from '../context.js';
import { analysisDir } from '../fsutil.js';
import { BASE } from '../paths.js';
import { typeOf } from '../typeRegistry.js';
import { runQuery } from '../pygen.js';

/** Fns permitidas para a análise = as anunciadas no deep deepen do seu tipo. */
function allowedFns(client: string, slug: string): Set<string> | null {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(BASE, client, slug, 'config.json'), 'utf8')) as Record<string, unknown>;
    const meta = typeOf(cfg).buildDeepenMeta(cfg);
    if (!meta?.consultar) return null;
    return new Set(['meta', ...meta.consultar.funcoes.map((f) => f.id)]);
  } catch { return null; }
}

export function registerQuery(app: Express, ctx: Ctx): void {
  app.post('/api/:client/:slug/query', async (req, res) => {
    const { client, slug } = req.params;
    if (!analysisDir(ctx.out, client, slug)) { res.status(400).json({ error: 'bad path' }); return; }

    const fns = allowedFns(client, slug);
    if (!fns) { res.status(404).json({ error: 'dado-base não retido para esta análise' }); return; }

    const body = (req.body || {}) as Record<string, unknown>;
    const fn = String(body.fn || '');
    if (!fns.has(fn)) { res.status(400).json({ error: `fn inválida (use: ${[...fns].join(', ')})` }); return; }

    const { fn: _fn, ...args } = body;
    const result = await runQuery(client, slug, fn, args);
    if (result === null) { res.status(404).json({ error: 'dado-base não retido para esta análise' }); return; }
    res.json(result);
  });
}
