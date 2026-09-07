import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('worker — wiring (T008)', () => {
  it('/api/health responde pelo defaultHandler', async () => {
    const res = await SELF.fetch('http://x/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('/mcp sem token → 401 com WWW-Authenticate', async () => {
    const res = await SELF.fetch('http://x/mcp', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBeTruthy();
  });

  it('metadados do servidor de autorização anunciam registro dinâmico', async () => {
    const res = await SELF.fetch('http://x/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    const meta = await res.json() as Record<string, string>;
    expect(meta.authorization_endpoint).toBe('http://x/authorize');
    expect(meta.token_endpoint).toBe('http://x/token');
    expect(meta.registration_endpoint).toBe('http://x/register');
  });
});
