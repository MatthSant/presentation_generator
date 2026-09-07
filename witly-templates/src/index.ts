/* index — o Worker. OAuthProvider protege /mcp (token emitido após login Google) e
 * manda o resto para o app Hono (autorização, UI, API, downloads). */

import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { TemplatesMcp } from './mcp.js';
import { app } from './app.js';

export { TemplatesMcp };

export default new OAuthProvider({
  apiRoute: '/mcp',
  apiHandler: TemplatesMcp.serve('/mcp', { binding: 'MCP_OBJECT' }) as never,
  defaultHandler: app as never,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  // Token curto: junto com a revalidação por chamada, cortar acesso vale em minutos (spec FR-014).
  accessTokenTTL: 3600,
});
