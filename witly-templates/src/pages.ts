/* pages — HTML mínimo servido pelo Worker (fora da UI estática). */

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const shell = (title: string, body: string): string => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Witly Templates</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F9FAFB;color:#111827;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}
  .card{max-width:460px;padding:32px;border:1px solid rgba(0,0,0,.08);border-radius:14px;background:#fff}
  h1{font-size:20px;margin:0 0 12px} p{margin:0 0 10px;color:#4B5563} code{background:#F3F4F6;padding:2px 6px;border-radius:6px}
  .muted{font-size:13px;color:#6B7280}
</style></head><body><div class="card">${body}</div></body></html>`;

export function pageAccessDenied(email: string, reason: 'domain' | 'inactive'): string {
  const why = reason === 'domain'
    ? 'Essa conta Google não pertence ao domínio da Witly.'
    : 'Essa conta está desativada.';
  return shell('Peça acesso', `
    <h1>Peça acesso</h1>
    <p>${esc(why)}</p>
    <p>Conta usada: <code>${esc(email)}</code></p>
    <p class="muted">Fale com um editor do Witly Templates para liberar este e-mail. Depois, tente conectar de novo pelo seu agente.</p>`);
}
