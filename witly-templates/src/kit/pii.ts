/* pii — gate de dado pessoal em TODA escrita vinda do MCP e do importador
 * (constituição II). Detecta e-mail, telefone BR e CPF (com dígito verificador).
 * Não tenta nomes: falso positivo alto. Devolve os achados mascarados. */

export interface PiiHit { tipo: 'email' | 'telefone' | 'cpf'; trecho: string }
export interface PiiResult { ok: boolean; achados: PiiHit[] }

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// (+55) (11) 9 9999-9999 · 11999999999 · (11)3333-4444 — exige separador ou DDD entre parênteses
// para não pegar números soltos de métricas (ex.: 1199999999 sem formatação também casa, mas
// só com 10–11 dígitos contíguos precedidos de DDD válido 11–99).
const PHONE = /(?:\+55\s?)?(?:\(?[1-9]{2}\)?[\s.-]?)(?:9\s?)?\d{4}[\s.-]\d{4}\b/g;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

function cpfValido(s: string): boolean {
  const d = s.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (n: number) => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

const mask = (s: string): string => (s.length <= 4 ? '****' : s.slice(0, 2) + '*'.repeat(Math.max(3, s.length - 4)) + s.slice(-2));

/** Varre um texto. */
export function scanPii(text: string): PiiHit[] {
  const hits: PiiHit[] = [];
  // Pré-checagens baratas: o regex de e-mail é quadrático em runs longos sem "@".
  if (text.includes('@')) for (const m of text.matchAll(EMAIL)) hits.push({ tipo: 'email', trecho: mask(m[0]) });
  if (!/\d{4}/.test(text)) return hits;
  for (const m of text.matchAll(CPF)) if (cpfValido(m[0])) hits.push({ tipo: 'cpf', trecho: mask(m[0]) });
  for (const m of text.matchAll(PHONE)) {
    // descarta o que já casou como CPF (formatos parecidos) e sequências dentro de números longos
    const digits = m[0].replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) continue;
    hits.push({ tipo: 'telefone', trecho: mask(m[0]) });
  }
  return hits;
}

/** Varre qualquer valor (string/objeto) pelo JSON serializado. `ignoreEmails` = e-mails
 *  legítimos do payload (ex.: o do próprio usuário no campo de autor). */
export function checkPii(value: unknown, ignoreEmails: string[] = []): PiiResult {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const ignore = new Set(ignoreEmails.map((e) => e.toLowerCase()));
  const achados = scanPii(text).filter((h) => {
    if (h.tipo !== 'email') return true;
    // re-extrai o e-mail real para comparar com a lista de ignorados
    return ![...text.matchAll(EMAIL)].some((m) => ignore.has(m[0].toLowerCase()) && mask(m[0]) === h.trecho);
  });
  return { ok: achados.length === 0, achados };
}

export function piiMessage(r: PiiResult): string {
  return `contém dado pessoal (não gravado): ${r.achados.map((a) => `${a.tipo} ${a.trecho}`).join(', ')}. Remova e tente de novo.`;
}
