/* guia.ts — serves the guide viewer shell for /guia/:slug (content from guias.json). */

import path from 'node:path';
import type { Express } from 'express';
import { PUBLIC } from '../paths.js';

export function registerGuia(app: Express): void {
  app.get('/guia/:slug', (_req, res) => {
    res.sendFile(path.join(PUBLIC, 'guia.html'));
  });
  // Query builder for an analysis type (content embedded in the page per slug).
  app.get('/montador/:slug', (_req, res) => {
    res.sendFile(path.join(PUBLIC, 'montador.html'));
  });
}
