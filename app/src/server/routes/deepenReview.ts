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
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import type { Ctx } from '../context.js';
import { sendGenError } from '../creditError.js';
import type { ReportData, PageRef, Section, Layout } from '../../shared/types.js';
import { analysisDir, isSafeSeg, readJson, writeJson } from '../fsutil.js';
import { generateDetalhamento } from '../detalhamento.js';
import { packFallback } from '../layoutAudit.js';
import { rateDeepen, listHistory, getEntry, recordDeepen, getFewShot, approveDeepen, markRevised, markDiscarded } from '../deepenHistory.js';

export function registerDeepenReview(app: Express, ctx: Ctx): void {
  app.post('/api/:client/:slug/deepen/:historyId/rate', (req: Request, res: Response) => {
    const { historyId } = req.params;
    const body = (req.body || {}) as Record<string, unknown>;
    const rating = Number(body.rating);
    const ok = rateDeepen(ctx.db, historyId, rating, typeof body.feedback === 'string' ? body.feedback : undefined);
    if (!ok) { res.status(400).json({ error: 'rating inválido ou entrada não encontrada' }); return; }
    res.json({ ok: true, rating });
  });

  /** Aprovação explícita do detalhamento (fluxo de revisão). */
  app.post('/api/:client/:slug/deepen/:historyId/aprovar', (req: Request, res: Response) => {
    const ok = approveDeepen(ctx.db, req.params.historyId);
    if (!ok) { res.status(404).json({ error: 'entrada não encontrada' }); return; }
    res.json({ ok: true, status: 'aprovado' });
  });

  /** Pedir REVISÃO de uma seção det-*: regenera a MESMA seção partindo da versão
   *  atual (prev) + o comentário do consultor; a entrada anterior fica marcada
   *  como revisada e a nova encadeia por prev_modal_id. */
  app.post('/api/:client/:slug/det/:sectionId/revisar', async (req: Request, res: Response) => {
    const { client, slug, sectionId } = req.params;
    const dir = analysisDir(ctx.out, client, slug);
    if (!dir || !isSafeSeg(sectionId) || !sectionId.startsWith('det-')) { res.status(400).json({ error: 'bad path' }); return; }
    const file = path.join(dir, `${sectionId}.json`);
    const section = readJson<Section>(file);
    if (!section) { res.status(404).json({ error: 'seção não encontrada' }); return; }
    const comentario = String((req.body as Record<string, unknown> | undefined)?.comentario || '').trim();
    if (!comentario) { res.status(400).json({ error: 'comentário da revisão é obrigatório' }); return; }

    const prevHistory = section.historyId ? getEntry(ctx.db, section.historyId) : undefined;
    const srcSecId = String(prevHistory?.section_id || '');
    const blockId = String(prevHistory?.block_id || '');
    const analysisType = String(prevHistory?.analysis_type || 'conversao-perfil');

    try {
      const r = await generateDetalhamento({
        out: ctx.out, client, slug, srcSecId, blockId,
        prompt: comentario,
        prev: { title: section.header?.title, widgets: section.widgets },
        resultId: sectionId, objetivo: section.header?.title,
        fewShot: getFewShot(ctx.db, analysisType, 3),
      });
      if (r.datasetChanged) {
        ctx.skipNextSSE.add('dataset.json');
        writeJson(path.join(dir, 'dataset.json'), r.dataset);
      }
      const historyId = recordDeepen(ctx.db, {
        client, slug, analysisType: r.analysisType, origem: 'iteracao',
        sectionId: srcSecId, blockId, modalId: sectionId,
        prompt: comentario, prevModalId: sectionId,
        cardContext: r.cardContext,
        modalJson: { title: section.header?.title, widgets: r.widgets },
        validatedOk: true, usage: r.usage, mocked: r.mocked,
        gateAttempts: r.gate.attempts, gateIssues: r.gate.issues, gateResidual: r.gate.residual,
      });
      if (section.historyId) markRevised(ctx.db, section.historyId, comentario);
      section.widgets = r.widgets;
      section.historyId = historyId;
      ctx.skipNextSSE.add(`${sectionId}.json`);
      writeJson(file, section);
      // A revisão regenera os WIDGETS — a disposição nova (r.layout) tem de ir junto:
      // manter a entrada antiga deixava coordenadas apontando p/ ids que podem nem
      // existir mais, e o render saía quebrado (sem F5 que salvasse).
      writeSectionLayout(dir, ctx, sectionId, r.layout);
      res.json({ ok: true, mocked: r.mocked, sectionId, historyId });
    } catch (e) {
      sendGenError(res, e);
    }
  });

  /** Reorganizar a DISPOSIÇÃO de um aprofundamento — determinístico, sem IA.
   *  Aplica o packer de gabarito (packFallback) sobre os widgets como estão:
   *  resposta no topo, kpis em linha própria cheia, evidência pareada com
   *  conclusão. Não toca no conteúdo nem no histórico — é geometria, não geração. */
  app.post('/api/:client/:slug/det/:sectionId/relayout', (req: Request, res: Response) => {
    const { client, slug, sectionId } = req.params;
    const dir = analysisDir(ctx.out, client, slug);
    if (!dir || !isSafeSeg(sectionId) || !sectionId.startsWith('det-')) { res.status(400).json({ error: 'bad path' }); return; }
    const section = readJson<Section>(path.join(dir, `${sectionId}.json`));
    if (!section?.widgets?.length) { res.status(404).json({ error: 'seção não encontrada' }); return; }
    const layout = packFallback(section.widgets.map((w) => ({ id: w.id, type: w.type })));
    writeSectionLayout(dir, ctx, sectionId, layout);
    res.json({ ok: true, layout });
  });

  /** Descartar um detalhamento já feito: remove a seção det-* do relatório
   *  (arquivo + ref na navegação + entrada de layout) e, se ela veio de uma
   *  pergunta, zera o status dela (volta a ser seguível). Só seções det-*. */
  app.post('/api/:client/:slug/det/:sectionId/descartar', (req: Request, res: Response) => {
    const { client, slug, sectionId } = req.params;
    const dir = analysisDir(ctx.out, client, slug);
    if (!dir || !isSafeSeg(sectionId) || !sectionId.startsWith('det-')) { res.status(400).json({ error: 'bad path' }); return; }
    const file = path.join(dir, `${sectionId}.json`);
    if (!fs.existsSync(file)) { res.status(404).json({ error: 'seção não encontrada' }); return; }

    // Motivo do descarte (opcional): fica no histórico com a geração (status='descartado').
    const motivo = String((req.body as Record<string, unknown> | undefined)?.motivo || '').trim();
    const discarded = readJson<Section>(file);
    if (discarded?.historyId && motivo) markDiscarded(ctx.db, discarded.historyId, motivo);

    const pageRemoved = detachFromDetalhamentos(dir, ctx, sectionId);

    const layoutFile = path.join(dir, 'layout.json');
    const layout = readJson<Layout>(layoutFile);
    if (layout?.sections && sectionId in layout.sections) {
      delete layout.sections[sectionId];
      ctx.skipNextSSE.add('layout.json');
      writeJson(layoutFile, layout);
    }

    ctx.skipNextSSE.add(`${sectionId}.json`);
    fs.rmSync(file, { force: true });

    clearPerguntaStatus(ctx, client, slug, sectionId);

    res.json({ ok: true, sectionId, pageRemoved });
  });

  /** Descartar o detalhamento de um BLOCO (modal da varinha): remove o modal do
   *  bloco + limpa card.modal, gravando o motivo no histórico (status='descartado').
   *  A varinha volta a ser "detalhar". */
  app.post('/api/:client/:slug/section/:secId/block/:blockId/descartar', (req: Request, res: Response) => {
    const { client, slug, secId, blockId } = req.params;
    const dir = analysisDir(ctx.out, client, slug);
    if (!dir || !isSafeSeg(secId)) { res.status(400).json({ error: 'bad path' }); return; }
    const file = path.join(dir, `${secId}.json`);
    const section = readJson<Section>(file);
    if (!section) { res.status(404).json({ error: 'seção não encontrada' }); return; }
    const card = section.widgets.find((w) => w.id === blockId) as { modal?: string } | undefined;
    const modalId = card?.modal;
    if (!card || !modalId) { res.status(404).json({ error: 'bloco sem detalhamento' }); return; }

    const motivo = String((req.body as Record<string, unknown> | undefined)?.motivo || '').trim();
    const modal = (section.modals || []).find((m) => m.id === modalId) as { historyId?: string } | undefined;
    if (modal?.historyId && motivo) markDiscarded(ctx.db, modal.historyId, motivo);

    section.modals = (section.modals || []).filter((m) => m.id !== modalId);
    delete card.modal;
    ctx.skipNextSSE.add(`${secId}.json`);
    writeJson(file, section);
    res.json({ ok: true, secId, blockId });
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
        objetivo: prompt,
        fewShot: getFewShot(ctx.db, analysisType, 3),
      });
      if (r.datasetChanged) {
        ctx.skipNextSSE.add('dataset.json');
        writeJson(path.join(dir, 'dataset.json'), r.dataset);
      }
      const title = prompt.length > 80 ? `${prompt.slice(0, 78)}…` : prompt;
      const section: Section = { id: sectionId, header: { badge: 'Aprofundamento · Replay', title }, widgets: r.widgets };
      const newId = recordDeepen(ctx.db, {
        client, slug, analysisType: r.analysisType,
        origem: (entry.origem as 'card' | 'pergunta' | 'custom' | 'iteracao') || 'card',
        sectionId: srcSecId, blockId, modalId: sectionId,
        prompt, prevModalId: String(entry.modal_id || ''),
        cardContext: r.cardContext, modalJson: { title, widgets: r.widgets },
        validatedOk: true, usage: r.usage, mocked: r.mocked,
        gateAttempts: r.gate.attempts, gateIssues: r.gate.issues, gateResidual: r.gate.residual,
      });
      section.historyId = newId;
      ctx.skipNextSSE.add(`${sectionId}.json`);
      writeJson(path.join(dir, `${sectionId}.json`), section);
      writeSectionLayout(dir, ctx, sectionId, r.layout);   // replay criava a seção SEM disposição
      attachToDetalhamentos(dir, ctx, { id: sectionId, label: title.slice(0, 42) });
      res.json({ ok: true, mocked: r.mocked, pageId: 'detalhamentos', sectionId, historyId: newId });
    } catch (e) {
      sendGenError(res, e);
    }
  });
}

