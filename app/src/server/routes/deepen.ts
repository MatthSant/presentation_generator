/* deepen.ts — B2 (raso): aprofundar um card numa modal.
 *
 * POST /api/:client/:slug/section/:secId/deepen { blockId, prompt }
 *   → catálogo das tabelas já calculadas → Claude emite uma modal (widgets que
 *   fazem bind só a essas tabelas) → validateSection (mesma guarda do renderer) →
 *   1 turno de reparo se preciso → anexa a modal + seta card.modal → SSE recarrega.
 *
 * A modal só referencia agregados existentes; nenhum número novo é fabricado. */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import type { Ctx } from '../context.js';
import type { Section, Widget, Modal } from '../../shared/types.js';
import { analysisDir, isSafeSeg, readJson, writeJson } from '../fsutil.js';
import { BASE } from '../paths.js';
import { buildCatalog } from '../datasetCatalog.js';
import { generateModal, generateModalDeep, type DeepDeps } from '../claude.js';
import { runQuery } from '../pygen.js';
import { validateSection } from '../../shared/validate.js';

interface DataTable { dims?: string[]; filters?: string[]; rows: Array<Record<string, unknown>> }
type DataMap = Record<string, DataTable>;
interface BaseConfig { criterios: Array<{ id: string; label?: string }>; channels?: string[] }

function assignIds(modal: Modal): Modal {
  // The model can emit a malformed `widgets` (the tool schema isn't strictly
  // enforced) — coerce to an array so we never crash on .forEach.
  const ws = Array.isArray(modal.widgets) ? modal.widgets : [];
  ws.forEach((w, i) => { if (!w.id) (w as { id: string }).id = `${modal.id}-w${i}`; });
  modal.widgets = ws;
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
    // Criterion-page widgets are id-prefixed ("renda-reptoggle" → "renda").
    // Validate the prefix against the real dataset criteria so we anchor the model
    // on the card's own criterion instead of letting it wander to another one.
    const critIds = new Set<string>();
    for (const t of catalog.tables) { const mm = t.name.match(/^crit_([a-z0-9]+)_/i); if (mm) critIds.add(mm[1]); }
    const prefix = blockId.includes('-') ? blockId.slice(0, blockId.indexOf('-')) : '';
    const cardCtx = {
      title: (card as { title?: string }).title,
      detail: (card as { detail?: string }).detail,
      type: (card as Widget).type,
      bind: (card as { bind?: unknown }).bind,
      pagina: section.header?.title,
      criterio: critIds.has(prefix) ? prefix : undefined,
    };
    const modalId = `modal-${blockId}-${crypto.randomBytes(3).toString('hex')}`;
    const validate = (modal: Modal): string[] => {
      if (!Array.isArray(modal.widgets) || modal.widgets.length === 0) {
        return ['widgets deve ser uma lista não-vazia (find-note / chart / table)'];
      }
      return validateSection({ ...section, modals: [...(section.modals || []), modal] }, dataset as unknown as Parameters<typeof validateSection>[1])
        .map((e) => `${e.path}: ${e.message}`);
    };

    // Deep mode is available when this analysis kept its base data (Fase 3b).
    const baseDir = path.join(BASE, client, slug);
    const hasBase = fs.existsSync(path.join(baseDir, 'dump.csv')) && fs.existsSync(path.join(baseDir, 'config.json'));

    try {
      let mocked = false;
      let modal: Modal | null = null;
      let datasetChanged = false;
      let errors: string[] = [];

      if (hasBase) {
        // The model decides which cuts to request; the app computes them over the
        // retained base and merges the aggregates into the dataset to bind to.
        const config = readJson<BaseConfig>(path.join(baseDir, 'config.json'));
        let qn = 0;
        const deps: DeepDeps = {
          meta: {
            criterios: (config?.criterios || []).map((c) => ({ id: c.id, label: c.label || c.id })),
            canais: config?.channels || ['Geral'],
            metricas: ['conv_lcto', 'conv_12m', 'diff', 'uplift', 'rep'],
          },
          runQuery: async (fn, args) => (await runQuery(client, slug, fn, args)) ?? { status: 'erro', motivo: 'sem base' },
          registerTable: (table, _summary) => {
            const key = `q-${modalId}-${qn++}`;
            dataset[key] = { dims: table.dims, filters: table.filters, rows: table.rows };
            datasetChanged = true;
            return key;
          },
          validate: (modal) => validate(assignIds({ ...(modal as Modal), id: modalId })),
        };
        const r = await generateModalDeep(prompt, cardCtx, catalog, deps);
        mocked = r.mocked;
        const cand = assignIds({ ...(r.modal as Modal), id: modalId });
        errors = validate(cand);
        if (errors.length === 0) modal = cand;
      } else {
        // Shallow: bind only to already-computed tables; 1 repair turn.
        for (let attempt = 0; attempt < 2; attempt++) {
          const repair = attempt === 0 ? undefined : `A modal anterior foi rejeitada: ${errors.join('; ')}. Corrija usando só tabelas/colunas do catálogo.`;
          const r = await generateModal(prompt, cardCtx, catalog, repair);
          mocked = r.mocked;
          const cand = assignIds({ ...(r.modal as Modal), id: modalId });
          errors = validate(cand);
          if (errors.length === 0) { modal = cand; break; }
          if (mocked) break;
        }
      }
      if (!modal) {
        console.warn(`[deepen] ${client}/${slug}/${secId} ${blockId}: modal inválida →`, errors);
        res.status(422).json({ error: 'modal inválida', detail: errors });
        return;
      }

      if (datasetChanged) writeJson(path.join(dir, 'dataset.json'), dataset);
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

      res.json({ ok: true, modal, mocked, blockId, datasetChanged });
    } catch (e) {
      console.error(`[deepen] ${client}/${slug}/${secId} ${blockId}:`, (e as Error).message);
      res.status(500).json({ error: (e as Error).message });
    }
  });
}
