/* claudeLog.ts — read the append-only log of Claude API calls (debug/audit).
 * GET /api/claude-log?limit=N → the last N records (request + response/error). */

import fs from 'node:fs';
import type { Express } from 'express';
import type { Ctx } from '../context.js';
import { CLAUDE_LOG } from '../paths.js';

export function registerClaudeLog(app: Express, _ctx: Ctx): void {
  app.get('/api/claude-log', (req, res) => {
    if (!fs.existsSync(CLAUDE_LOG)) { res.json({ total: 0, totals: { usd: 0, input_tokens: 0, output_tokens: 0 }, entries: [] }); return; }
    const lines = fs.readFileSync(CLAUDE_LOG, 'utf8').trim().split('\n').filter(Boolean);

    // Running totals over the whole log (cost + tokens), independent of the limit.
    let usd = 0, inTok = 0, outTok = 0;
    for (const l of lines) {
      try {
        const e = JSON.parse(l) as { cost?: { usd?: number; tokens?: { in?: number; out?: number } } };
        if (e.cost) { usd += e.cost.usd || 0; inTok += e.cost.tokens?.in || 0; outTok += e.cost.tokens?.out || 0; }
      } catch { /* skip */ }
    }

    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const entries = lines.slice(-limit).map((l) => {
      try { return JSON.parse(l) as unknown; } catch { return { raw: l }; }
    });
    res.json({ total: lines.length, totals: { usd: Number(usd.toFixed(4)), input_tokens: inTok, output_tokens: outTok }, entries });
  });
}
