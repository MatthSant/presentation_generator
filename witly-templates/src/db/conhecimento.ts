/* db/conhecimento — o conhecimento (spec 008) no D1: entradas, busca, uso, propostas, votos,
 * aprovação/reversão e a configuração da org. Uma função por operação. */

import { bytes, chaveTitulo, linhaSempre, termosBusca, validarEntrada, type Entrada, type EntradaInput, type EntradaNormalizada, type Modo, type Urgencia, LIMITES, type RELACOES } from '../kit/conhecimento.js';

const now = () => new Date().toISOString();
const J = (v: unknown) => JSON.stringify(v ?? null);
function parse<T>(s: string | null | undefined, fallback: T): T { try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; } }

interface Row {
  id: string; org_id: string; familia: string; tipo: string; dominio: string; escopo: string; nivel: string; tags_json: string; titulo: string; corpo_md: string;
  dados_json: string; confianca: string; fontes_json: string; status: string; supersedido_por: string | null; sempre: number; gatilho_json: string;
  verificado_por: string | null; verificado_em: string | null; verificar_ate: string | null; autor: string | null; versao: number; criado_em: string; atualizado_em: string;
}
export function rowToEntrada(r: Row): Entrada {
  return {
    id: r.id, familia: r.familia as Entrada['familia'], tipo: r.tipo, dominio: r.dominio as Entrada['dominio'], escopo: r.escopo, nivel: r.nivel as Entrada['nivel'],
    tags: parse<string[]>(r.tags_json, []), titulo: r.titulo, corpo_md: r.corpo_md, dados: parse<Record<string, unknown>>(r.dados_json, {}),
    confianca: r.confianca as Entrada['confianca'], fontes: parse<string[]>(r.fontes_json, []), status: r.status as Entrada['status'], supersedido_por: r.supersedido_por,
    sempre: !!r.sempre, gatilho: parse<Entrada['gatilho']>(r.gatilho_json, []), verificado_por: r.verificado_por, verificado_em: r.verificado_em, verificar_ate: r.verificar_ate,
    autor: r.autor, versao: r.versao, criado_em: r.criado_em, atualizado_em: r.atualizado_em,
  };
}

export interface Filtro {
  familia?: string; tipo?: string | string[]; dominio?: string; escopo?: string | string[]; nivel?: string; tags?: string[]; q?: string;
  status?: 'ativo' | 'rascunho' | 'supersedido' | 'todos'; sempre?: boolean; gatilho?: string; ids?: string[];
  cliente?: string; funil?: string; campanha?: string; resultado?: string; origem?: string; limit?: number; offset?: number;
}

