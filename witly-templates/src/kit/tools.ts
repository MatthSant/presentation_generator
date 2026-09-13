/* tools — a lógica das tools do MCP, pura (db + env + usuário → texto). O McpAgent só
 * registra e chama. Testável sem transporte MCP. */

import { versionLabel } from '../db/semver.js';
import { canSee, designSystemText, getPublishedKit, getTemplate, listTemplates, logUsage, type Kit } from '../db/index.js';
import { obterConhecimento } from '../db/conhecimento.js';
import { indiceBlock, nivel0Block } from './conhecimento-tools.js';
import { textoCompleto } from './conhecimento.js';
import { montarQuery, MontarQueryError, type ParamDef } from './montar-query.js';
import { signDownload, signingKey } from './sign.js';
import { questionsBlock, rulesBlock } from './zip.js';

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
  /** kind = conversa (roteiro): etapas com checkpoint, o que pedir, ferramentas, saída */
  kind?: string;
  entrada?: string;
  etapas?: Etapa[];
  ferramentas?: string[];
  saida?: string;
  funil?: string;
  tags?: string[];
  [k: string]: unknown;
}
export interface Etapa { id: string; entrega: string; espera?: string; registra?: string; puxa?: string[] }

export const DOWNLOAD_TTL = 15 * 60;

function manifestOf(kit: Kit): Manifest {
  try { return JSON.parse(kit.version.manifest_json) as Manifest; } catch { return {}; }
}

function fence(lang: string, body: string): string {
  const f = body.includes('```') ? '````' : '```';
  return `${f}${lang}\n${body.replace(/\s+$/, '')}\n${f}`;
}

async function kitOrThrow(env: ToolEnv, user: ToolUser, slug: string): Promise<Kit> {
  const t0 = await getTemplate(env.DB, slug);
  const t = t0 && t0.kind !== 'design' ? t0 : null;   // o design system não é um template de análise
  const kit = t && canSee(t, user.email) ? await getPublishedKit(env.DB, slug) : null;
  if (kit) return kit;
  const known = (await listTemplates(env.DB, env.ORG_ID, user.email)).map((x) => x.slug);
  if (t && canSee(t, user.email)) throw new ToolError(`o template "${slug}" existe mas não tem versão publicada (só rascunho). Peça a um editor para publicar.`);
  throw new ToolError(`template "${slug}" não existe. Disponíveis: ${known.join(', ') || '(nenhum)'}`);
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
    out.push(`## ${t.name}  \`${t.slug}\`  (${versionLabel({ semver: t.published_semver, number: t.published_number })})${t.owner_email ? '  — PESSOAL (só você vê)' : ''}`);
    if (t.kind === 'conversa') out.push('**Tipo:** ROTEIRO de conversa em etapas (sem Python nem zip): o agente entrega uma etapa, espera a palavra do consultor, registra e avança.');
    if (t.objective) out.push(`**Objetivo:** ${t.objective}`);
    if (t.when_to_use) out.push(`**Quando usar:** ${t.when_to_use}`);
    if (m.tarefas_contexto?.length) out.push(`**Tarefas de contexto:** ${m.tarefas_contexto.map((x) => `${x.id} (${x.objetivo})`).join(' · ')}`);
    if (m.params?.length) out.push(`**Parâmetros das queries:** ${m.params.map((p) => `${p.id}${p.required === false ? '?' : ''}`).join(', ')}`);
    out.push('');
  }
  out.push('Use `obter_template(slug)` para o kit completo e `montar_query(slug, params)` para o SQL pronto.');
  out.push('Pergunta que não cabe em template? `obter_template("analise-livre")` traz o design system com exemplos, as regras de contexto e o `montar.py` que valida e gera o HTML.');
  out.push('Fez uma análise específica que vale guardar? `salvar_template({...})` cria um template pessoal (só seu) no mesmo formato; um editor pode promovê-lo para todos.');
  return out.join('\n');
}

