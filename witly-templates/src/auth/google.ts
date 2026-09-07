/* google — o Worker é servidor OAuth p/ os clientes MCP e cliente OAuth do Google.
 * Adaptado do demo oficial (cloudflare/ai/demos/remote-mcp-google-oauth).
 *
 *  GET  /authorize  → diálogo de aprovação do cliente MCP (ou direto p/ o Google se já aprovado)
 *  POST /authorize  → registra aprovação e redireciona p/ o Google
 *  GET  /callback   → troca o code, lê o perfil, aplica o gate de acesso e conclui a autorização
 */

import { AuthorizationError, type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { Hono } from 'hono';
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl } from '../upstream.js';
import {
  addApprovedClient, bindStateToSession, createOAuthState, generateCSRFProtection,
  isClientApproved, OAuthError, renderApprovalDialog, validateCSRFToken, validateOAuthState,
} from '../oauth-utils.js';
import { resolveAccess, type GoogleProfile } from './access.js';
import { pageAccessDenied } from '../pages.js';
import { finishUiLogin, takeUiState } from './session.js';

/** O que vai dentro do token MCP e chega ao McpAgent como `this.props`. */
export interface Props extends Record<string, unknown> { email: string; name: string }

type Bindings = Env & { OAUTH_PROVIDER: OAuthHelpers };

export const google = new Hono<{ Bindings: Bindings }>();

const SERVER_INFO = {
  name: 'Witly Grimório',
  description: 'Templates de análise da Witly para o seu agente (Claude, Codex, Cursor…). Entre com a conta Google da Witly.',
};

google.get('/authorize', async (c) => {
  let oauthReqInfo: AuthRequest;
  try {
    oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  } catch (error) {
    // Requisição malformada / cliente desconhecido: 400 local; redirect_uri válida → erro OAuth no cliente.
    if (!(error instanceof AuthorizationError)) throw error;
    if (!error.redirectUri) return c.text(`Requisição OAuth inválida: ${error.description}`, 400);
    const redirect = new URL(error.redirectUri);
    redirect.searchParams.set('error', error.code);
    redirect.searchParams.set('error_description', error.description);
    if (error.state) redirect.searchParams.set('state', error.state);
    return c.redirect(redirect.toString(), 302);
  }
  const { clientId } = oauthReqInfo;
  if (!clientId) return c.text('Requisição inválida', 400);

  if (await isClientApproved(c.req.raw, clientId, c.env.COOKIE_ENCRYPTION_KEY)) {
    const { stateToken } = await createOAuthState(oauthReqInfo, c.env.OAUTH_KV);
    const { setCookie } = await bindStateToSession(stateToken);
    return redirectToGoogle(c.req.raw, c.env, stateToken, { 'Set-Cookie': setCookie });
  }

  const { token: csrfToken, setCookie } = generateCSRFProtection();
  return renderApprovalDialog(c.req.raw, {
    client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
    csrfToken,
    server: SERVER_INFO,
    setCookie,
    state: { oauthReqInfo },
  });
});

google.post('/authorize', async (c) => {
  try {
    const formData = await c.req.raw.formData();
    validateCSRFToken(formData, c.req.raw);
    const encodedState = formData.get('state');
    if (!encodedState || typeof encodedState !== 'string') return c.text('Estado ausente', 400);

    let state: { oauthReqInfo?: AuthRequest };
    try { state = JSON.parse(atob(encodedState)); } catch { return c.text('Estado inválido', 400); }
    if (!state.oauthReqInfo?.clientId) return c.text('Requisição inválida', 400);

    const approvedClientCookie = await addApprovedClient(c.req.raw, state.oauthReqInfo.clientId, c.env.COOKIE_ENCRYPTION_KEY);
    const { stateToken } = await createOAuthState(state.oauthReqInfo, c.env.OAUTH_KV);
    const { setCookie: sessionBindingCookie } = await bindStateToSession(stateToken);

    const headers = new Headers();
    headers.append('Set-Cookie', approvedClientCookie);
    headers.append('Set-Cookie', sessionBindingCookie);
    return redirectToGoogle(c.req.raw, c.env, stateToken, Object.fromEntries(headers));
  } catch (error) {
    if (error instanceof OAuthError) return error.toResponse();
    return c.text(`Erro interno: ${(error as Error).message}`, 500);
  }
});

