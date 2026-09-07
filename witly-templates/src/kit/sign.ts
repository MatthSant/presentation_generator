/* sign — URL assinada (HMAC-SHA256, expira) para o download do kit. O agente faz
 * `curl` sem header de autorização; a assinatura é a autorização. */

const enc = new TextEncoder();

async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const payload = (slug: string, n: number, exp: number) => `dl:${slug}:${n}:${exp}`;

/** Token `exp.sig` para /dl/:slug/:n?t=… */
export async function signDownload(key: string, slug: string, n: number, ttlSeconds = 900, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return `${exp}.${await hmac(key, payload(slug, n, exp))}`;
}

export async function verifyDownload(key: string, slug: string, n: number, token: string | null | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = await hmac(key, payload(slug, n, exp));
  const given = token.slice(dot + 1);
  if (expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export function signingKey(env: Pick<Env, 'DOWNLOAD_SIGNING_KEY' | 'COOKIE_ENCRYPTION_KEY'>): string {
  return env.DOWNLOAD_SIGNING_KEY || env.COOKIE_ENCRYPTION_KEY;
}
