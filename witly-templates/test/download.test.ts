import { env, SELF } from 'cloudflare:test';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { signDownload, verifyDownload } from '../src/kit/sign.js';
import { seedPublished } from './helpers.js';
import * as db from '../src/db/index.js';

describe('sign — URL assinada (T010)', () => {
  it('válida, expirada e adulterada', async () => {
    const t = await signDownload('k', 'acomp', 1, 60, 1_000_000_000_000);
    expect(await verifyDownload('k', 'acomp', 1, t, 1_000_000_000_000 + 30_000)).toBe(true);
    expect(await verifyDownload('k', 'acomp', 1, t, 1_000_000_000_000 + 61_000)).toBe(false);
    expect(await verifyDownload('k', 'acomp', 2, t, 1_000_000_000_000)).toBe(false);
    expect(await verifyDownload('outra', 'acomp', 1, t, 1_000_000_000_000)).toBe(false);
    expect(await verifyDownload('k', 'acomp', 1, t.slice(0, -2) + 'zz', 1_000_000_000_000)).toBe(false);
    expect(await verifyDownload('k', 'acomp', 1, null)).toBe(false);
  });
});

describe('/dl/:slug/:n (T010)', () => {
  it('sem assinatura → 403; com assinatura → zip com manifest, contexto, arquivos', async () => {
    const v = await seedPublished('acomp');
    await db.upsertPlatformDoc(env.DB, { slug: 'design-system', org_id: 'witly', title: 'DS', body_md: '# DS', kit_file: 'design-system.md' });
    expect((await SELF.fetch('http://x/dl/acomp/1')).status).toBe(403);

    const t = await signDownload(env.COOKIE_ENCRYPTION_KEY, 'acomp', v.number);
    const res = await SELF.fetch(`http://x/dl/acomp/${v.number}?t=${t}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const names = Object.keys(files).filter((n) => !n.includes('/viewer/')).sort();
    const viewer = Object.keys(files).filter((n) => n.includes('/viewer/')).sort();
    // viewer/ entra quando public/viewer/ foi buildado (npm run build); nunca quebra o zip
    if (viewer.length) expect(viewer).toEqual(['acomp/viewer/shell.html', 'acomp/viewer/viewer.css', 'acomp/viewer/viewer.js']);
    expect(names).toEqual([
      'acomp/contexto/lancamento.md', 'acomp/design-system.md', 'acomp/documento.md', 'acomp/exemplo.html', 'acomp/guia.md',
      'acomp/manifest.json', 'acomp/python/gerar.py', 'acomp/queries/dump.sql',
    ]);
    expect(strFromU8(files['acomp/design-system.md'])).toBe('# DS');
    const manifest = JSON.parse(strFromU8(files['acomp/manifest.json']));
    expect(manifest.version).toBe(1);
    expect(manifest.params).toHaveLength(4);
    expect(strFromU8(files['acomp/contexto/lancamento.md'])).toContain('# Identificar o lançamento');
  });

  it('versão que não é a publicada → 404', async () => {
    await seedPublished('acomp2');
    const t = await signDownload(env.COOKIE_ENCRYPTION_KEY, 'acomp2', 7);
    expect((await SELF.fetch(`http://x/dl/acomp2/7?t=${t}`)).status).toBe(404);
  });
});
