/* conhecimento — o esquema dos tipos (spec 008 §3): famílias, tipos e seus campos, eixos,
 * gatilhos e limites. Um lugar só gera a validação, o texto do MCP, a UI e o seed.
 * Sem banco aqui: puro. */

export const FAMILIAS = ['saber', 'pensar', 'fazer', 'comunicar', 'contexto', 'memoria'] as const;
export type Familia = (typeof FAMILIAS)[number];
export const FAMILIA_LABEL: Record<Familia, string> = { saber: 'Saber', pensar: 'Pensar', fazer: 'Fazer', comunicar: 'Comunicar', contexto: 'Contexto', memoria: 'Memória' };

export const DOMINIOS = ['analise', 'dados', 'midia', 'negocio', 'comunicacao', 'design'] as const;
export type Dominio = (typeof DOMINIOS)[number];

export const NIVEIS = ['estrategico', 'tatico', 'operacional'] as const;
export type Nivel = (typeof NIVEIS)[number];

export const CONFIANCAS = ['alta', 'media', 'baixa'] as const;
export type Confianca = (typeof CONFIANCAS)[number];

/** Quando a entrada é puxada (spec §6.1). `sempre` = nível 0; os demais são chamados pela etapa. */
export const GATILHOS = ['sempre', 'ao_abrir', 'ao_identificar', 'ao_consultar_dados', 'ao_diagnosticar', 'ao_recomendar', 'ao_escrever', 'ao_fechar'] as const;
export type Gatilho = (typeof GATILHOS)[number];
export const GATILHO_LABEL: Record<Gatilho, string> = {
  sempre: 'sempre', ao_abrir: 'ao abrir o template', ao_identificar: 'ao identificar cliente/campanha', ao_consultar_dados: 'antes de escrever SQL',
  ao_diagnosticar: 'quando um número saiu da faixa', ao_recomendar: 'antes de propor ação', ao_escrever: 'antes de redigir a entrega', ao_fechar: 'ao fechar o trabalho',
};

/** Vocabulário de tags sugerido (a tag continua livre; isto orienta o formulário e o filtro). Grupos só para a UI. */
export const TAGS_SUGERIDAS: Array<{ grupo: string; tags: string[] }> = [
  { grupo: 'mídia', tags: ['trafego-pago', 'meta-ads', 'google-ads', 'criativos', 'publico', 'canais', 'budget', 'escala'] },
  { grupo: 'funil', tags: ['funil', 'lancamento', 'perpetuo', 'captacao', 'conversao', 'pagina', 'checkout', 'atribuicao'] },
  { grupo: 'métricas', tags: ['metrica', 'cpl', 'cpa', 'cpmql', 'roas', 'cac', 'ltv', 'mql', 'benchmark', 'metas'] },
  { grupo: 'leitura', tags: ['numeros', 'estatistica', 'amostra', 'janela', 'tendencia', 'sazonalidade', 'diagnostico', 'agregacao'] },
  { grupo: 'dados', tags: ['dados', 'delfos', 'sql', 'filtros', 'dados-ausentes', 'lgpd'] },
  { grupo: 'entrega', tags: ['comunicacao', 'escrita', 'entrega', 'fca-r', 'vocabulario', 'dashboard', 'graficos', 'apresentacao', 'design'] },
  { grupo: 'processo', tags: ['processo', 'agente', 'mcp', 'teste', 'caso'] },
];
export const TAGS_TODAS = TAGS_SUGERIDAS.flatMap((g) => g.tags);

export const URGENCIAS = ['urgente', 'normal', 'baixa'] as const;
export type Urgencia = (typeof URGENCIAS)[number];
export const MODOS = ['nova', 'edicao', 'substituta', 'fechar_resultado', 'superseder'] as const;
export type Modo = (typeof MODOS)[number];
export const RELACOES = ['supersede', 'contradiz', 'corrige', 'sustenta'] as const;

/** Limites (spec §7). `corpo` por tipo quando difere. */
export const LIMITES = { titulo: 200, corpo: 2000, corpo_conceito: 2000, sempre: 40, indice: 40, nivel0_bytes: 10 * 1024, indice_bytes: 6 * 1024, tool_completo: 20, tool_indice: 100 } as const;

