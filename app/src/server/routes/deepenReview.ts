/* deepenReview.ts — avaliação e revisão do harness de detalhamento.
 *
 * POST /api/:client/:slug/deepen/:historyId/rate   { rating: 1–5, feedback? }
 * GET  /api/deepen-history?client=&slug=&origem=&rated=&minRating=&ids=&limit=
 * POST /api/:client/:slug/deepen/:historyId/replay → reexecuta o prompt original
 *      e grava entrada NOVA; o resultado vira uma seção na página Detalhamentos.
 *
 * O rating ancora nos artefatos via modal.historyId / section.historyId; os
 * bem avaliados (≥4) alimentam o few-shot (deepenHistory.getFewShot). */

import crypto from 'node:crypto';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import type { Ctx } from '../context.js';
import type { ReportData, PageRef, Section } from '../../shared/types.js';
import { analysisDir, isSafeSeg, readJson, writeJson } from '../fsutil.js';
import { generateDetalhamento } from '../detalhamento.js';
import { rateDeepen, listHistory, getEntry, recordDeepen, getFewShot } from '../deepenHistory.js';

export function registerDeepenReview(app: Express, ctx: Ctx): void {
  app.post('/api/:client/:slug/deepen/:historyId/rate', (req: Request, res: Response) => {
    const { historyId } = req.params;
    const body = (req.body || {}) as Record<string, unknown>;
    const rating = Number(body.rating);
    const ok = rateDeepen(ctx.db, historyId, rating, typeof body.feedback === 'string' ? body.feedback : undefined);
    if (!ok) { res.status(400).json({ error: 'rating inválido ou entrada não encontrada' }); return; }
    res.json({ ok: true, rating });
  });

  app.get('/api/deepen-history', (req: Request, res: Response) => {
    const q = req.query as Record<string, string | undefined>;
    res.setHeader('Cache-Control', 'no-cache');
    res.json({
      entries: listHistory(ctx.db, {
        client: q.client, slug: q.slug, origem: q.origem,
        rated: q.rated === 'true',
        minRating: q.minRating ? Number(q.minRating) : undefined,
        ids: q.ids ? q.ids.split(',').filter(Boolean) : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
      }),
    });
  });

  app.post('/api/:client/:slug/deepen/:historyId/replay', async (req: Request, res: Response) => {
    const { client, slug, historyId } = req.params;
    const dir = analysisDir(ctx.out, client, slug);
    if (!dir) { res.status(400).json({ error: 'bad path' }); return; }
    const entry = getEntry(ctx.db, historyId);
    if (!entry || entry.client !== client || entry.slug !== slug) {
      res.status(404).json({ error: 'entrada não encontrada' }); return;
    }

    const prompt = String(entry.prompt || '');
    const srcSecId = String(entry.section_id || '');
    const blockId = String(entry.block_id || '');
    const analysisType = String(entry.analysis_type || 'conversao-perfil');
    const sectionId = `det-replay-${crypto.randomBytes(3).toString('hex')}`;
    if (!isSafeSeg(sectionId)) { res.status(400).json({ error: 'id inválido' }); return; }

    try {
      const r = await generateDetalhamento({
        out: ctx.out, client, slug, srcSecId, blockId, prompt, resultId: sectionId,
        fewShot: getFewShot(ctx.db, analysisType, 3),
      });
      if (r.datasetChanged) {
        ctx.skipNextSSE.add('dataset.json');
        writeJson(path.join(dir, 'dataset.json'), r.dataset);
      }
      const title = prompt.length > 80 ? `${prompt.slice(0, 78)}…` : prompt;
      const section: Section = { id: sectionId, header: { badge: 'Detalhamento · Replay', title }, widgets: r.widgets };
      const newId = recordDeepen(ctx.db, {
        client, slug, analysisType: r.analysisType,
        origem: (entry.origem as 'card' | 'pergunta' | 'custom' | 'iteracao') || 'card',
        sectionId: srcSecId, blockId, modalId: sectionId,
        prompt, prevModalId: String(entry.modal_id || ''),
        cardContext: r.cardContext, modalJson: { title, widgets: r.widgets },
        validatedOk: true, usage: r.usage, mocked: r.mocked,
      });
      section.historyId = newId;
      ctx.skipNextSSE.add(`${sectionId}.json`);
      writeJson(path.join(dir, `${sectionId}.json`), section);
      attachToDetalhamentos(dir, ctx, { id: sectionId, label: title.slice(0, 42) });
      res.json({ ok: true, mocked: r.mocked, pageId: 'detalhamentos', sectionId, historyId: newId });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
}

/** Garante a página Detalhamentos no data.json e registra a seção (mesma regra
 *  do perguntas.ts; duplicada aqui no mínimo necessário para o replay). */
function attachToDetalhamentos(dir: string, ctx: Ctx, ref: { id: string; label: string }): void {
  const dataFile = path.join(dir, 'data.json');
  const data = readJson<ReportData>(dataFile) || ({ meta: {}, pages: [] } as ReportData);
  const pages = (data.pages ||= []);
  let page = pages.find((p) => p.id === 'detalhamentos');
  if (!page) {
    page = { id: 'detalhamentos', label: 'Detalhamentos', sections: [] } as PageRef;
    const pi = pages.findIndex((p) => p.kind === 'perguntas');
    if (pi >= 0) pages.splice(pi, 0, page); else pages.push(page);
  }
  if (!page.sections.some((s) => s.id === ref.id)) page.sections.push(ref);
  ctx.skipNextSSE.add('data.json');
  writeJson(dataFile, data);
}
