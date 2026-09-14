import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import path from 'node:path';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        isolatedStorage: true,   // D1/KV/DO limpos a cada teste
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            COOKIE_ENCRYPTION_KEY: 'test-key',
            ALLOWED_DOMAIN: 'witly.digital',
            EDITOR_SEED: 'dono@witly.digital',
            ORG_ID: 'witly',
            PUBLIC_URL: 'http://x',
            GOOGLE_CLIENT_ID: 'x',
            GOOGLE_CLIENT_SECRET: 'y',
          },
        },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/apply-migrations.ts'],
      // Cada teste sobe um worker com D1/KV/DO isolados. Sozinho, um caso roda em ~500ms;
      // com os 21 arquivos em paralelo a contenção passa dos 5000ms padrão e o suite falha
      // um punhado de casos diferentes a cada rodada — sinal aleatório, que é pior que
      // nenhum. 20s dá folga para a contenção sem esconder um teste de fato travado.
      testTimeout: 20_000,
      hookTimeout: 20_000,
    },
  };
});