export type CampoKind = 'texto' | 'lista' | 'objeto' | 'enum' | 'numero' | 'id' | 'ids' | 'data';
export interface Campo { nome: string; kind: CampoKind; obrigatorio?: boolean; opcoes?: readonly string[]; dica?: string }
export interface TipoDef { tipo: string; familia: Familia; label: string; e: string; campos: Campo[]; gatilhos_padrao: Gatilho[] }

const c = (nome: string, kind: CampoKind, extra: Partial<Campo> = {}): Campo => ({ nome, kind, ...extra });

/** Os 17 tipos (spec §3.2). A ordem é a da UI. */
export const TIPOS: TipoDef[] = [
  // Saber
  { tipo: 'conceito', familia: 'saber', label: 'Conceito', e: 'um fenômeno ou ideia aplicado aos negócios que analisamos: onde aparece, onde já aconteceu, o cuidado (não é enciclopédia)',
    campos: [c('o_que_e', 'texto', { dica: '1 linha de teoria' }), c('onde_aparece', 'lista', { obrigatorio: true, dica: 'situações dos nossos negócios: funil, métrica, momento' }), c('ja_aconteceu', 'ids', { dica: 'ids de caso' }), c('cuidado', 'lista', { obrigatorio: true }), c('referencia', 'texto', { dica: 'link externo, opcional' })],
    gatilhos_padrao: ['ao_escrever'] },
  { tipo: 'definicao', familia: 'saber', label: 'Definição', e: 'vocabulário: uma palavra, um sentido', campos: [c('termos', 'lista')], gatilhos_padrao: ['ao_escrever'] },
  { tipo: 'metrica', familia: 'saber', label: 'Métrica', e: 'número com fórmula e leitura',
    campos: [c('formula', 'texto', { obrigatorio: true }), c('unidade', 'texto'), c('melhor', 'enum', { opcoes: ['maior', 'menor'] }), c('onde', 'texto', { dica: 'view.coluna no Delfos' }), c('armadilhas', 'lista')],
    gatilhos_padrao: ['ao_consultar_dados', 'ao_escrever'] },
  { tipo: 'benchmark', familia: 'saber', label: 'Benchmark', e: 'número de referência com contexto',
    campos: [c('metrica_id', 'id'), c('valor', 'texto', { obrigatorio: true }), c('faixa', 'texto'), c('contexto', 'texto', { obrigatorio: true, dica: 'funil, nicho, ticket' }), c('fonte', 'texto'), c('data', 'data')],
    gatilhos_padrao: ['ao_diagnosticar'] },
  // Pensar
  { tipo: 'principio', familia: 'pensar', label: 'Princípio', e: 'lógica de decisão que vale sempre, o porquê por trás das regras',
    campos: [c('quando_falha', 'texto'), c('principios_relacionados', 'ids'), c('origem', 'enum', { opcoes: ['witly', 'framework'] }), c('fonte', 'texto')], gatilhos_padrao: ['ao_recomendar'] },
  { tipo: 'diagnostico', familia: 'pensar', label: 'Diagnóstico', e: 'sintoma → causa provável → o que checar, em ordem',
    campos: [c('sintoma', 'texto', { obrigatorio: true, dica: 'métrica + direção' }), c('causas', 'lista', { obrigatorio: true, dica: 'ordenadas, com o nível' }), c('checar', 'lista'), c('funil', 'texto')],
    gatilhos_padrao: ['ao_diagnosticar'] },
  { tipo: 'pergunta', familia: 'pensar', label: 'Pergunta', e: 'pergunta norteadora: o título é a pergunta', campos: [c('como_aprofundar', 'texto'), c('metricas', 'lista')], gatilhos_padrao: ['ao_diagnosticar'] },
  // Fazer
  { tipo: 'regra', familia: 'fazer', label: 'Regra', e: 'quando X, faça Y', campos: [c('forca', 'enum', { opcoes: ['sempre', 'geralmente'] })], gatilhos_padrao: ['ao_abrir'] },
  { tipo: 'metodo', familia: 'fazer', label: 'Método', e: 'passos para fazer algo; origem separa a metodologia Witly de um framework específico',
    campos: [c('origem', 'enum', { opcoes: ['witly', 'framework'], obrigatorio: true }), c('framework', 'texto', { dica: 'nome, quando framework' }), c('fonte', 'texto'), c('quando', 'texto'), c('entrada', 'texto'), c('passos', 'lista', { obrigatorio: true }), c('saida', 'texto'), c('templates', 'lista')],
    gatilhos_padrao: ['ao_recomendar'] },
  { tipo: 'padrao', familia: 'fazer', label: 'Padrão de design', e: 'design/UX/UI de qualquer entregável: nesta situação, mostre assim',
    campos: [c('entregavel', 'enum', { opcoes: ['dashboard', 'apresentacao', 'one-pager', 'report', 'email'], obrigatorio: true }), c('situacao', 'texto', { obrigatorio: true }), c('solucao', 'texto', { obrigatorio: true }), c('elemento_id', 'texto'), c('componente', 'texto'), c('evite', 'lista'), c('exemplo', 'texto')],
    gatilhos_padrao: ['ao_escrever'] },
  // Comunicar
  { tipo: 'estilo', familia: 'comunicar', label: 'Estilo', e: 'como escrever: tom, frase, palavras', campos: [c('publico', 'enum', { opcoes: ['consultor', 'cliente', 'c-level'] }), c('use', 'lista'), c('evite', 'lista')], gatilhos_padrao: ['ao_escrever'] },
  { tipo: 'formato', familia: 'comunicar', label: 'Formato', e: 'estrutura de um entregável e o que o leitor lê',
    campos: [c('entregavel', 'texto', { obrigatorio: true }), c('canal', 'texto'), c('secoes', 'lista', { obrigatorio: true }), c('tamanho', 'texto'), c('exemplo', 'texto')], gatilhos_padrao: ['ao_escrever'] },
  // Contexto
  { tipo: 'funil', familia: 'contexto', label: 'Funil', e: 'como um tipo de funil funciona e se decide',
    campos: [c('fases', 'lista', { obrigatorio: true }), c('metricas_decisao', 'lista', { obrigatorio: true }), c('tetos', 'texto'), c('templates', 'lista')], gatilhos_padrao: ['ao_abrir'] },
  { tipo: 'cliente', familia: 'contexto', label: 'Cliente', e: 'contexto de negócio de um cliente (o delta do genérico)',
    campos: [c('slug_delfos', 'texto'), c('modelo', 'texto', { obrigatorio: true }), c('funis', 'lista'), c('metas', 'texto'), c('canais', 'lista'), c('armadilhas_dado', 'lista'), c('templates', 'lista')], gatilhos_padrao: ['ao_identificar'] },
  { tipo: 'campanha', familia: 'contexto', label: 'Campanha', e: 'histórico vivo de uma campanha ou lançamento',
    campos: [c('cliente_id', 'id', { obrigatorio: true }), c('funil', 'texto'), c('periodo', 'texto', { obrigatorio: true }), c('objetivo', 'texto'), c('metas', 'texto'), c('tetos', 'texto'), c('processo', 'texto'), c('budgets', 'objeto'), c('pendencias', 'lista'), c('linha_do_tempo', 'lista')],
    gatilhos_padrao: ['ao_identificar'] },
  // Memória
  { tipo: 'caso', familia: 'memoria', label: 'Caso', e: 'FCA-R real, com resultado: o exemplo e a ação que funcionou (ou não)',
    campos: [c('situacao', 'objeto', { obrigatorio: true, dica: '{funil, nivel, sintoma, metrica}' }), c('fato', 'texto', { obrigatorio: true }), c('causa', 'texto', { obrigatorio: true }), c('acao', 'texto', { obrigatorio: true }), c('resultado', 'enum', { opcoes: ['pendente', 'confirmado', 'refutado'], obrigatorio: true }), c('data', 'data'), c('campanha_id', 'id'), c('cliente_id', 'id')],
    gatilhos_padrao: ['ao_recomendar'] },
  { tipo: 'teste', familia: 'memoria', label: 'Teste', e: 'hipótese pré-registrada e o que deu',
    campos: [c('hipotese', 'texto', { obrigatorio: true }), c('metrica', 'texto', { obrigatorio: true }), c('inicio', 'data'), c('fim', 'data'), c('resultado', 'enum', { opcoes: ['pendente', 'confirmado', 'refutado'], obrigatorio: true }), c('aprendizado', 'texto'), c('campanha_id', 'id')],
    gatilhos_padrao: ['ao_recomendar', 'ao_fechar'] },
];
export const TIPO_NOMES = TIPOS.map((t) => t.tipo);
export const tipoDef = (tipo: string): TipoDef | undefined => TIPOS.find((t) => t.tipo === tipo);
export const familiaDe = (tipo: string): Familia | undefined => tipoDef(tipo)?.familia;

