/* index.ts — process entrypoint: build the app and start listening. */

import './env.js'; // load app/.env before anything reads process.env
import fs from 'node:fs';
import { createApp } from './app.js';
import { PORT, OUT } from './paths.js';
import { db } from './db.js';
import { ensureUser, authenticate, assignClient } from './auth.js';

// Auth is ON by default; AUTH_DISABLED=1 turns it off for local dev.
const AUTH = process.env.AUTH_DISABLED !== '1';

// Optional env-based bootstrap: seed the first consultant and claim every
// existing analysis for them (so nothing is orphaned when auth turns on).
if (AUTH && process.env.SEED_EMAIL && process.env.SEED_PASSWORD) {
  ensureUser(db, process.env.SEED_EMAIL, process.env.SEED_PASSWORD);
  const u = authenticate(db, process.env.SEED_EMAIL, process.env.SEED_PASSWORD);
  if (u && fs.existsSync(OUT)) {
    for (const c of fs.readdirSync(OUT, { withFileTypes: true })) {
      if (c.isDirectory()) assignClient(db, u.id, c.name);
    }
  }
}

const { app } = createApp({ auth: AUTH });

app.listen(PORT, () => {
  console.log(`\n  ✓  Analytics App  →  http://localhost:${PORT}${AUTH ? '' : '  (auth OFF)'}\n`);
});
