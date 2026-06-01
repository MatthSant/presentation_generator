/* report.ts — serves the SPA shell for /report/:client/:slug. */

import path from 'node:path';
import type { Express } from 'express';
import { PUBLIC } from '../paths.js';

export function registerReport(app: Express): void {
  app.get('/report/:client/:slug', (_req, res) => {
    res.sendFile(path.join(PUBLIC, 'report.html'));
  });
}
