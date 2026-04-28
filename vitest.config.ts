import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.test.ts'],
    environment: 'happy-dom',
    environmentMatchGlobs: [
      ['test/unit/**', 'node'],
      ['test/integration/**', 'happy-dom'],
    ],
  },
});
