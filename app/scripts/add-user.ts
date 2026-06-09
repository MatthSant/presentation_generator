/* add-user.ts — cria (ou garante) um consultor.
 *   npm run user:add -- consultor@witly.com senhaForte
 * Idempotente: se o e-mail já existe, não duplica. */

import { db } from '../src/server/db.js';
import { ensureUser } from '../src/server/auth.js';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('uso: npm run user:add -- <email> <senha>');
  process.exit(1);
}
ensureUser(db, email, password);
console.log('✓ consultor garantido:', email);
