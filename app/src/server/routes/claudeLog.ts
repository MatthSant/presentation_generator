/* claudeLog.ts — usage of the Claude API (cost + tokens), for the /uso page.
 * GET /api/claude-log            → totals + per-kind breakdown + recent (compact)
 * GET /api/claude-log?full=1     → recent entries with the full request/response */

import fs from 'node:fs';
import type { Express } from 'express';
import type { Ctx } from '../context.js';
import { CLAUDE_LOG } from '../paths.js';

interface LogEntry {
  ts?: string; kind?: string; model?: string; error?: string; stop_reason?: string;
  cost?: { usd?: number; tokens?: { in?: number; out?: number; cache_write?: number; cache_read?: number } };
  request?: unknown; response?: unknown;
}

export function registerClaudeLog(app: Express, _ctx: Ctx): void {
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
