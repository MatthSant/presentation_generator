/* db — acesso tipado ao D1. Uma função por operação; nada de ORM.
 * Modelo: specs/001-fase1-mcp-templates/plan.md §D3. */

export type Role = 'editor' | 'leitor';

export interface User { email: string; name: string | null; org_id: string; role: Role; active: number; created_at: string }

export interface Template {
  slug: string; org_id: string; name: string; objective: string; when_to_use: string;
  published_version_id: string | null; draft_version_id: string | null;
}

export interface Version {
  id: string; slug: string; number: number; state: 'draft' | 'published';
  author_email: string | null; created_at: string; updated_at: string; published_at: string | null;
  manifest_json: string;
}

export interface TemplateFile { version_id: string; path: string; content: string }
export interface ContextTask { version_id: string; task_id: string; title: string; body_md: string; sort: number }
export interface GeneralContext { slug: string; org_id: string; title: string; body_md: string; author_email: string | null; updated_at: string }

/** Kit completo de uma versão: o que o MCP entrega e a UI edita. */
export interface Kit { template: Template; version: Version; files: TemplateFile[]; tasks: ContextTask[] }

const now = () => new Date().toISOString();

// ── usuários ────────────────────────────────────────────────────────────────

export async function getUser(db: D1Database, email: string): Promise<User | null> {
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase()).first<User>();
}

export async function upsertUser(db: D1Database, u: { email: string; name?: string | null; org_id: string; role: Role }): Promise<User> {
  const email = u.email.toLowerCase();
  await db.prepare(
    `INSERT INTO users (email, name, org_id, role) VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET name = COALESCE(excluded.name, users.name)`,
  ).bind(email, u.name ?? null, u.org_id, u.role).run();
  return (await getUser(db, email))!;
}

export async function setUserRole(db: D1Database, email: string, role: Role): Promise<void> {
  await db.prepare('UPDATE users SET role = ? WHERE email = ?').bind(role, email.toLowerCase()).run();
}

export async function setUserActive(db: D1Database, email: string, active: boolean): Promise<void> {
  await db.prepare('UPDATE users SET active = ? WHERE email = ?').bind(active ? 1 : 0, email.toLowerCase()).run();
}

export async function listUsers(db: D1Database, org_id: string): Promise<User[]> {
  return (await db.prepare('SELECT * FROM users WHERE org_id = ? ORDER BY email').bind(org_id).all<User>()).results;
}

// ── templates & versões ─────────────────────────────────────────────────────

export async function listTemplates(db: D1Database, org_id: string): Promise<Array<Template & { published_number: number | null; draft_number: number | null }>> {
  return (await db.prepare(
    `SELECT t.*, p.number AS published_number, d.number AS draft_number
       FROM templates t
       LEFT JOIN template_versions p ON p.id = t.published_version_id
       LEFT JOIN template_versions d ON d.id = t.draft_version_id
      WHERE t.org_id = ? ORDER BY t.name`,
  ).bind(org_id).all<Template & { published_number: number | null; draft_number: number | null }>()).results;
}

export async function getTemplate(db: D1Database, slug: string): Promise<Template | null> {
  return db.prepare('SELECT * FROM templates WHERE slug = ?').bind(slug).first<Template>();
}

export async function getVersion(db: D1Database, id: string): Promise<Version | null> {
  return db.prepare('SELECT * FROM template_versions WHERE id = ?').bind(id).first<Version>();
}

export async function getVersionFiles(db: D1Database, version_id: string): Promise<TemplateFile[]> {
  return (await db.prepare('SELECT * FROM template_files WHERE version_id = ? ORDER BY path').bind(version_id).all<TemplateFile>()).results;
}

export async function getContextTasks(db: D1Database, version_id: string): Promise<ContextTask[]> {
  return (await db.prepare('SELECT * FROM context_tasks WHERE version_id = ? ORDER BY sort, task_id').bind(version_id).all<ContextTask>()).results;
}

