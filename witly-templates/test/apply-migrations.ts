import { applyD1Migrations, env } from 'cloudflare:test';

// Roda as migrations no D1 isolado de cada arquivo de teste (pool de Workers).
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS ?? []);
