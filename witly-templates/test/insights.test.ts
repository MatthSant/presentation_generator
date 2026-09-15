import { env, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { autorDe, insightsDestino, insightsPreparar, insightsPublicar, nomeDocumento } from '../src/kit/insights.js';
import { signUpload } from '../src/kit/sign.js';
import { seedUser } from './helpers.js';

const A = 'ana@witly.digital';
const U = (e = A) => ({ email: e, name: 'Ana' }) as never;
const E = () => ({ ...env, INSIGHTS_CHAVE: 'wit_teste', INSIGHTS_BASE: 'https://ins.test/api', PUBLIC_URL: 'http://x' }) as never;

/** Responde só ao que a rota pedir; guarda as chamadas para conferir cabeçalho e método. */
function servidor(rotas: Record<string, unknown>, vistas: Array<{ url: string; metodo: string; autor: string | null }> = []) {
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const h = new Headers(init?.headers);
    vistas.push({ url: u, metodo: init?.method || 'GET', autor: h.get('x-autor') });
    const rota = Object.keys(rotas).find((k) => u.endsWith(k) || u.includes(k));
    if (!rota) return new Response(JSON.stringify({ error: 'não existe' }), { status: 404 });
    return new Response(JSON.stringify(rotas[rota]), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return vistas;
}

afterEach(() => vi.unstubAllGlobals());

describe('insights — quem assina a ação', () => {
  it('login compartilhado não assina: pede o e-mail da pessoa', () => {
    expect(() => autorDe(U('projetos@witly.digital'))).toThrow(/login compartilhado/);
    // com o e-mail informado, segue
    expect(autorDe(U('projetos@witly.digital'), 'roberto@witly.digital')).toBe('roberto@witly.digital');
  });

  it('login de pessoa assina sozinho, e e-mail inválido é recusado', () => {
    expect(autorDe(U())).toBe(A);
    expect(() => autorDe(U(), 'roberto')).toThrow(/não é um e-mail/);
  });

  it('o X-Autor vai em toda chamada — é o acesso dele que vale, não o da chave', async () => {
    await seedUser(A);
    const vistas = servidor({ '/clients': [{ id: 1, name: 'B55' }] });
    await insightsDestino(E(), U(), {});
    expect(vistas.every((v) => v.autor === A)).toBe(true);
  });
});

describe('insights — publicar sem passar o arquivo pela conversa', () => {
  it('preparar cria o documento e devolve o curl, nunca o conteúdo', async () => {
    await seedUser(A);
    servidor({
      '/projects/34/trackings': { id: 99, name: 'Debriefing', code: 'abc123' },
      '/me': { email: A, poderes: ['ler', 'escrever', 'publicar'], envio: { maxArquivosPorVez: 60 } },
    });
    const out = await insightsPreparar(E(), U(), { projeto: 34, nome: 'Debriefing' });

    expect(out).toContain('curl -sS -X POST');
    expect(out).toContain('/up/99?t=');
    expect(out).toContain('files=@relatorio.html');
    expect(out).toContain('não me mande o conteúdo');
    expect(out).toContain('insights_publicar({documento:99, consultor_pediu:true})');
    expect(out).toContain('PERGUNTE ao consultor');
  });

  it('sem chave configurada, diz o que fazer em vez de falhar opaco', async () => {
    await seedUser(A);
    servidor({});
    await expect(insightsDestino({ ...env, INSIGHTS_BASE: 'https://ins.test/api' } as never, U(), {}))
      .rejects.toThrow(/wrangler secret put INSIGHTS_CHAVE/);
  });

  it('publicar devolve o endereço do cliente e diz que ele já vê', async () => {
    await seedUser(A);
    const vistas = servidor({
      '/trackings/99/diff': { files: [{ path: 'relatorio.html' }] },
      '/trackings/99/publish': { ok: true, files: 3 },
      '/trackings/99': { id: 99, name: 'Debriefing', code: 'abc123' },
    });
    const out = await insightsPublicar(E(), U(), { documento: 99, principal: 'relatorio.html', consultor_pediu: true });

    expect(out).toContain('https://insights.witly.com.br/v/abc123/');
    expect(out).toContain('3 arquivo');
    expect(out).toContain('passa a ver na área dele');
    expect(vistas.some((v) => v.metodo === 'PATCH')).toBe(true);     // entry_path + client_access
    expect(vistas.some((v) => v.url.includes('/publish') && v.metodo === 'POST')).toBe(true);
  });

  it('erro 403 do Insights explica que o alcance é da pessoa, não da chave', async () => {
    await seedUser(A);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'Você não tem acesso a este cliente.' }), { status: 403 }));
    await expect(insightsDestino(E(), U(), {})).rejects.toThrow(/acesso de edição a este cliente/);
  });
});

describe('insights — a rota de upload', () => {
  it('recusa assinatura inválida, de outro documento e vencida', async () => {
    const chave = env.COOKIE_ENCRYPTION_KEY;
    const bom = await signUpload(chave, 99, A);
    const outro = await signUpload(chave, 100, A);
    const venceu = await signUpload(chave, 99, A, -10);

    const põe = (t: string, tracking = 99) => SELF.fetch(`http://x/up/${tracking}?t=${encodeURIComponent(t)}&a=${A}`, {
      method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: '--x--',
    });

    expect((await põe('nada')).status).toBe(403);
    expect((await põe(outro)).status).toBe(403);          // assinatura é de outro documento
    expect((await põe(venceu)).status).toBe(403);         // expirada
    // com assinatura boa passa da autorização (aí falha por falta de chave, que é outro passo)
    expect((await põe(bom)).status).not.toBe(403);
  });
});

describe('insights — os dois portões', () => {
  it('não publica sem o consultor ter pedido', async () => {
    await seedUser(A);
    servidor({ '/trackings/99/publish': { ok: true, files: 1 }, '/trackings/99': { id: 99, name: 'x', code: 'c' } });
    await expect(insightsPublicar(E(), U(), { documento: 99 })).rejects.toThrow(/decisão do consultor/);
    await expect(insightsPublicar(E(), U(), { documento: 99, consultor_pediu: true })).resolves.toContain('está no ar');
  });

  it('o nome é o que o cliente lê: recusa slug técnico e ALL CAPS, arruma o resto', () => {
    expect(() => nomeDocumento('lcto-cria-abr-26')).toThrow(/identificador técnico/);
    expect(() => nomeDocumento('DEBRIEFING DA CAMPANHA')).toThrow(/maiúsculas/);
    expect(() => nomeDocumento('ab')).toThrow(/nome/);
    expect(nomeDocumento('  debriefing ·   Cria abr/26 ')).toBe('Debriefing · Cria abr/26');
  });
});