export const ESCOPO_KINDS = ['geral', 'template', 'funil', 'cliente', 'campanha'] as const;
/** `geral` | `template:<slug>` | `funil:<tipo>` | `cliente:<slug>` | `campanha:<id>` */
export function parseEscopo(s: string | null | undefined): { kind: (typeof ESCOPO_KINDS)[number]; alvo: string | null } | null {
  const v = String(s ?? 'geral').trim().toLowerCase();
  if (v === 'geral' || v === '') return { kind: 'geral', alvo: null };
  const m = v.match(/^(template|funil|cliente|campanha):([a-z0-9][a-z0-9-]{0,63})$/);
  return m ? { kind: m[1] as never, alvo: m[2] } : null;
}

/** Uma entrada de conhecimento como a UI e o MCP a veem (dados já parseados). */
export interface Entrada {
  id: string; familia: Familia; tipo: string; dominio: Dominio; escopo: string; nivel: Nivel; tags: string[];
  titulo: string; corpo_md: string; dados: Record<string, unknown>; confianca: Confianca; fontes: string[];
  status: 'ativo' | 'rascunho' | 'supersedido'; supersedido_por: string | null; sempre: boolean; gatilho: Gatilho[];
  verificado_por: string | null; verificado_em: string | null; verificar_ate: string | null;
  autor: string | null; versao: number; criado_em: string; atualizado_em: string;
}

