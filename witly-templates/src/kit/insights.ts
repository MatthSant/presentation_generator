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

function acha<T>(itens: T[], busca: string, nome: (x: T) => string): T | undefined {
  const b = String(busca).trim().toLowerCase();
  const porId = itens.find((x) => String((x as { id: number }).id) === b);
  if (porId) return porId;
  return itens.find((x) => nome(x).toLowerCase() === b) ?? itens.find((x) => nome(x).toLowerCase().includes(b));
}

// ── entregar_analise: uma conversa em etapas ─────────────────────────────────
//
// Uma tool só, não quatro. As etapas não são independentes — "preparar" sozinho não
// significa nada, e publicar antes do upload põe documento vazio na frente do cliente. Em
// tools separadas a ordem fica por conta do agente; aqui ela é do servidor.
//
// A etapa não é declarada pelo agente: é DEDUZIDA do estado real no Insights (o documento
// existe? tem arquivo no rascunho? já está no ar?). Então "já subi" e "já publiquei" são
// verificados, não acreditados — que é a diferença entre um roteiro e uma lista de botões.

export interface EntregarInput {
  cliente?: string;
  projeto?: string | number;
  documento?: number;
  nome?: string;
  tipo?: string;
  autor?: string;
  consultor_pediu?: boolean;
  principal?: string;
  cliente_ve?: boolean;
  link?: { expira_em?: string; senha?: string };
}

interface Arquivo { path: string; version?: string }

const cabeca = (etapa: string, de: number, autor: string): string[] =>
  [`## Entrega da análise — etapa ${de} de 5: **${etapa}**`, '', `_assinando como \`${autor}\`_`, ''];

export async function entregarAnalise(env: ToolEnv & InsightsEnv, user: ToolUser, input: EntregarInput): Promise<string> {
  const autor = autorDe(user, input.autor);
  await logUsage(env.DB, { email: user.email, tool: 'entregar_analise' });

  // ── etapa 1: onde ──────────────────────────────────────────────────────────
  if (!input.documento && !input.projeto) return await etapaOnde(env, autor, input);

  // ── resolve o documento (cria se for novo) ─────────────────────────────────
  let doc: Documento;
  let recemCriado = false;
  if (input.documento) {
    doc = await api<Documento>(env, `/trackings/${input.documento}`, { autor });
  } else {
    const nome = nomeDocumento(input.nome);
    const projetoId = await achaProjeto(env, autor, input);
    // Criar é o único passo daqui que deixa sujeira difícil de ver: um documento vazio no
    // projeto do cliente, que ninguém procura porque não está no ar. Se já existe um com
    // este nome, quase sempre a intenção era SUBSTITUIR a análise dele.
    const jaTem = lista<Documento>(await api(env, `/projects/${projetoId}/trackings`, { autor }))
      .find((t) => t.name.trim().toLowerCase() === nome.toLowerCase());
    if (jaTem) {
      throw new ToolError(
        `o projeto já tem um documento chamado "${jaTem.name}" (\`${jaTem.id}\`). Criar outro com o mesmo nome deixa dois iguais na lista do cliente. `
        + `Para trocar a análise dele — mantendo o link que o cliente já tem — use \`{documento:${jaTem.id}}\`. `
        + 'Se for mesmo um documento novo e diferente, mande um `nome` que os distinga.');
    }
    doc = await api<Documento>(env, `/projects/${projetoId}/trackings`, {
      metodo: 'POST', autor, corpo: { name: nome, type: input.tipo || 'analise' },
    });
    recemCriado = true;
  }

  // ── o que já existe no rascunho decide a etapa ─────────────────────────────
  const arquivos = await api<{ files?: Arquivo[] } | Arquivo[]>(env, `/trackings/${doc.id}/files`, { autor });
  const todos: Arquivo[] = Array.isArray(arquivos) ? arquivos : (arquivos.files ?? []);
  const staging = todos.filter((f) => !f.version || f.version === 'staging');

  if (!staging.length) return await etapaSubir(env, autor, doc, recemCriado);
  if (input.consultor_pediu === true) return await etapaPublicar(env, autor, doc, staging, input);
  if (input.link && doc.published_at) return await etapaLink(env, autor, doc, input.link);
  return await etapaConferir(env, autor, doc, staging);
}

async function achaProjeto(env: ToolEnv & InsightsEnv, autor: string, input: EntregarInput): Promise<number> {
  const id = Number(input.projeto);
  if (Number.isFinite(id)) return id;
  if (!input.cliente) throw new ToolError('para achar o projeto pelo nome preciso também do `cliente` — ou passe o id do projeto.');
  const cs = lista<Cliente>(await api(env, '/clients', { autor }));
  const cli = acha(cs, input.cliente, (x) => x.name);
  if (!cli) throw new ToolError(`não achei o cliente "${input.cliente}". Chame sem \`cliente\` e sem \`projeto\` para ver a lista.`);
  const ps = lista<Projeto>(await api(env, `/clients/${cli.id}/projects`, { autor }));
  const prj = acha(ps, String(input.projeto), (x) => x.name);
  if (!prj) throw new ToolError(`não achei o projeto "${input.projeto}" em ${cli.name}. Projetos: ${ps.map((p) => p.name).join(' · ') || '(nenhum)'}`);
  return prj.id;
}