/** Lista com filtros por índice + FTS (`q`). Ordem: sempre primeiro, depois título (ou rank quando há `q`). */
export async function listarConhecimento(db: D1Database, org_id: string, f: Filtro = {}): Promise<Entrada[]> {
  const w: string[] = ['c.org_id = ?']; const b: unknown[] = [org_id];
  const status = f.status ?? 'ativo';
  if (status !== 'todos') { w.push('c.status = ?'); b.push(status); }
  if (f.familia) { w.push('c.familia = ?'); b.push(f.familia); }
  if (f.tipo) { const t = Array.isArray(f.tipo) ? f.tipo : [f.tipo]; w.push(`c.tipo IN (${t.map(() => '?').join(',')})`); b.push(...t); }
  if (f.dominio) { w.push('c.dominio = ?'); b.push(f.dominio); }
  if (f.nivel) { w.push('c.nivel = ?'); b.push(f.nivel); }
  const escopos = [...(Array.isArray(f.escopo) ? f.escopo : f.escopo ? [f.escopo] : [])];
  if (f.cliente) escopos.push(`cliente:${f.cliente}`);
  if (f.funil) escopos.push(`funil:${f.funil}`);
  if (f.campanha) escopos.push(`campanha:${f.campanha}`);
  if (escopos.length) { w.push(`c.escopo IN (${escopos.map(() => '?').join(',')})`); b.push(...escopos); }
  if (f.sempre != null) { w.push('c.sempre = ?'); b.push(f.sempre ? 1 : 0); }
  if (f.gatilho) { w.push('EXISTS (SELECT 1 FROM json_each(c.gatilho_json) g WHERE g.value = ?)'); b.push(f.gatilho); }
  if (f.tags?.length) { w.push(`EXISTS (SELECT 1 FROM json_each(c.tags_json) t WHERE t.value IN (${f.tags.map(() => '?').join(',')}))`); b.push(...f.tags); }
  if (f.ids?.length) { w.push(`c.id IN (${f.ids.map(() => '?').join(',')})`); b.push(...f.ids); }
  if (f.resultado) { w.push("json_extract(c.dados_json, '$.resultado') = ?"); b.push(f.resultado); }
  if (f.origem) { w.push("json_extract(c.dados_json, '$.origem') = ?"); b.push(f.origem); }
  let from = 'conhecimento c'; let order = 'c.sempre DESC, c.titulo';
  const q = f.q?.trim();
  if (q) {
    const match = termosBusca(q) || `"${q.replace(/"/g, '')}"`;
    from = 'conhecimento_fts f JOIN conhecimento c ON c.id = f.id'; w.unshift('conhecimento_fts MATCH ?'); b.unshift(match); order = 'f.rank';
  }
  b.push(Math.min(f.limit ?? 100, 500), f.offset ?? 0);
  const rows = (await db.prepare(`SELECT c.* FROM ${from} WHERE ${w.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...b).all<Row>()).results;
  return rows.map(rowToEntrada);
}

export async function obterConhecimento(db: D1Database, id: string): Promise<Entrada | null> {
  const r = await db.prepare('SELECT * FROM conhecimento WHERE id = ?').bind(id).first<Row>();
  return r ? rowToEntrada(r) : null;
}

/** Grava direto (seed, migração, aprovação). Conteúdo igual = não mexe; diferente = versão + 1. */
export async function gravarConhecimento(db: D1Database, org_id: string, e: EntradaNormalizada, autor: string | null, opts: { soSeAutor?: string } = {}): Promise<{ id: string; versao: number; mudou: boolean }> {
  const cur = await db.prepare('SELECT * FROM conhecimento WHERE id = ?').bind(e.id).first<Row>();
  const cols = { familia: e.familia, tipo: e.tipo, dominio: e.dominio, escopo: e.escopo, nivel: e.nivel, tags_json: J(e.tags), titulo: e.titulo, corpo_md: e.corpo_md,
    dados_json: J(e.dados), confianca: e.confianca, fontes_json: J(e.fontes), status: e.status, sempre: e.sempre ? 1 : 0, gatilho_json: J(e.gatilho) };
  if (!cur) {
    await db.prepare(`INSERT INTO conhecimento (id, org_id, ${Object.keys(cols).join(', ')}, autor) VALUES (?, ?, ${Object.keys(cols).map(() => '?').join(', ')}, ?)`)
      .bind(e.id, org_id, ...Object.values(cols), autor).run();
    return { id: e.id, versao: 1, mudou: true };
  }
  if (opts.soSeAutor && cur.autor !== opts.soSeAutor) return { id: e.id, versao: cur.versao, mudou: false };
  const igual = (Object.keys(cols) as Array<keyof typeof cols>).every((k) => String(cols[k]) === String(cur[k as keyof Row]));
  if (igual) return { id: e.id, versao: cur.versao, mudou: false };
  await db.prepare(`UPDATE conhecimento SET ${Object.keys(cols).map((k) => `${k} = ?`).join(', ')}, autor = ?, versao = versao + 1, atualizado_em = ? WHERE id = ?`)
    .bind(...Object.values(cols), autor, now(), e.id).run();
  return { id: e.id, versao: cur.versao + 1, mudou: true };
}

export async function marcarVerificada(db: D1Database, id: string, por: string, ate: string | null): Promise<void> {
  await db.prepare('UPDATE conhecimento SET verificado_por = ?, verificado_em = ?, verificar_ate = ? WHERE id = ?').bind(por.toLowerCase(), now(), ate, id).run();
}

export async function historico(db: D1Database, id: string): Promise<Array<{ versao: number; snapshot: Record<string, unknown>; autor: string | null; at: string }>> {
  const rows = (await db.prepare('SELECT versao, snapshot_json, autor, at FROM conhecimento_hist WHERE entrada_id = ? ORDER BY id DESC').bind(id).all<{ versao: number; snapshot_json: string; autor: string | null; at: string }>()).results;
  return rows.map((r) => ({ versao: r.versao, snapshot: parse<Record<string, unknown>>(r.snapshot_json, {}), autor: r.autor, at: r.at }));
}

/** Entradas ativas parecidas com um título (FTS por termos) — o "é a mesma coisa?". */
export async function parecidas(db: D1Database, org_id: string, titulo: string, limit = 5, excluir?: string): Promise<Entrada[]> {
  const match = termosBusca(titulo);
  if (!match) return [];
  const rows = (await db.prepare(`SELECT c.* FROM conhecimento_fts f JOIN conhecimento c ON c.id = f.id WHERE conhecimento_fts MATCH ? AND c.org_id = ? AND c.status = 'ativo' ORDER BY f.rank LIMIT ?`)
    .bind(match, org_id, limit + 1).all<Row>()).results;
  return rows.filter((r) => r.id !== excluir).slice(0, limit).map(rowToEntrada);
}

export async function relacionar(db: D1Database, de: string, para: string, tipo: (typeof RELACOES)[number]): Promise<void> {
  await db.prepare('INSERT OR IGNORE INTO conhecimento_rel (de, para, tipo) VALUES (?, ?, ?)').bind(de, para, tipo).run();
}
export async function relacoesDe(db: D1Database, id: string): Promise<Array<{ de: string; para: string; tipo: string }>> {
  return (await db.prepare('SELECT de, para, tipo FROM conhecimento_rel WHERE de = ? OR para = ?').bind(id, id).all<{ de: string; para: string; tipo: string }>()).results;
}

/** Orçamento do nível 0: quantas `sempre` e quantos bytes o bloco ocupa. */
export async function orcamentoSempre(db: D1Database, org_id: string): Promise<{ n: number; bytes: number; limite_n: number; limite_bytes: number }> {
  const rows = await listarConhecimento(db, org_id, { sempre: true, limit: 500 });
  return { n: rows.length, bytes: bytes(rows.map(linhaSempre).join('\n')), limite_n: LIMITES.sempre, limite_bytes: LIMITES.nivel0_bytes };
}

// ── uso ─────────────────────────────────────────────────────────────────────

export async function registrarUso(db: D1Database, usos: Array<{ id: string; ajudou?: boolean | null }>, email: string, atividade_id: string | null): Promise<number> {
  const ids = usos.map((u) => u.id);
  if (!ids.length) return 0;
  const existentes = new Set((await db.prepare(`SELECT id FROM conhecimento WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ id: string }>()).results.map((r) => r.id));
  const validos = usos.filter((u) => existentes.has(u.id));
  if (validos.length) await db.batch(validos.map((u) => db.prepare('INSERT INTO conhecimento_uso (entrada_id, atividade_id, email, ajudou) VALUES (?, ?, ?, ?)').bind(u.id, atividade_id, email.toLowerCase(), u.ajudou == null ? null : (u.ajudou ? 1 : 0))));
  return validos.length;
}