/** O que uma proposta/seed manda: os campos editáveis. */
export interface EntradaInput {
  id?: string; tipo: string; dominio?: string; escopo?: string; nivel?: string; tags?: unknown; titulo: string; corpo_md?: string;
  dados?: unknown; confianca?: string; fontes?: unknown; sempre?: boolean; gatilho?: unknown; status?: string;
}
export type EntradaNormalizada = Omit<Entrada, 'versao' | 'criado_em' | 'atualizado_em' | 'autor' | 'verificado_por' | 'verificado_em' | 'verificar_ate' | 'supersedido_por'>;

const ID = /^[a-z0-9][a-z0-9-]{1,79}$/;
export const slugify = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const strList = (v: unknown, max = 40): string[] => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(/[,\n]/) : []).map((x) => String(x).trim()).filter(Boolean).slice(0, max);

/** Valida e normaliza. `erros` vazio = ok. Aplica limites e os campos obrigatórios do tipo. */
export function validarEntrada(input: EntradaInput, opts: { exigirCampos?: boolean } = {}): { erros: string[]; entrada: EntradaNormalizada | null } {
  const erros: string[] = [];
  const def = tipoDef(String(input.tipo || ''));
  if (!def) erros.push(`tipo inválido: ${input.tipo} (tipos: ${TIPO_NOMES.join(', ')})`);
  const titulo = String(input.titulo ?? '').trim().replace(/\s+/g, ' ');
  if (!titulo) erros.push('titulo obrigatório: a frase que o agente precisa');
  if (titulo.length > LIMITES.titulo) erros.push(`titulo com ${titulo.length} caracteres (máximo ${LIMITES.titulo}): o que não cabe vai para o corpo`);
  const corpo = String(input.corpo_md ?? '').trim();
  const maxCorpo = def?.tipo === 'conceito' ? LIMITES.corpo_conceito : LIMITES.corpo;
  if (corpo.length > maxCorpo) erros.push(`corpo com ${corpo.length} caracteres (máximo ${maxCorpo}): quebre em outra entrada e linke`);
  const dominio = String(input.dominio ?? 'analise').toLowerCase();
  if (!(DOMINIOS as readonly string[]).includes(dominio)) erros.push(`dominio inválido: ${dominio} (${DOMINIOS.join(', ')})`);
  const nivel = String(input.nivel ?? 'tatico').toLowerCase();
  if (!(NIVEIS as readonly string[]).includes(nivel)) erros.push(`nivel inválido: ${nivel} (${NIVEIS.join(', ')})`);
  const esc = parseEscopo(input.escopo);
  if (!esc) erros.push(`escopo inválido: ${input.escopo} (geral | template:<slug> | funil:<tipo> | cliente:<slug> | campanha:<id>)`);
  const confianca = String(input.confianca ?? 'media').toLowerCase();
  if (!(CONFIANCAS as readonly string[]).includes(confianca)) erros.push(`confianca inválida: ${confianca}`);
  const gat = strList(input.gatilho).map((g) => g.toLowerCase());
  for (const g of gat) if (!(GATILHOS as readonly string[]).includes(g)) erros.push(`gatilho inválido: ${g} (${GATILHOS.join(', ')})`);
  const status = String(input.status ?? 'ativo');
  if (!['ativo', 'rascunho', 'supersedido'].includes(status)) erros.push(`status inválido: ${status}`);
  const id = String(input.id || slugify(titulo)).trim();
  if (!ID.test(id)) erros.push(`id inválido: "${id}" (a-z, 0-9, hífen, 2–80)`);

  const dados: Record<string, unknown> = (input.dados && typeof input.dados === 'object' && !Array.isArray(input.dados)) ? { ...(input.dados as Record<string, unknown>) } : {};
  if (def) {
    for (const campo of def.campos) {
      const v = dados[campo.nome];
      const vazio = v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length);
      if (campo.obrigatorio && opts.exigirCampos !== false && vazio) erros.push(`${def.tipo} exige \`${campo.nome}\`${campo.dica ? ` (${campo.dica})` : ''}`);
      if (vazio) { delete dados[campo.nome]; continue; }
      if (campo.kind === 'lista' || campo.kind === 'ids') dados[campo.nome] = strList(v, 60);
      else if (campo.kind === 'enum' && campo.opcoes && !campo.opcoes.includes(String(v).toLowerCase())) erros.push(`${campo.nome} deve ser ${campo.opcoes.join(' | ')}`);
      else if (campo.kind === 'enum') dados[campo.nome] = String(v).toLowerCase();
      else if (campo.kind === 'texto' || campo.kind === 'id' || campo.kind === 'data') dados[campo.nome] = String(v).trim().slice(0, 2000);
    }
    if (def.tipo === 'metodo' && dados.origem === 'framework' && !dados.framework) erros.push('metodo de origem framework exige `framework` (o nome)');
  }
  if (erros.length) return { erros, entrada: null };
  const sempre = !!input.sempre;
  const gatilho = (gat.length ? gat : (sempre ? ['sempre'] : def!.gatilhos_padrao)) as Gatilho[];
  return { erros, entrada: {
    id, familia: def!.familia, tipo: def!.tipo, dominio: dominio as Dominio, escopo: esc!.kind === 'geral' ? 'geral' : `${esc!.kind}:${esc!.alvo}`, nivel: nivel as Nivel,
    tags: strList(input.tags).map((t) => slugify(t)).filter(Boolean), titulo, corpo_md: corpo, dados, confianca: confianca as Confianca,
    fontes: strList(input.fontes), status: status as Entrada['status'], sempre, gatilho: sempre && !gatilho.includes('sempre') ? ['sempre', ...gatilho] : gatilho,
  } };
}