// ── obter_template ───────────────────────────────────────────────────────────

export async function obterTemplate(env: ToolEnv, user: ToolUser, slug: string): Promise<string> {
  const kit = await kitOrThrow(env, user, slug);
  const m = manifestOf(kit);
  const n = kit.version.number;
  await logUsage(env.DB, { email: user.email, tool: 'obter_template', slug, version_number: n });
  if (kit.template.kind === 'conversa') return obterRoteiro(env, kit, m);

  const token = await signDownload(signingKey(env), slug, n, DOWNLOAD_TTL);
  const base = (env.PUBLIC_URL || '').replace(/\/$/, '');
  const url = `${base}/dl/${encodeURIComponent(slug)}/${n}?t=${token}`;
  const exp = new Date(Date.now() + DOWNLOAD_TTL * 1000).toISOString();

  const files = new Map(kit.files.map((f) => [f.path, f.content]));
  const text = (p: string) => files.get(p) ?? '';

  const out: string[] = [];
  out.push(`# Kit: ${kit.template.name}  \`${slug}\`  ${versionLabel(kit.version)}${kit.template.owner_email ? '  — PESSOAL' : ''}`);
  out.push('');
  out.push(`**Objetivo:** ${kit.template.objective}`);
  out.push(`**Quando usar:** ${kit.template.when_to_use}`);
  out.push(await nivel0Block(env, slug, m as { funil?: unknown; tags?: unknown }));
  out.push('');
  out.push('## Download do kit completo (Python, viewer, exemplo — NÃO passe pelo contexto, baixe)');
  out.push('');
  out.push(fence('bash', `curl -L -o ${slug}.zip "${url}"\nunzip -o ${slug}.zip   # expira em ${exp}`));
  out.push('');
  out.push('Depois de descompactar: `' + (m.como_gerar || []).join('` · `') + '`');
  out.push('');
  out.push('## Manifesto');
  out.push('');
  out.push(fence('json', JSON.stringify({ ...m, slug, name: kit.template.name, version: kit.version.semver ?? String(n), version_number: n }, null, 2)));
  out.push('');
  const confirmar = new Map((m.tarefas_contexto || []).map((t) => [t.id, t.confirmar !== false]));
  out.push('## Tarefas (execute ANTES de gerar; as marcadas PERGUNTE ao consultor, não decida sozinho)');
  for (const t of kit.tasks) {
    out.push('');
    out.push(`### ${t.title}  \`${t.task_id}\`  — ${confirmar.get(t.task_id) === false ? 'resolva pela regra (pergunte só se ambíguo)' : '**PERGUNTE AO CONSULTOR e confirme antes de gerar**'}`);
    out.push('');
    out.push(t.body_md.trim());
  }
  out.push('');
  out.push('## Checklist antes de gerar (não pule)');
  out.push('');
  const perguntar = kit.tasks.filter((t) => confirmar.get(t.task_id) !== false);
  if (perguntar.length) out.push(`- Perguntas ao consultor (uma tarefa por vez, mostrando o que você propõe): ${perguntar.map((t) => `**${t.task_id}**`).join(', ')}.`);
  if (m.params?.length) out.push(`- Parâmetros das queries com valor confirmado: ${m.params.map((p) => `\`${p.id}\`${p.required === false ? ' (opcional)' : ''}${p.default != null ? ` (padrão ${p.default})` : ''}`).join(', ')}.`);
  const req = (m.required_files as string[] | undefined) || [];
  if (req.length) out.push(`- Arquivos auxiliares obrigatórios: ${req.map((r) => `\`${r}.csv\``).join(', ')} (o gerar.py recusa sem eles).`);
  out.push('- Só então `montar_query` → Delfos → CSV → `python python/gerar.py`.');
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
  out.push(rulesBlock(kit.rules));
  out.push(questionsBlock(kit.rules));
  if (await designSystemText(env.DB, env.ORG_ID)) {
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
  out.push('- Faltou regra, definição ou pergunta NO TEMPLATE? `sugerir_regra({slug, tipo, titulo, corpo, motivo})` — triagem do editor. Faltou CONHECIMENTO (métrica, diagnóstico, caso, benchmark, formato…)? `sugerir({tipo, titulo, corpo, dados, escopo, motivo, urgencia?, evidencia?})` — vira proposta; cálculo/métrica errada = `urgencia:"urgente"` com evidência.');
  out.push('- Em todo `registrar`, mande `usadas:[{id, ajudou}]` com as entradas de conhecimento que entraram na análise (é a evidência que mantém o conhecimento vivo).');
  out.push('- **Ao fechar o trabalho com o consultor** (obrigatório): `registrar({evento:"feedback", slug, versao, cliente, resumo, segurou:[…], custou:[{item, prioridade, pedido, rodadas}], medida:{apresentacao, filtro, analise}, nota})` — o que segurou bem, cada ajuste que custou rodada (o `pedido` é o que mudar no kit, escrito como regra), quantas rodadas foram sobre apresentação × filtro × análise, e a nota de 1 a 5. É assim que o kit aprende; o editor triagem cada item.');
  out.push(await indiceBlock(env, kit));
  return out.join('\n');
}

/** kind = conversa: o roteiro em etapas com checkpoint (spec 008 §5). Sem zip, sem Python. */
async function obterRoteiro(env: ToolEnv, kit: Kit, m: Manifest): Promise<string> {
  const slug = kit.template.slug;
  const files = new Map(kit.files.map((f) => [f.path, f.content]));
  const out: string[] = [];
  out.push(`# Roteiro: ${kit.template.name}  \`${slug}\`  ${versionLabel(kit.version)}${kit.template.owner_email ? '  — PESSOAL' : ''}`);
  out.push('');
  out.push(`**Objetivo:** ${kit.template.objective}`);
  out.push(`**Quando usar:** ${kit.template.when_to_use}`);
  out.push('');
  out.push('Este template é uma **conversa em etapas**, não um gerador de HTML. Regra do roteiro: entregue a etapa, faça a pergunta de `espera` ao consultor, registre o que a etapa manda e só então avance. Não faça tudo de uma vez.');
  out.push(await nivel0Block(env, slug, m as { funil?: unknown; tags?: unknown }));
  if (m.entrada) { out.push('', '## Entrada — o que pedir ao consultor antes de começar', '', String(m.entrada)); }
  const confirmar = new Map((m.tarefas_contexto || []).map((t) => [t.id, t.confirmar !== false]));
  if (kit.tasks.length) {
    out.push('', '## Tarefas (execute ANTES da etapa 1; as marcadas PERGUNTE ao consultor)');
    for (const t of kit.tasks) { out.push('', `### ${t.title}  \`${t.task_id}\`  — ${confirmar.get(t.task_id) === false ? 'resolva pela regra (pergunte só se ambíguo)' : '**PERGUNTE AO CONSULTOR e confirme**'}`, '', t.body_md.trim()); }
  }
  out.push('', '## Etapas (uma por vez, com checkpoint)', '');
  out.push('| # | entrega | espera (o que libera a próxima) | registra | puxa do conhecimento |');
  out.push('|---|---|---|---|---|');
  for (const [i, e] of (m.etapas || []).entries()) out.push(`| ${i} \`${e.id}\` | ${e.entrega} | ${e.espera || '—'} | ${e.registra || '—'} | ${(e.puxa || []).map((p) => `\`${p}\``).join(', ') || '—'} |`);
  if (m.ferramentas?.length) out.push('', `**Ferramentas:** ${m.ferramentas.join(' · ')}`);
  if (m.saida) out.push('', `**Saída:** ${m.saida}`);
  const guia = files.get('guia.md');
  if (guia) out.push('', '## Guia', '', guia.trim());
  out.push(rulesBlock(kit.rules));
  out.push(questionsBlock(kit.rules));
  out.push('', '## Ao terminar (obrigatório)', '');
  out.push(`- Cada entrega (report, resumo, recomendação): \`registrar({evento:"geracao", slug:"${slug}", versao, cliente, contexto:{etapa, campanha}, resultado:{titulo, secoes, decisoes}})\`.`);
  out.push('- Decisão do consultor (desligar, escalar, budget, manter) → vai no `resultado.decisoes` em FCA-R com o motivo real dele e como verificar.');
  out.push('- Faltou conhecimento (regra, diagnóstico, caso, benchmark)? `sugerir({...})`. Cálculo ou métrica errada: `urgencia:"urgente"` com evidência.');
  out.push('- Em todo `registrar`, mande `usadas:[{id, ajudou}]` com as entradas de conhecimento que entraram.');
  out.push(`- **Ao fechar**: \`registrar({evento:"feedback", slug:"${slug}", versao, cliente, resumo, segurou:[…], custou:[{item, prioridade, pedido, rodadas}], medida:{apresentacao, filtro, analise}, nota})\`.`);
  out.push(await indiceBlock(env, kit));
  return out.join('\n');
}