/** Garante a página Detalhamentos no data.json e registra a seção (mesma regra
 *  do perguntas.ts; duplicada aqui no mínimo necessário para o replay). */
/** Grava a disposição de uma seção det-* no layout.json (mesma regra do
 *  perguntas.ts: SSE suprimido — o fluxo que escreveu atualiza o client). */
function writeSectionLayout(dir: string, ctx: Ctx, sectionId: string, items: Layout['sections'][string] | undefined): void {
  if (!items?.length) return;
  const layoutFile = path.join(dir, 'layout.json');
  const layout = readJson<Layout>(layoutFile) || { sections: {} };
  (layout.sections ||= {})[sectionId] = items;
  ctx.skipNextSSE.add('layout.json');
  writeJson(layoutFile, layout);
}

function attachToDetalhamentos(dir: string, ctx: Ctx, ref: { id: string; label: string }): void {
  const dataFile = path.join(dir, 'data.json');
  const data = readJson<ReportData>(dataFile) || ({ meta: {}, pages: [] } as ReportData);
  const pages = (data.pages ||= []);
  let page = pages.find((p) => p.id === 'detalhamentos');
  if (!page) {
    page = { id: 'detalhamentos', label: 'Aprofundamentos', sections: [] } as PageRef;
    const pi = pages.findIndex((p) => p.kind === 'perguntas');
    if (pi >= 0) pages.splice(pi, 0, page); else pages.push(page);
  }
  if (!page.sections.some((s) => s.id === ref.id)) page.sections.push(ref);
  ctx.skipNextSSE.add('data.json');
  writeJson(dataFile, data);
}

