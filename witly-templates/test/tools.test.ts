import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import * as db from '../src/db/index.js';
import { guia, listarTemplates, montarQueries, obterTemplate, resourceText, ToolError } from '../src/kit/tools.js';
import { verifyDownload } from '../src/kit/sign.js';
import { ORG, SAMPLE_FILES, SAMPLE_MANIFEST, seedPublished, seedUser } from './helpers.js';

const user = { email: 'leitor@witly.digital', name: 'Leitor' };
// O D1 do pool não é limpo entre testes do mesmo arquivo: cada teste usa um slug próprio.
let n = 0;
const fresh = () => `acomp-${++n}`;

describe('tools (T011)', () => {
  it('listar_templates: só publicados, com tarefas e parâmetros', async () => {
    await seedUser(user.email);
    const slug = fresh();
    await seedPublished(slug);
    await db.createTemplate(env.DB, { slug: 'so-rascunho', org_id: ORG, name: 'Rascunho', manifest: {}, files: [], tasks: [] });
    const out = await listarTemplates(env, user);
    expect(out).toContain(`\`${slug}\``);
    expect(out).toContain('lancamento (identificar o lançamento)');
    expect(out).toContain('field_conversion, data_corte?, tipo_funil, limite?');
    expect(out).not.toContain('so-rascunho');
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM usage_log WHERE tool='listar_templates' AND email=?").bind(user.email).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it('obter_template: texto com manifesto, tarefas, queries, documento, guia, contextos gerais e URL assinada válida', async () => {
    const slug = fresh();
    await seedPublished(slug);
    await db.upsertGeneralContext(env.DB, { slug: 'numeros-pequenos', org_id: ORG, title: 'Números pequenos', body_md: 'Taxa em cima de pouca base não é sinal.' });
    const out = await obterTemplate(env, user, slug);
    expect(out).toContain(`# Kit: Acompanhamento diário  \`${slug}\`  v1`);
    expect(out).toContain('### Identificar o lançamento  `lancamento`');
    expect(out).toContain(SAMPLE_FILES[0].content);            // SQL cru com {{param}}
    expect(out).toContain('# Documento');
    expect(out).toContain('Leia com cuidado.');
    expect(out).toContain('## Contextos gerais');
    expect(out).toContain('Taxa em cima de pouca base');
    const m = out.match(new RegExp(String.raw`curl -L -o ${slug}\.zip "http://x/dl/${slug}/1\?t=([^"]+)"`));
    expect(m).not.toBeNull();
    expect(await verifyDownload(env.COOKIE_ENCRYPTION_KEY, slug, 1, m![1])).toBe(true);
    const log = await env.DB.prepare("SELECT slug, version_number FROM usage_log WHERE tool='obter_template' AND slug=?").bind(slug).first<{ slug: string; version_number: number }>();
    expect(log).toEqual({ slug, version_number: 1 });
  });

  it('obter_template: slug inexistente lista os disponíveis; só rascunho avisa', async () => {
    const slug = fresh();
    await seedPublished(slug);
    await db.createTemplate(env.DB, { slug: 'novo', org_id: ORG, name: 'Novo', manifest: {}, files: [], tasks: [] });
    await expect(obterTemplate(env, user, 'nada')).rejects.toThrow(new RegExp(String.raw`não existe\. Disponíveis: .*${slug}.*novo`));
    await expect(obterTemplate(env, user, 'novo')).rejects.toThrow(/só rascunho/);
  });

  it('montar_query: seleciona por `when`, preenche e escapa; falta de parâmetro cita a tarefa', async () => {
    const slug = fresh();
    await seedPublished(slug);
    const out = await montarQueries(env, user, slug, { field_conversion: "lcto'x", tipo_funil: 'pago' });
    expect(out).toContain("WHERE fc = 'lcto''x' AND tipo = 'pago' LIMIT 10");
    expect(out).toContain('salvar como `dump.csv`');
    await expect(montarQueries(env, user, slug, { tipo_funil: 'pago' })).rejects.toThrow(/field_conversion \(tarefa de contexto "lancamento"\)/);
    const e = await montarQueries(env, user, slug, { field_conversion: 'a', tipo_funil: 'outro' }).catch((x) => x as ToolError);
    expect(e).toBeInstanceOf(ToolError);   // enum inválido → ToolError com a lista de inválidos
    expect((e as ToolError).message).toMatch(/inválidos: tipo_funil/);
  });

  it('guia: devolve o guia + contextos gerais', async () => {
    const slug = fresh();
    await seedPublished(slug);
    await db.upsertGeneralContext(env.DB, { slug: 'g1', org_id: ORG, title: 'G1', body_md: 'corpo g1' });
    const out = await guia(env, user, slug);
    expect(out.startsWith('# Guia')).toBe(true);
    expect(out).toContain('### [REGRA] G1');
  });

  it('resources: manifesto, guia, contexto/<tarefa>, contexto geral', async () => {
    await seedPublished('acomp');
    await db.upsertGeneralContext(env.DB, { slug: 'g1', org_id: ORG, title: 'G1', body_md: 'corpo g1' });
    expect(JSON.parse((await resourceText(env, 'template://acomp'))!)).toMatchObject({ slug: 'acomp', version: '1.0.0', version_number: 1, params: SAMPLE_MANIFEST.params });
    expect(await resourceText(env, 'template://acomp/guia')).toBe('# Guia\nLeia com cuidado.');
    expect(await resourceText(env, 'template://acomp/contexto/lancamento')).toContain('# Identificar o lançamento');
    expect(await resourceText(env, 'contexto://geral/g1')).toBe('# G1\n\ncorpo g1');
    expect(await resourceText(env, 'template://nada')).toBeNull();
  });
});