export async function usoDe(db: D1Database, id: string): Promise<{ usos: number; ajudou: number; nao_ajudou: number; ultimo: string | null }> {
  const r = await db.prepare('SELECT COUNT(*) AS usos, SUM(ajudou = 1) AS ajudou, SUM(ajudou = 0) AS nao_ajudou, MAX(at) AS ultimo FROM conhecimento_uso WHERE entrada_id = ?').bind(id).first<{ usos: number; ajudou: number | null; nao_ajudou: number | null; ultimo: string | null }>();
  return { usos: r?.usos ?? 0, ajudou: r?.ajudou ?? 0, nao_ajudou: r?.nao_ajudou ?? 0, ultimo: r?.ultimo ?? null };
}

// ── configuração da org ─────────────────────────────────────────────────────

export interface OrgConfig { votos: number; dias_pendente: number }
export async function getOrgConfig(db: D1Database, org_id: string): Promise<OrgConfig> {
  const r = await db.prepare('SELECT config_json FROM orgs WHERE id = ?').bind(org_id).first<{ config_json: string }>();
  const c = parse<Partial<OrgConfig>>(r?.config_json, {});
  return { votos: Number.isInteger(c.votos) && c.votos! > 0 ? c.votos! : 2, dias_pendente: Number.isInteger(c.dias_pendente) && c.dias_pendente! > 0 ? c.dias_pendente! : 30 };
}
export async function setOrgConfig(db: D1Database, org_id: string, c: Partial<OrgConfig>): Promise<OrgConfig> {
  const cur = await getOrgConfig(db, org_id);
  const next = { ...cur, ...c };
  await db.prepare('UPDATE orgs SET config_json = ? WHERE id = ?').bind(J(next), org_id).run();
  return next;
}

