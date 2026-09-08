/* db — acesso tipado ao D1. Uma função por operação; nada de ORM.
 * Modelo: specs/001-fase1-mcp-templates/plan.md §D3. */

import { nextSemver, type Bump } from './semver.js';

export type Role = 'editor' | 'leitor';

export interface User { email: string; name: string | null; org_id: string; role: Role; active: number; created_at: string }

export interface Template {
  slug: string; org_id: string; name: string; objective: string; when_to_use: string;
  published_version_id: string | null; draft_version_id: string | null;
  /** NULL = da organização; e-mail = template pessoal do dono. */
  owner_email: string | null; promoted_from: string | null; notas: string;
}

export interface Version {
  id: string; slug: string; number: number;
  /** Versão semântica visível (v1.0.2); NULL em rascunho até publicar. */
  semver: string | null; state: 'draft' | 'published';
  author_email: string | null; created_at: string; updated_at: string; published_at: string | null;
  manifest_json: string; changelog: string;
}

export interface Activity {
  id: string; org_id: string; email: string; evento: 'geracao' | 'aprofundamento' | 'edicao';
  slug: string; version_number: number | null; cliente: string | null; pergunta_id: string | null;
  dados_json: string; avaliacao: number | null; descartado: number; motivo: string | null;
  editor_nota: number | null; editor_comentario: string | null; virou_exemplo: number; virou_regra: number;
  veredito: Veredito | null; veredito_por: string | null; veredito_em: string | null;
  origem: 'mcp' | 'app'; at: string;
}

/** O que o editor decidiu sobre um aprofundamento; NULL = ainda na fila de revisão. */
export type Veredito = 'exemplo' | 'regra' | 'descarte' | 'ok';
export const VEREDITOS: Veredito[] = ['exemplo', 'regra', 'descarte', 'ok'];

export interface Rating { id: string; org_id: string; slug: string; version_number: number | null; email: string; nota: number; comentario: string | null; at: string }

export interface TemplateFile { version_id: string; path: string; content: string }
export interface ContextTask { version_id: string; task_id: string; title: string; body_md: string; sort: number }
/** Regra da análise: o TÍTULO é a regra; `tipo` diz o peso (mesma taxonomia dos contextos gerais). */
export interface TemplateRule { version_id: string; rule_id: string; tipo: ContextoTipo; title: string; body_md: string; sort: number }
export type ContextoTipo = 'regra' | 'recomendacao' | 'definicao';
export interface GeneralContext { slug: string; org_id: string; title: string; body_md: string; tipo: ContextoTipo; author_email: string | null; updated_at: string }

/** Kit completo de uma versão: o que o MCP entrega e a UI edita. */
export interface Kit { template: Template; version: Version; files: TemplateFile[]; tasks: ContextTask[]; rules: TemplateRule[] }

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

export type TemplateRow = Template & { published_number: number | null; draft_number: number | null; published_semver: string | null; publicada_em: string | null; geracoes: number; aprofundamentos: number; ultimo_uso: string | null };

/** Templates visíveis: os da organização + os pessoais do `viewer`. `viewer='*'` = todos (editor na UI). */
export async function listTemplates(db: D1Database, org_id: string, viewer: string | '*' = '*'): Promise<TemplateRow[]> {
  const where = viewer === '*' ? '' : ' AND (t.owner_email IS NULL OR t.owner_email = ?)';
  const stmt = db.prepare(
    `SELECT t.*, p.number AS published_number, d.number AS draft_number, p.semver AS published_semver,
            p.published_at AS publicada_em,
            (SELECT COUNT(*) FROM activity a WHERE a.slug = t.slug AND a.evento = 'geracao') AS geracoes,
            (SELECT COUNT(*) FROM activity a WHERE a.slug = t.slug AND a.evento = 'aprofundamento') AS aprofundamentos,
            (SELECT MAX(a.at) FROM activity a WHERE a.slug = t.slug) AS ultimo_uso
       FROM templates t
       LEFT JOIN template_versions p ON p.id = t.published_version_id
       LEFT JOIN template_versions d ON d.id = t.draft_version_id
      WHERE t.org_id = ?${where} ORDER BY t.owner_email IS NOT NULL, t.name`,
  );
  return (await (viewer === '*' ? stmt.bind(org_id) : stmt.bind(org_id, viewer.toLowerCase())).all<TemplateRow>()).results;
}

