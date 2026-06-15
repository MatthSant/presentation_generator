/* clients.ts — cadastro de clientes padrões (nome + contexto + regras de temperatura).
 *
 * Registro simples persistido fora da árvore servida (BASE/_clients.json). O
 * contexto descreve o negócio do cliente e pode alimentar a geração de insights.
 * As regras de temperatura (pattern→label) classificam o lead pelo nome da campanha
 * e são aplicadas na geração (ver generate.ts → motores). Fallback geral em
 * BASE/_temp_default.json.
 *   GET  /api/clients          → { clients: [{ slug, name, context, temp_rules, temp_overwrite }] }
 *   POST /api/clients {name, context, temp_rules?, temp_overwrite?} → upsert por slug
 *   GET  /api/temp-default     → { temp_rules, temp_overwrite }
 *   POST /api/temp-default {temp_rules, temp_overwrite} → grava fallback geral */

import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import { BASE } from '../paths.js';
import { readJson, writeJson } from '../fsutil.js';

interface TempRule { contains: string[]; label: string; }
interface TempCfg { temp_rules: TempRule[]; temp_overwrite: boolean; }
interface Client { slug: string; name: string; context: string; temp_rules?: TempRule[]; temp_overwrite?: boolean; }
interface Store { clients: Client[]; }

const FILE = path.join(BASE, '_clients.json');
const TEMP_FILE = path.join(BASE, '_temp_default.json');

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Normaliza regras de temperatura — aceita `contains` como lista (chips) ou
 *  string separada por vírgula. Descarta regras sem label ou sem termos. */
function sanitizeRules(raw: unknown): TempRule[] {
  if (!Array.isArray(raw)) return [];
  const out: TempRule[] = [];
  for (const r of raw) {
    const o = (r || {}) as Record<string, unknown>;
    const contains = (Array.isArray(o.contains) ? o.contains : String(o.contains ?? '').split(','))
      .map((s) => String(s).trim()).filter(Boolean);
    const label = String(o.label ?? '').trim();
    if (label && contains.length) out.push({ contains, label });
  }
  return out;
}

/** Nome de exibição de um cliente do registro (ou null se não cadastrado). */
export function clientName(slug: string): string | null {
  const d = readJson<Store>(FILE) || { clients: [] };
  return d.clients.find((c) => c.slug === slug)?.name ?? null;
}

/** Regras de temperatura de um cliente (ou null se ele não tiver nenhuma). */
export function clientTemp(slug: string): TempCfg | null {
  const d = readJson<Store>(FILE) || { clients: [] };
  const c = d.clients.find((x) => x.slug === slug);
  if (!c?.temp_rules?.length) return null;
  return { temp_rules: c.temp_rules, temp_overwrite: !!c.temp_overwrite };
}

/** Fallback geral de temperatura (ou null se não configurado). */
export function globalTemp(): TempCfg | null {
  const d = readJson<TempCfg>(TEMP_FILE);
  if (!d?.temp_rules?.length) return null;
  return { temp_rules: d.temp_rules, temp_overwrite: !!d.temp_overwrite };
}

export function registerClients(app: Express): void {
  app.get('/api/clients', (_req, res) => {
    const d = readJson<Store>(FILE) || { clients: [] };
    res.setHeader('Cache-Control', 'no-cache');
    res.json(d);
  });

  app.post('/api/clients', (req, res) => {
    const b = (req.body || {}) as Record<string, unknown>;
    const name = String(b.name || '').trim();
    const context = String(b.context || '').trim();
    if (!name) { res.status(400).json({ error: 'nome obrigatório' }); return; }
    const slug = slugify(name);
    if (!slug) { res.status(400).json({ error: 'nome inválido' }); return; }
    const d = readJson<Store>(FILE) || { clients: [] };
    const ex = d.clients.find((c) => c.slug === slug);
    const c = ex || { slug, name, context };
    c.name = name; c.context = context;
    // Temperatura: só toca quando o campo vem no corpo (não apaga ao salvar pelo form simples).
    if ('temp_rules' in b) c.temp_rules = sanitizeRules(b.temp_rules);
    if ('temp_overwrite' in b) c.temp_overwrite = !!b.temp_overwrite;
    if (!ex) d.clients.push(c);
    d.clients.sort((a, b2) => a.name.localeCompare(b2.name));
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    writeJson(FILE, d);
    res.json({ ok: true, slug });
  });

  app.get('/api/temp-default', (_req, res) => {
    const d = readJson<TempCfg>(TEMP_FILE) || { temp_rules: [], temp_overwrite: false };
    res.setHeader('Cache-Control', 'no-cache');
    res.json(d);
  });

  app.post('/api/temp-default', (req, res) => {
    const b = (req.body || {}) as Record<string, unknown>;
    const cfg: TempCfg = { temp_rules: sanitizeRules(b.temp_rules), temp_overwrite: !!b.temp_overwrite };
    fs.mkdirSync(path.dirname(TEMP_FILE), { recursive: true });
    writeJson(TEMP_FILE, cfg);
    res.json({ ok: true });
  });
}
