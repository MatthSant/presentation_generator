/* Spec 005 — o agente com Python na mão: perguntas como entradas, sugerir_regra na triagem,
 * salvar_template com regras, edicao fora das tools, perguntas.md do zip vindo das entradas. */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import * as db from '../src/db/index.js';
import { SESSION_COOKIE, signSession } from '../src/auth/session.js';
import { registrar, sugerir } from '../src/kit/activity.js';
import { virarRegra } from '../src/kit/curate.js';
import { obterTemplate, perguntas } from '../src/kit/tools.js';
import { buildKitZip, questionsBlock, rulesBlock } from '../src/kit/zip.js';
import { ORG, seedPublished, seedUser } from './helpers.js';

let n = 0;
const fresh = () => `agente-${++n}`;
async function call(path: string, init: RequestInit & { as?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.as) headers.set('cookie', `${SESSION_COOKIE}=${await signSession(env.COOKIE_ENCRYPTION_KEY, init.as)}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return SELF.fetch(`http://x${path}`, { ...init, headers });
}
const ED = 'ed-ag@witly.digital'; const A = 'a-ag@witly.digital';
const dec = new TextDecoder();

describe('perguntas como entradas (tipo pergunta)', () => {
  it('entram no obter_template, na tool perguntas e no perguntas.md do zip; regras.md não as lista', async () => {
    await seedUser(ED, 'editor');
    const s = fresh(); await seedPublished(s);
    const d = await db.ensureDraft(env.DB, s, ED);
    await db.saveTemplateRule(env.DB, d.id, { rule_id: 'cpl-subiu', tipo: 'pergunta', title: 'Por que o CPL subiu?', body_md: 'Decomponha em CPM, CTR e página.', sort: 0 });
    await db.saveTemplateRule(env.DB, d.id, { rule_id: 'nao-somar', tipo: 'regra', title: 'Não somar taxas', body_md: '', sort: 0 });
    await db.publishDraft(env.DB, s);
    const kit = (await db.getPublishedKit(env.DB, s))!;
    expect(kit.rules.map((r) => r.tipo)).toEqual(['regra', 'pergunta']);   // perguntas por último

    const texto = await obterTemplate(env, { email: ED, name: 'Ed' }, s);
    expect(texto).toContain('## Perguntas norteadoras');
    expect(texto).toContain('### Por que o CPL subiu?');
    expect(texto).toContain('[REGRA] Não somar taxas');
    expect(texto).not.toContain('perguntas.json');
    expect(await perguntas(env, { email: ED, name: 'Ed' }, s)).toContain('Decomponha em CPM');

    expect(rulesBlock(kit.rules)).not.toContain('CPL subiu');
    expect(questionsBlock(kit.rules)).toContain('Por que o CPL subiu?');
    const files = unzipSync(buildKitZip(kit, []));
    expect(dec.decode(files[`${s}/perguntas.md`])).toContain('### Por que o CPL subiu?');
    expect(dec.decode(files[`${s}/regras.md`])).not.toContain('CPL subiu');
    // a UI grava pergunta pela mesma rota das regras
    expect((await call(`/api/templates/${s}/draft/regras/outra`, { method: 'PUT', as: ED, body: JSON.stringify({ tipo: 'pergunta', title: 'Qual canal está pior?' }) })).status).toBe(200);
    expect((await db.getDraftKit(env.DB, s))!.rules.find((r) => r.rule_id === 'outra')!.tipo).toBe('pergunta');
  });
});

describe('sugerir_regra → triagem → entrada', () => {
  it('a sugestão cai na fila sem veredito; aceitar cria a entrada com tipo e título; descartar fecha', async () => {
    await seedUser(ED, 'editor'); await seedUser(A);
    const s = fresh(); await seedPublished(s);
    const u = { email: A, name: 'A' };
    const out = await sugerir(env, u, { slug: s, tipo: 'definicao', titulo: 'CPA = CPL ÷ conversão paga', corpo: 'Use sempre a conversão do pago.', motivo: 'o relatório não define CPA' });
    expect(out).toContain('sugestão registrada');
    await expect(sugerir(env, u, { slug: s, tipo: 'regra', titulo: 'ligue para 11 99999-9999' })).rejects.toThrow(/dado pessoal/);
    await expect(sugerir(env, u, { slug: 'nao-existe', tipo: 'regra', titulo: 'x' })).rejects.toThrow(/não existe/);

    const fila = await (await call(`/api/atividade?slug=${s}&evento=aprofundamento,sugestao&veredito=sem`, { as: ED })).json() as Array<{ id: string; evento: string; resumo: { titulo: string; tipo: string } }>;
    expect(fila.length).toBe(1);
    expect(fila[0].evento).toBe('sugestao');
    expect(fila[0].resumo).toMatchObject({ titulo: 'CPA = CPL ÷ conversão paga', tipo: 'definicao' });
    const resumo = await (await call(`/api/atividade/resumo?slug=${s}`, { as: ED })).json() as { sem_veredito: number };
    expect(resumo.sem_veredito).toBeGreaterThanOrEqual(1);

    // aceitar = virar regra sem texto: usa o que o agente mandou
    const r = await virarRegra(env.DB, fila[0].id, ED);
    expect(r.ok).toBe(true);
    const draft = (await db.getDraftKit(env.DB, s))!;
    const nova = draft.rules.find((x) => x.title === 'CPA = CPL ÷ conversão paga')!;
    expect(nova.tipo).toBe('definicao');
    expect(nova.body_md).toContain('Use sempre a conversão do pago.');
    expect((await db.getActivity(env.DB, fila[0].id))!.veredito).toBe('regra');
    expect((await (await call(`/api/atividade?slug=${s}&evento=aprofundamento,sugestao&veredito=sem`, { as: ED })).json() as unknown[]).length).toBe(0);

    // saúde conta a fila com sugestões
    const outra = await sugerir(env, u, { slug: s, tipo: 'pergunta', titulo: 'Vale escalar o Quente?' });
    expect(outra).toContain('pergunta');
    const h = await (await call('/api/saude', { as: ED })).json() as { templates: Array<{ slug: string; sem_veredito: number }> };
    expect(h.templates.find((t) => t.slug === s)!.sem_veredito).toBe(1);
  });

  it('registrar não aceita mais edicao', async () => {
    await seedUser(A);
    const s = fresh(); await seedPublished(s);
    await expect(registrar(env, { email: A, name: 'A' }, { evento: 'edicao' as never, slug: s, mudanca: 'x' })).rejects.toThrow(/geracao \| aprofundamento/);
  });
});

describe('salvar_template com regras', () => {
  it('id inválido e título vazio são recusados; entradas viram rules do pessoal', async () => {
    await seedUser(A);
    const { salvarTemplate } = await import('../src/kit/personal.js');
    const u = { email: A, name: 'A' };
    const base = { name: 'Meu', manifest: { params: [], queries: [], tarefas_contexto: [] }, arquivos: { 'guia.md': '# g' } };
    await expect(salvarTemplate(env, u, { slug: fresh(), ...base, regras: { 'Id Ruim': { title: 'x' } } })).rejects.toThrow(/id de regra/);
    await expect(salvarTemplate(env, u, { slug: fresh(), ...base, regras: { ok: { title: '  ' } } })).rejects.toThrow(/title obrigatório/);
    const slug = fresh();
    await salvarTemplate(env, u, { slug, ...base, regras: { q1: { tipo: 'pergunta', title: 'CPL subiu?' }, r1: { tipo: 'nada', title: 'Sem somar' } } });
    const kit = (await db.getPublishedKit(env.DB, slug))!;
    expect(kit.rules.map((r) => [r.rule_id, r.tipo])).toEqual([['r1', 'regra'], ['q1', 'pergunta']]);
  });
});

describe('uso conta chamadas de tool', () => {
  it('ultimo_uso vem do usage_log quando não há atividade', async () => {
    await seedUser(ED, 'editor');
    const s = fresh(); await seedPublished(s);
    await db.logUsage(env.DB, { email: ED, tool: 'obter_template', slug: s, version_number: 1 });
    const rows = await db.listTemplates(env.DB, ORG, '*');
    expect(rows.find((t) => t.slug === s)!.ultimo_uso).toBeTruthy();
  });
});
