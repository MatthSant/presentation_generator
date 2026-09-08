/* personal — templates pessoais salvos pelo agente (spec 002 US6).
 * salvar_template: cria (ou publica versão nova de) um template do PRÓPRIO usuário, já
 * publicado (não há revisor num pessoal). remover_template: só o dono. */

import { createTemplate, deleteTemplate, getTemplate, isOwner, publishNewVersion, updateTemplateMeta } from '../db/index.js';
import { checkPii, piiMessage } from './pii.js';
import { ToolError, type ToolEnv, type ToolUser } from './tools.js';

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const PATH_RE = /^(?!\.)(?!.*\.\.)[A-Za-z0-9_./-]{1,200}$/;
const TASK_RE = /^[a-z0-9_-]{1,64}$/;
export const MAX_FILE_BYTES = 1024 * 1024;

export interface SalvarTemplateInput {
  slug: string;
  name: string;
  objective?: string;
  when_to_use?: string;
  manifest?: unknown;
  /** caminho → conteúdo (queries/*.sql, python/*.py, guia.md, documento.md, perguntas.md…) */
  arquivos?: Record<string, string>;
  /** tarefa → { title, body_md } */
  contexto?: Record<string, { title?: string; body_md?: string }>;
  notas?: string;
  changelog?: string;
}

export async function salvarTemplate(env: ToolEnv, user: ToolUser, input: SalvarTemplateInput): Promise<string> {
  const slug = String(input.slug || '').trim().toLowerCase();
  if (!SLUG_RE.test(slug)) throw new ToolError('slug inválido: use a-z, 0-9 e hífen (2–64 caracteres)');
  const name = String(input.name || '').trim();
  if (!name) throw new ToolError('name obrigatório');

  const files: Array<{ path: string; content: string }> = [];
  const enc = new TextEncoder();
  for (const [path, content] of Object.entries(input.arquivos || {})) {
    if (!PATH_RE.test(path)) throw new ToolError(`caminho inválido: ${path}`);
    if (typeof content !== 'string') throw new ToolError(`conteúdo de ${path} deve ser texto`);
    if (enc.encode(content).length > MAX_FILE_BYTES) throw new ToolError(`${path} passa de 1 MB`);
    files.push({ path, content });
  }
  const tasks: Array<{ task_id: string; title: string; body_md: string; sort: number }> = [];
  let i = 0;
  for (const [task_id, t] of Object.entries(input.contexto || {})) {
    if (!TASK_RE.test(task_id)) throw new ToolError(`id de tarefa inválido: ${task_id}`);
    tasks.push({ task_id, title: String(t?.title || task_id).trim(), body_md: String(t?.body_md || ''), sort: i++ });
  }
  const manifest = input.manifest && typeof input.manifest === 'object' ? input.manifest : { params: [], queries: [], tarefas_contexto: [] };

  const pii = checkPii({ name, objective: input.objective, when_to_use: input.when_to_use, manifest, files, tasks, notas: input.notas }, [user.email]);
  if (!pii.ok) throw new ToolError(piiMessage(pii));

  const existing = await getTemplate(env.DB, slug);
  if (existing && !isOwner(existing, user.email)) {
    throw new ToolError(existing.owner_email ? `o slug "${slug}" já é de outra pessoa; escolha outro` : `o slug "${slug}" é de um template da organização; escolha outro (ex.: ${slug}-${user.email.split('@')[0]})`);
  }
  if (!existing) {
    const v = await createTemplate(env.DB, {
      slug, org_id: env.ORG_ID, name, objective: input.objective ?? '', when_to_use: input.when_to_use ?? '',
      manifest, files, tasks, author_email: user.email, owner_email: user.email, notas: input.notas ?? '', publish: true,
    });
    return `template pessoal criado: ${slug} v${v.semver ?? v.number} (só você vê; um editor pode promover para todos na UI)`;
  }
  await updateTemplateMeta(env.DB, slug, { name, objective: input.objective ?? existing.objective, when_to_use: input.when_to_use ?? existing.when_to_use });
  const v = await publishNewVersion(env.DB, slug, { manifest, files, tasks, author_email: user.email, changelog: input.changelog ?? 'salvo pelo agente' });
  return `template pessoal atualizado: ${slug} v${v.semver ?? v.number}`;
}

export async function removerTemplate(env: ToolEnv, user: ToolUser, slug: string): Promise<string> {
  const t = await getTemplate(env.DB, slug);
  if (!t) throw new ToolError(`template "${slug}" não existe`);
  if (!isOwner(t, user.email)) throw new ToolError(t.owner_email ? 'só o dono remove um template pessoal' : 'templates da organização só são removidos por editores na UI');
  await deleteTemplate(env.DB, slug);
  return `template pessoal removido: ${slug} (a atividade dele fica no histórico)`;
}
