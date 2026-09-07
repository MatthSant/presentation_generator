import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import * as db from '../src/db/index.js';
import { SESSION_COOKIE, signSession } from '../src/auth/session.js';
import { lineDiff } from '../src/kit/versions.js';
import { virarExemplo, virarRegra } from '../src/kit/curate.js';
import { ORG, SAMPLE_FILES, SAMPLE_MANIFEST, seedPublished, seedUser } from './helpers.js';

let n = 0;
const fresh = () => `f2api-${++n}`;
async function call(path: string, init: RequestInit & { as?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.as) headers.set('cookie', `${SESSION_COOKIE}=${await signSession(env.COOKIE_ENCRYPTION_KEY, init.as)}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return SELF.fetch(`http://x${path}`, { ...init, headers });
}
const ED = 'ed@witly.digital'; const A = 'a@witly.digital'; const B = 'b@witly.digital';

describe('api — pessoais (US6)', () => {
  it('leitor vê os seus; editor vê todos com uso; promover; remover (dono ou editor)', async () => {
    await seedUser(ED, 'editor'); await seedUser(A); await seedUser(B);
    const mine = fresh();
    await db.createTemplate(env.DB, { slug: mine, org_id: ORG, name: 'Meu', manifest: SAMPLE_MANIFEST, files: SAMPLE_FILES, tasks: [], owner_email: A, publish: true });
    await db.insertActivity(env.DB, { org_id: ORG, email: A, evento: 'geracao', slug: mine, dados: {} });
    expect((await (await call('/api/pessoais', { as: A })).json() as Array<{ slug: string; geracoes: number }>).find((t) => t.slug === mine)!.geracoes).toBe(1);
    expect((await (await call('/api/pessoais', { as: B })).json() as Array<{ slug: string }>).some((t) => t.slug === mine)).toBe(false);
    expect((await (await call('/api/pessoais', { as: ED })).json() as Array<{ slug: string }>).some((t) => t.slug === mine)).toBe(true);
    // catálogo: leitor B não vê; GET direto 404 para B
    expect((await (await call('/api/templates', { as: B })).json() as Array<{ slug: string }>).some((t) => t.slug === mine)).toBe(false);
    expect((await call(`/api/templates/${mine}`, { as: B })).status).toBe(404);
    // dono (leitor) edita o próprio pessoal
    expect((await call(`/api/templates/${mine}/draft/files/guia.md`, { method: 'PUT', as: A, body: JSON.stringify({ content: 'x' }) })).status).toBe(200);
    expect((await call(`/api/templates/${mine}/draft/files/guia.md`, { method: 'PUT', as: B, body: JSON.stringify({ content: 'x' }) })).status).toBe(403);
    // promover: só editor
    expect((await call(`/api/templates/${mine}/promover`, { method: 'POST', as: A })).status).toBe(403);
    expect((await call(`/api/templates/${mine}/promover`, { method: 'POST', as: ED, body: '{}' })).status).toBe(200);
    expect((await (await call('/api/templates', { as: B })).json() as Array<{ slug: string }>).some((t) => t.slug === mine)).toBe(true);
    // remover: template da org só editor
    expect((await call(`/api/templates/${mine}`, { method: 'DELETE', as: A })).status).toBe(403);
    expect((await call(`/api/templates/${mine}`, { method: 'DELETE', as: ED })).status).toBe(200);
  });
});

describe('api — atividade, uso, curadoria (US1/US2/US3)', () => {
  it('lista com resumo; leitor só as suas; detalhe; reavaliar; uso', async () => {
    await seedUser(ED, 'editor'); await seedUser(A); await seedUser(B);
    const s = fresh(); await seedPublished(s);
    const id = await db.insertActivity(env.DB, { org_id: ORG, email: A, evento: 'aprofundamento', slug: s, version_number: 1, dados: { pergunta: 'CPL?', resposta: 'r'.repeat(500) }, avaliacao: 5 });
    await db.insertActivity(env.DB, { org_id: ORG, email: B, evento: 'geracao', slug: s, version_number: 1, dados: {} });
    const listA = await (await call(`/api/atividade?slug=${s}`, { as: A })).json() as Array<{ email: string; resumo: { resposta: string } }>;
    expect(listA).toHaveLength(1); expect(listA[0].resumo.resposta.length).toBe(240);
    const listEd = await (await call(`/api/atividade?slug=${s}`, { as: ED })).json() as unknown[];
    expect(listEd).toHaveLength(2);
    expect((await (await call(`/api/atividade?slug=${s}&evento=geracao`, { as: ED })).json() as unknown[]).length).toBe(1);
    const det = await (await call(`/api/atividade/${id}`, { as: ED })).json() as { dados: { resposta: string } };
    expect(det.dados.resposta.length).toBe(500);
    expect((await call(`/api/atividade/${id}`, { as: B })).status).toBe(404);
    expect((await call(`/api/atividade/${id}`, { method: 'PATCH', as: ED, body: JSON.stringify({ editor_nota: 3, editor_comentario: 'bom' }) })).status).toBe(200);
    expect((await db.getActivity(env.DB, id))!.editor_nota).toBe(3);
    const uso = await (await call(`/api/uso?slug=${s}`, { as: ED })).json() as { stats: Array<{ geracoes: number; aprofundamentos: number }>; top_perguntas: Array<{ n: number }> };
    expect(uso.stats[0]).toMatchObject({ geracoes: 1, aprofundamentos: 1 });
    expect(uso.top_perguntas[0].n).toBe(1);
    expect((await call('/api/uso', { as: A })).status).toBe(403);
  });

  it('virar exemplo / virar regra editam o guia do rascunho, publicada intacta, idempotentes', async () => {
    await seedUser(ED, 'editor');
    const s = fresh(); await seedPublished(s);
    const ex = await db.insertActivity(env.DB, { org_id: ORG, email: A, evento: 'aprofundamento', slug: s, dados: { pergunta: 'Por que o CPL subiu?', resposta: 'CPM +30%.' }, avaliacao: 5 });
    const rg = await db.insertActivity(env.DB, { org_id: ORG, email: A, evento: 'aprofundamento', slug: s, dados: { pergunta: 'x' }, descartado: true, motivo: 'inventou meta por canal' });
    expect((await call(`/api/atividade/${ex}/virar-exemplo`, { method: 'POST', as: ED })).status).toBe(200);
    expect((await call(`/api/atividade/${rg}/virar-regra`, { method: 'POST', as: ED, body: '{}' })).status).toBe(200);
    const draft = (await db.getDraftKit(env.DB, s))!.files.find((f) => f.path === 'guia.md')!.content;
    expect(draft).toContain('## Exemplos de aprofundamento');
    expect(draft).toContain('### Por que o CPL subiu?');
    expect(draft).toContain('## O que NÃO concluir');
    expect(draft).toContain('- inventou meta por canal');
    expect((await db.getPublishedKit(env.DB, s))!.files.find((f) => f.path === 'guia.md')!.content).toBe('# Guia\nLeia com cuidado.');
    expect((await call(`/api/atividade/${ex}/virar-exemplo`, { method: 'POST', as: ED })).status).toBe(409);
    expect((await virarRegra(env.DB, rg, ED)).ok).toBe(false);
    expect((await virarExemplo(env.DB, 'nao-existe', ED)).ok).toBe(false);
    // segunda regra vai para a MESMA seção, sem duplicar o cabeçalho
    const rg2 = await db.insertActivity(env.DB, { org_id: ORG, email: A, evento: 'aprofundamento', slug: s, dados: { pergunta: 'y' }, descartado: true, motivo: 'somou taxas' });
    await virarRegra(env.DB, rg2, ED);
    const g2 = (await db.getDraftKit(env.DB, s))!.files.find((f) => f.path === 'guia.md')!.content;
    expect(g2.split('## O que NÃO concluir').length).toBe(2);
    expect(g2).toContain('- somou taxas');
  });
});

describe('api — versões (US4)', () => {
  it('lineDiff marca +/-; diff por arquivo/tarefa/manifesto; changelog; restaurar', async () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc')).toEqual(['  a', '- b', '+ B', '  c']);
    await seedUser(ED, 'editor'); await seedUser(A);
    const s = fresh(); await seedPublished(s);
    const d = await db.ensureDraft(env.DB, s, ED);
    await db.saveFile(env.DB, d.id, 'guia.md', '# Guia\nLeia com cuidado.\nNova linha');
    await db.saveFile(env.DB, d.id, 'novo.md', 'x');
    await db.deleteFile(env.DB, d.id, 'exemplo.html');
    await db.saveContextTask(env.DB, d.id, { task_id: 'metas', title: 'Metas', body_md: 'm' });
    expect((await call(`/api/templates/${s}/publish`, { method: 'POST', as: ED, body: JSON.stringify({ changelog: 'guia + metas' }) })).status).toBe(200);
    const vs = await (await call(`/api/templates/${s}/versoes`, { as: A })).json() as Array<{ number: number; changelog: string; state: string }>;
    expect(vs.map((v) => v.number)).toEqual([2, 1]);
    expect(vs[0].changelog).toBe('guia + metas');
    const diff = await (await call(`/api/templates/${s}/versoes/diff?de=1&para=2`, { as: A })).json() as { files: Array<{ path: string; kind: string; lines?: string[] }>; tasks: Array<{ path: string; kind: string }>; manifest: unknown };
    expect(diff.files.map((f) => `${f.kind}:${f.path}`).sort()).toEqual(['added:novo.md', 'changed:guia.md', 'removed:exemplo.html']);
    expect(diff.files.find((f) => f.path === 'guia.md')!.lines).toContain('+ Nova linha');
    expect(diff.tasks).toEqual([{ path: 'metas', kind: 'added' }]);
    expect(diff.manifest).toBeNull();
    expect((await call(`/api/templates/${s}/versoes/1/restaurar`, { method: 'POST', as: A })).status).toBe(403);
    const r = await (await call(`/api/templates/${s}/versoes/1/restaurar`, { method: 'POST', as: ED })).json() as { version: { number: number; state: string } };
    expect(r.version).toMatchObject({ number: 3, state: 'draft' });
    expect((await db.getDraftKit(env.DB, s))!.files.some((f) => f.path === 'exemplo.html')).toBe(true);
    expect((await db.getPublishedKit(env.DB, s))!.version.number).toBe(2);
  });
});
