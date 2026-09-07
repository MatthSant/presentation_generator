import { env } from 'cloudflare:test';
import * as db from '../src/db/index.js';

export const ORG = 'witly';

/** Template mínimo mas completo (7 partes) para os testes de kit/MCP. */
export const SAMPLE_MANIFEST = {
  params: [
    { id: 'field_conversion', type: 'string', required: true, task_id: 'lancamento', desc: 'id do lançamento' },
    { id: 'data_corte', type: 'date', required: false },
    { id: 'tipo_funil', type: 'enum', enum: ['classico', 'pago'], required: true },
    { id: 'limite', type: 'number', required: false, default: 10 },
  ],
  queries: [{ id: 'dump', file: 'queries/dump.sql', title: 'Dump diário' }],
  tarefas_contexto: [{ id: 'lancamento', objetivo: 'identificar o lançamento', saida: 'config.field_conversion' }],
};

export const SAMPLE_FILES = [
  { path: 'queries/dump.sql', content: "SELECT * FROM v WHERE fc = {{field_conversion}} AND tipo = {{tipo_funil}} LIMIT {{limite}}" },
  { path: 'python/gerar.py', content: 'print("ok")' },
  { path: 'documento.md', content: '# Documento\n{{numeros.leads}}' },
  { path: 'guia.md', content: '# Guia\nLeia com cuidado.' },
  { path: 'exemplo.html', content: '<html>exemplo</html>' },
];

export async function seedPublished(slug = 'acompanhamento-diario') {
  await db.createTemplate(env.DB, {
    slug, org_id: ORG, name: 'Acompanhamento diário', objective: 'acompanhar a campanha', when_to_use: 'durante o lançamento',
    manifest: SAMPLE_MANIFEST, files: SAMPLE_FILES,
    tasks: [{ task_id: 'lancamento', title: 'Identificar o lançamento', body_md: 'Liste candidatos em wtl_campaign_definition.' }],
    author_email: 'dono@witly.digital',
  });
  return db.publishDraft(env.DB, slug);
}

export async function seedUser(email: string, role: db.Role = 'leitor') {
  return db.upsertUser(env.DB, { email, org_id: ORG, role });
}