function redirectToGoogle(request: Request, env: Env, stateToken: string, headers: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 302,
    headers: {
      ...headers,
      location: getUpstreamAuthorizeUrl({
        upstreamUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        clientId: env.GOOGLE_CLIENT_ID,
        redirectUri: new URL('/callback', request.url).href,
        scope: 'email profile',
        state: stateToken,
        hostedDomain: env.ALLOWED_DOMAIN || undefined,   // `hd`: o Google já pré-filtra o domínio
      }),
    },
  });
}

/** Conclui o login: gate de acesso + emissão do token MCP. Separado p/ ser testável sem o Google. */
export async function finishAuthorization(
  env: Pick<Env, 'DB' | 'ALLOWED_DOMAIN' | 'EDITOR_SEED' | 'ORG_ID'> & { OAUTH_PROVIDER: Pick<OAuthHelpers, 'completeAuthorization'> },
  oauthReqInfo: AuthRequest,
  profile: GoogleProfile & { id: string },
): Promise<{ ok: true; redirectTo: string } | { ok: false; reason: 'domain' | 'inactive' }> {
  const access = await resolveAccess(env, profile);
  if (!access.ok) return access;
  const props: Props = { email: access.user.email, name: profile.name || access.user.name || access.user.email };
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: access.user.email,
    metadata: { label: props.name },
    scope: oauthReqInfo.scope,
    props,
  });
  return { ok: true, redirectTo };
}

google.get('/callback', async (c) => {
  // O MESMO callback serve a UI: o state `ui.<token>` vem do /ui/login (session.ts).
  const ui = await takeUiState(c.env.OAUTH_KV, c.req.query('state'));
  if (ui) {
    const code = c.req.query('code');
    if (!code) return c.text('Código ausente', 400);
    const r = await finishUiLogin(c, code, ui.next);
    return r.ok ? r.response : c.html(pageAccessDenied(r.email, r.access.reason), 403);
  }

  let oauthReqInfo: AuthRequest;
  let clearSessionCookie: string;
  try {
    const r = await validateOAuthState(c.req.raw, c.env.OAUTH_KV);
    oauthReqInfo = r.oauthReqInfo;
    clearSessionCookie = r.clearCookie;
  } catch (error) {
    if (error instanceof OAuthError) return error.toResponse();
    return c.text('Erro interno', 500);
  }
  if (!oauthReqInfo.clientId) return c.text('Requisição OAuth inválida', 400);

  const code = c.req.query('code');
  if (!code) return c.text('Código ausente', 400);

  const [accessToken, errResponse] = await fetchUpstreamAuthToken({
    upstreamUrl: 'https://oauth2.googleapis.com/token',
    clientId: c.env.GOOGLE_CLIENT_ID,
    clientSecret: c.env.GOOGLE_CLIENT_SECRET,
    code,
    redirectUri: new URL('/callback', c.req.url).href,
    grantType: 'authorization_code',
  });
  if (errResponse) return errResponse;

  const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!userResponse.ok) return c.text('Falha ao ler o perfil Google', 500);
  const { id, name, email } = await userResponse.json() as { id: string; name?: string; email: string };

  const result = await finishAuthorization(c.env, oauthReqInfo, { id, name, email });
  if (!result.ok) return c.html(pageAccessDenied(email, result.reason), 403);

  const headers = new Headers({ Location: result.redirectTo });
  if (clearSessionCookie) headers.set('Set-Cookie', clearSessionCookie);
  return new Response(null, { status: 302, headers });
});
