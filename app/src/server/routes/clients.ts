/* clients.ts — cadastro de clientes padrões (nome + contexto).
 *
 * Registro simples persistido fora da árvore servida (BASE/_clients.json). O
 * contexto descreve o negócio do cliente e pode alimentar a geração de insights.
 *   GET  /api/clients          → { clients: [{ slug, name, context }] }
 *   POST /api/clients {name, context} → cria/atualiza (upsert por slug) */

import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import { BASE } from '../paths.js';
import { readJson, writeJson } from '../fsutil.js';

interface Client { slug: string; name: string; context: string; }
interface Store { clients: Client[]; }

const FILE = path.join(BASE, '_clients.json');

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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
    if (ex) { ex.name = name; ex.context = context; }
    else d.clients.push({ slug, name, context });
    d.clients.sort((a, b2) => a.name.localeCompare(b2.name));
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    writeJson(FILE, d);
    res.json({ ok: true, slug });
  });
}
