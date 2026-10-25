import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*', 'data'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/index.ts',
        '**/tipos.ts',
        '**/main.{ts,tsx}',
        '**/*-cli.ts',
        '**/test/**',
      ],
      reporter: ['text', 'html'],
      thresholds: {
        'packages/core/src/**': { lines: 95, branches: 95, functions: 95, statements: 95 },
        'packages/dte/src/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'packages/printer/src/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
      },
    },
  },
});
