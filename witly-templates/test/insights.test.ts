import { env, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { autorDe, entregarAnalise, nomeDocumento } from '../src/kit/insights.js';
import { signUpload } from '../src/kit/sign.js';
import { seedUser } from './helpers.js';

const A = 'ana@witly.digital';
const U = (e = A) => ({ email: e, name: 'Ana' }) as never;
const E = () => ({ ...env, INSIGHTS_CHAVE: 'wit_teste', INSIGHTS_BASE: 'https://ins.test/api', PUBLIC_URL: 'http://x' }) as never;

type Visto = { url: string; metodo: string; autor: string | null };

/** Insights de mentira: responde pela rota e guarda as chamadas, para conferir método e
 *  cabeçalho. A ordem das chaves importa — a primeira que casar responde. */
function servidor(rotas: Record<string, unknown>): Visto[] {
  const vistas: Visto[] = [];
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const h = new Headers(init?.headers);
    vistas.push({ url: u, metodo: init?.method || 'GET', autor: h.get('x-autor') });
    const rota = Object.keys(rotas).find((k) => u.includes(k));
    if (!rota) return new Response(JSON.stringify({ error: `sem rota para ${u}` }), { status: 404 });
    return new Response(JSON.stringify(rotas[rota]), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return vistas;
}

const DOC = { id: 99, name: 'Debriefing · Cria abr/26', code: 'abc123' };
const ME = { email: A, poderes: ['ler', 'escrever', 'publicar'], envio: { maxArquivosPorVez: 60 } };

afterEach(() => vi.unstubAllGlobals());

describe('entregar_analise — quem assina', () => {
  it('login compartilhado não assina: pede o e-mail da pessoa', () => {
    expect(() => autorDe(U('projetos@witly.digital'))).toThrow(/login compartilhado/);
    expect(autorDe(U('projetos@witly.digital'), 'roberto@witly.digital')).toBe('roberto@witly.digital');
  });

  it('login de pessoa assina sozinho; e-mail inválido é recusado', () => {
    expect(autorDe(U())).toBe(A);
    expect(() => autorDe(U(), 'roberto')).toThrow(/não é um e-mail/);
  });

  it('o X-Autor vai em toda chamada — vale o acesso dele, não o da chave', async () => {
    await seedUser(A);
    const vistas = servidor({ '/clients': [{ id: 1, name: 'B55' }] });
    await entregarAnalise(E(), U(), {});
    expect(vistas.length).toBeGreaterThan(0);
    expect(vistas.every((v) => v.autor === A)).toBe(true);
  });
});

describe('entregar_analise — a etapa vem do estado, não do que o agente diz', () => {
  it('1 · sem argumento, mostra onde a análise pode ir', async () => {
    await seedUser(A);
    servidor({ '/clients': [{ id: 1, name: 'B55' }] });
    const out = await entregarAnalise(E(), U(), {});
    expect(out).toContain('etapa 1 de 5');
    expect(out).toContain('B55');
    expect(out).toContain('Próximo');
  });

  it('2 · documento vazio cai em "subir", com o curl e sem pedir o conteúdo', async () => {
    await seedUser(A);
    servidor({ '/projects/34/trackings': DOC, '/trackings/99/files': [], '/me': ME });
    const out = await entregarAnalise(E(), U(), { projeto: 34, nome: 'Debriefing · Cria abr/26' });
    expect(out).toContain('etapa 2 de 5');
    expect(out).toContain('curl -sS -X POST');
    expect(out).toContain('/up/99?t=');
    expect(out).toContain('Não me mande o conteúdo');
  });

  it('3 · com arquivo no rascunho cai em "conferir" e MANDA perguntar — não publica', async () => {
    await seedUser(A);
    const vistas = servidor({ '/trackings/99/files': [{ path: 'relatorio.html' }], '/trackings/99': DOC });
    const out = await entregarAnalise(E(), U(), { documento: 99 });
    expect(out).toContain('etapa 3 de 5');
    expect(out).toContain('PERGUNTAR ao consultor');
    expect(out).toContain('consultor_pediu:true');
    expect(vistas.some((v) => v.url.includes('/publish'))).toBe(false);   // nada foi ao ar
  });

  it('3 · avisa quando há mais de um candidato a página principal', async () => {
    await seedUser(A);
    servidor({ '/trackings/99/files': [{ path: 'relatorio.html' }, { path: 'anexo.html' }], '/trackings/99': DOC });
    const out = await entregarAnalise(E(), U(), { documento: 99 });
    expect(out).toContain('podem ser a página do documento');
    expect(out).toContain('`principal:');
  });

  it('4 · só publica com o pedido do consultor, e devolve o endereço', async () => {
    await seedUser(A);
    const vistas = servidor({
      '/trackings/99/files': [{ path: 'relatorio.html' }],
      '/trackings/99/publish': { ok: true, files: 3 },
      '/trackings/99': DOC,
    });
    const out = await entregarAnalise(E(), U(), { documento: 99, consultor_pediu: true, principal: 'relatorio.html' });
    expect(out).toContain('etapa 4 de 5');
    expect(out).toContain('https://insights.witly.com.br/v/abc123/');
    expect(out).toContain('3 arquivo');
    expect(vistas.some((v) => v.url.includes('/publish') && v.metodo === 'POST')).toBe(true);
    expect(vistas.some((v) => v.metodo === 'PATCH')).toBe(true);   // entry_path + client_access
  });

  it('5 · link público de documento já no ar', async () => {
    await seedUser(A);
    servidor({
      '/trackings/99/files': [{ path: 'relatorio.html' }],
      '/trackings/99/shares': { url: 'https://insights.witly.com.br/v/zzz/', expires_at: '2026-12-31' },
      '/trackings/99': { ...DOC, published_at: '2026-09-15' },
    });
    const out = await entregarAnalise(E(), U(), { documento: 99, link: { expira_em: '2026-12-31' } });
    expect(out).toContain('etapa 5 de 5');
    expect(out).toContain('https://insights.witly.com.br/v/zzz/');
  });
});

describe('entregar_analise — o que ela recusa', () => {
  it('sem chave configurada, diz o que fazer em vez de falhar opaco', async () => {
    await seedUser(A);
    servidor({});
    await expect(entregarAnalise({ ...env, INSIGHTS_BASE: 'https://ins.test/api' } as never, U(), {}))
      .rejects.toThrow(/wrangler secret put INSIGHTS_CHAVE/);
  });

  it('403 do Insights explica que o alcance é da pessoa, não da chave', async () => {
    await seedUser(A);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'Você não tem acesso a este cliente.' }), { status: 403 }));
    await expect(entregarAnalise(E(), U(), {})).rejects.toThrow(/acesso de edição a este cliente/);
  });

  it('o nome é o que o cliente lê: recusa slug técnico e ALL CAPS, arruma o resto', () => {
    expect(() => nomeDocumento('lcto-cria-abr-26')).toThrow(/identificador técnico/);
    expect(() => nomeDocumento('DEBRIEFING DA CAMPANHA')).toThrow(/maiúsculas/);
    expect(() => nomeDocumento('ab')).toThrow(/nome/);
    expect(nomeDocumento('  debriefing ·   Cria abr/26 ')).toBe('Debriefing · Cria abr/26');
  });
});

