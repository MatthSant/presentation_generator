/* insights — cliente da API do Insights (hospedador de análises) e as tools que o agente
 * usa para entregar a análise pronta ao cliente.
 *
 * Desenho, e por quê:
 *
 * A chave (`wit_…`) fica só no Worker, como secret. Cada chamada declara `X-Autor`, que é
 * a PESSOA agindo — e é o acesso dela que vale, não o da chave. Quem publica aparece no
 * histórico do Insights com o próprio nome.
 *
 * O arquivo NÃO passa por aqui. Um relatório de debriefing tem ~3 MB, e argumento de tool
 * é texto que o modelo gera: mandar o HTML por ali estouraria o contexto muitas vezes.
 * Então o Grimório assina uma URL de upload dele mesmo, o `curl` local manda o arquivo
 * para lá, e o Worker repassa ao Insights com a chave. O byte sai da máquina do consultor
 * e vai direto para o servidor, sem atravessar a conversa. */

import { logUsage } from '../db/index.js';
import { signingKey, signUpload } from './sign.js';
import { ToolError, type ToolEnv, type ToolUser } from './tools.js';

/** Logins compartilhados: não são uma pessoa, então não podem assinar a ação. */
const COMPARTILHADOS = new Set(['projetos@witly.digital']);

export interface InsightsEnv {
  INSIGHTS_CHAVE?: string;
  INSIGHTS_BASE?: string;
}

const base = (env: ToolEnv & InsightsEnv): string =>
  (env.INSIGHTS_BASE || 'https://insights.witly.com.br/api').replace(/\/$/, '');

/** O e-mail que assina a ação no Insights. Ver COMPARTILHADOS. */
export function autorDe(user: ToolUser, informado?: string | null): string {
  const dado = String(informado ?? '').trim().toLowerCase();
  if (dado) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dado)) throw new ToolError(`autor inválido: ${dado} não é um e-mail`);
    return dado;
  }
  const meu = user.email.toLowerCase();
  if (COMPARTILHADOS.has(meu)) {
    throw new ToolError(
      `você está no login compartilhado \`${meu}\`, que não é uma pessoa. Pergunte ao consultor o e-mail dele no Insights `
      + 'e repita a chamada com `autor:"<e-mail>"` — é esse nome que vai assinar a publicação no histórico do cliente.');
  }
  return meu;
}

/** O nome que o CLIENTE vê na lista dele. Vale a regra do Insights: leigo, sem jargão.
 *  Recusa o slug técnico (`lcto-cria-abr-26`) porque é o erro fácil — o agente tem o
 *  field_conversion na mão e é tentador passá-lo adiante. */
export function nomeDocumento(bruto: unknown): string {
  const n = String(bruto ?? '').replace(/\s+/g, ' ').trim();
  if (n.length < 3) throw new ToolError('dê um `nome` ao documento — é o que o cliente vê na lista dele. Ex.: "Debriefing · Cria abr/26".');
  if (n.length > 120) throw new ToolError(`o nome tem ${n.length} caracteres e não cabe na lista do cliente. Encurte para até 120.`);
  if (/^[a-z0-9]+([-_][a-z0-9]+)+$/.test(n)) {
    throw new ToolError(
      `"${n}" é o identificador técnico, não um nome. O cliente lê isso na área dele — escreva como você escreveria num e-mail para ele: `
      + '"Debriefing · Cria abr/26", "Acompanhamento — Vitalícia 26". Sem slug, sem field_conversion, sem ALL CAPS.');
  }
  if (n.length > 8 && n === n.toUpperCase() && /[A-ZÀ-Ý]/.test(n)) {
    throw new ToolError(`"${n}" está todo em maiúsculas e soa como grito na tela do cliente. Escreva normalmente.`);
  }
  return n[0].toUpperCase() + n.slice(1);
}

interface Chamada { metodo?: string; corpo?: unknown; autor: string }

/** Chama a API do Insights. O erro dela já vem em português e escrito para uma pessoa ler:
 *  repassamos a frase em vez de inventar outra. */
