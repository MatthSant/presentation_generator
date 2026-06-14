/* creditError.ts — detecção e resposta padronizada quando a geração falha por FALTA
 * DE CRÉDITO na API da Anthropic (HTTP 400 "credit balance is too low"). O app mostra
 * uma tela específica em vez do erro genérico de "não foi possível gerar". */

import type { Response } from 'express';

export const CREDIT_MSG =
  'Sem crédito na API da Anthropic. Recarregue em Plans & Billing para gerar detalhamentos/insights.';

/** True quando a mensagem indica saldo/crédito insuficiente na API. */
export function isCreditError(msg: unknown): boolean {
  const s = String((msg as { message?: string })?.message ?? msg ?? '').toLowerCase();
  return s.includes('credit balance') || (s.includes('credit') && (s.includes('too low') || s.includes('insufficient')));
}

/** Responde o erro: 402 + code 'no_credit' quando é falta de crédito (tela específica);
 *  senão repassa a mensagem real com o status dado. */
export function sendGenError(res: Response, e: unknown, status = 500): void {
  if (res.writableEnded) return;
  if (isCreditError(e)) { res.status(402).json({ error: CREDIT_MSG, code: 'no_credit' }); return; }
  res.status(status).json({ error: (e as Error)?.message ?? String(e) });
}
