/* versao-proposta — `propor_versao`: o agente sobe o template JÁ CORRIGIDO como rascunho.
 *
 * Por que existe: quando o agente conserta algo durante o trabalho (a tarefa que faltava
 * uma checagem, a query sem uma coluna, o guia que explicava errado), o caminho antigo era
 * descrever o conserto em prosa — `sugerir_regra` — e o editor reescrever tudo à mão a
 * partir da frase. Trabalho feito duas vezes, e a segunda pior: quem reescreve não viu o
 * caso que motivou.
 *
 * O que ele NÃO faz: publicar. Escreve no rascunho, que só chega ao agente quando um
 * editor revisa o diff e publica. A versão publicada nunca é tocada por aqui. */

import { ensureDraft, getPublishedKit, getTemplate, getVersionFiles, insertActivity, logUsage, saveFile, saveTemplateRule, saveContextTask, getTemplateRules, getContextTasks, saveManifest, CONTEXTO_TIPOS, type ContextoTipo } from '../db/index.js';
import { lineDiff } from './versions.js';
import { checkPii, piiMessage } from './pii.js';
import { ToolError, type ToolEnv, type ToolUser } from './tools.js';

const PATH_RE = /^[a-z0-9][a-z0-9._\-/]{0,120}$/i;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;

export interface ProporVersaoInput {
  slug: string;
  motivo: string;
  arquivos?: Record<string, string>;
  tarefas?: Record<string, { title?: string; body_md?: string }>;
  regras?: Record<string, { tipo?: string; title?: string; body_md?: string }>;
  manifest?: Record<string, unknown>;
  cliente?: string;
  forcar?: boolean;
}

/** Resumo legível do que mudou em relação à PUBLICADA — é o que o editor lê antes de decidir. */
function resumoDiff(antes: string, depois: string): { linhas: number; trecho: string } {
  const d = lineDiff(antes, depois, 1);
  const linhas = d.filter((l) => l.startsWith('+') || l.startsWith('-')).length;
  return { linhas, trecho: d.slice(0, 14).join('\n') };
}

