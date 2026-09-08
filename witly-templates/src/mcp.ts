/* mcp — o servidor MCP (McpAgent num Durable Object). A lógica está em kit/tools.ts;
 * aqui só registro, revalidação de acesso e tradução de erro. */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { z } from 'zod';
import { isStillActive } from './auth/access.js';
import type { Props } from './auth/google.js';
import { listTemplates, listGeneralContexts } from './db/index.js';
import { guia, listarTemplates, montarQueries, obterTemplate, perguntas, resourceText, ToolError, type ToolUser } from './kit/tools.js';
import { avaliar, registrar } from './kit/activity.js';
import { removerTemplate, salvarTemplate } from './kit/personal.js';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
const text = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] });
const fail = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }], isError: true });

export class TemplatesMcp extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({ name: 'witly-grimorio', version: '0.1.0' });

  /** Revalida o usuário a cada tool: token válido + usuário removido = erro (spec US3.3). */
  protected async requireUser(): Promise<ToolUser> {
    const email = this.props?.email;
    if (!email) throw new ToolError('unauthorized: sem identidade no token');
    const u = await isStillActive(this.env.DB, email);
    if (!u) throw new ToolError('unauthorized: acesso removido — peça a um editor para reativar');
    return { email: u.email, name: this.props?.name || u.name || u.email };
  }

  private async run(fn: (u: ToolUser) => Promise<string>): Promise<ToolResult> {
    try {
      return text(await fn(await this.requireUser()));
    } catch (e) {
      if (e instanceof ToolError) return fail(e.message);
      return fail(`erro interno: ${(e as Error).message}`);
    }
  }

  async init(): Promise<void> {
    this.server.registerTool('listar_templates', {
      description: 'Catálogo dos templates de análise da Witly publicados: slug, objetivo, quando usar, tarefas de contexto e parâmetros. Comece por aqui.',
      inputSchema: {},
    }, async () => this.run((u) => listarTemplates(this.env, u)));

    this.server.registerTool('obter_template', {
      description: 'O kit-pai completo de um template: manifesto, tarefas de contexto (o que levantar com o consultor antes de gerar), queries, estrutura do documento, guia de leitura e contextos gerais — mais a URL assinada para baixar o zip com o Python, o viewer e o exemplo (baixe com curl; não leia o zip pelo contexto).',
      inputSchema: { slug: z.string().describe('slug do template, ex.: acompanhamento-diario') },
    }, async ({ slug }) => this.run((u) => obterTemplate(this.env, u, slug)));

    this.server.registerTool('montar_query', {
      description: 'Devolve o SQL do template já com os parâmetros preenchidos e escapados, pronto para rodar no Delfos (Witly_Query). Seleciona as queries que casam com os parâmetros (ex.: tipo_funil).',
      inputSchema: {
        slug: z.string().describe('slug do template'),
        params: z.record(z.string(), z.union([z.string(), z.number()])).describe('valores dos parâmetros declarados no manifesto, ex.: {"field_conversion":"lcto-x","tipo_funil":"lancamento-padrao"}'),
      },
    }, async ({ slug, params }) => this.run((u) => montarQueries(this.env, u, slug, params)));

    this.server.registerTool('guia', {
      description: 'Só o guia de leitura de um template (definições, benchmarks, o que não concluir) + os contextos gerais. Use ao revisar ou aprofundar um documento já gerado.',
      inputSchema: { slug: z.string() },
    }, async ({ slug }) => this.run((u) => guia(this.env, u, slug)));

    this.server.registerTool('perguntas', {
      description: 'Banco de perguntas norteadoras de um template: o que vale aprofundar em cada caso e como. A relevância para UMA campanha sai em saida/perguntas.json depois do gerar.py; apresente as mais relevantes ao consultor no chat (não no HTML).',
      inputSchema: { slug: z.string() },
    }, async ({ slug }) => this.run((u) => perguntas(this.env, u, slug)));

    this.server.registerTool('registrar', {
      description: 'Registra o que você fez para o editor do template ver e melhorar o template: geracao (ao terminar o documento), aprofundamento (cada pergunta respondida, com a resposta em prosa + tabelas agregadas e, se houver, a avaliação/descarte do consultor) ou edicao. NUNCA inclua e-mail, telefone, CPF ou nome de lead — o registro é recusado.',
      inputSchema: {
        evento: z.enum(['geracao', 'aprofundamento', 'edicao']),
        slug: z.string(),
        versao: z.number().int().optional(),
        cliente: z.string().optional().describe('slug do cliente (não nome de pessoa)'),
        contexto: z.record(z.string(), z.unknown()).optional().describe('geracao: resultado das tarefas de contexto'),
        resultado: z.record(z.string(), z.unknown()).optional().describe('geracao: {titulo, secoes, problemas}'),
        pergunta: z.string().optional(),
        pergunta_id: z.string().optional().describe('id no banco de perguntas, se veio de lá'),
        resposta: z.string().optional(),
        consultas: z.array(z.unknown()).optional().describe('consultas do query_api usadas'),
        avaliacao: z.number().int().min(1).max(5).optional(),
        descartado: z.boolean().optional(),
        motivo: z.string().optional(),
        mudanca: z.string().optional().describe('edicao: o que mudou e por quê'),
      },
    }, async (input) => this.run((u) => registrar(this.env, u, input)));

    this.server.registerTool('avaliar', {
      description: 'Nota de 1 a 5 do consultor para o template (não para uma resposta): o que faltou, o que sobrou.',
      inputSchema: { slug: z.string(), nota: z.number().int().min(1).max(5), comentario: z.string().optional() },
    }, async ({ slug, nota, comentario }) => this.run((u) => avaliar(this.env, u, slug, nota, comentario)));

    this.server.registerTool('salvar_template', {
      description: 'Salva um template PESSOAL (só você vê e usa) no mesmo formato dos oficiais: manifesto, arquivos (queries/*.sql, python/*.py, guia.md, documento.md…) e tarefas de contexto. Slug seu já existente = versão nova. Um editor pode promover para todos na UI. Sem dado pessoal.',
      inputSchema: {
        slug: z.string(), name: z.string(), objective: z.string().optional(), when_to_use: z.string().optional(),
        manifest: z.record(z.string(), z.unknown()).optional(),
        arquivos: z.record(z.string(), z.string()).optional().describe('caminho → conteúdo'),
        contexto: z.record(z.string(), z.object({ title: z.string().optional(), body_md: z.string().optional() })).optional().describe('tarefa → página'),
        notas: z.string().optional(), changelog: z.string().optional(),
      },
    }, async (input) => this.run((u) => salvarTemplate(this.env, u, input)));

    this.server.registerTool('remover_template', {
      description: 'Remove um template pessoal seu. A atividade dele fica no histórico.',
      inputSchema: { slug: z.string() },
    }, async ({ slug }) => this.run((u) => removerTemplate(this.env, u, slug)));

    this.server.registerTool('quem_sou', {
      description: 'Identidade do usuário logado neste MCP (diagnóstico).',
      inputSchema: {},
    }, async () => this.run(async (u) => `${u.name} <${u.email}>`));

    // Resources: o mesmo conteúdo como contexto passivo.
    const read = async (uri: URL) => {
      const u = await this.requireUser();
      const t = await resourceText(this.env, uri.href, u.email);
      if (t == null) throw new ToolError(`resource não encontrado: ${uri.href}`);
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: t }] };
    };
    const listTpl = async () => {
      const u = await this.requireUser();
      const rows = (await listTemplates(this.env.DB, this.env.ORG_ID, u.email)).filter((r) => r.published_version_id);
      return { resources: rows.flatMap((r) => [
        { uri: `template://${r.slug}`, name: `${r.name} — manifesto` },
        { uri: `template://${r.slug}/guia`, name: `${r.name} — guia` },
        { uri: `template://${r.slug}/documento`, name: `${r.name} — documento` },
      ]) };
    };
    this.server.registerResource('template', new ResourceTemplate('template://{slug}', { list: listTpl }), { description: 'Manifesto de um template' }, read);
    this.server.registerResource('template-parte', new ResourceTemplate('template://{slug}/{parte}', { list: undefined }), { description: 'guia | documento | perguntas | exemplo de um template' }, read);
    this.server.registerResource('contrato-widgets', 'contrato://widgets', { description: 'Design system dos aprofundamentos: widgets, binds, layout e regras' }, read);
    this.server.registerResource('template-contexto', new ResourceTemplate('template://{slug}/contexto/{tarefa}', { list: undefined }), { description: 'Página detalhada de uma tarefa de contexto' }, read);
    this.server.registerResource('contexto-geral', new ResourceTemplate('contexto://geral/{slug}', {
      list: async () => ({ resources: (await listGeneralContexts(this.env.DB, this.env.ORG_ID)).map((g) => ({ uri: `contexto://geral/${g.slug}`, name: g.title })) }),
    }), { description: 'Contexto geral (vale para toda análise)' }, read);
  }
}
