/* query.ts — Fase 3b: the closed query catalog as an HTTP endpoint.
 *
 * POST /api/:client/:slug/query { fn, criterio?, cruzar_com?, canal?, metrica? }
 *   → runs query_api over the RETAINED base dump → returns ONLY aggregates.
 *   404 when the analysis has no retained base (deep crossings unavailable).
 *
 * Gated + tenant-scoped by the auth middleware (it's an /api/:client/:slug route). */

import type { Express } from 'express';
import type { Ctx } from '../context.js';
import { analysisDir } from '../fsutil.js';
import { runQuery } from '../pygen.js';

const FNS = new Set(['meta', 'cut_by_criterion', 'trend', 'crosstab', 'association']);

export function registerQuery(app: Express, ctx: Ctx): void {
  app.post('/api/:client/:slug/query', async (req, res) => {
    const { client, slug } = req.params;
    if (!analysisDir(ctx.out, client, slug)) { res.status(400).json({ error: 'bad path' }); return; }

    const body = (req.body || {}) as Record<string, unknown>;
    const fn = String(body.fn || '');
    if (!FNS.has(fn)) { res.status(400).json({ error: `fn inválida (use: ${[...FNS].join(', ')})` }); return; }

    const args = {
      criterio: body.criterio, cruzar_com: body.cruzar_com,
      canal: body.canal, metrica: body.metrica,
    };
    const result = await runQuery(client, slug, fn, args);
    if (result === null) { res.status(404).json({ error: 'dado-base não retido para esta análise' }); return; }
    res.json(result);
  });
}
