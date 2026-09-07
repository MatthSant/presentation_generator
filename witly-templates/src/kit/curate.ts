/* curate — atividade → guia do template (spec 002 US2). "Virar exemplo" e "virar regra"
 * editam o guia.md do RASCUNHO (nunca a publicada) e marcam a entrada. Idempotentes. */

import { ensureDraft, getActivity, getVersionFiles, saveFile, updateActivityEditor } from '../db/index.js';

const SEC_EXEMPLOS = '## Exemplos de aprofundamento';
const SEC_REGRAS = '## O que NÃO concluir';

function appendUnderSection(md: string, section: string, block: string): string {
  const idx = md.indexOf(section);
  if (idx === -1) return `${md.replace(/\s+$/, '')}\n\n${section}\n\n${block}\n`;
  // fim da seção = próximo "## " depois dela (ou fim do arquivo)
  const after = md.indexOf('\n## ', idx + section.length);
  const end = after === -1 ? md.length : after;
  const body = md.slice(idx, end).replace(/\s+$/, '');
  return `${md.slice(0, idx)}${body}\n\n${block}\n${md.slice(end)}`;
}

async function guiaDoRascunho(db: D1Database, slug: string, email: string): Promise<{ vid: string; guia: string }> {
  const d = await ensureDraft(db, slug, email);
  const f = (await getVersionFiles(db, d.id)).find((x) => x.path === 'guia.md');
  return { vid: d.id, guia: f?.content ?? `# Guia de leitura\n` };
}

export async function virarExemplo(db: D1Database, activityId: string, editorEmail: string): Promise<{ ok: true; slug: string } | { ok: false; motivo: string }> {
  const a = await getActivity(db, activityId);
  if (!a) return { ok: false, motivo: 'atividade não existe' };
  if (a.evento !== 'aprofundamento') return { ok: false, motivo: 'só aprofundamentos viram exemplo' };
  if (a.virou_exemplo) return { ok: false, motivo: 'esta entrada já virou exemplo' };
  const dados = JSON.parse(a.dados_json) as { pergunta?: string; resposta?: string };
  if (!dados.pergunta) return { ok: false, motivo: 'entrada sem pergunta' };
  const { vid, guia } = await guiaDoRascunho(db, a.slug, editorEmail);
  const block = `### ${dados.pergunta.trim()}\n\n${(dados.resposta || '').trim() || '_(sem resposta registrada)_'}\n\n<!-- atividade:${a.id} -->`;
  await saveFile(db, vid, 'guia.md', appendUnderSection(guia, SEC_EXEMPLOS, block));
  await updateActivityEditor(db, a.id, { virou_exemplo: true });
  return { ok: true, slug: a.slug };
}

export async function virarRegra(db: D1Database, activityId: string, editorEmail: string, texto?: string): Promise<{ ok: true; slug: string } | { ok: false; motivo: string }> {
  const a = await getActivity(db, activityId);
  if (!a) return { ok: false, motivo: 'atividade não existe' };
  if (a.virou_regra) return { ok: false, motivo: 'esta entrada já virou regra' };
  const regra = (texto || a.motivo || '').trim();
  if (!regra) return { ok: false, motivo: 'sem motivo de descarte nem texto da regra' };
  const { vid, guia } = await guiaDoRascunho(db, a.slug, editorEmail);
  await saveFile(db, vid, 'guia.md', appendUnderSection(guia, SEC_REGRAS, `- ${regra} <!-- atividade:${a.id} -->`));
  await updateActivityEditor(db, a.id, { virou_regra: true });
  return { ok: true, slug: a.slug };
}