async function loadKit(db: D1Database, template: Template, version_id: string | null): Promise<Kit | null> {
  if (!version_id) return null;
  const version = await getVersion(db, version_id);
  if (!version) return null;
  const [files, tasks] = await Promise.all([getVersionFiles(db, version_id), getContextTasks(db, version_id)]);
  return { template, version, files, tasks };
}

/** Kit da versão PUBLICADA (o que o MCP serve). null = template inexistente ou sem publicada. */
export async function getPublishedKit(db: D1Database, slug: string): Promise<Kit | null> {
  const t = await getTemplate(db, slug);
  return t ? loadKit(db, t, t.published_version_id) : null;
}

/** Kit do RASCUNHO (o que a UI edita). */
export async function getDraftKit(db: D1Database, slug: string): Promise<Kit | null> {
  const t = await getTemplate(db, slug);
  return t ? loadKit(db, t, t.draft_version_id) : null;
}

export interface NewTemplateInput {
  slug: string; org_id: string; name: string; objective?: string; when_to_use?: string;
  manifest: unknown; files: Array<{ path: string; content: string }>;
  tasks: Array<{ task_id: string; title: string; body_md: string; sort?: number }>;
  author_email?: string | null;
}

/** Cria o template com a versão 1 já como RASCUNHO (publicar é passo explícito). */
export async function createTemplate(db: D1Database, input: NewTemplateInput): Promise<Version> {
  const vid = crypto.randomUUID();
  const stmts = [
    db.prepare('INSERT INTO templates (slug, org_id, name, objective, when_to_use, draft_version_id) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(input.slug, input.org_id, input.name, input.objective ?? '', input.when_to_use ?? '', vid),
    db.prepare('INSERT INTO template_versions (id, slug, number, state, author_email, manifest_json) VALUES (?, ?, 1, ?, ?, ?)')
      .bind(vid, input.slug, 'draft', input.author_email ?? null, JSON.stringify(input.manifest)),
    ...input.files.map((f) => db.prepare('INSERT INTO template_files (version_id, path, content) VALUES (?, ?, ?)').bind(vid, f.path, f.content)),
    ...input.tasks.map((t, i) => db.prepare('INSERT INTO context_tasks (version_id, task_id, title, body_md, sort) VALUES (?, ?, ?, ?, ?)').bind(vid, t.task_id, t.title, t.body_md, t.sort ?? i)),
  ];
  await db.batch(stmts);
  return (await getVersion(db, vid))!;
}

/** Garante um rascunho: se não existe, copia a publicada (number+1). Devolve o rascunho. */
export async function ensureDraft(db: D1Database, slug: string, author_email: string | null): Promise<Version> {
  const t = await getTemplate(db, slug);
  if (!t) throw new Error(`template inexistente: ${slug}`);
  if (t.draft_version_id) return (await getVersion(db, t.draft_version_id))!;
  if (!t.published_version_id) throw new Error(`template sem versão: ${slug}`);
  const pub = (await getVersion(db, t.published_version_id))!;
  const vid = crypto.randomUUID();
  await db.batch([
    db.prepare('INSERT INTO template_versions (id, slug, number, state, author_email, manifest_json) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(vid, slug, pub.number + 1, 'draft', author_email, pub.manifest_json),
    db.prepare('INSERT INTO template_files (version_id, path, content) SELECT ?, path, content FROM template_files WHERE version_id = ?').bind(vid, pub.id),
    db.prepare('INSERT INTO context_tasks (version_id, task_id, title, body_md, sort) SELECT ?, task_id, title, body_md, sort FROM context_tasks WHERE version_id = ?').bind(vid, pub.id),
    db.prepare('UPDATE templates SET draft_version_id = ? WHERE slug = ?').bind(vid, slug),
  ]);
  return (await getVersion(db, vid))!;
}

async function touch(db: D1Database, version_id: string): Promise<void> {
  await db.prepare('UPDATE template_versions SET updated_at = ? WHERE id = ?').bind(now(), version_id).run();
}

export async function saveManifest(db: D1Database, version_id: string, manifest: unknown): Promise<void> {
  await db.prepare('UPDATE template_versions SET manifest_json = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(manifest), now(), version_id).run();
}

export async function saveFile(db: D1Database, version_id: string, path: string, content: string): Promise<void> {
  await db.prepare('INSERT INTO template_files (version_id, path, content) VALUES (?, ?, ?) ON CONFLICT(version_id, path) DO UPDATE SET content = excluded.content')
    .bind(version_id, path, content).run();
  await touch(db, version_id);
}

export async function deleteFile(db: D1Database, version_id: string, path: string): Promise<void> {
  await db.prepare('DELETE FROM template_files WHERE version_id = ? AND path = ?').bind(version_id, path).run();
  await touch(db, version_id);
}

export async function saveContextTask(db: D1Database, version_id: string, t: { task_id: string; title: string; body_md: string; sort?: number }): Promise<void> {
  await db.prepare(
    `INSERT INTO context_tasks (version_id, task_id, title, body_md, sort) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(version_id, task_id) DO UPDATE SET title = excluded.title, body_md = excluded.body_md, sort = excluded.sort`,
  ).bind(version_id, t.task_id, t.title, t.body_md, t.sort ?? 0).run();
  await touch(db, version_id);
}

export async function updateTemplateMeta(db: D1Database, slug: string, m: { name?: string; objective?: string; when_to_use?: string }): Promise<void> {
  const t = await getTemplate(db, slug);
  if (!t) throw new Error(`template inexistente: ${slug}`);
  await db.prepare('UPDATE templates SET name = ?, objective = ?, when_to_use = ? WHERE slug = ?')
    .bind(m.name ?? t.name, m.objective ?? t.objective, m.when_to_use ?? t.when_to_use, slug).run();
}

/** Publica o rascunho: vira a versão publicada; o draft_version_id é limpo. */
export async function publishDraft(db: D1Database, slug: string): Promise<Version> {
  const t = await getTemplate(db, slug);
  if (!t?.draft_version_id) throw new Error(`sem rascunho para publicar: ${slug}`);
  const ts = now();
  await db.batch([
    db.prepare('UPDATE template_versions SET state = ?, published_at = ? WHERE id = ?').bind('published', ts, t.draft_version_id),
    db.prepare('UPDATE templates SET published_version_id = ?, draft_version_id = NULL WHERE slug = ?').bind(t.draft_version_id, slug),
  ]);
  return (await getVersion(db, t.draft_version_id))!;
}

// ── contextos gerais ────────────────────────────────────────────────────────

export async function listGeneralContexts(db: D1Database, org_id: string): Promise<GeneralContext[]> {
  return (await db.prepare('SELECT * FROM general_contexts WHERE org_id = ? ORDER BY title').bind(org_id).all<GeneralContext>()).results;
}

export async function upsertGeneralContext(db: D1Database, g: { slug: string; org_id: string; title: string; body_md: string; author_email?: string | null }): Promise<void> {
  await db.prepare(
    `INSERT INTO general_contexts (slug, org_id, title, body_md, author_email, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET title = excluded.title, body_md = excluded.body_md, author_email = excluded.author_email, updated_at = excluded.updated_at`,
  ).bind(g.slug, g.org_id, g.title, g.body_md, g.author_email ?? null, now()).run();
}

export async function deleteGeneralContext(db: D1Database, slug: string): Promise<void> {
  await db.prepare('DELETE FROM general_contexts WHERE slug = ?').bind(slug).run();
}

// ── uso ─────────────────────────────────────────────────────────────────────

export async function logUsage(db: D1Database, e: { email: string; tool: string; slug?: string | null; version_number?: number | null }): Promise<void> {
  await db.prepare('INSERT INTO usage_log (email, tool, slug, version_number) VALUES (?, ?, ?, ?)')
    .bind(e.email, e.tool, e.slug ?? null, e.version_number ?? null).run();
}