// ── propostas ───────────────────────────────────────────────────────────────

export interface Proposta {
  id: string; org_id: string; entrada_id: string | null; modo: Modo; urgencia: Urgencia; conteudo: Record<string, unknown>; motivo: string;
  evidencia: unknown[]; origem: string; autor: string; ocorrencias: number; hash: string | null; estado: 'aberta' | 'aprovada' | 'recusada' | 'fundida' | 'revertida';
  aprovada_por: string | null; decidido_por: string | null; decidido_em: string | null; motivo_decisao: string | null; versao_anterior: number | null;
  criado_em: string; atualizado_em: string; votos: number; votos_contra: number; votos_editor: number;
}
interface PRow { id: string; org_id: string; entrada_id: string | null; modo: Modo; urgencia: Urgencia; conteudo_json: string; motivo: string; evidencia_json: string; origem: string; autor: string; ocorrencias: number; hash: string | null; estado: Proposta['estado']; aprovada_por: string | null; decidido_por: string | null; decidido_em: string | null; motivo_decisao: string | null; versao_anterior: number | null; criado_em: string; atualizado_em: string; votos: number | null; votos_contra: number | null; votos_editor: number | null }
const PSEL = `SELECT p.*,
  (SELECT COALESCE(SUM(v.valor = 1), 0) FROM voto v WHERE v.proposta_id = p.id) AS votos,
  (SELECT COALESCE(SUM(v.valor = -1), 0) FROM voto v WHERE v.proposta_id = p.id) AS votos_contra,
  (SELECT COALESCE(SUM(v.valor = 1 AND u.role = 'editor'), 0) FROM voto v JOIN users u ON u.email = v.email WHERE v.proposta_id = p.id) AS votos_editor
  FROM proposta p`;
const rowToProposta = (r: PRow): Proposta => ({
  id: r.id, org_id: r.org_id, entrada_id: r.entrada_id, modo: r.modo, urgencia: r.urgencia, conteudo: parse<Record<string, unknown>>(r.conteudo_json, {}), motivo: r.motivo,
  evidencia: parse<unknown[]>(r.evidencia_json, []), origem: r.origem, autor: r.autor, ocorrencias: r.ocorrencias, hash: r.hash, estado: r.estado, aprovada_por: r.aprovada_por,
  decidido_por: r.decidido_por, decidido_em: r.decidido_em, motivo_decisao: r.motivo_decisao, versao_anterior: r.versao_anterior, criado_em: r.criado_em, atualizado_em: r.atualizado_em,
  votos: r.votos ?? 0, votos_contra: r.votos_contra ?? 0, votos_editor: r.votos_editor ?? 0,
});

export interface NovaProposta { entrada_id?: string | null; modo: Modo; urgencia?: Urgencia; conteudo: Record<string, unknown>; motivo?: string; evidencia?: unknown[]; origem: string; autor: string }