async function etapaOnde(env: ToolEnv & InsightsEnv, autor: string, input: EntregarInput): Promise<string> {
  const o = cabeca('onde a análise vai', 1, autor);
  const cs = lista<Cliente>(await api(env, '/clients', { autor }));
  if (!input.cliente) {
    o.push(`${cs.length} cliente(s) que \`${autor}\` alcança:`, '');
    for (const c of cs) o.push(`- \`${c.id}\` ${c.name}`);
    if (!cs.length) o.push('_(nenhum — confira o acesso dessa pessoa no Insights)_');
    o.push('', '**Próximo:** chame de novo com `cliente:"<id ou nome>"` para ver os projetos.');
    return o.join('\n');
  }
  const cli = acha(cs, input.cliente, (x) => x.name);
  if (!cli) throw new ToolError(`não achei o cliente "${input.cliente}". Chame sem argumento para ver a lista.`);
  const ps = lista<Projeto>(await api(env, `/clients/${cli.id}/projects`, { autor }));
  o.push(`**${cli.name}** — ${ps.length} projeto(s):`, '');
  for (const p of ps) {
    const ts = lista<Documento>(await api(env, `/projects/${p.id}/trackings`, { autor }));
    o.push(`- \`${p.id}\` **${p.name}** — ${ts.length} documento(s)`);
    for (const t of ts.slice(0, 6)) {
      o.push(`    - \`${t.id}\` ${t.name}${t.published_at ? ' · no ar' : ' · _nunca publicado_'}`);
    }
  }
  if (!ps.length) o.push('_(nenhum projeto ainda)_');
  o.push('', '**Próximo:** documento NOVO → `{projeto:<id>, nome:"Debriefing · Cria abr/26"}`. '
    + 'SUBSTITUIR a análise de um que já existe (o link do cliente não muda) → `{documento:<id>}`.');
  return o.join('\n');
}

/** O comando de upload. Serve ao documento vazio (etapa 2) E a subir por cima de um que já
 *  tem rascunho (etapa 3) — substituir a análise é o caso normal, não a exceção. Antes só a
 *  etapa 2 devolvia isto, então quem já tinha subido uma vez não conseguia mandar a versão
 *  corrigida: a etapa 3 dizia "suba por cima" sem dar o meio de fazê-lo. */
async function comandoDeUpload(env: ToolEnv & InsightsEnv, autor: string, doc: Documento, exemplo = 'relatorio.html'): Promise<string[]> {
  const token = await signUpload(signingKey(env), doc.id, autor);
  const url = `${(env.PUBLIC_URL || '').replace(/\/$/, '')}/up/${doc.id}?t=${encodeURIComponent(token)}&a=${encodeURIComponent(autor)}`;
  return ['```bash', `curl -sS -X POST "${url}" \\`, `  -F "files=@${exemplo}"`, '```'];
}

async function etapaSubir(env: ToolEnv & InsightsEnv, autor: string, doc: Documento, novo: boolean): Promise<string> {
  const eu = await api<Eu>(env, '/me', { autor });
  const o = cabeca('subir os arquivos', 2, autor);
  o.push(`Documento **${doc.name}** \`${doc.id}\`${novo ? ' (recém-criado)' : ''} está vazio no rascunho.`, '');
  o.push('**Rode este comando no terminal, na pasta da análise.** Não me mande o conteúdo do relatório: ele tem alguns MB, e argumento de tool é texto que você gera — o arquivo tem de sair da máquina direto para o servidor.', '');
  o.push(...await comandoDeUpload(env, autor, doc), '');
  o.push(`O nome do arquivo **é** o caminho dentro do documento: \`-F "files=@assets/grafico.png"\` vive em \`assets/grafico.png\`, então os caminhos relativos do HTML continuam funcionando. Um \`-F\` por arquivo, até ${eu.envio?.maxArquivosPorVez ?? 60} por chamada. A URL vale 30 minutos e só serve para este documento.`, '');
  o.push(`**Próximo:** com o upload feito, chame \`entregar_analise({documento:${doc.id}})\` de novo — eu confiro o que entrou e preparo o que mostrar ao consultor. Nada disso o cliente vê ainda.`);
  return o.join('\n');
}

