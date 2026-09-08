/* curate — atividade → guia do template (spec 002 US2). "Virar exemplo" e "virar regra"
 * editam o guia.md do RASCUNHO (nunca a publicada) e marcam a entrada. Idempotentes. */

import { CONTEXTO_TIPOS, ensureDraft, getActivity, getTemplateRules, getVersionFiles, saveFile, saveTemplateRule, setActivityVeredito, updateActivityEditor, type ContextoTipo } from '../db/index.js';

const SEC_EXEMPLOS = '## Exemplos de aprofundamento';

/** id curto e estável a partir do texto da regra (a-z0-9-). */
function ruleId(texto: string): string {
  const base = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 6).join('-');
  return (base || 'regra').slice(0, 48);
}

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
  await setActivityVeredito(db, a.id, 'exemplo', editorEmail);
  return { ok: true, slug: a.slug };
}

export async function virarRegra(db: D1Database, activityId: string, editorEmail: string, texto?: string): Promise<{ ok: true; slug: string } | { ok: false; motivo: string }> {
  const a = await getActivity(db, activityId);
  if (!a) return { ok: false, motivo: 'atividade não existe' };
  if (a.virou_regra) return { ok: false, motivo: 'esta entrada já virou regra' };
  // sugestão do agente: título, tipo e corpo já vêm no registro; o editor só aceita
  let sug: { tipo?: string; titulo?: string; corpo?: string } = {};
  if (a.evento === 'sugestao') { try { sug = JSON.parse(a.dados_json) as typeof sug; } catch { /* ignora */ } }
  const regra = (texto || sug.titulo || a.motivo || '').trim();
  if (!regra) return { ok: false, motivo: 'sem motivo de descarte nem texto da regra' };
  const tipo: ContextoTipo = CONTEXTO_TIPOS.find((x) => x === sug.tipo) ?? 'regra';
  const corpo = a.evento === 'sugestao'
    ? `${(sug.corpo || '').trim()}\n\nSugerida pelo agente. <!-- atividade:${a.id} -->`.trim()
    : `Veio de um aprofundamento descartado pelo editor. <!-- atividade:${a.id} -->`;
  // A regra vira ENTRADA no rascunho (o título é a regra), não mais um bullet no guia.
  const d = await ensureDraft(db, a.slug, editorEmail);
  const existentes = await getTemplateRules(db, d.id);
  let id = ruleId(regra);
  if (existentes.some((r) => r.rule_id === id)) id = `${id}-${existentes.length + 1}`.slice(0, 48);
  await saveTemplateRule(db, d.id, { rule_id: id, tipo, title: regra, body_md: corpo, sort: existentes.length });
  await updateActivityEditor(db, a.id, { virou_regra: true });
  await setActivityVeredito(db, a.id, 'regra', editorEmail);
  return { ok: true, slug: a.slug };
}
