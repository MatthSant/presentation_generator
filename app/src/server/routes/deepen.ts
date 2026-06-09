/* deepen.ts — B2 (raso): aprofundar um card numa modal.
 *
 * POST /api/:client/:slug/section/:secId/deepen { blockId, prompt }
 *   → catálogo das tabelas já calculadas → Claude emite uma modal (widgets que
 *   fazem bind só a essas tabelas) → validateSection (mesma guarda do renderer) →
 *   1 turno de reparo se preciso → anexa a modal + seta card.modal → SSE recarrega.
 *
 * A modal só referencia agregados existentes; nenhum número novo é fabricado. */

import crypto from 'node:crypto';
import path from 'node:path';
import type { Express } from 'express';
import type { Ctx } from '../context.js';
import type { Section, Widget, Modal } from '../../shared/types.js';
import { analysisDir, isSafeSeg, readJson, writeJson } from '../fsutil.js';
import { buildCatalog } from '../datasetCatalog.js';
import { generateModal } from '../claude.js';
import { validateSection } from '../../shared/validate.js';

type DataMap = Record<string, { rows: Array<Record<string, unknown>> }>;

function assignIds(modal: Modal): Modal {
  (modal.widgets || []).forEach((w, i) => { if (!w.id) (w as { id: string }).id = `${modal.id}-w${i}`; });
  return modal;
}

export function registerDeepen(app: Express, ctx: Ctx): void {
  const log = ctx.db.prepare(`
    INSERT INTO block_edits
      (id, client, slug, section_id, section_label, block_id, block_type, action, changes, snapshot, created_at)
    VALUES
      (@id, @client, @slug, @section_id, @section_label, @block_id, @block_type, @action, @changes, @snapshot, @created_at)
  `);

  app.post('/api/:client/:slug/section/:secId/deepen', async (req, res) => {
    const { client, slug, secId } = req.params;
    const dir = analysisDir(ctx.out, client, slug);
    if (!dir || !isSafeSeg(secId)) { res.status(400).json({ error: 'bad path' }); return; }

    const file = path.join(dir, `${secId}.json`);
    const section = readJson<Section>(file);
    if (!section) { res.status(404).json({ error: 'section not found' }); return; }

    const body = (req.body || {}) as Record<string, unknown>;
    const blockId = String(body.blockId || '');
    const prompt = String(body.prompt || '').trim();
    if (!prompt) { res.status(400).json({ error: 'prompt required' }); return; }

    const card = section.widgets.find((w) => w.id === blockId);
    if (!card) { res.status(404).json({ error: 'card not found' }); return; }

    const dataset = readJson<DataMap>(path.join(dir, 'dataset.json'));
    if (!dataset) { res.status(400).json({ error: 'dataset ausente' }); return; }
    const catalog = buildCatalog(dataset);
    const cardCtx = {
      title: (card as { title?: string }).title,
      detail: (card as { detail?: string }).detail,
      type: (card as Widget).type,
      bind: (card as { bind?: unknown }).bind,
    };
    const modalId = `modal-${blockId}-${crypto.randomBytes(3).toString('hex')}`;

    try {
      let mocked = false;
      let modal: Modal | null = null;
      let lastErrors: string[] = [];
      // up to 2 attempts: initial + one repair fed the validation errors
      for (let attempt = 0; attempt < 2; attempt++) {
        const repair = attempt === 0 ? undefined : `A modal anterior foi rejeitada: ${lastErrors.join('; ')}. Corrija usando só tabelas/colunas do catálogo.`;
        const r = await generateModal(prompt, cardCtx, catalog, repair);
        mocked = r.mocked;
        modal = assignIds({ ...(r.modal as Modal), id: modalId });
        const errs = validateSection({ ...section, modals: [...(section.modals || []), modal] }, dataset as unknown as Parameters<typeof validateSection>[1]);
        if (errs.length === 0) { lastErrors = []; break; }
        lastErrors = errs.map((e) => `${e.path}: ${e.message}`);
        modal = null;
        if (mocked) break; // mock won't self-repair
      }
      if (!modal) { res.status(422).json({ error: 'modal inválida', detail: lastErrors }); return; }

      section.modals = [...(section.modals || []).filter((m) => m.id !== modal!.id), modal];
      (card as { modal?: string }).modal = modal.id;

      ctx.skipNextSSE.add(`${secId}.json`);
      writeJson(file, section);
      log.run({
        id: crypto.randomUUID(), client, slug,
        section_id: secId, section_label: section.header?.title || '',
        block_id: blockId, block_type: (card as Widget).type,
        action: 'attach-modal',
        changes: JSON.stringify({ prompt }),
        snapshot: JSON.stringify(modal),
        created_at: new Date().toISOString(),
      });

      res.json({ ok: true, modal, mocked, blockId });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
}