// ── perguntas ────────────────────────────────────────────────────────────────

export async function perguntas(env: ToolEnv, user: ToolUser, slug: string): Promise<string> {
  const kit = await kitOrThrow(env, user, slug);
  await logUsage(env.DB, { email: user.email, tool: 'perguntas', slug, version_number: kit.version.number });
  const qb = questionsBlock(kit.rules);
  if (!qb) throw new ToolError(`o template "${slug}" não tem perguntas norteadoras`);
  return qb.trim();
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
  return g.trim() + rulesBlock(kit.rules) + await nivel0Block(env, slug, manifestOf(kit) as { funil?: unknown; tags?: unknown });
}

// ── resources ────────────────────────────────────────────────────────────────

export async function resourceText(env: ToolEnv, uri: string, viewer?: string): Promise<string | null> {
  const u = new URL(uri);
  if (u.protocol === 'contrato:') {
    // contrato://widgets — o design system dos aprofundamentos (documento da PLATAFORMA, igual para todo template)
    if (u.hostname === 'widgets') return designSystemText(env.DB, env.ORG_ID);
    return null;
  }
  if (u.protocol === 'conhecimento:' || u.protocol === 'contexto:') {
    // conhecimento://<id> (e o alias antigo contexto://geral/<slug>)
    const id = (u.hostname && u.hostname !== 'geral' ? u.hostname : u.pathname.replace(/^\/+/, '')).split('/')[0];
    const e = id ? await obterConhecimento(env.DB, id) : null;
    return e ? textoCompleto(e) : null;
  }
  if (u.protocol !== 'template:') return null;
  const slug = u.hostname || u.pathname.split('/')[1];
  const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  const t = await getTemplate(env.DB, slug);
  if (!t || t.kind === 'design' || (viewer && !canSee(t, viewer))) return null;
  const kit = await getPublishedKit(env.DB, slug);
  if (!kit) return null;
  const file = (p: string) => kit.files.find((f) => f.path === p)?.content ?? null;
  if (!parts.length) return JSON.stringify({ ...manifestOf(kit), slug, name: kit.template.name, version: kit.version.semver ?? String(kit.version.number), version_number: kit.version.number }, null, 2);
  if (parts[0] === 'guia') return file('guia.md');
  if (parts[0] === 'documento') return file('documento.md');
  if (parts[0] === 'exemplo') return file('exemplo/numeros.json');
  if (parts[0] === 'perguntas') return questionsBlock(kit.rules).trim() || null;
  if (parts[0] === 'contexto' && parts[1]) {
    const t = kit.tasks.find((x) => x.task_id === parts[1]);
    return t ? `# ${t.title}\n\n${t.body_md}` : null;
  }
  return null;
}