/** Só os pessoais (UI "Pessoais"): todos para editor, os seus para leitor. */
export async function listPersonal(db: D1Database, org_id: string, viewer: string | '*'): Promise<Array<TemplateRow & { geracoes: number; aprofundamentos: number }>> {
  const where = viewer === '*' ? '' : ' AND t.owner_email = ?';
  const stmt = db.prepare(
    `SELECT t.*, p.number AS published_number, d.number AS draft_number, p.semver AS published_semver,
            (SELECT COUNT(*) FROM activity a WHERE a.slug = t.slug AND a.evento = 'geracao') AS geracoes,
            (SELECT COUNT(*) FROM activity a WHERE a.slug = t.slug AND a.evento = 'aprofundamento') AS aprofundamentos
       FROM templates t
       LEFT JOIN template_versions p ON p.id = t.published_version_id
       LEFT JOIN template_versions d ON d.id = t.draft_version_id
      WHERE t.org_id = ? AND t.owner_email IS NOT NULL${where} ORDER BY t.owner_email, t.name`,
  );
  return (await (viewer === '*' ? stmt.bind(org_id) : stmt.bind(org_id, viewer.toLowerCase())).all<TemplateRow & { geracoes: number; aprofundamentos: number }>()).results;
}

/** Quem enxerga um template: org = todos; pessoal = só o dono (editores veem na UI via listPersonal). */
export function canSee(t: Pick<Template, 'owner_email'>, email: string): boolean {
  return t.owner_email == null || t.owner_email === email.toLowerCase();
}
export function isOwner(t: Pick<Template, 'owner_email'>, email: string): boolean {
  return t.owner_email != null && t.owner_email === email.toLowerCase();
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

export async function getTemplateRules(db: D1Database, version_id: string): Promise<TemplateRule[]> {
  return (await db.prepare("SELECT * FROM template_rules WHERE version_id = ? ORDER BY CASE tipo WHEN 'regra' THEN 0 WHEN 'definicao' THEN 1 ELSE 2 END, sort, rule_id").bind(version_id).all<TemplateRule>()).results;
}

async function loadKit(db: D1Database, template: Template, version_id: string | null): Promise<Kit | null> {
  if (!version_id) return null;
  const version = await getVersion(db, version_id);
  if (!version) return null;
  const [files, tasks, rules] = await Promise.all([getVersionFiles(db, version_id), getContextTasks(db, version_id), getTemplateRules(db, version_id)]);
  return { template, version, files, tasks, rules };
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
  rules?: Array<{ rule_id: string; tipo?: ContextoTipo; title: string; body_md?: string; sort?: number }>;
  author_email?: string | null;
  /** Template pessoal: e-mail do dono. */
  owner_email?: string | null;
  notas?: string;
  /** true = já nasce publicado (templates pessoais salvos pelo MCP). */
  publish?: boolean;
}

/** Cria o template com a versão 1 já como RASCUNHO (publicar é passo explícito). */
export async function createTemplate(db: D1Database, input: NewTemplateInput): Promise<Version> {
  const vid = crypto.randomUUID();
  const pub = !!input.publish;
  const stmts = [
    db.prepare('INSERT INTO templates (slug, org_id, name, objective, when_to_use, draft_version_id, published_version_id, owner_email, notas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(input.slug, input.org_id, input.name, input.objective ?? '', input.when_to_use ?? '', pub ? null : vid, pub ? vid : null, input.owner_email?.toLowerCase() ?? null, input.notas ?? ''),
    db.prepare('INSERT INTO template_versions (id, slug, number, state, author_email, manifest_json, published_at, semver) VALUES (?, ?, 1, ?, ?, ?, ?, ?)')
      .bind(vid, input.slug, pub ? 'published' : 'draft', input.author_email ?? null, JSON.stringify(input.manifest), pub ? now() : null, pub ? '1.0.0' : null),
    ...input.files.map((f) => db.prepare('INSERT INTO template_files (version_id, path, content) VALUES (?, ?, ?)').bind(vid, f.path, f.content)),
    ...input.tasks.map((t, i) => db.prepare('INSERT INTO context_tasks (version_id, task_id, title, body_md, sort) VALUES (?, ?, ?, ?, ?)').bind(vid, t.task_id, t.title, t.body_md, t.sort ?? i)),
    ...(input.rules ?? []).map((r, i) => db.prepare('INSERT INTO template_rules (version_id, rule_id, tipo, title, body_md, sort) VALUES (?, ?, ?, ?, ?, ?)').bind(vid, r.rule_id, r.tipo ?? 'regra', r.title, r.body_md ?? '', r.sort ?? i)),
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
    db.prepare('INSERT INTO template_rules (version_id, rule_id, tipo, title, body_md, sort) SELECT ?, rule_id, tipo, title, body_md, sort FROM template_rules WHERE version_id = ?').bind(vid, pub.id),
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

export async function saveTemplateRule(db: D1Database, version_id: string, r: { rule_id: string; tipo?: ContextoTipo; title: string; body_md?: string; sort?: number }): Promise<void> {
  await db.prepare(
    `INSERT INTO template_rules (version_id, rule_id, tipo, title, body_md, sort) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(version_id, rule_id) DO UPDATE SET tipo = excluded.tipo, title = excluded.title, body_md = excluded.body_md, sort = excluded.sort`,
  ).bind(version_id, r.rule_id, r.tipo ?? 'regra', r.title, r.body_md ?? '', r.sort ?? 0).run();
  await touch(db, version_id);
}

export async function deleteTemplateRule(db: D1Database, version_id: string, rule_id: string): Promise<void> {
  await db.prepare('DELETE FROM template_rules WHERE version_id = ? AND rule_id = ?').bind(version_id, rule_id).run();
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
export async function publishDraft(db: D1Database, slug: string, changelog = '', bump: Bump = 'patch'): Promise<Version> {
  const t = await getTemplate(db, slug);
  if (!t?.draft_version_id) throw new Error(`sem rascunho para publicar: ${slug}`);
  const ts = now();
  const cur = t.published_version_id ? (await getVersion(db, t.published_version_id))?.semver : null;
  await db.batch([
    db.prepare('UPDATE template_versions SET state = ?, published_at = ?, changelog = ?, semver = ? WHERE id = ?').bind('published', ts, changelog, nextSemver(cur, bump), t.draft_version_id),
    db.prepare('UPDATE templates SET published_version_id = ?, draft_version_id = NULL WHERE slug = ?').bind(t.draft_version_id, slug),
  ]);
  return (await getVersion(db, t.draft_version_id))!;
}

/** Publica uma versão NOVA já pronta (pessoal salvo pelo MCP): número max+1, publicada na hora. */
export async function publishNewVersion(db: D1Database, slug: string, v: { manifest: unknown; files: Array<{ path: string; content: string }>; tasks: Array<{ task_id: string; title: string; body_md: string; sort?: number }>; rules?: Array<{ rule_id: string; tipo?: ContextoTipo; title: string; body_md?: string; sort?: number }>; author_email: string | null; changelog?: string; bump?: Bump }): Promise<Version> {
  const vid = crypto.randomUUID();
  const ts = now();
  const t = await getTemplate(db, slug);
  const cur = t?.published_version_id ? (await getVersion(db, t.published_version_id))?.semver : null;
  await db.batch([
    db.prepare('INSERT INTO template_versions (id, slug, number, state, author_email, manifest_json, published_at, changelog, semver) VALUES (?, ?, COALESCE((SELECT MAX(number) FROM template_versions WHERE slug = ?), 0) + 1, ?, ?, ?, ?, ?, ?)')
      .bind(vid, slug, slug, 'published', v.author_email, JSON.stringify(v.manifest), ts, v.changelog ?? '', nextSemver(cur, v.bump ?? 'patch')),
    ...v.files.map((f) => db.prepare('INSERT INTO template_files (version_id, path, content) VALUES (?, ?, ?)').bind(vid, f.path, f.content)),
    ...v.tasks.map((t, i) => db.prepare('INSERT INTO context_tasks (version_id, task_id, title, body_md, sort) VALUES (?, ?, ?, ?, ?)').bind(vid, t.task_id, t.title, t.body_md, t.sort ?? i)),
    ...(v.rules ?? []).map((r, i) => db.prepare('INSERT INTO template_rules (version_id, rule_id, tipo, title, body_md, sort) VALUES (?, ?, ?, ?, ?, ?)').bind(vid, r.rule_id, r.tipo ?? 'regra', r.title, r.body_md ?? '', r.sort ?? i)),
    db.prepare('UPDATE templates SET published_version_id = ? WHERE slug = ?').bind(vid, slug),
  ]);
  return (await getVersion(db, vid))!;
}

export async function listVersions(db: D1Database, slug: string): Promise<Version[]> {
  return (await db.prepare('SELECT * FROM template_versions WHERE slug = ? ORDER BY number DESC').bind(slug).all<Version>()).results;
}

export async function getVersionByNumber(db: D1Database, slug: string, number: number): Promise<Version | null> {
  return db.prepare('SELECT * FROM template_versions WHERE slug = ? AND number = ?').bind(slug, number).first<Version>();
}

/** Restaura a versão `number` como RASCUNHO novo (max+1). Substitui o rascunho atual, se houver. */
export async function restoreVersion(db: D1Database, slug: string, number: number, author_email: string | null): Promise<Version> {
  const t = await getTemplate(db, slug);
  if (!t) throw new Error(`template inexistente: ${slug}`);
  const src = await getVersionByNumber(db, slug, number);
  if (!src) throw new Error(`versão ${number} não existe`);
  const vid = crypto.randomUUID();
  const stmts: D1PreparedStatement[] = [];
  if (t.draft_version_id) stmts.push(db.prepare('DELETE FROM template_versions WHERE id = ?').bind(t.draft_version_id));
  stmts.push(
    db.prepare('INSERT INTO template_versions (id, slug, number, state, author_email, manifest_json, changelog) VALUES (?, ?, (SELECT MAX(number) FROM template_versions WHERE slug = ?) + 1, ?, ?, ?, ?)')
      .bind(vid, slug, slug, 'draft', author_email, src.manifest_json, `restaurada da v${src.semver ?? number}`),
    db.prepare('INSERT INTO template_files (version_id, path, content) SELECT ?, path, content FROM template_files WHERE version_id = ?').bind(vid, src.id),
    db.prepare('INSERT INTO context_tasks (version_id, task_id, title, body_md, sort) SELECT ?, task_id, title, body_md, sort FROM context_tasks WHERE version_id = ?').bind(vid, src.id),
    db.prepare('INSERT INTO template_rules (version_id, rule_id, tipo, title, body_md, sort) SELECT ?, rule_id, tipo, title, body_md, sort FROM template_rules WHERE version_id = ?').bind(vid, src.id),
    db.prepare('UPDATE templates SET draft_version_id = ? WHERE slug = ?').bind(vid, slug),
  );
  await db.batch(stmts);
  return (await getVersion(db, vid))!;
}

/** Promove um pessoal para a organização. `newSlug` quando o slug colide com um da org. */
export async function promoteTemplate(db: D1Database, slug: string, newSlug?: string): Promise<Template> {
  const t = await getTemplate(db, slug);
  if (!t?.owner_email) throw new Error('não é um template pessoal');
  const target = newSlug && newSlug !== slug ? newSlug : slug;
  const stmts: D1PreparedStatement[] = [];
  if (target !== slug) {
    if (await getTemplate(db, target)) throw new Error(`slug ${target} já existe`);
    stmts.push(
      db.prepare('INSERT INTO templates (slug, org_id, name, objective, when_to_use, published_version_id, draft_version_id, owner_email, promoted_from, notas) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)')
        .bind(target, t.org_id, t.name, t.objective, t.when_to_use, t.published_version_id, t.draft_version_id, t.owner_email, t.notas),
      db.prepare('UPDATE template_versions SET slug = ? WHERE slug = ?').bind(target, slug),
      db.prepare('UPDATE activity SET slug = ? WHERE slug = ?').bind(target, slug),
      db.prepare('UPDATE template_ratings SET slug = ? WHERE slug = ?').bind(target, slug),
      db.prepare('DELETE FROM templates WHERE slug = ?').bind(slug),
    );
  } else {
    stmts.push(db.prepare('UPDATE templates SET owner_email = NULL, promoted_from = ? WHERE slug = ?').bind(t.owner_email, slug));
  }
  await db.batch(stmts);
  return (await getTemplate(db, target))!;
}

/** Remove um template e suas versões (arquivos/tarefas caem por CASCADE). Atividade fica (histórico). */
export async function deleteTemplate(db: D1Database, slug: string): Promise<void> {
  await db.batch([
    db.prepare('UPDATE templates SET published_version_id = NULL, draft_version_id = NULL WHERE slug = ?').bind(slug),
    db.prepare('DELETE FROM template_versions WHERE slug = ?').bind(slug),
    db.prepare('DELETE FROM templates WHERE slug = ?').bind(slug),
  ]);
}

// ── atividade & avaliações ──────────────────────────────────────────────────

export interface NewActivity {
  org_id: string; email: string; evento: Activity['evento']; slug: string; version_number?: number | null;
  cliente?: string | null; pergunta_id?: string | null; dados: unknown; avaliacao?: number | null;
  descartado?: boolean; motivo?: string | null; origem?: 'mcp' | 'app'; at?: string;
}

export async function insertActivity(db: D1Database, a: NewActivity): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO activity (id, org_id, email, evento, slug, version_number, cliente, pergunta_id, dados_json, avaliacao, descartado, motivo, origem, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`,
  ).bind(id, a.org_id, a.email.toLowerCase(), a.evento, a.slug, a.version_number ?? null, a.cliente ?? null, a.pergunta_id ?? null,
    JSON.stringify(a.dados ?? {}), a.avaliacao ?? null, a.descartado ? 1 : 0, a.motivo ?? null, a.origem ?? 'mcp', a.at ?? null).run();
  return id;
}

export interface ActivityFilter {
  email?: string; slug?: string; cliente?: string; evento?: string; desde?: string; ate?: string;
  avaliacao?: number; descartado?: boolean; limit?: number; offset?: number;
  /** 'sem' = ainda na fila de revisão; um veredito = só os assim decididos. */
  veredito?: 'sem' | Veredito;
  /** busca livre em pergunta/resposta (dados_json), cliente e e-mail */
  busca?: string;
}

/** WHERE compartilhado por listActivity e countActivity. */
function activityWhere(org_id: string, f: ActivityFilter): { sql: string; bind: unknown[] } {
  const w: string[] = ['org_id = ?']; const b: unknown[] = [org_id];
  if (f.email) { w.push('email = ?'); b.push(f.email.toLowerCase()); }
  if (f.slug) { w.push('slug = ?'); b.push(f.slug); }
  if (f.cliente) { w.push('cliente = ?'); b.push(f.cliente); }
  if (f.evento) { w.push('evento = ?'); b.push(f.evento); }
  if (f.desde) { w.push('at >= ?'); b.push(f.desde); }
  if (f.ate) { w.push('at <= ?'); b.push(f.ate); }
  if (f.avaliacao != null) { w.push('avaliacao = ?'); b.push(f.avaliacao); }
  if (f.descartado != null) { w.push('descartado = ?'); b.push(f.descartado ? 1 : 0); }
  if (f.veredito === 'sem') { w.push('veredito IS NULL'); }
  else if (f.veredito) { w.push('veredito = ?'); b.push(f.veredito); }
  if (f.busca) { w.push('(dados_json LIKE ? OR cliente LIKE ? OR email LIKE ?)'); const q = `%${f.busca}%`; b.push(q, q, q); }
  return { sql: w.join(' AND '), bind: b };
}

export async function listActivity(db: D1Database, org_id: string, f: ActivityFilter = {}): Promise<Activity[]> {
  const { sql, bind } = activityWhere(org_id, f);
  bind.push(Math.min(f.limit ?? 100, 500), f.offset ?? 0);
  return (await db.prepare(`SELECT * FROM activity WHERE ${sql} ORDER BY at DESC LIMIT ? OFFSET ?`).bind(...bind).all<Activity>()).results;
}

/** Quantas entradas o filtro pega (paginação) e quantas ainda esperam veredito. */
export async function countActivity(db: D1Database, org_id: string, f: ActivityFilter = {}): Promise<{ total: number; sem_veredito: number; mais_antiga_sem_veredito: string | null }> {
  const { sql, bind } = activityWhere(org_id, f);
  const r = await db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(evento = 'aprofundamento' AND veredito IS NULL) AS sem_veredito,
            MIN(CASE WHEN evento = 'aprofundamento' AND veredito IS NULL THEN at END) AS mais_antiga_sem_veredito
       FROM activity WHERE ${sql}`,
  ).bind(...bind).first<{ total: number; sem_veredito: number | null; mais_antiga_sem_veredito: string | null }>();
  return { total: r?.total ?? 0, sem_veredito: r?.sem_veredito ?? 0, mais_antiga_sem_veredito: r?.mais_antiga_sem_veredito ?? null };
}

/** Descarte feito na triagem (o consultor descarta pelo MCP; o editor, aqui). */
export async function descartarActivity(db: D1Database, id: string, motivo: string | null): Promise<void> {
  await db.prepare('UPDATE activity SET descartado = 1, motivo = ? WHERE id = ?').bind(motivo, id).run();
}

/** O veredito do editor sobre um aprofundamento (o que fecha a triagem). */
export async function setActivityVeredito(db: D1Database, id: string, veredito: Veredito | null, por: string): Promise<void> {
  if (!(await getActivity(db, id))) throw new Error('atividade não existe');
  const agora = veredito ? new Date().toISOString() : null;
  await db.prepare('UPDATE activity SET veredito = ?, veredito_por = ?, veredito_em = ? WHERE id = ?')
    .bind(veredito, veredito ? por.toLowerCase() : null, agora, id).run();
}

export async function getActivity(db: D1Database, id: string): Promise<Activity | null> {
  return db.prepare('SELECT * FROM activity WHERE id = ?').bind(id).first<Activity>();
}

export async function updateActivityEditor(db: D1Database, id: string, p: { editor_nota?: number | null; editor_comentario?: string | null; virou_exemplo?: boolean; virou_regra?: boolean }): Promise<void> {
  const cur = await getActivity(db, id);
  if (!cur) throw new Error('atividade não existe');
  await db.prepare('UPDATE activity SET editor_nota = ?, editor_comentario = ?, virou_exemplo = ?, virou_regra = ? WHERE id = ?')
    .bind(p.editor_nota === undefined ? cur.editor_nota : p.editor_nota, p.editor_comentario === undefined ? cur.editor_comentario : p.editor_comentario,
      p.virou_exemplo === undefined ? cur.virou_exemplo : (p.virou_exemplo ? 1 : 0), p.virou_regra === undefined ? cur.virou_regra : (p.virou_regra ? 1 : 0), id).run();
}

export async function insertRating(db: D1Database, r: { org_id: string; slug: string; version_number: number | null; email: string; nota: number; comentario?: string | null }): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO template_ratings (id, org_id, slug, version_number, email, nota, comentario) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, r.org_id, r.slug, r.version_number, r.email.toLowerCase(), r.nota, r.comentario ?? null).run();
  return id;
}

export interface CatalogStats { publicados: number; rascunhos: number; ultima_publicacao: string | null; sem_uso_30d: number }

/** Os quatro números do topo do catálogo: o que o MCP entrega hoje e o que está parado. */
export async function catalogStats(db: D1Database, org_id: string, desde30: string): Promise<CatalogStats> {
  const r = await db.prepare(
    `SELECT SUM(t.published_version_id IS NOT NULL) AS publicados,
            SUM(t.draft_version_id IS NOT NULL) AS rascunhos,
            (SELECT MAX(v.published_at) FROM template_versions v JOIN templates x ON x.slug = v.slug
              WHERE x.org_id = ? AND v.state = 'published') AS ultima_publicacao,
            SUM(t.published_version_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM activity a WHERE a.slug = t.slug AND a.at >= ?)) AS sem_uso_30d
       FROM templates t WHERE t.org_id = ?`,
  ).bind(org_id, desde30, org_id).first<CatalogStats>();
  return { publicados: r?.publicados ?? 0, rascunhos: r?.rascunhos ?? 0, ultima_publicacao: r?.ultima_publicacao ?? null, sem_uso_30d: r?.sem_uso_30d ?? 0 };
}

export interface HealthRow { slug: string; name: string; published_semver: string | null; published_number: number | null; geracoes: number; aprofundamentos: number; descartados: number; sem_veredito: number; nota_media: number | null }

/** Saúde por template: descarte alto e pergunta repetida são o mesmo sintoma. */
export async function healthStats(db: D1Database, org_id: string): Promise<HealthRow[]> {
  return (await db.prepare(
    `SELECT t.slug, t.name, p.semver AS published_semver, p.number AS published_number,
            (SELECT COUNT(*) FROM activity a WHERE a.slug = t.slug AND a.evento = 'geracao') AS geracoes,
            (SELECT COUNT(*) FROM activity a WHERE a.slug = t.slug AND a.evento = 'aprofundamento') AS aprofundamentos,
            (SELECT COUNT(*) FROM activity a WHERE a.slug = t.slug AND a.evento = 'aprofundamento' AND a.descartado = 1) AS descartados,
            (SELECT COUNT(*) FROM activity a WHERE a.slug = t.slug AND a.evento = 'aprofundamento' AND a.veredito IS NULL) AS sem_veredito,
            (SELECT AVG(r.nota) FROM template_ratings r WHERE r.slug = t.slug AND r.org_id = t.org_id) AS nota_media
       FROM templates t LEFT JOIN template_versions p ON p.id = t.published_version_id
      WHERE t.org_id = ? AND t.owner_email IS NULL
      ORDER BY descartados * 1.0 / MAX(aprofundamentos, 1) DESC, aprofundamentos DESC, t.name`,
  ).bind(org_id).all<HealthRow>()).results;
}

export interface UsageRow { slug: string; version_number: number | null; geracoes: number; aprofundamentos: number; descartados: number; nota_media: number | null; avaliacoes: number }

/** Uso por template × versão (gerações, aprofundamentos, descartados, nota média dos ratings). */
export async function usageStats(db: D1Database, org_id: string): Promise<UsageRow[]> {
  return (await db.prepare(
    `WITH a AS (
       SELECT slug, version_number,
              SUM(evento = 'geracao') AS geracoes, SUM(evento = 'aprofundamento') AS aprofundamentos,
              SUM(evento = 'aprofundamento' AND descartado = 1) AS descartados
         FROM activity WHERE org_id = ? GROUP BY slug, version_number),
     r AS (SELECT slug, version_number, AVG(nota) AS nota_media, COUNT(*) AS avaliacoes FROM template_ratings WHERE org_id = ? GROUP BY slug, version_number)
     SELECT a.slug, a.version_number, a.geracoes, a.aprofundamentos, a.descartados, r.nota_media, COALESCE(r.avaliacoes, 0) AS avaliacoes
       FROM a LEFT JOIN r ON r.slug = a.slug AND r.version_number IS a.version_number
     UNION ALL
     SELECT r.slug, r.version_number, 0, 0, 0, r.nota_media, r.avaliacoes FROM r
      WHERE NOT EXISTS (SELECT 1 FROM a WHERE a.slug = r.slug AND a.version_number IS r.version_number)
     ORDER BY 1, 2 DESC`,
  ).bind(org_id, org_id).all<UsageRow>()).results;
}

/** Top perguntas de aprofundamento por template (por pergunta_id ou texto normalizado). */
export async function topQuestions(db: D1Database, org_id: string, slug?: string, limit = 10): Promise<Array<{ slug: string; chave: string; pergunta: string; n: number }>> {
  const stmt = slug
    ? db.prepare("SELECT slug, pergunta_id, dados_json FROM activity WHERE org_id = ? AND evento = 'aprofundamento' AND slug = ?").bind(org_id, slug)
    : db.prepare("SELECT slug, pergunta_id, dados_json FROM activity WHERE org_id = ? AND evento = 'aprofundamento'").bind(org_id);
  const rows = (await stmt.all<{ slug: string; pergunta_id: string | null; dados_json: string }>()).results;
  const agg = new Map<string, { slug: string; chave: string; pergunta: string; n: number }>();
  for (const r of rows) {
    let pergunta = '';
    try { pergunta = String((JSON.parse(r.dados_json) as { pergunta?: string }).pergunta || ''); } catch { /* ignora */ }
    const chave = r.pergunta_id || pergunta.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!chave) continue;
    const k = `${r.slug} ${chave}`;
    const cur = agg.get(k) || { slug: r.slug, chave, pergunta: pergunta || chave, n: 0 };
    cur.n++;
    agg.set(k, cur);
  }
  return [...agg.values()].sort((a, b) => b.n - a.n).slice(0, limit);
}


// ── documentos da plataforma (design system etc.) ───────────────────────────

export interface PlatformDoc { slug: string; org_id: string; title: string; body_md: string; kit_file: string | null; author_email: string | null; updated_at: string }

export async function listPlatformDocs(db: D1Database, org_id: string): Promise<PlatformDoc[]> {
  return (await db.prepare('SELECT * FROM platform_docs WHERE org_id = ? ORDER BY title').bind(org_id).all<PlatformDoc>()).results;
}
export async function getPlatformDoc(db: D1Database, slug: string): Promise<PlatformDoc | null> {
  return db.prepare('SELECT * FROM platform_docs WHERE slug = ?').bind(slug).first<PlatformDoc>();
}
export async function upsertPlatformDoc(db: D1Database, d: { slug: string; org_id: string; title: string; body_md: string; kit_file?: string | null; author_email?: string | null }): Promise<void> {
  await db.prepare(
    `INSERT INTO platform_docs (slug, org_id, title, body_md, kit_file, author_email, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET title = excluded.title, body_md = excluded.body_md, kit_file = COALESCE(excluded.kit_file, platform_docs.kit_file), author_email = excluded.author_email, updated_at = excluded.updated_at`,
  ).bind(d.slug, d.org_id, d.title, d.body_md, d.kit_file ?? null, d.author_email ?? null, now()).run();
}
/** Arquivos da plataforma que entram em TODO kit (zip): {path, content}. */
export async function platformKitFiles(db: D1Database, org_id: string): Promise<Array<{ path: string; content: string }>> {
  return (await listPlatformDocs(db, org_id)).filter((d) => d.kit_file).map((d) => ({ path: d.kit_file!, content: d.body_md }));
}

// ── contextos gerais ────────────────────────────────────────────────────────

export async function listGeneralContexts(db: D1Database, org_id: string): Promise<GeneralContext[]> {
  return (await db.prepare("SELECT * FROM general_contexts WHERE org_id = ? ORDER BY CASE tipo WHEN 'regra' THEN 0 WHEN 'definicao' THEN 1 ELSE 2 END, title").bind(org_id).all<GeneralContext>()).results;
}

export async function upsertGeneralContext(db: D1Database, g: { slug: string; org_id: string; title: string; body_md: string; tipo?: ContextoTipo; author_email?: string | null }): Promise<void> {
  await db.prepare(
    `INSERT INTO general_contexts (slug, org_id, title, body_md, tipo, author_email, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET title = excluded.title, body_md = excluded.body_md, tipo = excluded.tipo, author_email = excluded.author_email, updated_at = excluded.updated_at`,
  ).bind(g.slug, g.org_id, g.title, g.body_md, g.tipo ?? 'regra', g.author_email ?? null, now()).run();
}

export async function deleteGeneralContext(db: D1Database, slug: string): Promise<void> {
  await db.prepare('DELETE FROM general_contexts WHERE slug = ?').bind(slug).run();
}

// ── uso ─────────────────────────────────────────────────────────────────────

export async function logUsage(db: D1Database, e: { email: string; tool: string; slug?: string | null; version_number?: number | null }): Promise<void> {
  await db.prepare('INSERT INTO usage_log (email, tool, slug, version_number) VALUES (?, ?, ?, ?)')
    .bind(e.email, e.tool, e.slug ?? null, e.version_number ?? null).run();
}
