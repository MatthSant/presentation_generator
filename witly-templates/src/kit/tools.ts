/* tools — a lógica das tools do MCP, pura (db + env + usuário → texto). O McpAgent só
 * registra e chama. Testável sem transporte MCP. */

import { canSee, getPlatformDoc, getPublishedKit, getTemplate, listGeneralContexts, listTemplates, logUsage, type GeneralContext, type Kit } from '../db/index.js';
import { montarQuery, MontarQueryError, type ParamDef } from './montar-query.js';
import { signDownload, signingKey } from './sign.js';

export interface ToolEnv extends Pick<Env, 'DB' | 'ORG_ID' | 'COOKIE_ENCRYPTION_KEY' | 'DOWNLOAD_SIGNING_KEY' | 'PUBLIC_URL'> {}
export interface ToolUser { email: string; name: string }

export class ToolError extends Error {}

export interface ManifestQuery { id: string; file: string; title?: string; when?: Record<string, string>; optional?: boolean; saida?: string; desc?: string }
export interface Manifest {
  params?: ParamDef[];
  queries?: ManifestQuery[];
  tarefas_contexto?: Array<{ id: string; objetivo: string; saida?: string; confirmar?: boolean }>;
  como_gerar?: string[];
  config?: unknown;
  arquivos?: Record<string, string>;
  [k: string]: unknown;
}

export const DOWNLOAD_TTL = 15 * 60;

function manifestOf(kit: Kit): Manifest {
  try { return JSON.parse(kit.version.manifest_json) as Manifest; } catch { return {}; }
}

function fence(lang: string, body: string): string {
  const f = body.includes('```') ? '````' : '```';
  return `${f}${lang}\n${body.replace(/\s+$/, '')}\n${f}`;
}

async function kitOrThrow(env: ToolEnv, user: ToolUser, slug: string): Promise<Kit> {
  const t = await getTemplate(env.DB, slug);
  const kit = t && canSee(t, user.email) ? await getPublishedKit(env.DB, slug) : null;
  if (kit) return kit;
  const known = (await listTemplates(env.DB, env.ORG_ID, user.email)).map((x) => x.slug);
  if (t && canSee(t, user.email)) throw new ToolError(`o template "${slug}" existe mas não tem versão publicada (só rascunho). Peça a um editor para publicar.`);
  throw new ToolError(`template "${slug}" não existe. Disponíveis: ${known.join(', ') || '(nenhum)'}`);
}

function generalBlock(gc: GeneralContext[]): string {
  if (!gc.length) return '';
  return `\n\n---\n\n## Contextos gerais (valem para TODA análise)\n\n` + gc.map((g) => `### ${g.title}\n\n${g.body_md.trim()}`).join('\n\n');
}

// ── listar_templates ─────────────────────────────────────────────────────────

export async function listarTemplates(env: ToolEnv, user: ToolUser): Promise<string> {
  const rows = await listTemplates(env.DB, env.ORG_ID, user.email);
  await logUsage(env.DB, { email: user.email, tool: 'listar_templates' });
  const pub = rows.filter((r) => r.published_version_id);
  if (!pub.length) return 'Nenhum template publicado ainda.';
  const out: string[] = ['# Templates disponíveis', ''];
  for (const t of pub) {
    const kit = await getPublishedKit(env.DB, t.slug);
    const m = kit ? manifestOf(kit) : {};
    out.push(`## ${t.name}  \`${t.slug}\`  (v${t.published_number})${t.owner_email ? '  — PESSOAL (só você vê)' : ''}`);
    if (t.objective) out.push(`**Objetivo:** ${t.objective}`);
    if (t.when_to_use) out.push(`**Quando usar:** ${t.when_to_use}`);
    if (m.tarefas_contexto?.length) out.push(`**Tarefas de contexto:** ${m.tarefas_contexto.map((x) => `${x.id} (${x.objetivo})`).join(' · ')}`);
    if (m.params?.length) out.push(`**Parâmetros das queries:** ${m.params.map((p) => `${p.id}${p.required === false ? '?' : ''}`).join(', ')}`);
    out.push('');
  }
  out.push('Use `obter_template(slug)` para o kit completo e `montar_query(slug, params)` para o SQL pronto.');
  out.push('Fez uma análise específica que vale guardar? `salvar_template({...})` cria um template pessoal (só seu) no mesmo formato; um editor pode promovê-lo para todos.');
  return out.join('\n');
}

// ── obter_template ───────────────────────────────────────────────────────────

