/* campanha — a linha do tempo de uma campanha (spec 008 §3.4) e a ação estruturada (§5).
 * A campanha é uma entrada de conhecimento (`tipo: 'campanha'`); os eventos vivem em
 * `dados.linha_do_tempo`. Análise entra sozinha pelo `registrar`; achado e ação do agente
 * entram marcados "proposto" e só contam como feitos depois que uma pessoa confirma. */

export const EVENTOS = ['contexto', 'analise', 'achado', 'acao', 'resultado'] as const;
export type EventoTipo = (typeof EVENTOS)[number];

/** area/nivel/acao são texto com sugestão por roteiro, nunca enum fechado: serve a tráfego, CRM,
 *  página, oferta, conteúdo, dados — qualquer frente. */
export const AREAS = ['trafego', 'crm', 'pagina', 'oferta', 'conteudo', 'dados', 'outro'];
export const NIVEIS_SUGERIDOS = ['campanha', 'adset', 'criativo', 'fluxo', 'etapa', 'pagina', 'oferta'];
export const ACOES_SUGERIDAS = ['ligar', 'desligar', 'escalar', 'reduzir', 'trocar', 'criar', 'corrigir', 'manter', 'budget'];
export const RESULTADOS = ['pendente', 'confirmado', 'refutado'] as const;
export type Resultado = (typeof RESULTADOS)[number];

export interface Evento {
  id: string;
  data: string;
  tipo: EventoTipo;
  texto: string;
  /** id da atividade que o gerou (registrar) ou da entrada (caso/teste). */
  ref?: string | null;
  quem?: string | null;
  /** proposto pelo agente: aparece na campanha, nunca na tela Ações até alguém confirmar. */
  proposto?: boolean;
  confirmado_por?: string | null;
  confirmado_em?: string | null;
  /** só em `acao` */
  area?: string; nivel?: string; alvo?: string; acao?: string; valor?: string;
  fato?: string; causa?: string; resultado?: Resultado; verificar_em?: string | null;
  resultado_em?: string | null; resultado_texto?: string | null;
}

const S = (v: unknown, max = 600): string => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const slugish = (v: unknown, max = 60): string => S(v, max).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 _-]/g, '').trim();
const hoje = (): string => new Date().toISOString().slice(0, 10);
const dataOk = (v: unknown): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null);

export class EventoError extends Error {}

/** Valida e normaliza um evento vindo do MCP (registrar) ou da UI. `origem` decide o "proposto". */
export function normalizaEvento(input: Record<string, unknown>, opts: { quem: string; proposto: boolean; ref?: string | null; i?: number }): Evento {
  const onde = opts.i == null ? 'evento' : `eventos[${opts.i}]`;
  const tipo = S(input.tipo || 'acao', 20) as EventoTipo;
  if (!(EVENTOS as readonly string[]).includes(tipo)) throw new EventoError(`${onde}.tipo deve ser ${EVENTOS.join(' | ')}`);
  const texto = S(input.texto, 600);   // ação sem texto monta a frase do verbo + alvo no fim
  const e: Evento = {
    id: crypto.randomUUID().slice(0, 8),
    data: dataOk(input.data) ?? hoje(),
    tipo, texto, ref: opts.ref ?? (input.ref ? S(input.ref, 60) : null), quem: opts.quem,
  };
  if (opts.proposto && tipo !== 'analise') e.proposto = true;
  if (tipo === 'acao') {
    const alvo = S(input.alvo, 160); const acao = slugish(input.acao, 30);
    if (!alvo) throw new EventoError(`${onde}: ação exige \`alvo\` (o que foi mexido: nome ou id da campanha, adset, criativo, fluxo…)`);
    if (!acao) throw new EventoError(`${onde}: ação exige \`acao\` (verbo curto: ${ACOES_SUGERIDAS.join(', ')}…)`);
    e.area = slugish(input.area, 20) || 'outro';
    e.nivel = slugish(input.nivel, 30) || 'outro';
    e.alvo = alvo; e.acao = acao;
    if (input.valor != null && S(input.valor, 60)) e.valor = S(input.valor, 60);
    e.fato = S(input.fato, 600); e.causa = S(input.causa, 600);
    const r = S(input.resultado, 20) as Resultado;
    e.resultado = (RESULTADOS as readonly string[]).includes(r) ? r : 'pendente';
    e.verificar_em = dataOk(input.verificar_em);
    if (!e.texto) e.texto = `${e.acao} ${e.alvo}${e.valor ? ` (${e.valor})` : ''}`;
  }
  if (!e.texto) throw new EventoError(`${onde}: informe \`texto\` (o que aconteceu)`);
  return e;
}

