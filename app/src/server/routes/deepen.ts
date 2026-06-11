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
import { typeOf } from '../typeRegistry.js';
import { buildCardContext } from '../cardContext.js';
import { recordDeepen, getFewShot, methodologySmell } from '../deepenHistory.js';
import type { ModalUsage } from '../claude.js';

interface DataTable { dims?: string[]; filters?: string[]; rows: Array<Record<string, unknown>> }
type DataMap = Record<string, DataTable>;

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
    // When adjusting/iterating an existing detalhamento, the client sends the
    // current modal so the model starts from it instead of from scratch.
    const prev = body.prev && typeof body.prev === 'object' ? body.prev : undefined;

    const card = section.widgets.find((w) => w.id === blockId);
    if (!card) { res.status(404).json({ error: 'card not found' }); return; }

    const dataset = readJson<DataMap>(path.join(dir, 'dataset.json'));
    if (!dataset) { res.status(400).json({ error: 'dataset ausente' }); return; }
    const catalog = buildCatalog(dataset);
    const cardCtx = buildCardContext(section, blockId, catalog);
    const modalId = `modal-${blockId}-${crypto.randomBytes(3).toString('hex')}`;
    const validate = (modal: Modal): string[] => {
      if (!Array.isArray(modal.widgets) || modal.widgets.length === 0) {
        return ['widgets deve ser uma lista não-vazia (find-note / chart / table)'];
      }
      return validateSection({ ...section, modals: [...(section.modals || []), modal] }, dataset as unknown as Parameters<typeof validateSection>[1])
        .map((e) => `${e.path}: ${e.message}`);
    };

    // Deep mode: precisa da base retida E de um tipo com query de aprofundamento
    // (registry.buildDeepenMeta != null). Sem isso (ex.: histórico), modo raso.
    const baseDir = path.join(BASE, client, slug);
    const hasBase = fs.existsSync(path.join(baseDir, 'dump.csv')) && fs.existsSync(path.join(baseDir, 'config.json'));
    const baseConfig = hasBase ? readJson<Record<string, unknown>>(path.join(baseDir, 'config.json')) : null;
    const deepenMeta = hasBase ? typeOf(baseConfig).buildDeepenMeta(baseConfig) : null;

    const navMeta = readJson<{ meta?: { controls?: { kind?: string } } }>(path.join(dir, 'data.json'));
    const analysisType = (hasBase ? typeOf(baseConfig) : typeOf(navMeta?.meta?.controls?.kind)).type;
    const fewShot = getFewShot(ctx.db, analysisType, 3);
    // Os prompts dos bancos (e do consultor) são instruções por design — a
    // moldura força o modelo a EXECUTAR a análise, não a descrever o método.
    const framedPrompt = `Execute esta análise sobre as tabelas e apresente os resultados (não descreva como fazê-la): ${prompt}`;
    const origem = prev ? 'iteracao' : 'card';
    const record = (ok: boolean, errs: string[], m: Modal | null, usage: ModalUsage | undefined, mocked: boolean): string =>
      recordDeepen(ctx.db, {
        client, slug, analysisType, origem,
        sectionId: secId, blockId, modalId,
        prompt, prevModalId: (prev as Modal | undefined)?.id,
        cardContext: cardCtx, modalJson: m ?? undefined,
        validatedOk: ok, validationErrors: errs, usage, mocked,
      });

    try {
      let mocked = false;
      let modal: Modal | null = null;
      let datasetChanged = false;
      let errors: string[] = [];
      let usage: ModalUsage | undefined;

      if (deepenMeta) {
        // The model decides which cuts to request; the app computes them over the
        // retained base and merges the aggregates into the dataset to bind to.
        let qn = 0;
        const deps: DeepDeps = {
          meta: deepenMeta,
          runQuery: async (fn, args) => (await runQuery(client, slug, fn, args)) ?? { status: 'erro', motivo: 'sem base' },
          registerTable: (table, _summary) => {
            const key = `q-${modalId}-${qn++}`;
            dataset[key] = { dims: table.dims, filters: table.filters, rows: table.rows };
            datasetChanged = true;
            return key;
          },
          // qualidade entra no gate do loop: o modelo recebe o feedback e refaz
          validate: (m) => {
            const cand = assignIds({ ...(m as Modal), id: modalId });
            const errs = validate(cand);
            return errs.length ? errs : methodologySmell(cand);
          },
        };
        const r = await generateModalDeep(framedPrompt, cardCtx, catalog, deps, prev, fewShot);
        mocked = r.mocked;
        usage = r.usage;
        const cand = assignIds({ ...(r.modal as Modal), id: modalId });
        errors = validate(cand);
        if (errors.length === 0) modal = cand;
      } else {
        // Shallow: bind only to already-computed tables; 1 repair turn (estrutura
        // OU cheiro de metodologia disparam o reparo).
        for (let attempt = 0; attempt < 2; attempt++) {
          const repair = attempt === 0 ? undefined : `A modal anterior foi rejeitada: ${errors.join('; ')}. Corrija usando só tabelas/colunas do catálogo.`;
          const r = await generateModal(framedPrompt, cardCtx, catalog, repair, prev, fewShot);
          mocked = r.mocked;
          if (r.usage) usage = usage ? { ...r.usage, tokensIn: usage.tokensIn + r.usage.tokensIn, tokensOut: usage.tokensOut + r.usage.tokensOut, costUsd: Number((usage.costUsd + r.usage.costUsd).toFixed(6)) } : r.usage;
          const cand = assignIds({ ...(r.modal as Modal), id: modalId });
          errors = validate(cand);
          if (errors.length === 0) errors = methodologySmell(cand);
          if (errors.length === 0) { modal = cand; break; }
          if (mocked) break;
        }
      }
      if (!modal) {
        console.warn(`[deepen] ${client}/${slug}/${secId} ${blockId}: modal inválida →`, errors);
        record(false, errors, null, usage, mocked);
        res.status(422).json({ error: 'modal inválida', detail: errors });
        return;
      }

      const historyId = record(true, [], modal, usage, mocked);
      modal.historyId = historyId;   // âncora do rating no client

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

      res.json({ ok: true, modal, mocked, blockId, datasetChanged, historyId });
    } catch (e) {
      console.error(`[deepen] ${client}/${slug}/${secId} ${blockId}:`, (e as Error).message);
      record(false, [(e as Error).message], null, undefined, false);
      res.status(500).json({ error: (e as Error).message });
    }
  });
}
