/* benchmarks.ts — benchmarks de funil por tipo de lançamento (centralizado).
 *
 * Registro simples persistido fora da árvore servida (BASE/_benchmarks.json).
 * Cada tipo define os benchmarks de tráfego (hook/hold/ctr/connect/conv_pag) usados
 * como meta-padrão dos KPIs e do funil. A análise herda o preset do tipo escolhido
 * na criação (gerar-acompanhamento); o Python ainda tem o FUNNEL_BENCH como fallback.
 *   GET  /api/benchmarks           → { benchmarks: [{ tipo, label, hook, hold, ctr, connect, conv_pag }] }
 *   POST /api/benchmarks {tipo,…}  → cria/atualiza (upsert por tipo) */

import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import { BASE } from '../paths.js';
import { readJson, writeJson } from '../fsutil.js';

/** `taxa_bump` só existe no lançamento pago (order bump do ingresso) — opcional para
 *  os demais tipos, que não têm essa etapa. */
interface Bench { tipo: string; label: string; hook: number; hold: number; ctr: number; connect: number; conv_pag: number; taxa_bump?: number; }
interface Store { benchmarks: Bench[]; }

const FILE = path.join(BASE, '_benchmarks.json');
const REQUIRED = ['hook', 'hold', 'ctr', 'connect', 'conv_pag'] as const;   // taxa_bump: só no pago

const DEFAULTS: Store = {
  benchmarks: [
    { tipo: 'lancamento-padrao', label: 'Lançamento padrão', hook: 30, hold: 30, ctr: 1.5, connect: 80, conv_pag: 40 },
    // Pago: a página vende o INGRESSO, então a conversão é muito menor que a de uma
    // captura gratuita (5% × 40%) e entra a taxa de order bump (20%).
    { tipo: 'lancamento-pago', label: 'Lançamento pago', hook: 30, hold: 30, ctr: 1.5, connect: 80, conv_pag: 5, taxa_bump: 20 },
  ],
};

function load(): Store {
  const st = readJson<Store>(FILE);
  if (!st) return DEFAULTS;
  // Registro gravado ANTES da mecânica de lançamento pago existir. O tipo
  // 'lancamento-pago' já estava na lista, mas nenhum relatório pago o consumia — seus
  // valores eram cópia do lançamento padrão, nunca uma escolha deliberada. Então:
  //  • taxa_bump ausente → preenche (campo novo);
  //  • conv_pag ainda no valor herdado do padrão (40) → corrige p/ 5, que é a
  //    conversão de uma página que VENDE ingresso. Se alguém já ajustou (≠ 40),
  //    respeita — aí foi escolha do consultor.
  for (const d of DEFAULTS.benchmarks) {
    const b = st.benchmarks.find((x) => x.tipo === d.tipo);
    if (!b) { st.benchmarks.push({ ...d }); continue; }
    if (d.taxa_bump !== undefined && b.taxa_bump === undefined) b.taxa_bump = d.taxa_bump;
    if (d.tipo === 'lancamento-pago' && b.conv_pag === 40) b.conv_pag = d.conv_pag;
  }
  return st;
}

/** Preset de benchmarks de um tipo (ou null). Usado na resolução do funnel_bench. */
export function benchmarkFor(tipo: string): Record<string, number> | null {
  const b = load().benchmarks.find((x) => x.tipo === tipo);
  if (!b) return null;
  const out: Record<string, number> = { hook: b.hook, hold: b.hold, ctr: b.ctr, connect: b.connect, conv_pag: b.conv_pag };
  if (b.taxa_bump !== undefined) out.taxa_bump = b.taxa_bump;
  return out;
}

export function registerBenchmarks(app: Express): void {
  app.get('/api/benchmarks', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(load());
  });

  app.post('/api/benchmarks', (req, res) => {
    const b = (req.body || {}) as Record<string, unknown>;
    const tipo = String(b.tipo || '').trim();
    if (!tipo) { res.status(400).json({ error: 'tipo obrigatório' }); return; }
    const num = (k: string): number | null => {
      const v = Number(b[k]);
      return Number.isFinite(v) ? v : null;
    };
    for (const f of REQUIRED) {
      if (num(f) === null) { res.status(400).json({ error: `${f} inválido` }); return; }
    }
    const d = load();
    const rec: Bench = {
      tipo, label: String(b.label || tipo).trim(),
      hook: num('hook')!, hold: num('hold')!, ctr: num('ctr')!, connect: num('connect')!, conv_pag: num('conv_pag')!,
    };
    // taxa_bump é opcional: só o lançamento pago tem order bump.
    if (num('taxa_bump') !== null) rec.taxa_bump = num('taxa_bump')!;
    const ex = d.benchmarks.find((x) => x.tipo === tipo);
    if (ex) Object.assign(ex, rec);
    else d.benchmarks.push(rec);
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    writeJson(FILE, d);
    res.json({ ok: true, tipo });
  });
}
