/* content.ts — read-only JSON layers: data (nav map), dataset, section (view).
 *
 * New model: filters are applied client-side over the dataset, so the section
 * route serves a single sXX.json — no per-filter variant files. */

import fs from 'node:fs';
import path from 'node:path';
import type { Express, Response } from 'express';
import type { Ctx } from '../context.js';

async function sendJsonFile(res: Response, file: string, missingMsg: string): Promise<void> {
  if (!fs.existsSync(file)) { res.status(404).json({ error: missingMsg }); return; }
  try {
    const raw = await fs.promises.readFile(file, 'utf8');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Sempre revalidar (ETag) — após seguir/detalhar, getData precisa do data.json
    // recém-escrito (nav com a página nova), nunca de um cache heurístico.
    res.setHeader('Cache-Control', 'no-cache');
    res.send(raw);
  } catch (e) {
    res.status(500).json({ error: 'read error', detail: (e as Error).message });
  }
}

export function registerContent(app: Express, ctx: Ctx): void {
  app.get('/api/:client/:slug/data', (req, res) => {
    void sendJsonFile(res, path.join(ctx.out, req.params.client, req.params.slug, 'data.json'), 'not found');
  });

  app.get('/api/:client/:slug/dataset', (req, res) => {
    void sendJsonFile(res, path.join(ctx.out, req.params.client, req.params.slug, 'dataset.json'), 'dataset not found');
  });

  app.get('/api/:client/:slug/section/:id', (req, res) => {
    const { client, slug, id } = req.params;
    void sendJsonFile(res, path.join(ctx.out, client, slug, `${id}.json`), 'section not found');
  });
}
