/* deepenHistory.ts — histórico instrumentado do harness de detalhamento.
 *
 * Toda geração (card/pergunta/custom/iteração, sucesso OU falha de validação)
 * vira uma linha em deepen_history: prompt, contexto do card, snapshot da
 * resposta, custo/tokens e — depois — a avaliação do consultor (★1–5 +
 * comentário). Os bem avaliados (rating ≥ 4) alimentam o few-shot dos próximos
 * prompts, fechando o ciclo de melhoria. */

import crypto from 'node:crypto';
import type { DB } from './db.js';
import type { ModalUsage, FewShotExample } from './claude.js';

export interface DeepenEntry {
  client: string;
  slug: string;
  analysisType: string;
  origem: 'card' | 'pergunta' | 'custom' | 'iteracao';
  sectionId?: string;
  blockId?: string;
  modalId?: string;
  prompt: string;
  prevModalId?: string;
  cardContext?: unknown;
  modalJson?: unknown;
  validatedOk: boolean;
  validationErrors?: string[];
  usage?: ModalUsage;
  mocked: boolean;
}

export function recordDeepen(db: DB, e: DeepenEntry): string {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO deepen_history
      (id, client, slug, analysis_type, origem, section_id, block_id, modal_id,
       prompt, prev_modal_id, card_context, modal_json, validated_ok,
       validation_errors, model, tokens_in, tokens_out, cost_usd, mocked, created_at)
    VALUES
      (@id, @client, @slug, @analysis_type, @origem, @section_id, @block_id, @modal_id,
       @prompt, @prev_modal_id, @card_context, @modal_json, @validated_ok,
       @validation_errors, @model, @tokens_in, @tokens_out, @cost_usd, @mocked, @created_at)
  `).run({
    id, client: e.client, slug: e.slug, analysis_type: e.analysisType, origem: e.origem,
    section_id: e.sectionId || '', block_id: e.blockId || '', modal_id: e.modalId || '',
    prompt: e.prompt, prev_modal_id: e.prevModalId || '',
    card_context: JSON.stringify(e.cardContext ?? {}),
    modal_json: JSON.stringify(e.modalJson ?? {}),
    validated_ok: e.validatedOk ? 1 : 0,
    validation_errors: JSON.stringify(e.validationErrors ?? []),
    model: e.usage?.model || '', tokens_in: e.usage?.tokensIn ?? null,
    tokens_out: e.usage?.tokensOut ?? null, cost_usd: e.usage?.costUsd ?? null,
    mocked: e.mocked ? 1 : 0, created_at: new Date().toISOString(),
  });
  return id;
}

export function rateDeepen(db: DB, id: string, rating: number, feedback?: string): boolean {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return false;
  const r = db.prepare(`
    UPDATE deepen_history SET rating = ?, feedback_text = ?, feedback_at = ? WHERE id = ?
  `).run(rating, feedback || null, new Date().toISOString(), id);
  return r.changes > 0;
}

/* ── fluxo de revisão: o consultor aprova ou pede revisão com comentário ───── */

export function approveDeepen(db: DB, id: string): boolean {
  const r = db.prepare("UPDATE deepen_history SET status = 'aprovado' WHERE id = ?").run(id);
  return r.changes > 0;
}

/** Marca a versão anterior como revisada, guardando o comentário que motivou a
 *  revisão (a nova geração vira uma entrada própria, encadeada por prev_modal_id). */
export function markRevised(db: DB, id: string, comment: string): boolean {
  const r = db.prepare(`
    UPDATE deepen_history SET status = 'revisado',
      feedback_text = COALESCE(feedback_text || ' · ', '') || ?, feedback_at = ?
    WHERE id = ?
  `).run(`revisão pedida: ${comment}`, new Date().toISOString(), id);
  return r.changes > 0;
}

/** Entrada mais recente cujo artefato (modal/seção) é `modalId` — usada para
 *  marcar a versão anterior quando uma iteração chega só com o id do artefato. */
export function findByModalId(db: DB, client: string, slug: string, modalId: string): { id: string } | undefined {
  return db.prepare(`
    SELECT id FROM deepen_history WHERE client = ? AND slug = ? AND modal_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(client, slug, modalId) as { id: string } | undefined;
}

