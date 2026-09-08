/* session — login da UI com o MESMO Google e o MESMO /callback do fluxo MCP.
 *
 *  GET /ui/login   → grava `ui:state:<token>` no KV e redireciona ao Google
 *  GET /callback   → (em google.ts) se o state for de UI, cai em finishUiLogin()
 *  cookie `wt_session` = base64url({email,exp}) + "." + HMAC(COOKIE_ENCRYPTION_KEY)
 *  GET /ui/logout  → limpa o cookie
 *
 * O papel NÃO vai no cookie: cada requisição relê o usuário no D1, então desativar ou
 * rebaixar alguém vale na próxima chamada (spec FR-014). */

import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl } from '../upstream.js';
import { isStillActive, resolveAccess, type AccessResult } from './access.js';
import type { User } from '../db/index.js';

export const SESSION_COOKIE = 'wt_session';
export const SESSION_TTL = 12 * 60 * 60;   // 12 h; revalidação no D1 a cada request
const UI_STATE_TTL = 600;

const enc = new TextEncoder();
const b64u = (s: string): string => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string): string => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))));
}

export async function signSession(key: string, email: string, now = Date.now(), ttl = SESSION_TTL): Promise<string> {
  const payload = b64u(JSON.stringify({ email: email.toLowerCase(), exp: Math.floor(now / 1000) + ttl }));
  return `${payload}.${await hmac(key, payload)}`;
}

export async function verifySession(key: string, cookie: string | undefined, now = Date.now()): Promise<{ email: string } | null> {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expected = await hmac(key, payload);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const { email, exp } = JSON.parse(unb64u(payload)) as { email?: string; exp?: number };
    if (!email || !exp || exp * 1000 < now) return null;
    return { email };
  } catch { return null; }
}

/** Usuário da sessão, revalidado no D1. null = sem sessão, expirada, ou usuário inativo. */
export async function sessionUser(c: Context<{ Bindings: Env }>): Promise<User | null> {
  const s = await verifySession(c.env.COOKIE_ENCRYPTION_KEY, getCookie(c, SESSION_COOKIE));
  if (!s) return null;
  return isStillActive(c.env.DB, s.email);
}

export function setSessionCookie(c: Context<{ Bindings: Env }>, value: string): void {
  const secure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, SESSION_COOKIE, value, { path: '/', httpOnly: true, sameSite: 'Lax', secure, maxAge: SESSION_TTL });
}

export function clearSessionCookie(c: Context<{ Bindings: Env }>): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

// ── fluxo Google p/ a UI ─────────────────────────────────────────────────────

export async function startUiLogin(c: Context<{ Bindings: Env }>): Promise<Response> {
  const token = crypto.randomUUID();
  const next = c.req.query('next') || '/';
  await c.env.OAUTH_KV.put(`ui:state:${token}`, JSON.stringify({ next: next.startsWith('/') ? next : '/' }), { expirationTtl: UI_STATE_TTL });
  return c.redirect(getUpstreamAuthorizeUrl({
    upstreamUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: c.env.GOOGLE_CLIENT_ID,
    redirectUri: new URL('/callback', c.req.url).href,
    scope: 'email profile',
    state: `ui.${token}`,
    hostedDomain: c.env.ALLOWED_DOMAIN || undefined,
  }), 302);
}

/** Se o `state` é de UI, consome e devolve o destino; senão null (fluxo MCP). */
export async function takeUiState(kv: KVNamespace, state: string | undefined): Promise<{ next: string } | null> {
  if (!state?.startsWith('ui.')) return null;
  const key = `ui:state:${state.slice(3)}`;
  const raw = await kv.get(key);
  if (!raw) return null;
  await kv.delete(key);
  try { return JSON.parse(raw) as { next: string }; } catch { return { next: '/' }; }
}

/** Troca o code no Google, aplica o gate e emite o cookie. */
export async function finishUiLogin(c: Context<{ Bindings: Env }>, code: string, next: string): Promise<{ ok: true; response: Response } | { ok: false; email: string; access: AccessResult & { ok: false } }> {
  const [accessToken, err] = await fetchUpstreamAuthToken({
    upstreamUrl: 'https://oauth2.googleapis.com/token',
    clientId: c.env.GOOGLE_CLIENT_ID, clientSecret: c.env.GOOGLE_CLIENT_SECRET,
    code, redirectUri: new URL('/callback', c.req.url).href, grantType: 'authorization_code',
  });
  if (err) throw new Error('falha ao trocar o código no Google');
  const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error('falha ao ler o perfil Google');
  const { name, email } = await r.json() as { name?: string; email: string };
  const access = await resolveAccess(c.env, { email, name });
  if (!access.ok) return { ok: false, email, access };
  setSessionCookie(c, await signSession(c.env.COOKIE_ENCRYPTION_KEY, access.user.email));
  return { ok: true, response: c.redirect(next, 302) };
}