export async function api<T>(env: ToolEnv & InsightsEnv, rota: string, { metodo = 'GET', corpo, autor }: Chamada): Promise<T> {
  const chave = env.INSIGHTS_CHAVE;
  if (!chave) {
    throw new ToolError('o Grimório não tem chave do Insights configurada. Um editor precisa rodar `wrangler secret put INSIGHTS_CHAVE` com uma chave criada em Painel → menu do usuário → Chaves de acesso.');
  }
  const headers: Record<string, string> = { authorization: `Bearer ${chave}`, 'x-autor': autor };
  if (corpo !== undefined) headers['content-type'] = 'application/json';
  let r: Response;
  try {
    r = await fetch(`${base(env)}${rota}`, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  } catch (e) {
    throw new ToolError(`não consegui falar com o Insights: ${(e as Error).message}`);
  }
  const texto = await r.text();
  let dados: unknown = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }
  if (!r.ok) {
    const msg = (dados as { error?: string } | null)?.error || texto.slice(0, 300) || `HTTP ${r.status}`;
    if (r.status === 401) throw new ToolError(`o Insights recusou a chave do Grimório (401): ${msg}. Ela pode ter sido revogada ou vencido — fale com um editor.`);
    if (r.status === 403) throw new ToolError(`${msg} (403 — o alcance é o de \`${autor}\`, não o da chave: confira se essa pessoa tem acesso de edição a este cliente no Insights)`);
    throw new ToolError(`${msg} (${r.status})`);
  }
  return dados as T;
}

// ── tipos do que a API devolve (só o que usamos) ─────────────────────────────
interface Cliente { id: number; name: string }
interface Projeto { id: number; name: string }
interface Documento { id: number; name: string; code: string; type?: string; entry_path?: string | null; published_at?: string | null }
interface Eu { email: string; name: string; role: string; poderes: string[]; envio?: { maxArquivosPorVez?: number; tetoPadraoBytes?: number } }

const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : ((v as { items?: T[] })?.items ?? []));

// ── destino: onde publicar ───────────────────────────────────────────────────

export interface DestinoInput { cliente?: string; projeto?: string; autor?: string }

/** Navega Cliente → Projeto → Documento. Só JSON pequeno: é o passo de DECIDIR onde a
 *  análise vai, antes de mover qualquer arquivo. */