/** Insere eventos na linha do tempo, mais novo primeiro por data; devolve os dados da campanha. */
export function comEventos(dados: Record<string, unknown>, novos: Evento[]): Record<string, unknown> {
  const atual = Array.isArray(dados.linha_do_tempo) ? (dados.linha_do_tempo as Evento[]) : [];
  const linha = [...novos, ...atual].sort((a, b) => String(b.data).localeCompare(String(a.data)));
  return { ...dados, linha_do_tempo: linha.slice(0, 500) };
}

export const eventosDe = (dados: Record<string, unknown>): Evento[] => (Array.isArray(dados.linha_do_tempo) ? (dados.linha_do_tempo as Evento[]) : []);

/** Ação "feita": confirmada por uma pessoa (ou registrada por ela na UI). Só essas vão para a tela Ações. */
export const acaoFeita = (e: Evento): boolean => e.tipo === 'acao' && !e.proposto;

/** Proposta do agente que ninguém confirmou em N dias: some do índice, fica no histórico. */
export function eventoVelho(e: Evento, dias = 14): boolean {
  if (!e.proposto) return false;
  return Date.now() - Date.parse(`${e.data}T00:00:00Z`) > dias * 864e5;
}

/** As pendências que a etapa 0 de um roteiro mostra: ações a verificar cuja data chegou. */
export function pendentesVencidas(dados: Record<string, unknown>, hojeISO = hoje()): Evento[] {
  return eventosDe(dados).filter((e) => acaoFeita(e) && e.resultado === 'pendente' && e.verificar_em && e.verificar_em <= hojeISO);
}

/** Resumo da campanha para o nível 2 do MCP: período, metas, budgets, pendências e os últimos eventos. */
export function resumoCampanha(titulo: string, dados: Record<string, unknown>, limite = 10): string {
  const out = [`## Campanha: ${titulo}`];
  const linha = (k: string, v: unknown) => { if (v != null && String(v).trim()) out.push(`**${k}:** ${String(v)}`); };
  linha('Período', dados.periodo); linha('Funil', dados.funil); linha('Objetivo', dados.objetivo);
  linha('Metas', typeof dados.metas === 'object' ? JSON.stringify(dados.metas) : dados.metas);
  linha('Tetos', typeof dados.tetos === 'object' ? JSON.stringify(dados.tetos) : dados.tetos);
  linha('Processo', dados.processo);
  if (dados.budgets && typeof dados.budgets === 'object') out.push(`**Budgets (configurados, informados pelo consultor):** ${JSON.stringify(dados.budgets)}`);
  const pend = Array.isArray(dados.pendencias) ? (dados.pendencias as unknown[]) : [];
  if (pend.length) out.push('', '**Pendências:**', ...pend.map((p) => `- ${typeof p === 'string' ? p : JSON.stringify(p)}`));
  const venc = pendentesVencidas(dados);
  if (venc.length) {
    out.push('', '**Ações a verificar (a data chegou) — pergunte o resultado ANTES de olhar o dia:**');
    for (const e of venc) out.push(`- \`${e.id}\` ${e.data} · ${e.acao} ${e.alvo}${e.valor ? ` (${e.valor})` : ''} — ${e.fato || e.texto}${e.verificar_em ? ` · verificar em ${e.verificar_em}` : ''}`);
  }
  const ultimos = eventosDe(dados).filter((e) => !eventoVelho(e)).slice(0, limite);
  if (ultimos.length) {
    out.push('', `**Últimos eventos (${ultimos.length} de ${eventosDe(dados).length}):**`);
    for (const e of ultimos) out.push(`- ${e.data} · ${e.tipo}${e.proposto ? ' (proposto, não confirmado)' : ''} · ${e.texto}${e.tipo === 'acao' && e.resultado && e.resultado !== 'pendente' ? ` → ${e.resultado}` : ''}`);
  }
  out.push('', 'Registre o que fizer aqui: `registrar({..., campanha: "<id>", eventos: [{tipo, texto, ...}]})`. Ação do consultor: `{tipo:"acao", area, nivel, alvo, acao, valor, fato, causa, verificar_em}` com o motivo real dele.');
  return out.join('\n');
}
