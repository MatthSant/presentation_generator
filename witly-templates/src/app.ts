/* app — tudo que NÃO é o endpoint MCP protegido: fluxo Google (/authorize, /callback),
 * API da UI (/api/*), downloads do kit (/dl/*), sessão da UI (/ui/*). */

import { Hono } from 'hono';
import { google } from './auth/google.js';
import { api } from './api.js';
import { getPublishedKit, platformKitFiles } from './db/index.js';
import { signingKey, verifyDownload } from './kit/sign.js';
import { buildKitZip, loadViewer } from './kit/zip.js';

export const app = new Hono<{ Bindings: Env }>();

app.route('/', google);
app.route('/', api);

app.get('/api/health', (c) => c.json({ ok: true, service: 'witly-templates' }));

// Com html_handling: none os assets não mapeiam "/" → index.html; a UI é servida daqui.
app.get('/', (c) => c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url).href, { headers: c.req.raw.headers })));

/** Download do kit publicado. Autorização = assinatura na URL (emitida por obter_template). */
app.get('/dl/:slug/:n', async (c) => {
  const slug = c.req.param('slug');
  const n = Number(c.req.param('n'));
  if (!Number.isInteger(n)) return c.text('versão inválida', 400);
  if (!(await verifyDownload(signingKey(c.env), slug, n, c.req.query('t')))) return c.text('link inválido ou expirado', 403);
  const kit = await getPublishedKit(c.env.DB, slug);
  if (!kit || kit.version.number !== n) return c.text('versão não publicada', 404);
  const zip = buildKitZip(kit, await loadViewer(c.env.ASSETS), await platformKitFiles(c.env.DB, c.env.ORG_ID));
  return new Response(zip as unknown as BodyInit, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${slug}-v${kit.version.semver ?? n}.zip"`,
      'cache-control': 'private, no-store',
    },
  });
});

app.notFound((c) => c.text('Não encontrado', 404));
