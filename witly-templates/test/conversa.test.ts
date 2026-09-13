/* Spec 008 fase 4 — templates `kind = conversa`: roteiro em etapas com checkpoint, no catálogo e no
 * obter_template sem zip nem Python; a UI cria com o tipo. */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import * as db from '../src/db/index.js';
import { gravarConhecimento } from '../src/db/conhecimento.js';
import { validarEntrada } from '../src/kit/conhecimento.js';
import { SESSION_COOKIE, signSession } from '../src/auth/session.js';
import { listarTemplates, obterTemplate } from '../src/kit/tools.js';
import { ORG, seedUser } from './helpers.js';

const ED = 'ed-cv@witly.digital';
async function call(path: string, init: RequestInit & { as?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.as) headers.set('cookie', `${SESSION_COOKIE}=${await signSession(env.COOKIE_ENCRYPTION_KEY, init.as)}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return SELF.fetch(`http://x${path}`, { ...init, headers });
}

const MANIFEST = {
  kind: 'conversa', funil: 'perpetuo', tags: ['trafego-pago'],
  entrada: 'Cliente (slug do Delfos), a campanha e o modo (report ou otimização).',
  ferramentas: ['Delfos: Credentials(slug), Witly_Query'],
  saida: 'Report em texto e as decisões registradas.',
  etapas: [
    { id: 'contexto', entrega: 'cliente e campanha identificados; dado fechado', espera: '"ok" do consultor', registra: '—', puxa: ['conhecimento({cliente})'] },
    { id: 'report-geral', entrega: 'report geral em 1d/3d/7d, só o que gastou ontem', espera: '"vai"', registra: 'registrar(geracao)', puxa: ['conhecimento({tipo:"formato"})'] },
  ],
  tarefas_contexto: [{ id: 'cliente-campanha', objetivo: 'identificar cliente e modo', confirmar: true }],
};

async function seedRoteiro(slug: string) {
  await db.createTemplate(env.DB, {
    slug, org_id: ORG, name: 'Otimizar tráfego (roteiro)', kind: 'conversa',
    objective: 'Conduzir a otimização de mídia com o consultor', when_to_use: 'quando pedem "roda o report" ou "otimização"',
    manifest: MANIFEST,
    files: [{ path: 'guia.md', content: '# Guia\n\nOrdem: campanha → público → criativo.' }],
    tasks: [{ task_id: 'cliente-campanha', title: 'Identificar cliente, campanha e modo', body_md: 'Pergunte o slug do Delfos.' }],
    rules: [{ rule_id: 'so-gastou-ontem', tipo: 'regra', title: 'Só o que gastou ontem entra no report', body_md: 'sem gasto = já desligado' },
      { rule_id: 'onde-concentra', tipo: 'pergunta', title: 'A piora é de um criativo ou é geral?', body_md: 'desça os níveis' }],
    author_email: 'seed',
  });
  return db.publishDraft(env.DB, slug);
}

describe('templates kind = conversa (roteiro)', () => {
  it('entra no catálogo como roteiro e o obter_template devolve etapas com checkpoint, sem zip nem Python', async () => {
    await seedUser(ED, 'editor');
    const slug = `rot-${Date.now()}`;
    await seedRoteiro(slug);
    const u = { email: ED, name: 'Ed' };

    const rows = await db.listTemplates(env.DB, ORG, '*');
    expect(rows.find((t) => t.slug === slug)!.kind).toBe('conversa');
    expect(await listarTemplates(env, u)).toContain('ROTEIRO de conversa em etapas');

    await gravarConhecimento(env.DB, ORG, validarEntrada({ id: 'numero-com-janela', tipo: 'regra', titulo: 'Todo número vem com janela', corpo_md: 'ontem, 3d, 7d', sempre: true, dados: { forca: 'sempre' } }).entrada!, 'seed');
    await gravarConhecimento(env.DB, ORG, validarEntrada({ id: 'report-1d-3d-7d', tipo: 'metodo', titulo: 'Report 1d/3d/7d ancorado no dado fechado', escopo: `template:${slug}`, dados: { origem: 'witly', passos: ['confirme o dado fechado', 'leia a tendência'] } }).entrada!, 'seed');

    const out = await obterTemplate(env, u, slug);
    expect(out).toContain(`# Roteiro: Otimizar tráfego (roteiro)  \`${slug}\``);
    expect(out).toContain('entregue a etapa, faça a pergunta de `espera`');
    expect(out).toContain('## Entrada — o que pedir ao consultor antes de começar');
    expect(out).toContain('| # | entrega | espera (o que libera a próxima) | registra | puxa do conhecimento |');
    expect(out).toContain('| 0 `contexto` | cliente e campanha identificados; dado fechado | "ok" do consultor |');
    expect(out).toContain('**Ferramentas:** Delfos: Credentials(slug), Witly_Query');
    expect(out).toContain('**Saída:** Report em texto');
    expect(out).toContain('### Identificar cliente, campanha e modo  `cliente-campanha`  — **PERGUNTE AO CONSULTOR e confirme**');
    expect(out).toContain('Só o que gastou ontem entra no report');
    expect(out).toContain('A piora é de um criativo ou é geral?');
    // nível 0 e índice do escopo do roteiro entram; zip e Python não
    expect(out).toContain('[REGRA] Todo número vem com janela');
    expect(out).toContain('- `report-1d-3d-7d` · metodo');
    expect(out).not.toContain('curl -L -o');
    expect(out).not.toContain('python/gerar.py');
    expect(out).toContain('registrar({evento:"feedback"');
  });

  it('a API cria roteiro sem arquivos de Python e o catálogo separa os dois tipos', async () => {
    await seedUser(ED, 'editor');
    const slug = `novo-rot-${Date.now()}`;
    expect((await call('/api/templates', { method: 'POST', as: ED, body: JSON.stringify({ slug, name: 'Roteiro novo', kind: 'conversa' }) })).status).toBe(201);
    const d = await (await call(`/api/templates/${slug}?state=draft`, { as: ED })).json() as { template: { kind: string }; kit: { manifest: { kind: string; etapas: unknown[] }; files: Array<{ path: string }> } };
    expect(d.template.kind).toBe('conversa');
    expect(d.kit.manifest.kind).toBe('conversa');
    expect(d.kit.manifest.etapas.length).toBe(1);
    expect(d.kit.files.map((f) => f.path)).toEqual(['guia.md']);

    const slugA = `ana-${Date.now()}`;
    expect((await call('/api/templates', { method: 'POST', as: ED, body: JSON.stringify({ slug: slugA, name: 'Análise nova' }) })).status).toBe(201);
    const a = await (await call(`/api/templates/${slugA}?state=draft`, { as: ED })).json() as { template: { kind: string }; kit: { files: Array<{ path: string }> } };
    expect(a.template.kind).toBe('analise');
    expect(a.kit.files.some((f) => f.path === 'python/gerar.py')).toBe(true);

    const cat = await (await call('/api/catalogo', { as: ED })).json() as { templates: Array<{ slug: string; kind: string }> };
    expect(cat.templates.find((t) => t.slug === slug)!.kind).toBe('conversa');
    expect(cat.templates.find((t) => t.slug === slugA)!.kind).toBe('analise');
  });
});