export async function obterTemplate(env: ToolEnv, user: ToolUser, slug: string): Promise<string> {
  const kit = await kitOrThrow(env, user, slug);
  const m = manifestOf(kit);
  const n = kit.version.number;
  await logUsage(env.DB, { email: user.email, tool: 'obter_template', slug, version_number: n });

  const token = await signDownload(signingKey(env), slug, n, DOWNLOAD_TTL);
  const base = (env.PUBLIC_URL || '').replace(/\/$/, '');
  const url = `${base}/dl/${encodeURIComponent(slug)}/${n}?t=${token}`;
  const exp = new Date(Date.now() + DOWNLOAD_TTL * 1000).toISOString();

  const files = new Map(kit.files.map((f) => [f.path, f.content]));
  const text = (p: string) => files.get(p) ?? '';

  const out: string[] = [];
  out.push(`# Kit: ${kit.template.name}  \`${slug}\`  v${n}${kit.template.owner_email ? '  — PESSOAL' : ''}`);
  out.push('');
  out.push(`**Objetivo:** ${kit.template.objective}`);
  out.push(`**Quando usar:** ${kit.template.when_to_use}`);
  out.push('');
  out.push('## Download do kit completo (Python, viewer, exemplo — NÃO passe pelo contexto, baixe)');
  out.push('');
  out.push(fence('bash', `curl -L -o ${slug}.zip "${url}"\nunzip -o ${slug}.zip   # expira em ${exp}`));
  out.push('');
  out.push('Depois de descompactar: `' + (m.como_gerar || []).join('` · `') + '`');
  out.push('');
  out.push('## Manifesto');
  out.push('');
  out.push(fence('json', JSON.stringify({ ...m, slug, name: kit.template.name, version: n }, null, 2)));
  out.push('');
  out.push('## Tarefas de contexto (execute ANTES de gerar; confirme com o consultor o que estiver marcado)');
  for (const t of kit.tasks) { out.push(''); out.push(`### ${t.title}  \`${t.task_id}\``); out.push(''); out.push(t.body_md.trim()); }
  out.push('');
  out.push('## Queries (use `montar_query` para preencher os parâmetros com escape)');
  for (const q of m.queries || []) {
    out.push('');
    out.push(`### ${q.title || q.id}  \`${q.id}\`${q.optional ? ' (opcional)' : ''}${q.when ? '  — quando ' + Object.entries(q.when).map(([k, v]) => `${k}=${v}`).join(', ') : ''}`);
    if (q.desc) out.push(q.desc);
    out.push(`Salvar como: \`${q.saida || q.id + '.csv'}\``);
    out.push(fence('sql', text(q.file)));
  }
  out.push('');
  out.push('## Documento (estrutura do que o gerar.py produz)');
  out.push('');
  out.push(text('documento.md').trim());
  out.push('');
  out.push('## Guia de leitura');
  out.push('');
  out.push(text('guia.md').trim());
  if (files.has('perguntas.md')) {
    out.push('');
    out.push('## Perguntas norteadoras (o que vale aprofundar)');
    out.push('');
    out.push('Depois de gerar, leia `saida/perguntas.json` (relevância calculada sobre os números) e o `numeros.json`, e proponha ao consultor NO CHAT as 3–5 perguntas mais relevantes com a justificativa. Elas NÃO entram no HTML. Se ele aceitar uma, construa o aprofundamento no design system (`design-system.md` + `python/aprofundar.py`) e registre com `pergunta_id`.');
    out.push('');
    out.push(text('perguntas.md').trim());
  }
  if (await getPlatformDoc(env.DB, 'design-system')) {
    out.push('');
    out.push('## Design system dos aprofundamentos (da plataforma, igual para todo template)');
    out.push('');
    out.push('Todo aprofundamento entra no relatório com os widgets do contrato, número só via `bind`. O contrato vem no zip como `design-system.md` (e como resource `contrato://widgets`); leia antes de montar a seção. `python/aprofundar.py` valida e regera o HTML.');
  }
  out.push('');
  out.push('## Ao terminar (obrigatório)');
  out.push('');
  out.push('- Gerou o documento: `registrar({evento:"geracao", slug, versao, cliente, contexto:{tarefas resolvidas}, resultado:{titulo, secoes, problemas}})`.');
  out.push('- Cada aprofundamento: `registrar({evento:"aprofundamento", slug, pergunta, pergunta_id?, resposta, consultas, avaliacao?, descartado?, motivo?})` — resposta = prosa + tabelas agregadas; nunca e-mail, telefone ou CPF.');
  out.push('- Se o consultor der uma nota ao template: `avaliar(slug, nota, comentario)`.');
  out.push(generalBlock(await listGeneralContexts(env.DB, env.ORG_ID)));
  return out.join('\n');
}

// ── perguntas ────────────────────────────────────────────────────────────────

