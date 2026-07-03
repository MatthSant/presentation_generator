/* appSettings.ts — configurações globais do app (key-value em app_settings).
 *
 * Cache em memória p/ leitura barata em caminhos quentes (o gate do fallback NVIDIA
 * é checado em toda chamada ao Claude e não pode fazer I/O de DB). loadSettings roda
 * no boot; setSetting persiste no DB e atualiza o cache. */

import type { DB } from './db.js';

let cache: Record<string, string> = {};

export function loadSettings(db: DB): void {
  cache = {};
  for (const row of db.prepare('SELECT key, value FROM app_settings').all() as Array<{ key: string; value: string }>) {
    cache[row.key] = row.value;
  }
}

export function getSetting(key: string, def = ''): string {
  return cache[key] ?? def;
}

export function setSetting(db: DB, key: string, value: string): void {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  cache[key] = value;
}