export async function proporVersao(env: ToolEnv, user: ToolUser, input: ProporVersaoInput): Promise<string> {
  const slug = String(input.slug || '').trim().toLowerCase();
  const t = await getTemplate(env.DB, slug);
  if (!t) throw new ToolError(`template não existe: ${slug}`);
  if (!t.published_version_id) throw new ToolError(`${slug} ainda não tem versão publicada: não há de onde partir`);

  const motivo = String(input.motivo ?? '').trim();
  if (motivo.length < 15) {
    throw new ToolError('motivo obrigatório: o que aconteceu NA ANÁLISE que mostrou o problema, e o que a mudança corrige. Uma frase concreta — é o que o editor lê para decidir se publica.');
  }

  const arquivos = Object.entries(input.arquivos || {});
  const tarefas = Object.entries(input.tarefas || {});
  const regras = Object.entries(input.regras || {});
  if (!arquivos.length && !tarefas.length && !regras.length && !input.manifest) {
    throw new ToolError('mande ao menos uma mudança: `arquivos` (guia.md, documento.md, queries/x.sql, python/calc.py…), `tarefas`, `regras` ou `manifest`');
  }

  const enc = new TextEncoder();
  let total = 0;
  for (const [path, content] of arquivos) {
    if (!PATH_RE.test(path)) throw new ToolError(`caminho inválido: ${path}`);
    if (typeof content !== 'string') throw new ToolError(`conteúdo de ${path} deve ser texto`);
    const n = enc.encode(content).length;
    if (n > MAX_FILE_BYTES) throw new ToolError(`${path} passa de ${MAX_FILE_BYTES / 1024} KB`);
    total += n;
  }
  if (total > MAX_TOTAL_BYTES) throw new ToolError(`as mudanças somam mais de ${MAX_TOTAL_BYTES / 1024 / 1024} MB: mande só os arquivos que você mexeu`);
  for (const [id] of tarefas) if (!ID_RE.test(id)) throw new ToolError(`id de tarefa inválido: ${id}`);
  for (const [id] of regras) if (!ID_RE.test(id)) throw new ToolError(`id de regra inválido: ${id}`);

  const pii = checkPii({ arquivos: input.arquivos, tarefas: input.tarefas, regras: input.regras, motivo }, [user.email]);
  if (!pii.ok) throw new ToolError(piiMessage(pii));

  // Estado ANTES de mexer: é contra a publicada que o diff faz sentido, e é o rascunho
  // alheio que não pode ser atropelado sem aviso.
  const pub = await getPublishedKit(env.DB, slug);
  const pubFiles = new Map((pub?.files || []).map((f) => [f.path, f.content]));
  const rascunhoJaExistia = !!t.draft_version_id;
  const draft = await ensureDraft(env.DB, slug, user.email);
  const draftFiles = new Map((await getVersionFiles(env.DB, draft.id)).map((f) => [f.path, f.content]));

  const colisao: string[] = [];
  if (rascunhoJaExistia && draft.author_email && draft.author_email !== user.email) {
    for (const [path] of arquivos) {
      const d = draftFiles.get(path); const p = pubFiles.get(path);
      if (d != null && p != null && d !== p) colisao.push(path);
    }
    if (colisao.length && !input.forcar) {
      throw new ToolError(
        `o rascunho de ${slug} já tem mudança não publicada de ${draft.author_email} em: ${colisao.join(', ')}. `
        + 'Sobrescrever apagaria o trabalho dessa pessoa. Fale com ela, ou mande `forcar: true` se souber que pode.');
    }
  }

  // Aplica no RASCUNHO. Nada aqui toca a versão publicada.
  const mudou: string[] = [];
  const iguais: string[] = [];
  const diffs: string[] = [];
  for (const [path, content] of arquivos) {
    const atual = draftFiles.get(path);
    if (atual === content) { iguais.push(path); continue; }
    await saveFile(env.DB, draft.id, path, content);
    const base = pubFiles.get(path);
    const r = resumoDiff(base ?? '', content);
    mudou.push(`${path}${base == null ? ' (novo)' : ` (${r.linhas} linha(s))`}`);
    if (diffs.length < 4 && r.trecho) diffs.push(`#### ${path}\n\n\`\`\`diff\n${r.trecho}\n\`\`\``);
  }
  if (tarefas.length) {
    const atuais = await getContextTasks(env.DB, draft.id);
    for (const [id, tk] of tarefas) {
      const cur = atuais.find((x) => x.task_id === id);
      await saveContextTask(env.DB, draft.id, {
        task_id: id, title: String(tk?.title || cur?.title || id).trim(),
        body_md: String(tk?.body_md ?? cur?.body_md ?? ''), sort: cur?.sort ?? atuais.length,
      });
      mudou.push(`tarefa \`${id}\`${cur ? '' : ' (nova)'}`);
    }
  }
  if (regras.length) {
    const atuais = await getTemplateRules(env.DB, draft.id);
    for (const [id, r] of regras) {
      const cur = atuais.find((x) => x.rule_id === id);
      const tipo: ContextoTipo = CONTEXTO_TIPOS.find((x) => x === r?.tipo) ?? cur?.tipo ?? 'regra';
      const title = String(r?.title || cur?.title || '').trim();
      if (!title) throw new ToolError(`regra ${id}: title obrigatório (a regra em uma frase)`);
      await saveTemplateRule(env.DB, draft.id, { rule_id: id, tipo, title, body_md: String(r?.body_md ?? cur?.body_md ?? ''), sort: cur?.sort ?? atuais.length });
      mudou.push(`regra \`${id}\`${cur ? '' : ' (nova)'}`);
    }
  }
  if (input.manifest && typeof input.manifest === 'object') {
    await saveManifest(env.DB, draft.id, input.manifest);
    mudou.push('manifesto');
  }

  if (!mudou.length) {
    return `Nada mudou: o rascunho de ${slug} já estava idêntico ao que você mandou (${iguais.join(', ')}). Nenhuma versão foi criada.`;
  }

  const id = await insertActivity(env.DB, {
    org_id: env.ORG_ID, email: user.email, evento: 'versao', slug,
    version_number: draft.number, cliente: input.cliente ?? null,
    dados: { motivo, mudou, iguais, colisao, forcado: !!input.forcar, diffs },
    origem: 'mcp',
  });
  await logUsage(env.DB, { email: user.email, tool: 'propor_versao', slug, version_number: draft.number });

  const o: string[] = [];
  o.push(`Rascunho **v${draft.number}** de \`${slug}\` atualizado — **NÃO publicado**.`, '');
  o.push(`Mudou: ${mudou.join(' · ')}.`);
  if (iguais.length) o.push(`Já estava igual (ignorado): ${iguais.join(', ')}.`);
  if (colisao.length) o.push(`⚠ Você sobrescreveu mudança não publicada de ${draft.author_email} em: ${colisao.join(', ')}.`);
  o.push('');
  o.push(`Entrou na fila de triagem (id \`${id}\`). Um editor vê o diff contra a publicada e decide publicar ou descartar — **o agente continua recebendo a versão publicada até lá**, então não conte com esta mudança na análise de agora.`);
  o.push('', 'Diga ao consultor o que você mudou e por quê: é ele quem sabe se o conserto faz sentido para o cliente.');
  return o.join('\n');
}
