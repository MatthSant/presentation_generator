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
import { sendGenError } from '../creditError.js';
import type { Section, Widget, Modal } from '../../shared/types.js';
import { analysisDir, isSafeSeg, readJson, writeJson } from '../fsutil.js';
import { BASE } from '../paths.js';
import { buildCatalog } from '../datasetCatalog.js';
import { generateModal, generateModalDeep, rewriteQuestion, type DeepDeps } from '../claude.js';
import { gateAndRepair, pruneEmptyWidgets } from '../deepenLoop.js';
import { runQuery } from '../pygen.js';
import { validateSection } from '../../shared/validate.js';
import { typeOf, inferType } from '../typeRegistry.js';
import { buildCardContext, type CardContext } from '../cardContext.js';
import { recordDeepen, getFewShot, methodologySmell, markRevised, findByModalId } from '../deepenHistory.js';
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
    const navMeta = readJson<{ meta?: { controls?: { kind?: string } } }>(path.join(dir, 'data.json'));
    // A assinatura do dataset é AUTORITATIVA (foi gerada pelo build_report do tipo) e tem
    // prioridade sobre config/meta — evita o deepen rodar com o domínio/consultar errados
    // (fallback conversao-perfil) quando meta.type falta num relatório de debriefing/acomp.
    const analysisType = inferType(dataset) ?? (hasBase ? typeOf(baseConfig) : typeOf(navMeta?.meta?.controls?.kind)).type;
    const deepenMeta = hasBase ? typeOf(analysisType).buildDeepenMeta(baseConfig) : null;
    // Contexto de negócio (fase da campanha etc.): o client manda o estado ATUAL dos
    // controles (body.view = o que o consultor está olhando); sem ele, o default do
    // relatório (meta.controls). Vira meta.contexto no 1º turno do deep.
    if (deepenMeta) {
      const view = (body.view && typeof body.view === 'object' ? body.view : (navMeta?.meta?.controls as Record<string, unknown> | undefined)) as Record<string, unknown> | undefined;
      const contexto = typeOf(analysisType).deepenContext?.(baseConfig, view);
      if (contexto) deepenMeta.contexto = contexto;
    }
    const fewShot = getFewShot(ctx.db, analysisType, 3);
    // Os prompts dos bancos (e do consultor) são instruções por design — a
    // moldura força o modelo a EXECUTAR a análise, não a descrever o método.
    const framedPrompt = `Execute esta análise sobre as tabelas e apresente os resultados (não descreva como fazê-la): ${prompt}`;
    const origem = prev ? 'iteracao' : 'card';
    const record = (ok: boolean, errs: string[], m: Modal | null, usage: ModalUsage | undefined, mocked: boolean,
      gate?: { attempts: number; issues: string[]; residual: string[] }): string =>
      recordDeepen(ctx.db, {
        client, slug, analysisType, origem,
        sectionId: secId, blockId, modalId,
        prompt, prevModalId: (prev as Modal | undefined)?.id,
        cardContext: cardCtx, modalJson: m ?? undefined,
        validatedOk: ok, validationErrors: errs, usage, mocked,
        gateAttempts: gate?.attempts, gateIssues: gate?.issues, gateResidual: gate?.residual,
      });

    try {
      let datasetChanged = false;
      let qn = 0;
      const deps: DeepDeps | null = deepenMeta ? {
        meta: deepenMeta,
        runQuery: async (fn, args) => (await runQuery(client, slug, fn, args)) ?? { status: 'erro', motivo: 'sem base' },
        registerTable: (table, _summary) => {
          const key = `q-${modalId}-${qn++}`;
          dataset[key] = { dims: table.dims, filters: table.filters, rows: table.rows };
          datasetChanged = true;
          return key;
        },
        validate: (m) => {
          const cand = assignIds({ ...(m as Modal), id: modalId });
          const errs = validate(cand);
          return errs.length ? errs : methodologySmell(cand);
        },
      } : null;

      // Guardrail: mesmo após ajustes, o detalhamento deve seguir respondendo ao
      // ASSUNTO do bloco — pinamos o título do card como pergunta original.
      const objetivo = cardCtx.title || prompt;
      const gate = await gateAndRepair({
        dataset, objetivo, instrucao: prompt,
        onProgress: (msg) => ctx.emitProgress?.(client, slug, msg),
        generate: (repair, prevCand) => {
          const p = prevCand ?? prev;
          // Recataloga no reparo: inclui as q-* já criadas → o modelo reusa os dados e
          // conserta em vez de re-consultar tudo (evita o thrash de minutos no reparo).
          const cat = repair ? buildCatalog(dataset) : catalog;
          if (deps) {
            const dp = repair ? `${framedPrompt}\n\n${repair}` : framedPrompt;
            return generateModalDeep(dp, cardCtx, cat, deps, p, fewShot, objetivo, analysisType, !!repair);
          }
          return generateModal(framedPrompt, cardCtx, cat, repair, p, fewShot, objetivo, analysisType);
        },
        normalize: (m) => assignIds({ ...(m as Modal), id: modalId, widgets: pruneEmptyWidgets(((m as Modal).widgets) ?? []) }),
        validateSchema: (m) => validate(m as Modal),
      });
      const mocked = gate.mocked;
      const usage = gate.usage;
      const modal = gate.modal;
      if (!modal) {
        console.warn(`[deepen] ${client}/${slug}/${secId} ${blockId}: modal inválida →`, gate.residualBlocking);
        record(false, gate.residualBlocking, null, usage, mocked, { attempts: gate.attempts, issues: gate.issuesLog, residual: gate.residualBlocking });
        res.status(422).json({ error: 'modal inválida', detail: gate.residualBlocking });
        return;
      }
      // Só ERRO (residualBlocking) reprova — sugestões de forma nunca falham a entrega.
      if (gate.residualBlocking.length) {
        // Reprovado após todas as tentativas: não anexa um detalhamento pela metade —
        // devolve os ERROS (detail) e as SUGESTÕES separados p/ a tela de erro mostrar.
        console.warn(`[deepen] ${client}/${slug}/${secId} ${blockId}: reprovado após ${gate.attempts} tentativas →`, gate.residualBlocking);
        record(false, gate.residualBlocking, null, usage, mocked, { attempts: gate.attempts, issues: gate.issuesLog, residual: gate.residualBlocking });
        res.status(422).json({ error: `Não passou na verificação após ${gate.attempts} tentativas`, detail: gate.residualBlocking, suggestions: gate.residualSuggestions });
        return;
      }

      // TÍTULO do drawer = a PERGUNTA feita, deterministicamente. O modelo às vezes
      // cria um título bom, às vezes só ecoa o título do card — e a página já mostra
      // o card; repetir o nome dele não diz o que foi perguntado. Numa ITERAÇÃO o
      // prompt é instrução de ajuste ("aumente o gráfico"), não pergunta: mantém o
      // título original. O `objetivo` do gate segue sendo o assunto do bloco — papel
      // de guardrail, não de exibição; são coisas distintas de propósito.
      modal.title = prev ? ((prev as Modal).title || modal.title) : prompt;
      const historyId = record(true, [], modal, usage, mocked, { attempts: gate.attempts, issues: gate.issuesLog, residual: gate.residualBlocking });
      modal.historyId = historyId;   // âncora do rating no client
      // Iteração = revisão da versão anterior: marca-a como revisada com o
      // comentário do consultor (a nova entrada já encadeia por prev_modal_id).
      if (prev) {
        const prevId = (prev as Modal).id ? findByModalId(ctx.db, client, slug, (prev as Modal).id)?.id : undefined;
        if (prevId) markRevised(ctx.db, prevId, prompt);
      }

      if (datasetChanged) writeJson(path.join(dir, 'dataset.json'), dataset);
      // Iteração SUBSTITUI a modal anterior (é uma revisão, não um acúmulo) — o
      // histórico em deepen_history preserva todas as versões.
      const prevId = (prev as Modal | undefined)?.id;
      section.modals = [...(section.modals || []).filter((m) => m.id !== modal!.id && m.id !== prevId), modal];
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
      sendGenError(res, e);
    }
  });

  // Camada barata: reescreve a pergunta solta ANTES do detalhamento, ancorada no
  // bloco de origem (se houver) + vocabulário (métricas/dims) do relatório. Não
  // gera nada — só devolve a pergunta melhorada p/ o consultor revisar/editar.
  app.post('/api/:client/:slug/deepen/rewrite', async (req, res) => {
    const { client, slug } = req.params;
    const dir = analysisDir(ctx.out, client, slug);
    if (!dir) { res.status(400).json({ error: 'bad path' }); return; }
    const body = (req.body || {}) as Record<string, unknown>;
    const prompt = String(body.prompt || '').trim();
    if (!prompt) { res.status(400).json({ error: 'prompt required' }); return; }
    const secId = body.secId ? String(body.secId) : '';
    const blockId = body.blockId ? String(body.blockId) : '';

    const dataset = readJson<DataMap>(path.join(dir, 'dataset.json'));
    if (!dataset) { res.status(400).json({ error: 'dataset ausente' }); return; }
    const catalog = buildCatalog(dataset);

    // Contexto do bloco (quando o pedido parte de um bloco específico) + as tabelas
    // que ele consome — priorizam o vocabulário p/ manter a pergunta NO assunto do bloco.
    let card: CardContext | undefined;
    let blockTables: string[] = [];
    if (secId && isSafeSeg(secId) && blockId) {
      const section = readJson<Section>(path.join(dir, `${secId}.json`));
      if (section) {
        card = buildCardContext(section, blockId, catalog);
        const ds = new Set<string>();
        const b = (card.bind as { dataset?: string } | undefined)?.dataset;
        if (b) ds.add(b);
        for (const t of card.tabs || []) if (t.dataset) ds.add(String(t.dataset));
        blockTables = [...ds];
      }
    }

    const uniq = (a: string[]): string[] => [...new Set(a.filter(Boolean))];
    const relevant = blockTables.length ? catalog.tables.filter((t) => blockTables.includes(t.name)) : catalog.tables;
    const metrics = uniq(relevant.flatMap((t) => t.numericCols)).slice(0, 40);
    const dims = uniq(catalog.tables.flatMap((t) => t.dims)).slice(0, 30);
    const navMeta = readJson<{ meta?: { title?: string } }>(path.join(dir, 'data.json'));

    try {
      const r = await rewriteQuestion({ prompt, card, blockId: blockId || undefined, analysisTitle: navMeta?.meta?.title, vocab: { metrics, dims, blockTables } });
      res.json({ ok: true, rewritten: r.rewritten, mocked: r.mocked });
    } catch (e) {
      sendGenError(res, e);
    }
  });
}
