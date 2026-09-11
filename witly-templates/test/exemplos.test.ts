/* O design system é o contrato; o HTML real é a referência: `exemplos_de` no manifesto põe os
 * relatórios de exemplo de OUTROS templates no zip (exemplos/<slug>.html). */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import * as db from '../src/db/index.js';
import { signDownload, signingKey } from '../src/kit/sign.js';
import { buildKitZip } from '../src/kit/zip.js';
import { ORG, SAMPLE_FILES, SAMPLE_MANIFEST, seedPublished } from './helpers.js';

const dec = new TextDecoder();
let n = 0;
const fresh = () => `ex-${++n}`;

const EXEMPLO = [
  { path: 'exemplo/data.json', content: JSON.stringify({ meta: { title: 'Ref' }, pages: [] }) },
  { path: 'exemplo/dataset.json', content: '{}' },
  { path: 'exemplo/layout.json', content: '{"sections":{}}' },
];
const VIEWER = [
  { path: 'viewer/shell.html', bytes: new TextEncoder().encode('<html>{{TITLE}}<style>{{VIEWER_CSS}}</style><script>window.__REPORT={{REPORT_JSON}}</script><script>{{VIEWER_JS}}</script></html>') },
  { path: 'viewer/viewer.css', bytes: new TextEncoder().encode('body{}') },
  { path: 'viewer/viewer.js', bytes: new TextEncoder().encode('/*js*/') },
];

describe('exemplos de outros templates no zip', () => {
  it('buildKitZip grava exemplos/<slug>.html', async () => {
    const s = fresh(); await seedPublished(s);
    const kit = (await db.getPublishedKit(env.DB, s))!;
    const files = unzipSync(buildKitZip(kit, [], [], [{ slug: 'debriefing', html: '<html>ref</html>' }]));
    expect(dec.decode(files[`${s}/exemplos/debriefing.html`])).toBe('<html>ref</html>');
  });

  it('/dl resolve exemplos_de pelo manifesto e sintetiza o HTML do outro template', async () => {
    const ref = fresh();
    await db.createTemplate(env.DB, { slug: ref, org_id: ORG, name: 'Referência', manifest: SAMPLE_MANIFEST, files: [...SAMPLE_FILES, ...EXEMPLO], tasks: [], publish: true });
    const livre = fresh();
    await db.createTemplate(env.DB, { slug: livre, org_id: ORG, name: 'Livre', manifest: { ...SAMPLE_MANIFEST, exemplos_de: [ref, 'nao-existe'] }, files: SAMPLE_FILES, tasks: [], publish: true });
    const kit = (await db.getPublishedKit(env.DB, livre))!;
    // sem viewer nos Assets do teste, renderExampleHtml devolve null → sem exemplos; com viewer, entra
    const t = await signDownload(signingKey(env), livre, kit.version.number, 60);
    const r = await SELF.fetch(`http://x/dl/${livre}/${kit.version.number}?t=${t}`);
    expect(r.status).toBe(200);
    const files = unzipSync(new Uint8Array(await r.arrayBuffer()));
    expect(Object.keys(files).some((k) => k.startsWith(`${livre}/manifest.json`))).toBe(true);
    // o mesmo kit, com viewer em mãos (unidade): o exemplo do outro template vira exemplos/<ref>.html
    const outro = (await db.getPublishedKit(env.DB, ref))!;
    const { renderExampleHtml } = await import('../src/kit/zip.js');
    const html = renderExampleHtml(outro, VIEWER)!;
    expect(html).toContain('Ref');
    const z = unzipSync(buildKitZip(kit, VIEWER, [], [{ slug: ref, html }]));
    expect(dec.decode(z[`${livre}/exemplos/${ref}.html`])).toContain('window.__REPORT');
  });
});
