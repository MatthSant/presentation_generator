/* claudeLog.ts — usage of the Claude API (cost + tokens), for the /uso page.
 * GET /api/claude-log            → totals + per-kind breakdown + recent (compact)
 * GET /api/claude-log?full=1     → recent entries with the full request/response */

import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import type { Ctx } from '../context.js';
import { CLAUDE_LOG } from '../paths.js';

// Marcador de "já revisado": guarda o instante até o qual as chamadas foram tratadas.
// O export padrão traz só o que veio DEPOIS; ?all=1 ignora. Marcar = gravar "agora".
const RESOLVED_FILE = path.join(path.dirname(CLAUDE_LOG), 'ia-resolved.json');
function getWatermark(): string {
  try { return (JSON.parse(fs.readFileSync(RESOLVED_FILE, 'utf8')) as { watermark?: string }).watermark || ''; }
  catch { return ''; }
}
function setWatermark(ts: string): void {
  fs.mkdirSync(path.dirname(RESOLVED_FILE), { recursive: true });
  fs.writeFileSync(RESOLVED_FILE, JSON.stringify({ watermark: ts, updated_at: new Date().toISOString() }, null, 2));
}

interface LogEntry {
  ts?: string; kind?: string; model?: string; error?: string; stop_reason?: string;
  cost?: { usd?: number; tokens?: { in?: number; out?: number; cache_write?: number; cache_read?: number } };
  request?: unknown; response?: unknown;
}

export function registerClaudeLog(app: Express, ctx: Ctx): void {
  // Export completo p/ revisão offline: log bruto de cada chamada (request+response)
  // + telemetria estruturada (deepen_history/perguntas_history). Um único JSON que o
  // consultor baixa e manda para análise (a produção roda numa máquina sem acesso).
  app.get('/api/claude-log/export', (req, res) => {
    const full = req.query.all === '1';
    const wm = full ? '' : getWatermark();
    const after = (ts?: string): boolean => !wm || !ts || ts > wm;   // sem ts → inclui (não perde)
    const day = new Date().toISOString().slice(0, 10);
    let log: { ts?: string }[] = [];
    if (fs.existsSync(CLAUDE_LOG)) {
      log = fs.readFileSync(CLAUDE_LOG, 'utf8').trim().split('\n').filter(Boolean)
        .map((l) => { try { return JSON.parse(l) as { ts?: string }; } catch { return { _unparsed: l } as { ts?: string }; } });
    }
    const q = (sql: string): { created_at?: string }[] => {
      try { return ctx.db.prepare(sql).all() as { created_at?: string }[]; } catch { return []; }
    };
    const log2 = log.filter((e) => after(e?.ts));
    const deepen = q('SELECT * FROM deepen_history ORDER BY created_at').filter((r) => after(r?.created_at));
    const perguntas = q('SELECT * FROM perguntas_history ORDER BY created_at').filter((r) => after(r?.created_at));
    const bundle = {
      exported_at: new Date().toISOString(),
      mode: full ? 'completo' : 'novas (desde a última marcação como resolvidas)',
      resolved_watermark: wm || null,
      counts: { claude_log: log2.length, deepen_history: deepen.length, perguntas_history: perguntas.length },
      claude_log: log2, deepen_history: deepen, perguntas_history: perguntas,
    };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="witly-ia-historico-${full ? 'tudo' : 'novas'}-${day}.json"`);
    res.send(JSON.stringify(bundle, null, 2));
  });

  // Marca todas as chamadas até agora como resolvidas (watermark = agora). As próximas
  // exportações "novas" só trazem o que vier depois. Reversível só baixando ?all=1.
  app.post('/api/claude-log/resolve', (_req, res) => {
    const wm = new Date().toISOString();
    setWatermark(wm);
    res.json({ ok: true, watermark: wm });
  });

  app.get('/api/claude-log', (req, res) => {
    const empty = { total: 0, errors: 0, totals: { usd: 0, input_tokens: 0, output_tokens: 0 }, byKind: {}, entries: [] };
    if (!fs.existsSync(CLAUDE_LOG)) { res.json(empty); return; }
    const lines = fs.readFileSync(CLAUDE_LOG, 'utf8').trim().split('\n').filter(Boolean);

    let usd = 0, inTok = 0, outTok = 0, errors = 0;
    const byKind: Record<string, { count: number; usd: number; in: number; out: number }> = {};
    const parsed: LogEntry[] = [];
    for (const l of lines) {
      let e: LogEntry;
      try { e = JSON.parse(l) as LogEntry; } catch { continue; }
      parsed.push(e);
      const k = e.kind || 'desconhecido';
      const b = (byKind[k] ||= { count: 0, usd: 0, in: 0, out: 0 });
      b.count++;
      if (e.error) errors++;
      const c = e.cost;
      if (c) {
        usd += c.usd || 0; inTok += c.tokens?.in || 0; outTok += c.tokens?.out || 0;
        b.usd += c.usd || 0; b.in += c.tokens?.in || 0; b.out += c.tokens?.out || 0;
      }
    }

    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const recent = parsed.slice(-limit).reverse();
    const full = req.query.full === '1';
    const entries = recent.map((e) => full ? e : {
      ts: e.ts, kind: e.kind, model: e.model, error: e.error, stop_reason: e.stop_reason, cost: e.cost,
    });

    res.json({ total: lines.length, errors, totals: { usd: Number(usd.toFixed(4)), input_tokens: inTok, output_tokens: outTok }, byKind, entries });
  });
}