export async function insightsDestino(env: ToolEnv & InsightsEnv, user: ToolUser, input: DestinoInput): Promise<string> {
  const autor = autorDe(user, input.autor);
  await logUsage(env.DB, { email: user.email, tool: 'insights_destino' });
  const o: string[] = [];

  if (!input.cliente) {
    const cs = lista<Cliente>(await api(env, '/clients', { autor }));
    o.push(`# Clientes no Insights (${cs.length}) — assinando como \`${autor}\``, '');
    if (!cs.length) o.push('_(nenhum cliente que essa pessoa alcance — confira o acesso dela no Insights)_');
    for (const c of cs) o.push(`- \`${c.id}\` ${c.name}`);
    o.push('', 'Escolha um e chame de novo com `cliente:"<id ou nome>"` para ver os projetos.');
    return o.join('\n');
  }

  const cs = lista<Cliente>(await api(env, '/clients', { autor }));
  const cli = acha(cs, input.cliente, (x) => x.name);
  if (!cli) throw new ToolError(`não achei o cliente "${input.cliente}". Chame sem o filtro de cliente para ver a lista inteira.`);

  const ps = lista<Projeto>(await api(env, `/clients/${cli.id}/projects`, { autor }));
  if (!input.projeto) {
    o.push(`# ${cli.name} — ${ps.length} projeto(s)`, '');
    for (const p of ps) o.push(`- \`${p.id}\` ${p.name}`);
    if (!ps.length) o.push('_(nenhum projeto ainda)_');
    o.push('', 'Chame de novo com `projeto:"<id ou nome>"` para ver os documentos, ou vá direto ao `insights_preparar`.');
    return o.join('\n');
  }

  const prj = acha(ps, input.projeto, (x) => x.name);
  if (!prj) throw new ToolError(`não achei o projeto "${input.projeto}" em ${cli.name}. Projetos: ${ps.map((p) => p.name).join(' · ') || '(nenhum)'}`);
  const ts = lista<Documento>(await api(env, `/projects/${prj.id}/trackings`, { autor }));
  o.push(`# ${cli.name} › ${prj.name} — ${ts.length} documento(s)`, '');
  for (const t of ts) {
    o.push(`- \`${t.id}\` **${t.name}**${t.published_at ? ` · no ar em https://insights.witly.com.br/v/${t.code}/` : ' · _nunca publicado_'}`);
  }
  if (!ts.length) o.push('_(nenhum documento ainda — o `insights_preparar` cria)_');
  o.push('', `Para publicar uma análise aqui: \`insights_preparar({projeto:${prj.id}, nome:"…"})\` (ou \`documento:<id>\` para substituir a análise de um que já existe).`);
  return o.join('\n');
}

function acha<T>(itens: T[], busca: string, nome: (x: T) => string): T | undefined {
  const b = String(busca).trim().toLowerCase();
  const porId = itens.find((x) => String((x as { id: number }).id) === b);
  if (porId) return porId;
  return itens.find((x) => nome(x).toLowerCase() === b) ?? itens.find((x) => nome(x).toLowerCase().includes(b));
}

// ── preparar: cria (ou reusa) o documento e devolve como subir os arquivos ────

export interface PrepararInput { projeto?: string | number; cliente?: string; documento?: number; nome?: string; tipo?: string; autor?: string }

export async function insightsPreparar(env: ToolEnv & InsightsEnv, user: ToolUser, input: PrepararInput): Promise<string> {
  const autor = autorDe(user, input.autor);
  let doc: Documento;

  if (input.documento) {
    doc = await api<Documento>(env, `/trackings/${input.documento}`, { autor });
  } else {
    if (!input.projeto) throw new ToolError('diga em qual projeto: `projeto:<id>`. Não sabe? `insights_destino({cliente:"…"})` lista os projetos.');
    const nome = nomeDocumento(input.nome);
    let projetoId = Number(input.projeto);
    if (!Number.isFinite(projetoId)) {
      if (!input.cliente) throw new ToolError('para achar o projeto pelo nome preciso também do `cliente`. Ou passe o id do projeto.');
      const cs = lista<Cliente>(await api(env, '/clients', { autor }));
      const cli = acha(cs, input.cliente, (x) => x.name);
      if (!cli) throw new ToolError(`não achei o cliente "${input.cliente}".`);
      const ps = lista<Projeto>(await api(env, `/clients/${cli.id}/projects`, { autor }));
      const prj = acha(ps, String(input.projeto), (x) => x.name);
      if (!prj) throw new ToolError(`não achei o projeto "${input.projeto}" em ${cli.name}.`);
      projetoId = prj.id;
    }
    doc = await api<Documento>(env, `/projects/${projetoId}/trackings`, { metodo: 'POST', autor, corpo: { name: nome, type: input.tipo || 'analise' } });
  }

  const eu = await api<Eu>(env, '/me', { autor });
  const token = await signUpload(signingKey(env), doc.id, autor);
  const url = `${(env.PUBLIC_URL || '').replace(/\/$/, '')}/up/${doc.id}?t=${encodeURIComponent(token)}&a=${encodeURIComponent(autor)}`;
  await logUsage(env.DB, { email: user.email, tool: 'insights_preparar' });

  const o: string[] = [];
  o.push(`Documento **${doc.name}** \`${doc.id}\` pronto para receber os arquivos${input.documento ? '' : ' (recém-criado)'}.`, '');
  o.push('## Suba os arquivos DA SUA MÁQUINA (não me mande o conteúdo)', '');
  o.push('O relatório tem alguns MB. Passar o arquivo por aqui seria texto gerado por mim: estoura o contexto e não é para ser feito. Rode isto no terminal, na pasta da análise:', '');
  o.push('```bash');
  o.push(`curl -sS -X POST "${url}" \\`);
  o.push('  -F "files=@relatorio.html"          # e um -F por arquivo extra, com o caminho relativo');
  o.push('```', '');
  o.push(`O nome do arquivo **é** o caminho dentro do documento: \`-F "files=@assets/grafico.png"\` vive em \`assets/grafico.png\`, então os caminhos relativos do HTML continuam funcionando. Até ${eu.envio?.maxArquivosPorVez ?? 60} arquivos por chamada. A URL vale 30 minutos e só serve para este documento.`, '');
  o.push('Nada disso aparece para o cliente ainda: cai no rascunho.', '');
  o.push('**Depois do upload, PERGUNTE ao consultor se pode publicar.** Publicar é imediato para o cliente e não se desfaz sem ele ver. Com o "pode publicar" dele na mão:', '');
  o.push(`\`insights_publicar({documento:${doc.id}, consultor_pediu:true})\``, '');
  o.push(`Assinando como \`${autor}\` — é este nome que fica no histórico do cliente.`);
  return o.join('\n');
}

// ── publicar ─────────────────────────────────────────────────────────────────

export interface PublicarInput { documento: number; principal?: string; cliente_ve?: boolean; autor?: string; consultor_pediu?: boolean }

export async function insightsPublicar(env: ToolEnv & InsightsEnv, user: ToolUser, input: PublicarInput): Promise<string> {
  const autor = autorDe(user, input.autor);
  const id = Number(input.documento);
  if (!Number.isFinite(id)) throw new ToolError('`documento` é o id numérico que o `insights_preparar` devolveu.');
  // Publicar é a única ação daqui que o cliente vê na hora, e ninguém desfaz sem ele ter
  // visto. Quem decide entregar é o consultor, não o agente: sem o pedido dele, para aqui.
  if (input.consultor_pediu !== true) {
    throw new ToolError(
      'publicar coloca a análise na frente do cliente AGORA, e isso é decisão do consultor, não sua. '
      + 'Mostre a ele o que está no rascunho, pergunte se pode publicar, e só com o sim repita com `consultor_pediu:true`. '
      + 'Se ele quiser ver antes, o rascunho continua lá — nada se perde esperando.');
  }

  if (input.principal) await api(env, `/trackings/${id}`, { metodo: 'PATCH', autor, corpo: { entry_path: input.principal } });

  const antes = await api<{ files?: unknown[] }>(env, `/trackings/${id}/diff`, { autor }).catch(() => null);
  const pub = await api<{ ok: boolean; files: number }>(env, `/trackings/${id}/publish`, { metodo: 'POST', autor });
  if (input.cliente_ve !== false) await api(env, `/trackings/${id}`, { metodo: 'PATCH', autor, corpo: { client_access: true } });

  const doc = await api<Documento>(env, `/trackings/${id}`, { autor });
  await logUsage(env.DB, { email: user.email, tool: 'insights_publicar' });

  const o: string[] = [];
  o.push(`**${doc.name}** está no ar com ${pub.files} arquivo(s).`, '');
  o.push(`https://insights.witly.com.br/v/${doc.code}/`, '');
  o.push(input.cliente_ve === false
    ? 'O cliente **não** vê na área dele (você pediu `cliente_ve:false`) — só quem tiver o link.'
    : 'O cliente dono passa a ver na área dele **agora**. Publicar é imediato do ponto de vista dele.');
  if (antes && Array.isArray(antes.files) && antes.files.length) o.push('', `Mudaram ${antes.files.length} arquivo(s) em relação ao que estava no ar.`);
  o.push('', `Assinado por \`${autor}\`. Link público com prazo ou senha: \`insights_link({documento:${id}})\`.`);
  return o.join('\n');
}

// ── link público ─────────────────────────────────────────────────────────────

export interface LinkInput { documento: number; expira_em?: string; senha?: string; autor?: string }

export async function insightsLink(env: ToolEnv & InsightsEnv, user: ToolUser, input: LinkInput): Promise<string> {
  const autor = autorDe(user, input.autor);
  const id = Number(input.documento);
  if (!Number.isFinite(id)) throw new ToolError('`documento` é o id numérico do documento.');
  const corpo: Record<string, string> = {};
  if (input.expira_em) corpo.expires_at = String(input.expira_em);
  if (input.senha) corpo.senha = String(input.senha);
  const s = await api<{ code: string; url: string; expires_at?: string | null }>(env, `/trackings/${id}/shares`, { metodo: 'POST', autor, corpo });
  await logUsage(env.DB, { email: user.email, tool: 'insights_link' });
  return [`Link público criado: ${s.url}`, '',
    s.expires_at ? `Expira em ${s.expires_at}.` : 'Sem prazo — vale até alguém revogar.',
    input.senha ? 'Protegido por senha: mande a senha por outro canal, nunca no mesmo lugar do link.' : '',
    '', `Assinado por \`${autor}\`.`].filter(Boolean).join('\n');
}
