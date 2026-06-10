/* historico.ts — vista interativa do "histórico de lançamentos".
 *
 * POST /api/:client/:slug/historico/render { launches?: string[], metric?: string }
 *   → recalcula a vista filtrada sobre a base retida (render_view.py → assemble)
 *   → devolve { dataset, sections, layout } para o cliente re-renderizar.
 *
 * Não escreve nada (stateless); a base crua fica em app/.base/<client>/<slug>. */

import type { Express, Request, Response } from 'express';
import type { Ctx } from '../context.js';
import { analysisDir } from '../fsutil.js';
import { runHistoricoRender } from '../pygen.js';

export function registerHistorico(app: Express, _ctx: Ctx): void {
  app.post('/api/:client/:slug/historico/render', async (req: Request, res: Response) => {
    const { client, slug } = req.params;
    if (!analysisDir(_ctx.out, client, slug)) { res.status(400).json({ error: 'bad path' }); return; }
    const body = (req.body || {}) as Record<string, unknown>;
    const opts = {
      launches: Array.isArray(body.launches) ? body.launches.map(String) : undefined,
      metric: typeof body.metric === 'string' ? body.metric : undefined,
    };
    const r = await runHistoricoRender(client, slug, opts);
    if (!r) { res.status(404).json({ error: 'análise sem base retida (recálculo indisponível)' }); return; }
    if (r.error) { res.status(500).json({ error: String(r.error) }); return; }
    res.json(r);
  });
}