/** Chave para achar proposta idêntica: título normalizado (sem acento, pontuação, espaços). */
export function chaveTitulo(titulo: string): string {
  return titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 160);
}

/** Termos para a busca FTS a partir de um título (o "parecida"): palavras com 4+ letras, OR. */
export function termosBusca(texto: string, max = 8): string {
  const stop = new Set(['para', 'com', 'sem', 'nunca', 'sempre', 'quando', 'como', 'antes', 'depois', 'mais', 'menos', 'sobre', 'entre', 'pelo', 'pela', 'isso', 'esse', 'essa', 'uma', 'que', 'nao', 'dos', 'das']);
  const words = chaveTitulo(texto).split(' ').filter((w) => w.length >= 4 && !stop.has(w));
  return [...new Set(words)].slice(0, max).map((w) => `"${w}"`).join(' OR ');
}

const primeiraLinha = (corpo: string, max = 160): string => {
  const l = corpo.split('\n').map((x) => x.trim()).find((x) => x && !x.startsWith('#')) ?? '';
  return l.length > max ? l.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : l;
};

/** Linha do índice (spec P3): id · tipo · título — quando usar. */
export function linhaIndice(e: Pick<Entrada, 'id' | 'tipo' | 'titulo' | 'gatilho' | 'confianca' | 'nivel' | 'escopo'>, extra?: string): string {
  const quando = e.gatilho.filter((g) => g !== 'sempre').map((g) => GATILHO_LABEL[g]).join(', ');
  return `- \`${e.id}\` · ${e.tipo} · ${e.nivel} · ${e.titulo}${quando ? ` — puxe ${quando}` : ''}${extra ? ` ${extra}` : ''}`;
}