/** Cria a proposta. Idêntica aberta (mesmo hash) = só `ocorrencias + 1`; recusada nos últimos 90 dias = devolve a recusa, não cria. */
export async function criarProposta(db: D1Database, org_id: string, p: NovaProposta): Promise<{ proposta: Proposta; duplicada: boolean; recusada: Proposta | null }> {
  const titulo = String(p.conteudo.titulo ?? p.conteudo.resultado ?? '');
  const hash = `${p.modo}|${p.entrada_id ?? ''}|${chaveTitulo(titulo)}`;
  const aberta = await db.prepare(`${PSEL} WHERE p.org_id = ? AND p.hash = ? AND p.estado = 'aberta'`).bind(org_id, hash).first<PRow>();
  if (aberta) {
    await db.prepare('UPDATE proposta SET ocorrencias = ocorrencias + 1, atualizado_em = ? WHERE id = ?').bind(now(), aberta.id).run();
    return { proposta: rowToProposta({ ...aberta, ocorrencias: aberta.ocorrencias + 1 }), duplicada: true, recusada: null };
  }
  const desde = new Date(Date.now() - 90 * 864e5).toISOString();
  const recusada = await db.prepare(`${PSEL} WHERE p.org_id = ? AND p.hash = ? AND p.estado = 'recusada' AND p.decidido_em >= ? ORDER BY p.decidido_em DESC`).bind(org_id, hash, desde).first<PRow>();
  if (recusada) return { proposta: rowToProposta(recusada), duplicada: false, recusada: rowToProposta(recusada) };
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO proposta (id, org_id, entrada_id, modo, urgencia, conteudo_json, motivo, evidencia_json, origem, autor, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, org_id, p.entrada_id ?? null, p.modo, p.urgencia ?? 'normal', J(p.conteudo), p.motivo ?? '', J(p.evidencia ?? []), p.origem, p.autor.toLowerCase(), hash).run();
  return { proposta: (await getProposta(db, id))!, duplicada: false, recusada: null };
}

export async function getProposta(db: D1Database, id: string): Promise<Proposta | null> {
  const r = await db.prepare(`${PSEL} WHERE p.id = ?`).bind(id).first<PRow>();
  return r ? rowToProposta(r) : null;
}

export interface FiltroProposta { estado?: Proposta['estado'] | 'todas'; urgencia?: Urgencia; entrada_id?: string; autor?: string; desde?: string; limit?: number }
export async function listarPropostas(db: D1Database, org_id: string, f: FiltroProposta = {}): Promise<Proposta[]> {
  const w = ['p.org_id = ?']; const b: unknown[] = [org_id];
  const estado = f.estado ?? 'aberta';
  if (estado !== 'todas') { w.push('p.estado = ?'); b.push(estado); }
  if (f.urgencia) { w.push('p.urgencia = ?'); b.push(f.urgencia); }
  if (f.entrada_id) { w.push('p.entrada_id = ?'); b.push(f.entrada_id); }
  if (f.autor) { w.push('p.autor = ?'); b.push(f.autor.toLowerCase()); }
  if (f.desde) { w.push('COALESCE(p.decidido_em, p.criado_em) >= ?'); b.push(f.desde); }
  b.push(Math.min(f.limit ?? 200, 500));
  const rows = (await db.prepare(`${PSEL} WHERE ${w.join(' AND ')} ORDER BY CASE p.urgencia WHEN 'urgente' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, p.ocorrencias DESC, votos DESC, p.criado_em DESC LIMIT ?`).bind(...b).all<PRow>()).results;
  return rows.map(rowToProposta);
}

