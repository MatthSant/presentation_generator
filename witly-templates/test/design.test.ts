/* Spec 006 — design system vivo: template versionado (kind = design) fora do catálogo/MCP,
 * texto do kit gerado (contrato + regras + elementos), galeria (relatório) e preview. */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import * as db from '../src/db/index.js';
import { SESSION_COOKIE, signSession } from '../src/auth/session.js';
import { DESIGN_SLUG, designReport, designSystemMd, elementos, parseElemento, renderReportHtml } from '../src/kit/design.js';
import { listarTemplates, obterTemplate, resourceText } from '../src/kit/tools.js';
import { buildKitZip } from '../src/kit/zip.js';
import { ORG, SAMPLE_FILES, SAMPLE_MANIFEST, seedPublished, seedUser } from './helpers.js';

const ED = 'ed-ds@witly.digital';
const dec = new TextDecoder();
async function call(path: string, init: RequestInit & { as?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.as) headers.set('cookie', `${SESSION_COOKIE}=${await signSession(env.COOKIE_ENCRYPTION_KEY, init.as)}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return SELF.fetch(`http://x${path}`, { ...init, headers });
}

const EL = (id: string, grupo: string, sort: number) => ({
  path: `elementos/${id}.json`,
  content: JSON.stringify({ id, grupo, title: `Elemento ${id}`, desc: 'descrição', call: `s.${id}('x')`, sort,
    widgets: [{ id: `el-${id}-1`, type: 'kpi-card', tier: 'feature', label: id, value: '1' }],
    layout: [{ id: `el-${id}-1`, type: 'kpi-card', x: 0, y: 0, w: 3, h: 2 }],
    dataset: { 'q-x': { dims: ['k'], filters: [], rows: [{ k: 'a', v: 1 }] } } }),
});

async function seedDesign() {
  const t = await db.getTemplate(env.DB, DESIGN_SLUG);
  if (t) return;
  await db.createTemplate(env.DB, {
    slug: DESIGN_SLUG, org_id: ORG, name: 'Design system', kind: 'design', manifest: { kind: 'design' },
    files: [{ path: 'contrato.md', content: '# Contrato\n\nGrade de 12 colunas.' }, EL('kpi', 'numeros', 0), EL('achado', 'narrativa', 1)],
    tasks: [], rules: [{ rule_id: 'kpi-com-meta', tipo: 'regra', title: 'KPI com meta sempre mostra a comparação', body_md: 'senão fica sem referência' }],
    publish: true, author_email: 'seed',
  });
}

describe('design system como template versionado', () => {
  it('fica fora do catálogo, do MCP e da saúde; texto do kit = contrato + regras + elementos', async () => {
    await seedUser(ED, 'editor'); await seedDesign();
    expect((await db.listTemplates(env.DB, ORG, '*')).some((t) => t.slug === DESIGN_SLUG)).toBe(false);
    const u = { email: ED, name: 'Ed' };
    expect(await listarTemplates(env, u)).not.toContain(DESIGN_SLUG);
    await expect(obterTemplate(env, u, DESIGN_SLUG)).rejects.toThrow(/não existe/);
    expect(await resourceText(env, `template://${DESIGN_SLUG}`, ED)).toBeNull();
    const h = await (await call('/api/saude', { as: ED })).json() as { templates: Array<{ slug: string }> };
    expect(h.templates.some((t) => t.slug === DESIGN_SLUG)).toBe(false);

    const kit = (await db.getDesignKit(env.DB))!;
    const md = designSystemMd(kit);
    expect(md).toContain('# Contrato');
    expect(md).toContain('## Regras do design system');
    expect(md).toContain('[REGRA] KPI com meta sempre mostra a comparação');
    expect(md).toContain("s.kpi('x')");
    expect(md.indexOf('### Números')).toBeLessThan(md.indexOf('### Narrativa'));
    // é o que o MCP e o zip entregam
    expect(await resourceText(env, 'contrato://widgets')).toContain('KPI com meta sempre mostra');
    const s = `ds-zip-${Date.now()}`; await seedPublished(s);
    const z = unzipSync(buildKitZip((await db.getPublishedKit(env.DB, s))!, [], await db.platformKitFiles(env.DB, ORG)));
    expect(dec.decode(z[`${s}/design-system.md`])).toContain('## Regras do design system');
    expect(await obterTemplate(env, u, s)).toContain('Design system dos aprofundamentos');
  });

  it('galeria: uma página por grupo, uma seção por elemento; o foco vem primeiro; elemento editado entra no lugar', async () => {
    await seedDesign();
    const kit = (await db.getDesignKit(env.DB))!;
    const r = designReport(kit);
    expect((r.data.pages as Array<{ id: string }>).map((p) => p.id)).toEqual(['numeros', 'narrativa']);
    expect(Object.keys(r.sections)).toEqual(['el-kpi', 'el-achado']);
    expect(r.dataset).toHaveProperty('q-x');
    const f = designReport(kit, 'achado');
    expect((f.data.pages as Array<{ id: string }>)[0].id).toBe('narrativa');
    const editado = parseElemento({ ...JSON.parse(EL('kpi', 'numeros', 0).content), title: 'KPI editado' });
    const o = designReport(kit, 'kpi', editado);
    expect((o.sections['el-kpi'] as { header: { title: string } }).header.title).toBe('KPI editado');
    expect(() => parseElemento({ id: 'x', widgets: [] })).toThrow(/widgets/);
    expect(() => parseElemento({ id: 'Ruim Id', widgets: [{ id: 'a', type: 'kpi' }] })).toThrow(/id inválido/);
    const html = renderReportHtml(r, [
      { path: 'viewer/shell.html', bytes: new TextEncoder().encode('<html>{{TITLE}}<style>{{VIEWER_CSS}}</style><script>window.__REPORT={{REPORT_JSON}}</script><script>{{VIEWER_JS}}</script></html>') },
      { path: 'viewer/viewer.css', bytes: new TextEncoder().encode('b{}') }, { path: 'viewer/viewer.js', bytes: new TextEncoder().encode('1') },
    ], 'Design system')!;
    expect(html).toContain('el-achado');
    expect(elementos(kit).map((e) => e.id)).toEqual(['kpi', 'achado']);
  });

  it('/design/preview exige sessão; GET e POST respondem (200 com viewer, 503 sem); POST valida o elemento', async () => {
    await seedUser(ED, 'editor'); await seedDesign();
    expect((await call('/design/preview')).status).toBe(401);
    const g = await call('/design/preview?el=achado', { as: ED });
    expect([200, 503]).toContain(g.status);
    const bad = await call('/design/preview', { method: 'POST', as: ED, body: JSON.stringify({ elemento: { id: 'x' } }) });
    expect(bad.status).toBe(400);
    const p = await call('/design/preview', { method: 'POST', as: ED, body: JSON.stringify({ state: 'published', elemento: JSON.parse(EL('kpi', 'numeros', 0).content) }) });
    expect([200, 503]).toContain(p.status);
    // editar um elemento pela UI = arquivo do rascunho (rotas de template)
    expect((await call(`/api/templates/${DESIGN_SLUG}/draft/files/elementos%2Fnovo.json`, { method: 'PUT', as: ED, body: JSON.stringify({ content: EL('novo', 'funil', 9).content }) })).status).toBe(200);
    expect(elementos((await db.getDesignKit(env.DB, 'draft'))!).map((e) => e.id)).toContain('novo');
  });
});