/** Nível 0: título + 1 linha do corpo. */
export function linhaSempre(e: Pick<Entrada, 'tipo' | 'titulo' | 'corpo_md' | 'dados'>): string {
  const forca = e.tipo === 'regra' && e.dados.forca === 'geralmente' ? 'GERALMENTE' : e.tipo.toUpperCase();
  const l = primeiraLinha(e.corpo_md);
  return `- [${forca}] ${e.titulo}${l ? ` — ${l}` : ''}`;
}

/** Texto completo de uma entrada para o MCP/resource. */
export function textoCompleto(e: Entrada, meta?: { usos?: number; casos?: number }): string {
  const out = [`# ${e.titulo}`, '', `\`${e.id}\` · ${FAMILIA_LABEL[e.familia]} / ${e.tipo} · ${e.dominio} · ${e.nivel} · escopo ${e.escopo} · confiança ${e.confianca}${e.tags.length ? ` · tags: ${e.tags.join(', ')}` : ''}`];
  out.push(e.verificado_em ? `Verificada em ${e.verificado_em.slice(0, 10)}${e.verificado_por ? ` por ${e.verificado_por}` : ''}${e.verificar_ate ? ` (vence ${e.verificar_ate.slice(0, 10)})` : ''}.` : 'Não verificada.');
  if (e.status !== 'ativo') out.push(`**Status: ${e.status}**${e.supersedido_por ? ` → veja \`${e.supersedido_por}\`` : ''}`);
  if (meta?.usos != null || meta?.casos != null) out.push(`${meta.usos ?? 0} usos · ${meta.casos ?? 0} casos que sustentam`);
  if (e.corpo_md) out.push('', e.corpo_md.trim());
  const def = tipoDef(e.tipo);
  const campos = (def?.campos ?? []).filter((c) => e.dados[c.nome] != null);
  if (campos.length) {
    out.push('');
    for (const c of campos) {
      const v = e.dados[c.nome];
      if (Array.isArray(v)) out.push(`**${c.nome}:**`, ...v.map((x) => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`));
      else if (typeof v === 'object') out.push(`**${c.nome}:** ${JSON.stringify(v)}`);
      else out.push(`**${c.nome}:** ${String(v)}`);
    }
  }
  if (e.fontes.length) out.push('', `Fontes: ${e.fontes.join(' · ')}`);
  return out.join('\n');
}

export const bytes = (s: string): number => new TextEncoder().encode(s).length;