async function etapaConferir(env: ToolEnv & InsightsEnv, autor: string, doc: Documento, staging: Arquivo[]): Promise<string> {
  const o = cabeca('conferir e PERGUNTAR ao consultor', 3, autor);
  o.push(`**${doc.name}** \`${doc.id}\` tem ${staging.length} arquivo(s) no rascunho:`, '');
  for (const f of staging.slice(0, 20)) o.push(`- \`${f.path}\``);
  if (staging.length > 20) o.push(`- _(+${staging.length - 20})_`);

  const principais = staging.filter((f) => /\.(html|md|pdf|pptx)$/i.test(f.path));
  if (principais.length > 1 && !doc.entry_path) {
    o.push('', `⚠ Há ${principais.length} arquivos que podem ser a página do documento (${principais.map((f) => `\`${f.path}\``).join(', ')}). Diga qual em \`principal:"…"\` — sem isso a publicação é recusada.`);
  }
  if (doc.published_at) {
    const d = await api<{ files?: unknown[] }>(env, `/trackings/${doc.id}/diff`, { autor }).catch(() => null);
    const n = Array.isArray(d?.files) ? d!.files!.length : null;
    o.push('', `Este documento **já está no ar**${n != null ? ` e ${n} arquivo(s) mudam em relação ao que o cliente vê hoje` : ''}. Publicar substitui o que está lá.`);
  }
  o.push('', '### Pare aqui e pergunte', '');
  o.push('Publicar põe a análise na frente do cliente **na hora**, e não se desfaz sem ele ter visto. Essa decisão é do consultor, não sua. Mostre a ele o que a análise diz, e pergunte se pode publicar.', '');
  o.push(`**Com o sim dele:** \`entregar_analise({documento:${doc.id}, consultor_pediu:true})\`${principais.length > 1 && !doc.entry_path ? ', incluindo `principal`' : ''}.`);
  o.push('', '### Trocar algum arquivo antes de publicar', '');
  o.push('Refaça e **suba por cima** — o mesmo caminho sobrescreve, e o cliente não vê nada disso. Depois volte a esta etapa. O rascunho espera o tempo que precisar.', '');
  // O exemplo usa um caminho que JÁ existe: sobrescrever é o que "subir por cima"
  // significa, e mandar `relatorio.html` num documento cujo arquivo é
  // `relatorio-2026-09-15.html` acrescentaria um quarto em vez de trocar o certo.
  o.push(...await comandoDeUpload(env, autor, doc, doc.entry_path || principais[0]?.path || staging[0]?.path));
  return o.join('\n');
}

async function etapaPublicar(env: ToolEnv & InsightsEnv, autor: string, doc: Documento, staging: Arquivo[], input: EntregarInput): Promise<string> {
  if (input.principal) await api(env, `/trackings/${doc.id}`, { metodo: 'PATCH', autor, corpo: { entry_path: input.principal } });
  const pub = await api<{ ok: boolean; files: number }>(env, `/trackings/${doc.id}/publish`, { metodo: 'POST', autor });
  if (input.cliente_ve !== false) await api(env, `/trackings/${doc.id}`, { metodo: 'PATCH', autor, corpo: { client_access: true } });
  const dep = await api<Documento>(env, `/trackings/${doc.id}`, { autor });

  const o = cabeca('publicar', 4, autor);
  o.push(`**${dep.name}** está no ar com ${pub.files} arquivo(s).`, '');
  o.push(`https://insights.witly.com.br/v/${dep.code}/`, '');
  o.push(input.cliente_ve === false
    ? 'O cliente **não** vê na área dele — só quem tiver o link.'
    : 'O cliente dono vê na área dele **agora**.');
  o.push('', `**Próximo (opcional):** link público com prazo ou senha → \`entregar_analise({documento:${doc.id}, link:{expira_em:"2026-12-31"}})\`.`);
  o.push('', `Registre a entrega: \`registrar({evento:"geracao", …, cliente:"<slug>"})\` — e mande o endereço ao consultor.`);
  return o.join('\n');
}

async function etapaLink(env: ToolEnv & InsightsEnv, autor: string, doc: Documento, link: { expira_em?: string; senha?: string }): Promise<string> {
  const corpo: Record<string, string> = {};
  if (link.expira_em) corpo.expires_at = String(link.expira_em);
  if (link.senha) corpo.senha = String(link.senha);
  const s = await api<{ url: string; expires_at?: string | null }>(env, `/trackings/${doc.id}/shares`, { metodo: 'POST', autor, corpo });
  const o = cabeca('link público', 5, autor);
  o.push(s.url, '');
  o.push(link.expira_em ? `Expira em ${s.expires_at ?? link.expira_em}.` : 'Sem prazo — vale até alguém revogar.');
  if (link.senha) o.push('Protegido por senha: mande a senha por outro canal, nunca junto do link.');
  return o.join('\n');
}
