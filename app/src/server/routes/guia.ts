/* guia.ts — serves the guide viewer shell for /guia/:slug (content from guias.json). */

import path from 'node:path';
import type { Express } from 'express';
import { PUBLIC } from '../paths.js';
import { typeOf } from '../typeRegistry.js';

export function registerGuia(app: Express): void {
  app.get('/guia/:slug', (_req, res) => {
    res.sendFile(path.join(PUBLIC, 'guia.html'));
  });
  // Query builder for an analysis type (page resolved by the type registry).
  app.get('/montador/:slug', (req, res) => {
    res.sendFile(path.join(PUBLIC, typeOf(req.params.slug).montadorPage));
  });
  // All analyses of one client (the home links to it per client).
  app.get('/cliente/:slug', (_req, res) => {
    res.sendFile(path.join(PUBLIC, 'cliente.html'));
  });
}