describe('entregar_analise — a rota de upload', () => {
  it('recusa assinatura inválida, de outro documento e vencida', async () => {
    const chave = env.COOKIE_ENCRYPTION_KEY;
    const bom = await signUpload(chave, 99, A);
    const outro = await signUpload(chave, 100, A);
    const venceu = await signUpload(chave, 99, A, -10);

    const põe = (t: string) => SELF.fetch(`http://x/up/99?t=${encodeURIComponent(t)}&a=${A}`, {
      method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: '--x--',
    });

    expect((await põe('nada')).status).toBe(403);
    expect((await põe(outro)).status).toBe(403);
    expect((await põe(venceu)).status).toBe(403);
    expect((await põe(bom)).status).not.toBe(403);
  });
});

describe('entregar_analise — subir por cima e não duplicar', () => {
  it('a etapa 3 devolve o curl: substituir a análise é o caso normal', async () => {
    await seedUser(A);
    servidor({ '/trackings/99/files': [{ path: 'relatorio.html' }], '/trackings/99': DOC });
    const out = await entregarAnalise(E(), U(), { documento: 99 });
    // o bug era este: mandava "suba por cima" sem dar o meio de fazê-lo
    expect(out).toContain('suba por cima');
    expect(out).toContain('curl -sS -X POST');
    expect(out).toContain('/up/99?t=');
    // o exemplo tem de ser um caminho QUE JÁ EXISTE: subir 'relatorio.html' num documento
    // cujo arquivo é outro acrescentaria mais um em vez de trocar o certo
    expect(out).toContain('files=@relatorio.html');
  });

  it('o exemplo de upload usa o arquivo que já está no rascunho, não um nome genérico', async () => {
    await seedUser(A);
    servidor({ '/trackings/99/files': [{ path: 'relatorio-2026-09-15.html' }], '/trackings/99': DOC });
    const out = await entregarAnalise(E(), U(), { documento: 99 });
    expect(out).toContain('files=@relatorio-2026-09-15.html');
    expect(out).not.toContain('files=@relatorio.html"');
  });

  it('não cria um segundo documento com o mesmo nome — manda substituir o que existe', async () => {
    await seedUser(A);
    const vistas = servidor({
      '/projects/34/trackings': [{ id: 222, name: 'Debriefing · Cria abr/26', code: 'c' }],
      '/trackings/222': DOC,
    });
    await expect(entregarAnalise(E(), U(), { projeto: 34, nome: 'Debriefing · Cria abr/26' }))
      .rejects.toThrow(/já tem um documento chamado/);
    expect(vistas.some((v) => v.metodo === 'POST')).toBe(false);   // nada foi criado
  });
});
