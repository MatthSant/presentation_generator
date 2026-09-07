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
    },
  };
});