/** Remove a seção da página Detalhamentos; descarta a página se ela esvaziar.
 *  Retorna true se a página foi removida. */
function detachFromDetalhamentos(dir: string, ctx: Ctx, sectionId: string): boolean {
  const dataFile = path.join(dir, 'data.json');
  const data = readJson<ReportData>(dataFile);
  if (!data?.pages) return false;
  const page = data.pages.find((p) => p.id === 'detalhamentos');
  if (!page) return false;
  page.sections = (page.sections || []).filter((s) => s.id !== sectionId);
  let pageRemoved = false;
  if (page.sections.length === 0) {
    data.pages = data.pages.filter((p) => p.id !== 'detalhamentos');
    pageRemoved = true;
  }
  ctx.skipNextSSE.add('data.json');
  writeJson(dataFile, data);
  return pageRemoved;
}

/** Append-only: registra 'descartar' para a pergunta dona deste det (se houver),
 *  fazendo o liveStatus voltar a tratá-la como não-seguida. No-op para detalhamentos
 *  sem pergunta de origem (ex.: replay, detalhar por card). */
function clearPerguntaStatus(ctx: Ctx, client: string, slug: string, sectionId: string): void {
  const owner = ctx.db.prepare(
    `SELECT pergunta_id, pergunta FROM perguntas_history
       WHERE client = ? AND slug = ? AND modal_id = ? ORDER BY created_at DESC LIMIT 1`,
  ).get(client, slug, sectionId) as { pergunta_id?: string; pergunta?: string } | undefined;
  if (!owner?.pergunta_id) return;
  ctx.db.prepare(
    `INSERT INTO perguntas_history (id, client, slug, pergunta_id, pergunta, acao, modal_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'descartar', ?, ?)`,
  ).run(crypto.randomUUID(), client, slug, owner.pergunta_id, owner.pergunta || '', sectionId, new Date().toISOString());
}
