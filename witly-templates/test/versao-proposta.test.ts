import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import * as db from '../src/db/index.js';
import { proporVersao } from '../src/kit/versao-proposta.js';
import { obterTemplate } from '../src/kit/tools.js';
import { ORG, seedPublished, seedUser } from './helpers.js';

let n = 0;
const fresh = () => `pv-${++n}`;
const A = 'a-pv@witly.digital'; const B = 'b-pv@witly.digital';
const U = (e: string) => ({ email: e, name: e.split('@')[0] }) as never;
const MOTIVO = 'a conferência não checava o público e sete adsets saíram zerados na análise de ontem';

describe('propor_versao — o agente sobe o template já corrigido', () => {
  it('escreve no rascunho, NUNCA na publicada, e o agente segue recebendo a antiga', async () => {
    await seedUser(A); const slug = fresh(); await seedPublished(slug);
    const antes = await obterTemplate(env as never, U(A), slug);
    expect(antes).toContain('# Documento');

    const r = await proporVersao(env as never, U(A), {
      slug, motivo: MOTIVO, arquivos: { 'documento.md': '# Documento\n\nAgora com a checagem de público.' },
    });

    expect(r).toContain('NÃO publicado');
    // a publicada não mudou: é o que o próximo obter_template entrega
    const depois = await obterTemplate(env as never, U(A), slug);
    expect(depois).not.toContain('Agora com a checagem de público');
    // mas o rascunho tem
    const t = (await db.getTemplate(env.DB, slug))!;
    expect(t.draft_version_id).toBeTruthy();
    const f = (await db.getVersionFiles(env.DB, t.draft_version_id!)).find((x) => x.path === 'documento.md');
    expect(f!.content).toContain('Agora com a checagem de público');
  });

  it('entra na fila de triagem com o motivo e o que mudou', async () => {
    await seedUser(A); const slug = fresh(); await seedPublished(slug);
    await proporVersao(env as never, U(A), { slug, motivo: MOTIVO, arquivos: { 'guia.md': '# Guia\n\nnovo' } });

    const fila = await db.listActivity(env.DB, ORG, { evento: 'versao', veredito: 'sem' } as never);
    const item = fila.find((x) => x.slug === slug)!;
    expect(item.evento).toBe('versao');
    const d = JSON.parse(item.dados_json) as { motivo: string; mudou: string[] };
    expect(d.motivo).toBe(MOTIVO);
    expect(d.mudou.join(' ')).toContain('guia.md');
  });

  it('recusa sem motivo concreto e sem nenhuma mudança', async () => {
    await seedUser(A); const slug = fresh(); await seedPublished(slug);
    await expect(proporVersao(env as never, U(A), { slug, motivo: 'ajuste', arquivos: { 'guia.md': 'x' } })).rejects.toThrow(/motivo/);
    await expect(proporVersao(env as never, U(A), { slug, motivo: MOTIVO })).rejects.toThrow(/ao menos uma mudança/);
  });

  it('não atropela rascunho não publicado de outra pessoa sem forcar', async () => {
    await seedUser(A); await seedUser(B); const slug = fresh(); await seedPublished(slug);
    await proporVersao(env as never, U(B), { slug, motivo: MOTIVO, arquivos: { 'guia.md': '# Guia\n\nversão do B' } });

    await expect(proporVersao(env as never, U(A), { slug, motivo: MOTIVO, arquivos: { 'guia.md': '# Guia\n\nversão do A' } }))
      .rejects.toThrow(/já tem mudança não publicada/);

    const r = await proporVersao(env as never, U(A), { slug, motivo: MOTIVO, arquivos: { 'guia.md': '# Guia\n\nversão do A' }, forcar: true });
    expect(r).toContain('sobrescreveu');
  });

  it('arquivo idêntico ao que já está lá não cria versão nem entra na fila', async () => {
    await seedUser(A); const slug = fresh(); await seedPublished(slug);
    await proporVersao(env as never, U(A), { slug, motivo: MOTIVO, arquivos: { 'guia.md': '# Guia\n\nigual' } });
    const r = await proporVersao(env as never, U(A), { slug, motivo: MOTIVO, arquivos: { 'guia.md': '# Guia\n\nigual' } });
    expect(r).toContain('Nada mudou');
  });
});
