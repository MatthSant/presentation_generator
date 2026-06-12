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

type NavData = { pages?: Array<{ id?: string; sections?: Array<{ id?: string } | string> }> };

/** Serve data.json com auto-cura: poda refs de seções `det-*` cujo arquivo sumiu
 *  (cancelamento, descarte manual, limpeza fora do app) e remove a página
 *  Detalhamentos se ela esvaziar — assim nunca aparece uma sub-aba/página vazia.
 *  Persiste a correção (uma vez) para o Layout/HTML exportarem o estado limpo. */
async function sendData(res: Response, dir: string, ctx: Ctx): Promise<void> {
  const file = path.join(dir, 'data.json');
  if (!fs.existsSync(file)) { res.status(404).json({ error: 'not found' }); return; }
  try {
    const data = JSON.parse(await fs.promises.readFile(file, 'utf8')) as NavData;
    let changed = false;
    for (const page of data.pages || []) {
      if (!Array.isArray(page.sections)) continue;
      const kept = page.sections.filter((s) => {
        const id = typeof s === 'string' ? s : s?.id;
        if (typeof id === 'string' && id.startsWith('det-') && !fs.existsSync(path.join(dir, `${id}.json`))) {
          changed = true; return false;
        }
        return true;
      });
      page.sections = kept;
    }
    if (changed) {
      data.pages = (data.pages || []).filter((p) => p.id !== 'detalhamentos' || (p.sections || []).length > 0);
      ctx.skipNextSSE?.add('data.json');
      await fs.promises.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(JSON.stringify(data));
  } catch (e) {
    res.status(500).json({ error: 'read error', detail: (e as Error).message });
  }
}

export function registerContent(app: Express, ctx: Ctx): void {
  app.get('/api/:client/:slug/data', (req, res) => {
    void sendData(res, path.join(ctx.out, req.params.client, req.params.slug), ctx);
  });

  app.get('/api/:client/:slug/dataset', (req, res) => {
    void sendJsonFile(res, path.join(ctx.out, req.params.client, req.params.slug, 'dataset.json'), 'dataset not found');
  });

  app.get('/api/:client/:slug/section/:id', (req, res) => {
    const { client, slug, id } = req.params;
    void sendJsonFile(res, path.join(ctx.out, client, slug, `${id}.json`), 'section not found');
  });
}
