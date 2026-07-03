// Flat config (ESLint 9). Type-aware linting for the TS server + client + shared.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'public/js/', 'node_modules/', 'public/vendor/', '_dev_authoff.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      // The codebase deliberately narrows untrusted JSON with explicit casts.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'no-console': 'off',
    },
  },
  {
    // Client globals (vendor UMD libs are ambient; browser env).
    files: ['src/client/**/*.ts'],
    languageOptions: { globals: { document: 'readonly', window: 'readonly', location: 'readonly', history: 'readonly', fetch: 'readonly', EventSource: 'readonly', URLSearchParams: 'readonly', Blob: 'readonly', console: 'readonly', ApexCharts: 'readonly', GridStack: 'readonly' } },
  },
);
