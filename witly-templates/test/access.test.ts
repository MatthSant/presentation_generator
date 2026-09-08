import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { isAllowedDomain, isStillActive, resolveAccess } from '../src/auth/access.js';
import { setUserActive, upsertUser } from '../src/db/index.js';
import { finishAuthorization } from '../src/auth/google.js';
import type { AuthRequest } from '@cloudflare/workers-oauth-provider';

describe('access — regra de entrada (spec FR-008, US3)', () => {
  it('domínio permitido entra como leitor; EDITOR_SEED vira editor', async () => {
    const r = await resolveAccess(env, { email: 'Nova@Witly.digital', name: 'Nova' });
    expect(r.ok && r.user.role).toBe('leitor');
    const seed = await resolveAccess(env, { email: 'dono@witly.digital', name: 'Dono' });
    expect(seed.ok && seed.user.role).toBe('editor');
  });

  it('fora do domínio e sem cadastro → domain', async () => {
    const r = await resolveAccess(env, { email: 'alguem@gmail.com' });
    expect(r).toEqual({ ok: false, reason: 'domain' });
  });

  it('fora do domínio mas cadastrado ativo → entra (convidado)', async () => {
    await upsertUser(env.DB, { email: 'parceiro@outra.com', org_id: 'witly', role: 'leitor' });
    const r = await resolveAccess(env, { email: 'parceiro@outra.com' });
    expect(r.ok).toBe(true);
  });

  it('desativado → inactive, mesmo do domínio', async () => {
    await upsertUser(env.DB, { email: 'ex@witly.digital', org_id: 'witly', role: 'editor' });
    await setUserActive(env.DB, 'ex@witly.digital', false);
    expect(await resolveAccess(env, { email: 'ex@witly.digital' })).toEqual({ ok: false, reason: 'inactive' });
    expect(await isStillActive(env.DB, 'ex@witly.digital')).toBeNull();
  });

  it('isAllowedDomain é case-insensitive e exige domínio configurado', () => {
    expect(isAllowedDomain('A@WITLY.DIGITAL', 'witly.digital')).toBe(true);
    expect(isAllowedDomain('a@witly.digital', '')).toBe(false);
    expect(isAllowedDomain('a@witly.digital.evil.com', 'witly.digital')).toBe(false);
  });
});

describe('google — finishAuthorization (spec US3.1)', () => {
  const req = { clientId: 'c1', scope: ['mcp'], redirectUri: 'http://x/cb', responseType: 'code', state: 's', codeChallenge: 'x', codeChallengeMethod: 'S256' } as unknown as AuthRequest;

  it('e-mail barrado NÃO chama completeAuthorization', async () => {
    let called = 0;
    const provider = { completeAuthorization: async () => { called++; return { redirectTo: 'http://x/ok' }; } };
    const r = await finishAuthorization({ ...env, OAUTH_PROVIDER: provider }, req, { id: 'g1', email: 'fora@gmail.com', name: 'F' });
    expect(r).toEqual({ ok: false, reason: 'domain' });
    expect(called).toBe(0);
  });

  it('e-mail do domínio conclui com props {email,name}', async () => {
    let props: Record<string, unknown> | null = null;
    const provider = { completeAuthorization: async (o: { props: Record<string, unknown> }) => { props = o.props; return { redirectTo: 'http://x/ok' }; } };
    const r = await finishAuthorization({ ...env, OAUTH_PROVIDER: provider }, req, { id: 'g2', email: 'ok@witly.digital', name: 'Ok' });
    expect(r).toEqual({ ok: true, redirectTo: 'http://x/ok' });
    expect(props).toEqual({ email: 'ok@witly.digital', name: 'Ok' });
  });
});
