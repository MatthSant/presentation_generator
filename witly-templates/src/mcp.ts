/* mcp — o servidor MCP (McpAgent num Durable Object). A lógica está em kit/tools.ts;
 * aqui só registro, revalidação de acesso e tradução de erro. */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { z } from 'zod';
import { isStillActive } from './auth/access.js';
import type { Props } from './auth/google.js';
import { listTemplates } from './db/index.js';
import { listarConhecimento } from './db/conhecimento.js';
import { confirmar, conhecimento, sugerir as sugerirConhecimento } from './kit/conhecimento-tools.js';
import { DOMINIOS, FAMILIAS, GATILHOS, NIVEIS, TIPO_NOMES } from './kit/conhecimento.js';
import { guia, listarTemplates, montarQueries, obterTemplate, perguntas, resourceText, ToolError, type ToolUser } from './kit/tools.js';
import { avaliar, registrar, sugerir } from './kit/activity.js';
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
      description: 'Perguntas norteadoras de um template (entradas: o título é a pergunta; o corpo, como aprofundar). Depois do gerar.py, leia numeros.json, escolha as 3–5 mais relevantes para o caso e proponha ao consultor no chat (não no HTML).',
      inputSchema: { slug: z.string() },
    }, async ({ slug }) => this.run((u) => perguntas(this.env, u, slug)));

    this.server.registerTool('registrar', {
      description: 'Registra o que você fez para o editor do template ver e melhorar o template: geracao (ao terminar o documento), aprofundamento (cada pergunta respondida, com a resposta em prosa + tabelas agregadas e, se houver, a avaliação/descarte do consultor) e feedback (AO FECHAR o trabalho com o consultor: o que segurou, o que custou rodada com prioridade e pedido, a medida de rodadas por tipo e a nota 1–5 — é assim que o kit aprende). NUNCA inclua e-mail, telefone, CPF ou nome de lead — o registro é recusado.',
      inputSchema: {
        evento: z.enum(['geracao', 'aprofundamento', 'feedback']),
        slug: z.string(),
        versao: z.number().int().optional(),
        cliente: z.string().optional().describe('slug do cliente (não nome de pessoa)'),
        contexto: z.record(z.string(), z.unknown()).optional().describe('geracao: resultado das tarefas de contexto'),
        resultado: z.record(z.string(), z.unknown()).optional().describe('geracao: {titulo, secoes, problemas}'),
        pergunta: z.string().optional(),
        pergunta_id: z.string().optional().describe('id no banco de perguntas, se veio de lá'),
        resposta: z.string().optional(),
        consultas: z.array(z.unknown()).optional().describe('tabelas/cortes usados: {name, dims, filters}'),
        avaliacao: z.number().int().min(1).max(5).optional(),
        descartado: z.boolean().optional(),
        motivo: z.string().optional(),
        segurou: z.array(z.string()).optional().describe('feedback: o que funcionou e deve ficar'),
        custou: z.array(z.object({ item: z.string().describe('o que custou rodada do consultor'), prioridade: z.enum(['alta', 'media', 'baixa']).optional(), pedido: z.string().describe('o que mudar no kit, escrito como regra'), rodadas: z.number().int().optional() })).optional().describe('feedback: cada ajuste que custou rodada'),
        medida: z.object({ apresentacao: z.number().int().optional(), filtro: z.number().int().optional(), analise: z.number().int().optional(), total: z.number().int().optional() }).optional().describe('feedback: rodadas por tipo — a régua "bom de dado, caro de aparência"'),
        nota: z.number().int().min(1).max(5).optional().describe('feedback: nota do kit neste uso'),
        resumo: z.string().optional().describe('feedback: uma linha (o que era, quantas páginas, quantas rodadas)'),
        usadas: z.array(z.object({ id: z.string(), ajudou: z.boolean().nullable().optional() })).optional().describe('entradas de conhecimento (ids) que entraram na análise e se ajudaram — evidência de uso'),
      },
    }, async (input) => this.run((u) => registrar(this.env, u, input)));

    this.server.registerTool('conhecimento', {
      description: 'O conhecimento do time em camadas: métricas, benchmarks, princípios, diagnósticos (sintoma → causa), regras, métodos, padrões de design, estilo/formato de entrega, funil, cliente, campanha, casos (o que funcionou) e testes. Filtre por tipo/família/domínio/nível/escopo/gatilho/tags ou busque por `q`; `detalhe:"indice"` (1 linha por entrada) ou `"completo"` (corpo + campos). Chame pelo gatilho da etapa: ao_consultar_dados, ao_diagnosticar, ao_recomendar, ao_escrever, ao_fechar. Cliente/campanha nomeados? `{cliente:"slug"}` / `{campanha:"id"}`.',
      inputSchema: {
        familia: z.enum(FAMILIAS).optional(), tipo: z.union([z.enum(TIPO_NOMES as [string, ...string[]]), z.array(z.enum(TIPO_NOMES as [string, ...string[]]))]).optional(),
        dominio: z.enum(DOMINIOS).optional(), nivel: z.enum(NIVEIS).optional().describe('estrategico | tatico | operacional'),
        escopo: z.union([z.string(), z.array(z.string())]).optional().describe('geral | template:<slug> | funil:<tipo> | cliente:<slug> | campanha:<id>'),
        cliente: z.string().optional(), funil: z.string().optional(), campanha: z.string().optional(),
        gatilho: z.enum(GATILHOS).optional(), tags: z.array(z.string()).optional(), ids: z.array(z.string()).optional(),
        q: z.string().optional().describe('busca de texto (título, corpo, tags), sem acento'),
        situacao: z.record(z.string(), z.string()).optional().describe('para casos: {funil, nivel, sintoma, metrica} = o que já funcionou nessa situação'),
        resultado: z.enum(['pendente', 'confirmado', 'refutado']).optional().describe('caso/teste'), origem: z.enum(['witly', 'framework']).optional().describe('metodo/principio'),
        detalhe: z.enum(['indice', 'completo']).optional(), limite: z.number().int().min(1).max(100).optional(),
      },
    }, async (input) => this.run((u) => conhecimento(this.env, u, input as never)));

    this.server.registerTool('sugerir', {
      description: 'Propõe conhecimento novo ou uma correção (nunca muda direto): entrada nova, edição (entrada_id), substituta ou fechar_resultado de caso/teste. Vai para a fila: editor ou votos decidem. Cálculo/métrica/regra de dado ERRADA que contamina as próximas análises = urgencia:"urgente" com evidencia (o número ou cálculo errado): o editor decide sozinho e, até lá, o agente mostra ao consultor antes de gerar. Exige motivo (o que aconteceu). Idêntica já aberta = só conta ocorrência; recusada há pouco = devolve o motivo. Sem dado pessoal.',
      inputSchema: {
        tipo: z.enum(TIPO_NOMES as [string, ...string[]]), titulo: z.string().describe('a frase que o agente precisa (≤ 200)'),
        corpo: z.string().optional().describe('porquê + como aplicar (≤ 2.000)'), dados: z.record(z.string(), z.unknown()).optional().describe('campos do tipo (metrica: formula…; caso: situacao, fato, causa, acao, resultado; diagnostico: sintoma, causas, checar…)'),
        escopo: z.string().optional().describe('geral | template:<slug> | funil:<tipo> | cliente:<slug> | campanha:<id>'), dominio: z.enum(DOMINIOS).optional(), nivel: z.enum(NIVEIS).optional(), tags: z.array(z.string()).optional(),
        motivo: z.string().describe('o que aconteceu na análise que mostrou a falta'), urgencia: z.enum(['urgente', 'normal', 'baixa']).optional(),
        evidencia: z.array(z.object({ atividade: z.string().optional(), trecho: z.string() })).optional().describe('obrigatória em urgente: o número/cálculo errado'),
        entrada_id: z.string().optional().describe('para edicao | substituta | fechar_resultado'), modo: z.enum(['nova', 'edicao', 'substituta', 'fechar_resultado']).optional(),
        slug: z.string().optional().describe('template relacionado (vira escopo template:<slug> se escopo não vier)'),
      },
    }, async (input) => this.run((u) => sugerirConhecimento(this.env, u, input as never)));

    this.server.registerTool('confirmar', {
      description: 'A resposta do consultor a uma proposta pendente mostrada pelo agente ("isso está certo?"): ok:true = confirma e aplica nesta análise; ok:false = recusa e segue a regra atual. Vira voto de quem está logado; a aprovação definitiva de uma urgente é na UI.',
      inputSchema: { proposta_id: z.string(), ok: z.boolean(), motivo: z.string().optional() },
    }, async ({ proposta_id, ok, motivo }) => this.run((u) => confirmar(this.env, u, proposta_id, ok, motivo)));

    this.server.registerTool('avaliar', {
      description: 'Nota de 1 a 5 do consultor para o template (não para uma resposta): o que faltou, o que sobrou.',
      inputSchema: { slug: z.string(), nota: z.number().int().min(1).max(5), comentario: z.string().optional() },
    }, async ({ slug, nota, comentario }) => this.run((u) => avaliar(this.env, u, slug, nota, comentario)));

    this.server.registerTool('salvar_template', {
      description: 'Salva um template PESSOAL (só você vê e usa) no mesmo formato dos oficiais: manifesto, arquivos (queries/*.sql, python/*.py, guia.md, documento.md…), tarefas de contexto e regras (regra, recomendação, definição, pergunta). Slug seu já existente = versão nova. Um editor pode promover para todos na UI. Sem dado pessoal.',
      inputSchema: {
        slug: z.string(), name: z.string(), objective: z.string().optional(), when_to_use: z.string().optional(),
        manifest: z.record(z.string(), z.unknown()).optional(),
        arquivos: z.record(z.string(), z.string()).optional().describe('caminho → conteúdo'),
        contexto: z.record(z.string(), z.object({ title: z.string().optional(), body_md: z.string().optional() })).optional().describe('tarefa → página'),
        regras: z.record(z.string(), z.object({ tipo: z.enum(['regra', 'recomendacao', 'definicao', 'pergunta']).optional(), title: z.string(), body_md: z.string().optional() })).optional().describe('id → entrada (o título é a regra/pergunta)'),
        notas: z.string().optional(), changelog: z.string().optional(),
      },
    }, async (input) => this.run((u) => salvarTemplate(this.env, u, input)));

    this.server.registerTool('remover_template', {
      description: 'Remove um template pessoal seu. A atividade dele fica no histórico.',
      inputSchema: { slug: z.string() },
    }, async ({ slug }) => this.run((u) => removerTemplate(this.env, u, slug)));

    this.server.registerTool('sugerir_regra', {
      description: 'Sugere uma entrada para um template: regra, recomendação, definição ou pergunta norteadora que faltou. Vai para a triagem do editor (não muda o kit sozinho); se aceita, vira entrada no rascunho. O título já deve dizer a regra. Sem dado pessoal.',
      inputSchema: {
        slug: z.string(),
        tipo: z.enum(['regra', 'recomendacao', 'definicao', 'pergunta']),
        titulo: z.string().describe('a regra/pergunta em uma frase'),
        corpo: z.string().optional().describe('por quê + como aplicar (curto)'),
        motivo: z.string().optional().describe('o que aconteceu na análise que mostrou a falta'),
      },
    }, async (input) => this.run((u) => sugerir(this.env, u, input)));

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
    this.server.registerResource('conhecimento', new ResourceTemplate('conhecimento://{id}', {
      list: async () => ({ resources: (await listarConhecimento(this.env.DB, this.env.ORG_ID, { sempre: true, limit: 60 })).map((e) => ({ uri: `conhecimento://${e.id}`, name: `[${e.tipo}] ${e.titulo}` })) }),
    }), { description: 'Uma entrada de conhecimento (corpo + campos)' }, read);
    this.server.registerResource('contexto-geral', new ResourceTemplate('contexto://geral/{slug}', { list: undefined }), { description: 'Alias antigo de conhecimento://{id}' }, read);
  }
}