export async function perguntas(env: ToolEnv, user: ToolUser, slug: string): Promise<string> {
  const kit = await kitOrThrow(env, user, slug);
  await logUsage(env.DB, { email: user.email, tool: 'perguntas', slug, version_number: kit.version.number });
  const p = kit.files.find((f) => f.path === 'perguntas.md')?.content;
  if (!p) throw new ToolError(`o template "${slug}" não tem banco de perguntas norteadoras`);
  return p.trim() + '\n\nA relevância de cada pergunta para UMA campanha sai em `saida/perguntas.json` após o `gerar.py`. Apresente as mais relevantes ao consultor no chat, não no HTML.';
}

// ── montar_query ─────────────────────────────────────────────────────────────

export async function montarQueries(env: ToolEnv, user: ToolUser, slug: string, params: Record<string, unknown>): Promise<string> {
  const kit = await kitOrThrow(env, user, slug);
  const m = manifestOf(kit);
  await logUsage(env.DB, { email: user.email, tool: 'montar_query', slug, version_number: kit.version.number });
  const files = new Map(kit.files.map((f) => [f.path, f.content]));
  const defs = m.params || [];
  const selected = (m.queries || []).filter((q) => !q.when || Object.entries(q.when).every(([k, v]) => String(params[k] ?? '') === v));
  if (!selected.length) throw new ToolError('nenhuma query casa com os parâmetros informados; confira `when` no manifesto.');

  const out: string[] = [`# SQL pronto — ${kit.template.name}`, ''];
  const errors: string[] = [];
  for (const q of selected) {
    const sql = files.get(q.file);
    if (sql == null) { errors.push(`${q.id}: arquivo ${q.file} ausente no kit`); continue; }
    try {
      out.push(`## ${q.title || q.id}${q.optional ? ' (opcional)' : ''} → salvar como \`${q.saida || q.id + '.csv'}\``);
      out.push(fence('sql', montarQuery(sql, defs, params)));
      out.push('');
    } catch (e) {
      if (e instanceof MontarQueryError) errors.push(`${q.id}: ${e.message}`);
      else throw e;
    }
  }
  if (errors.length) throw new ToolError(`não foi possível montar:\n- ${errors.join('\n- ')}`);
  out.push('Rode no Delfos (`Witly_Query` com o `db_name` do cliente) e salve o resultado como CSV com o nome indicado.');
  return out.join('\n');
}

// ── guia ─────────────────────────────────────────────────────────────────────

export async function guia(env: ToolEnv, user: ToolUser, slug: string): Promise<string> {
  const kit = await kitOrThrow(env, user, slug);
  await logUsage(env.DB, { email: user.email, tool: 'guia', slug, version_number: kit.version.number });
  const g = kit.files.find((f) => f.path === 'guia.md')?.content ?? '(sem guia)';
  return g.trim() + generalBlock(await listGeneralContexts(env.DB, env.ORG_ID));
}

// ── resources ────────────────────────────────────────────────────────────────

export async function resourceText(env: ToolEnv, uri: string, viewer?: string): Promise<string | null> {
  const u = new URL(uri);
  if (u.protocol === 'contrato:') {
    // contrato://widgets — o design system dos aprofundamentos (documento da PLATAFORMA, igual para todo template)
    if (u.hostname === 'widgets') return (await getPlatformDoc(env.DB, 'design-system'))?.body_md ?? null;
    return null;
  }
  if (u.protocol === 'contexto:') {
    // contexto://geral/<slug>
    const slug = u.pathname.replace(/^\/+/, '');
    const g = (await listGeneralContexts(env.DB, env.ORG_ID)).find((x) => x.slug === slug);
    return g ? `# ${g.title}\n\n${g.body_md}` : null;
  }
  if (u.protocol !== 'template:') return null;
  const slug = u.hostname || u.pathname.split('/')[1];
  const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  const t = await getTemplate(env.DB, slug);
  if (!t || (viewer && !canSee(t, viewer))) return null;
  const kit = await getPublishedKit(env.DB, slug);
  if (!kit) return null;
  const file = (p: string) => kit.files.find((f) => f.path === p)?.content ?? null;
  if (!parts.length) return JSON.stringify({ ...manifestOf(kit), slug, name: kit.template.name, version: kit.version.number }, null, 2);
  if (parts[0] === 'guia') return file('guia.md');
  if (parts[0] === 'documento') return file('documento.md');
  if (parts[0] === 'exemplo') return file('exemplo/numeros.json');
  if (parts[0] === 'perguntas') return file('perguntas.md');
  if (parts[0] === 'contexto' && parts[1]) {
    const t = kit.tasks.find((x) => x.task_id === parts[1]);
    return t ? `# ${t.title}\n\n${t.body_md}` : null;
  }
  return null;
}