/** Urgentes abertas que o agente deve mostrar: escopo casa e (autor é editor OU já tem +1 de editor). */
export async function urgentesPendentes(db: D1Database, org_id: string, escopos: string[], limit = 3): Promise<Proposta[]> {
  const rows = (await db.prepare(`${PSEL} JOIN users ua ON ua.email = p.autor WHERE p.org_id = ? AND p.estado = 'aberta' AND p.urgencia = 'urgente' ORDER BY p.criado_em DESC LIMIT 50`).bind(org_id).all<PRow>()).results;
  const out: Proposta[] = [];
  for (const r of rows) {
    const p = rowToProposta(r);
    const escopo = String(p.conteudo.escopo ?? (p.entrada_id ? (await obterConhecimento(db, p.entrada_id))?.escopo : 'geral') ?? 'geral');
    if (!escopos.includes(escopo)) continue;
    const autorEditor = await db.prepare("SELECT role FROM users WHERE email = ?").bind(p.autor).first<{ role: string }>();
    if (autorEditor?.role !== 'editor' && p.votos_editor < 1) continue;
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

export async function votar(db: D1Database, org_id: string, proposta_id: string, email: string, valor: 1 | -1, comentario?: string | null): Promise<{ proposta: Proposta; aprovada: boolean; recusada: boolean }> {
  const p = await getProposta(db, proposta_id);
  if (!p) throw new Error('proposta não existe');
  if (p.estado !== 'aberta') throw new Error(`proposta já ${p.estado}`);
  await db.prepare('INSERT INTO voto (proposta_id, email, valor, comentario) VALUES (?, ?, ?, ?) ON CONFLICT(proposta_id, email) DO UPDATE SET valor = excluded.valor, comentario = excluded.comentario, at = excluded.at')
    .bind(proposta_id, email.toLowerCase(), valor, comentario ?? null).run();
  const cur = (await getProposta(db, proposta_id))!;
  const cfg = await getOrgConfig(db, org_id);
  const liquido = cur.votos - cur.votos_contra;
  if (cur.urgencia !== 'urgente' && liquido >= cfg.votos) { await decidirProposta(db, org_id, proposta_id, 'votos', 'aprovada', `${cur.votos} votos a favor`); return { proposta: (await getProposta(db, proposta_id))!, aprovada: true, recusada: false }; }
  if (cur.urgencia !== 'urgente' && liquido <= -cfg.votos) { await decidirProposta(db, org_id, proposta_id, 'votos', 'recusada', `${cur.votos_contra} votos contra`); return { proposta: (await getProposta(db, proposta_id))!, aprovada: false, recusada: true }; }
  return { proposta: cur, aprovada: false, recusada: false };
}

/** Aprova ou recusa. Aprovar aplica a mudança na entrada (nova/edição/substituta/fechar/superseder) e guarda a versão anterior para reverter. */
export async function decidirProposta(db: D1Database, org_id: string, id: string, por: string, decisao: 'aprovada' | 'recusada', motivo?: string | null): Promise<{ entrada_id: string | null }> {
  const p = await getProposta(db, id);
  if (!p) throw new Error('proposta não existe');
  if (p.estado !== 'aberta') throw new Error(`proposta já ${p.estado}`);
  let entrada_id = p.entrada_id; let versao_anterior: number | null = null;
  if (decisao === 'aprovada') {
    const autor = por === 'votos' ? p.autor : por.toLowerCase();
    if (p.modo === 'nova') {
      const v = validarEntrada(p.conteudo as unknown as EntradaInput);
      if (v.erros.length) throw new Error(`proposta inválida: ${v.erros.join('; ')}`);
      if (await obterConhecimento(db, v.entrada!.id)) throw new Error(`já existe uma entrada com id ${v.entrada!.id}; proponha como edição ou substituta`);
      if (p.urgencia === 'urgente' && ['regra', 'metrica'].includes(v.entrada!.tipo)) { v.entrada!.sempre = true; if (!v.entrada!.gatilho.includes('sempre')) v.entrada!.gatilho = ['sempre', ...v.entrada!.gatilho]; }
      await gravarConhecimento(db, org_id, v.entrada!, autor);
      entrada_id = v.entrada!.id;
    } else {
      const cur = p.entrada_id ? await obterConhecimento(db, p.entrada_id) : null;
      if (!cur) throw new Error('a entrada da proposta não existe mais');
      versao_anterior = cur.versao;
      if (p.modo === 'edicao') {
        const merged: EntradaInput = { ...entradaParaInput(cur), ...(p.conteudo as Partial<EntradaInput>), id: cur.id, tipo: String(p.conteudo.tipo ?? cur.tipo) };
        if (p.conteudo.dados && typeof p.conteudo.dados === 'object') merged.dados = { ...cur.dados, ...(p.conteudo.dados as Record<string, unknown>) };
        const v = validarEntrada(merged);
        if (v.erros.length) throw new Error(`proposta inválida: ${v.erros.join('; ')}`);
        if (p.urgencia === 'urgente' && ['regra', 'metrica'].includes(v.entrada!.tipo)) { v.entrada!.sempre = true; if (!v.entrada!.gatilho.includes('sempre')) v.entrada!.gatilho = ['sempre', ...v.entrada!.gatilho]; }
        await gravarConhecimento(db, org_id, v.entrada!, autor);
      } else if (p.modo === 'substituta') {
        const v = validarEntrada({ ...entradaParaInput(cur), ...(p.conteudo as Partial<EntradaInput>), tipo: String(p.conteudo.tipo ?? cur.tipo), id: String(p.conteudo.id || `${cur.id}-v${cur.versao + 1}`) });
        if (v.erros.length) throw new Error(`proposta inválida: ${v.erros.join('; ')}`);
        if (v.entrada!.id === cur.id) throw new Error('substituta precisa de id novo');
        await gravarConhecimento(db, org_id, v.entrada!, autor);
        await db.prepare('UPDATE conhecimento SET status = ?, supersedido_por = ?, versao = versao + 1, atualizado_em = ? WHERE id = ?').bind('supersedido', v.entrada!.id, now(), cur.id).run();
        await relacionar(db, v.entrada!.id, cur.id, 'supersede');
        entrada_id = v.entrada!.id;
      } else if (p.modo === 'fechar_resultado') {
        const resultado = String(p.conteudo.resultado ?? '');
        if (!['confirmado', 'refutado', 'pendente'].includes(resultado)) throw new Error('fechar_resultado exige resultado confirmado | refutado');
        const dados = { ...cur.dados, resultado, resultado_em: now().slice(0, 10), ...(p.conteudo.aprendizado ? { aprendizado: String(p.conteudo.aprendizado) } : {}), ...(p.conteudo.numero ? { resultado_numero: String(p.conteudo.numero) } : {}) };
        await db.prepare('UPDATE conhecimento SET dados_json = ?, versao = versao + 1, autor = ?, atualizado_em = ? WHERE id = ?').bind(J(dados), autor, now(), cur.id).run();
        if (resultado === 'refutado') {
          const rels = await relacoesDe(db, cur.id);
          for (const r of rels.filter((x) => x.de === cur.id && x.tipo === 'sustenta')) await db.prepare("UPDATE conhecimento SET confianca = CASE confianca WHEN 'alta' THEN 'media' ELSE 'baixa' END WHERE id = ?").bind(r.para).run();
        }
      } else if (p.modo === 'superseder') {
        const por_id = String(p.conteudo.por ?? '');
        await db.prepare('UPDATE conhecimento SET status = ?, supersedido_por = ?, versao = versao + 1, atualizado_em = ? WHERE id = ?').bind('supersedido', por_id || null, now(), cur.id).run();
        if (por_id) await relacionar(db, por_id, cur.id, 'supersede');
      }
    }
  }
  await db.prepare('UPDATE proposta SET estado = ?, aprovada_por = ?, decidido_por = ?, decidido_em = ?, motivo_decisao = ?, versao_anterior = ?, entrada_id = ?, atualizado_em = ? WHERE id = ?')
    .bind(decisao, decisao === 'aprovada' ? (por === 'votos' ? 'votos' : `editor:${por.toLowerCase()}`) : null, por === 'votos' ? 'votos' : por.toLowerCase(), now(), motivo ?? null, versao_anterior, entrada_id, now(), id).run();
  return { entrada_id };
}

/** Reverte uma proposta aprovada: a entrada volta ao snapshot anterior (versão nova, histórico intacto). */
export async function reverterProposta(db: D1Database, org_id: string, id: string, por: string, motivo?: string | null): Promise<void> {
  const p = await getProposta(db, id);
  if (!p) throw new Error('proposta não existe');
  if (p.estado !== 'aprovada') throw new Error('só proposta aprovada se reverte');
  const cur = p.entrada_id ? await obterConhecimento(db, p.entrada_id) : null;
  if (cur) {
    if (p.modo === 'nova') {
      await db.prepare('UPDATE conhecimento SET status = ?, versao = versao + 1, atualizado_em = ? WHERE id = ?').bind('rascunho', now(), cur.id).run();
    } else if (p.modo === 'substituta') {
      const old = (await relacoesDe(db, cur.id)).find((r) => r.de === cur.id && r.tipo === 'supersede');
      await db.prepare('UPDATE conhecimento SET status = ?, versao = versao + 1, atualizado_em = ? WHERE id = ?').bind('rascunho', now(), cur.id).run();
      if (old) await db.prepare('UPDATE conhecimento SET status = ?, supersedido_por = NULL, versao = versao + 1, atualizado_em = ? WHERE id = ?').bind('ativo', now(), old.para).run();
    } else if (p.versao_anterior != null) {
      const snap = await db.prepare('SELECT snapshot_json FROM conhecimento_hist WHERE entrada_id = ? AND versao = ? ORDER BY id DESC').bind(cur.id, p.versao_anterior).first<{ snapshot_json: string }>();
      const s = parse<Record<string, unknown>>(snap?.snapshot_json, {});
      if (Object.keys(s).length) {
        await db.prepare('UPDATE conhecimento SET titulo = ?, corpo_md = ?, dados_json = ?, tags_json = ?, escopo = ?, nivel = ?, dominio = ?, confianca = ?, status = ?, supersedido_por = ?, sempre = ?, gatilho_json = ?, versao = versao + 1, autor = ?, atualizado_em = ? WHERE id = ?')
          .bind(s.titulo, s.corpo_md, s.dados_json, s.tags_json, s.escopo, s.nivel ?? cur.nivel, s.dominio, s.confianca, s.status, s.supersedido_por ?? null, s.sempre, s.gatilho_json, por.toLowerCase(), now(), cur.id).run();
      }
    }
  }
  await db.prepare('UPDATE proposta SET estado = ?, motivo_decisao = ?, atualizado_em = ? WHERE id = ?').bind('revertida', motivo ?? `revertida por ${por}`, now(), id).run();
}

export function entradaParaInput(e: Entrada): EntradaInput {
  return { id: e.id, tipo: e.tipo, dominio: e.dominio, escopo: e.escopo, nivel: e.nivel, tags: e.tags, titulo: e.titulo, corpo_md: e.corpo_md, dados: e.dados, confianca: e.confianca, fontes: e.fontes, sempre: e.sempre, gatilho: e.gatilho, status: e.status };
}

/** Saúde do conhecimento: por tipo, sempre, pendentes, urgentes, sem verificação. */
export async function saudeConhecimento(db: D1Database, org_id: string): Promise<Record<string, unknown>> {
  const porTipo = (await db.prepare("SELECT tipo, COUNT(*) AS n FROM conhecimento WHERE org_id = ? AND status = 'ativo' GROUP BY tipo ORDER BY n DESC").bind(org_id).all<{ tipo: string; n: number }>()).results;
  const orc = await orcamentoSempre(db, org_id);
  const pend = await db.prepare("SELECT SUM(json_extract(dados_json, '$.resultado') = 'pendente') AS pendentes, SUM(verificado_em IS NULL) AS nao_verificadas, SUM(verificar_ate IS NOT NULL AND verificar_ate < ?) AS vencidas FROM conhecimento WHERE org_id = ? AND status = 'ativo'").bind(now().slice(0, 10), org_id).first<{ pendentes: number | null; nao_verificadas: number | null; vencidas: number | null }>();
  const prop = await db.prepare("SELECT SUM(estado = 'aberta') AS abertas, SUM(estado = 'aberta' AND urgencia = 'urgente') AS urgentes, SUM(estado = 'aberta' AND urgencia = 'urgente' AND criado_em < ?) AS urgentes_24h, SUM(estado = 'aprovada' AND aprovada_por = 'votos' AND decidido_em >= ?) AS por_votos_30d FROM proposta WHERE org_id = ?")
    .bind(new Date(Date.now() - 864e5).toISOString(), new Date(Date.now() - 30 * 864e5).toISOString(), org_id).first<Record<string, number | null>>();
  const contradiz = await db.prepare("SELECT COUNT(*) AS n FROM conhecimento_rel r JOIN conhecimento a ON a.id = r.de JOIN conhecimento b ON b.id = r.para WHERE r.tipo = 'contradiz' AND a.status = 'ativo' AND b.status = 'ativo'").first<{ n: number }>();
  return { por_tipo: porTipo, sempre: orc, pendentes: pend?.pendentes ?? 0, nao_verificadas: pend?.nao_verificadas ?? 0, verificacao_vencida: pend?.vencidas ?? 0,
    propostas: { abertas: prop?.abertas ?? 0, urgentes: prop?.urgentes ?? 0, urgentes_24h: prop?.urgentes_24h ?? 0, por_votos_30d: prop?.por_votos_30d ?? 0 }, contradicoes_abertas: contradiz?.n ?? 0 };
}
