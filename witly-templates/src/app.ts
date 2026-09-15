/* app — tudo que NÃO é o endpoint MCP protegido: fluxo Google (/authorize, /callback),
 * API da UI (/api/*), downloads do kit (/dl/*), sessão da UI (/ui/*). */

import { Hono } from 'hono';
import { google } from './auth/google.js';
import { api } from './api.js';
import { getDesignKit, getPublishedKit, platformKitFiles } from './db/index.js';
import { sessionUser } from './auth/session.js';
import { designReport, parseElemento, renderReportHtml } from './kit/design.js';
import { signingKey, verifyDownload, verifyUpload } from './kit/sign.js';
import { buildKitZip, loadViewer, renderExampleHtml } from './kit/zip.js';

export const app = new Hono<{ Bindings: Env }>();

app.route('/', google);
app.route('/', api);

app.get('/api/health', (c) => c.json({ ok: true, service: 'witly-templates' }));

// Com html_handling: none os assets não mapeiam "/" → index.html; a UI é servida daqui.
app.get('/', (c) => c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url).href, { headers: c.req.raw.headers })));

/** Galeria do design system (spec 006): o viewer renderiza os elementos da versão. `el` traz um
 *  elemento para a frente; o POST renderiza um elemento editado sem salvar (pré-visualização). */
app.get('/design/preview', async (c) => {
  if (!(await sessionUser(c))) return c.text('sem sessão', 401);
  const state = c.req.query('state') === 'draft' ? 'draft' : 'published';
  const kit = (await getDesignKit(c.env.DB, state)) ?? (await getDesignKit(c.env.DB, 'published'));
  if (!kit) return c.text('design system sem versão', 404);
  const html = renderReportHtml(designReport(kit, c.req.query('el')), await loadViewer(c.env.ASSETS), 'Design system');
  return html ? c.html(html) : c.text('viewer indisponível (rode npm run build)', 503);
});
app.post('/design/preview', async (c) => {
  if (!(await sessionUser(c))) return c.text('sem sessão', 401);
  const b = await c.req.json<{ state?: string; el?: string; elemento?: unknown }>().catch(() => ({} as { state?: string; el?: string; elemento?: unknown }));
  let elemento;
  try { elemento = parseElemento(b.elemento); } catch (e) { return c.text((e as Error).message, 400); }
  const state = b.state === 'draft' ? 'draft' : 'published';
  const kit = (await getDesignKit(c.env.DB, state)) ?? (await getDesignKit(c.env.DB, 'published'));
  if (!kit) return c.text('design system sem versão', 404);
  const html = renderReportHtml(designReport(kit, elemento.id, elemento), await loadViewer(c.env.ASSETS), 'Design system');
  return html ? c.html(html) : c.text('viewer indisponível (rode npm run build)', 503);
});

/** Repasse de upload para o Insights. A autorização é a assinatura na URL (emitida por
 *  `insights_preparar`), que vale para UM documento e meia hora.
 *
 *  Por que o arquivo passa por aqui em vez de ir direto: a chave do Insights é secret do
 *  Worker e não pode descer para a máquina do consultor. E não pode ir pelo argumento da
 *  tool porque argumento é texto que o modelo gera — um relatório de debriefing tem ~3 MB.
 *  Então o `curl` local manda para cá e o Worker só encaminha, sem ler nem guardar nada:
 *  o corpo é repassado como stream. */
app.post('/up/:tracking', async (c) => {
  const tracking = Number(c.req.param('tracking'));
  const autor = (c.req.query('a') || '').toLowerCase();
  if (!Number.isInteger(tracking) || !autor) return c.json({ error: 'pedido inválido' }, 400);
  if (!(await verifyUpload(signingKey(c.env), tracking, autor, c.req.query('t')))) {
    return c.json({ error: 'link de upload inválido ou expirado — peça outro com insights_preparar' }, 403);
  }
  const chave = c.env.INSIGHTS_CHAVE;
  if (!chave) return c.json({ error: 'o Grimório não tem chave do Insights configurada' }, 503);
  const tipo = c.req.header('content-type') || '';
  if (!tipo.startsWith('multipart/form-data')) return c.json({ error: 'mande os arquivos como multipart (-F "files=@arquivo")' }, 400);

  const base = (c.env.INSIGHTS_BASE || 'https://insights.witly.com.br/api').replace(/\/$/, '');
  const r = await fetch(`${base}/trackings/${tracking}/files`, {
    method: 'POST',
    headers: { authorization: `Bearer ${chave}`, 'x-autor': autor, 'content-type': tipo },
    body: c.req.raw.body,
  });
  const texto = await r.text();
  return new Response(texto, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json' } });
});

/** Download do kit publicado. Autorização = assinatura na URL (emitida por obter_template). */
app.get('/dl/:slug/:n', async (c) => {
  const slug = c.req.param('slug');
  const n = Number(c.req.param('n'));
  if (!Number.isInteger(n)) return c.text('versão inválida', 400);
  if (!(await verifyDownload(signingKey(c.env), slug, n, c.req.query('t')))) return c.text('link inválido ou expirado', 403);
  const kit = await getPublishedKit(c.env.DB, slug);
  if (!kit || kit.version.number !== n) return c.text('versão não publicada', 404);
  const viewer = await loadViewer(c.env.ASSETS);
  const zip = buildKitZip(kit, viewer, await platformKitFiles(c.env.DB, c.env.ORG_ID), await exemplosDeOutros(c.env.DB, kit, viewer));
  return new Response(zip as unknown as BodyInit, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${slug}-v${kit.version.semver ?? n}.zip"`,
      'cache-control': 'private, no-store',
    },
  });
});

app.notFound((c) => c.text('Não encontrado', 404));

/** `exemplos_de` no manifesto: os relatórios de exemplo de outros templates entram no zip como
 *  exemplos/<slug>.html — referência visual do design system (análise livre usa debriefing e acompanhamento). */
async function exemplosDeOutros(db: D1Database, kit: Awaited<ReturnType<typeof getPublishedKit>>, viewer: Awaited<ReturnType<typeof loadViewer>>): Promise<Array<{ slug: string; html: string }>> {
  let slugs: string[] = [];
  try { const m = JSON.parse(kit!.version.manifest_json) as { exemplos_de?: unknown }; if (Array.isArray(m.exemplos_de)) slugs = m.exemplos_de.filter((x): x is string => typeof x === 'string'); } catch { /* sem manifesto */ }
  const out: Array<{ slug: string; html: string }> = [];
  for (const slug of slugs.slice(0, 4)) {
    const outro = await getPublishedKit(db, slug);
    const html = outro ? renderExampleHtml(outro, viewer) : null;
    if (html) out.push({ slug, html });
  }
  return out;
}
