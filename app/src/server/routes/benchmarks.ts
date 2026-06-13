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

interface Bench { tipo: string; label: string; hook: number; hold: number; ctr: number; connect: number; conv_pag: number; }
interface Store { benchmarks: Bench[]; }

const FILE = path.join(BASE, '_benchmarks.json');
const FIELDS = ['hook', 'hold', 'ctr', 'connect', 'conv_pag'] as const;

const DEFAULTS: Store = {
  benchmarks: [
    { tipo: 'lancamento-padrao', label: 'Lançamento padrão', hook: 30, hold: 30, ctr: 1.5, connect: 80, conv_pag: 40 },
    { tipo: 'lancamento-pago', label: 'Lançamento pago', hook: 30, hold: 30, ctr: 1.5, connect: 80, conv_pag: 40 },
  ],
};

function load(): Store {
  return readJson<Store>(FILE) || DEFAULTS;
}

/** Preset de benchmarks de um tipo (ou null). Usado na resolução do funnel_bench. */
export function benchmarkFor(tipo: string): Record<string, number> | null {
  const b = load().benchmarks.find((x) => x.tipo === tipo);
  if (!b) return null;
  return { hook: b.hook, hold: b.hold, ctr: b.ctr, connect: b.connect, conv_pag: b.conv_pag };
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
    for (const f of FIELDS) {
      if (num(f) === null) { res.status(400).json({ error: `${f} inválido` }); return; }
    }
    const d = load();
    const rec: Bench = {
      tipo, label: String(b.label || tipo).trim(),
      hook: num('hook')!, hold: num('hold')!, ctr: num('ctr')!, connect: num('connect')!, conv_pag: num('conv_pag')!,
    };
    const ex = d.benchmarks.find((x) => x.tipo === tipo);
    if (ex) Object.assign(ex, rec);
    else d.benchmarks.push(rec);
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    writeJson(FILE, d);
    res.json({ ok: true, tipo });
  });
}
