/* settings.ts — configurações globais do app (key-value em app_settings).
 *
 * GET  /api/settings            → estado atual (p/ o config.html)
 * POST /api/settings { nvidiaFallback:boolean } → liga/desliga o fallback NVIDIA
 *
 * Desligar o fallback + erro de crédito do Claude ⇒ o erro de crédito volta ao
 * usuário como antes (loggedCreate não cai para o NVIDIA). */

import type { Express } from 'express';
import type { Ctx } from '../context.js';
import { getSetting, setSetting } from '../appSettings.js';
import { nvidiaKeyPresent } from '../nvidiaFallback.js';

export function registerSettings(app: Express, ctx: Ctx): void {
  app.get('/api/settings', (_req, res) => {
    res.json({
      nvidiaFallback: getSetting('nvidia_fallback', '1') !== '0',
      nvidiaKeyPresent: nvidiaKeyPresent(),
    });
  });

  app.post('/api/settings', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    if ('nvidiaFallback' in body) setSetting(ctx.db, 'nvidia_fallback', body.nvidiaFallback ? '1' : '0');
    res.json({ ok: true, nvidiaFallback: getSetting('nvidia_fallback', '1') !== '0' });
  });
}
