/* historico.ts — recompute da vista interativa (controles por lançamento/métrica).
 *
 * POST /api/:client/:slug/render { launches?: string[], metric?: string }
 *   → recalcula a vista filtrada sobre a base retida, via renderScript do TIPO
 *     (registry) → devolve { dataset, sections, layout } para re-renderizar.
 * POST /api/:client/:slug/historico/render — alias legado (mesmo handler).
 *
 * Não escreve nada (stateless); a base crua fica em app/.base/<client>/<slug>. */

import type { Express, Request, Response } from 'express';
import type { Ctx } from '../context.js';
import { analysisDir } from '../fsutil.js';
import { runRenderView } from '../pygen.js';

export function registerHistorico(app: Express, _ctx: Ctx): void {
  const handler = async (req: Request, res: Response): Promise<void> => {
    const { client, slug } = req.params;
    if (!analysisDir(_ctx.out, client, slug)) { res.status(400).json({ error: 'bad path' }); return; }
    const body = (req.body || {}) as Record<string, unknown>;
    const opts = {
      launches: Array.isArray(body.launches) ? body.launches.map(String) : undefined,
      metric: typeof body.metric === 'string' ? body.metric : undefined,
      mode: typeof body.mode === 'string' ? body.mode : undefined,   // criativos: resultado × captação
      min_invest: typeof body.min_invest === 'number' ? body.min_invest : undefined,
      temp: typeof body.temp === 'string' ? body.temp : undefined,
    };
    const r = await runRenderView(client, slug, opts);
    if (!r) { res.status(404).json({ error: 'análise sem base retida ou tipo sem recompute' }); return; }
    if (r.error) { res.status(500).json({ error: String(r.error) }); return; }
    res.json(r);
  };
  app.post('/api/:client/:slug/render', handler);
  app.post('/api/:client/:slug/historico/render', handler);   // alias legado
}