export interface HistoryFilters { client?: string; slug?: string; origem?: string; rated?: boolean; minRating?: number; ids?: string[]; limit?: number }

export function listHistory(db: DB, f: HistoryFilters = {}): Array<Record<string, unknown>> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.client) { where.push('client = ?'); args.push(f.client); }
  if (f.slug) { where.push('slug = ?'); args.push(f.slug); }
  if (f.origem) { where.push('origem = ?'); args.push(f.origem); }
  if (f.rated) where.push('rating IS NOT NULL');
  if (f.minRating != null) { where.push('rating >= ?'); args.push(f.minRating); }
  if (f.ids?.length) { where.push(`id IN (${f.ids.map(() => '?').join(',')})`); args.push(...f.ids); }
  const sql = `SELECT id, client, slug, analysis_type, origem, section_id, block_id, modal_id,
      prompt, validated_ok, validation_errors, model, tokens_in, tokens_out, cost_usd,
      mocked, rating, feedback_text, status, created_at
    FROM deepen_history ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC LIMIT ?`;
  args.push(Math.min(Math.max(f.limit ?? 50, 1), 500));
  return db.prepare(sql).all(...args) as Array<Record<string, unknown>>;
}

/** Linha completa (com prompt/contexto) para replay. */
export function getEntry(db: DB, id: string): Record<string, unknown> | undefined {
  return db.prepare('SELECT * FROM deepen_history WHERE id = ?').get(id) as Record<string, unknown> | undefined;
}

/* ── few-shot ─────────────────────────────────────────────────────────────── */

interface NoteWidget { type?: string; text?: string; title?: string; chartType?: string; bind?: unknown }

/** Resumo compacto de uma modal para few-shot: títulos + tipos + binds; prosa
 *  truncada. O objetivo é ESTILO/estrutura, não os dados. */
function summarizeModal(modalJson: string): unknown {
  try {
    const m = JSON.parse(modalJson) as { title?: string; widgets?: NoteWidget[] };
    return {
      title: m.title,
      widgets: (m.widgets || []).map((w) => w.type === 'find-note'
        ? { type: 'find-note', text: String(w.text || '').slice(0, 180) }
        : { type: w.type, chartType: w.chartType, title: w.title, bind: w.bind }),
    };
  } catch { return undefined; }
}

const FEWSHOT_CHAR_CAP = 8000; // ~2k tokens

export function getFewShot(db: DB, analysisType: string, limit = 3): FewShotExample[] {
  const rows = db.prepare(`
    SELECT prompt, modal_json FROM deepen_history
    WHERE analysis_type = ? AND rating >= 4 AND validated_ok = 1 AND mocked = 0
    ORDER BY rating DESC, created_at DESC LIMIT 10
  `).all(analysisType) as Array<{ prompt: string; modal_json: string }>;
  const out: FewShotExample[] = [];
  let chars = 0;
  for (const r of rows) {
    const modal = summarizeModal(r.modal_json);
    if (!modal) continue;
    const ex = { instrucao: r.prompt, modal };
    chars += JSON.stringify(ex).length;
    if (chars > FEWSHOT_CHAR_CAP) break;
    out.push(ex);
    if (out.length >= limit) break;
  }
  return out;
}

/* ── qualidade: análise executada, não método ─────────────────────────────── */

const METHOD_SMELL = /^\s*(Calcule|Avalie|Compare|Analise|Verifique|Para responder|Seria necessário|Você deve|Deve-se|É preciso|Agrupe)\b/i;

/** Detecta find-notes que descrevem o MÉTODO em vez de entregar a análise
 *  (imperativo metodológico + ausência de números). Retorna mensagens de
 *  reparo; [] quando a modal entrega números/conclusão. */
export function methodologySmell(modal: unknown): string[] {
  const ws = (modal as { widgets?: NoteWidget[] } | null)?.widgets;
  if (!Array.isArray(ws)) return [];
  const errs: string[] = [];
  for (const w of ws) {
    if (w.type !== 'find-note') continue;
    const text = String(w.text || '');
    if (METHOD_SMELL.test(text) && !/\d/.test(text)) {
      errs.push('find-note descreve o método em vez da análise — reescreva entregando os números e a conclusão a partir das tabelas');
      break;
    }
  }
  return errs;
}
