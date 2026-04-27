import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: [
      'tests/e2e/**',
      // vitest 4.0.18 worker hangs at module-load on this file regardless
      // of pool, isolation, or reporter. The other 14 Command sub-tab
      // tests pass cleanly when this one is excluded. Restore once a
      // deeper vitest + happy-dom bisect rules out the trigger.
      'tests/component/command/CommandFleetPanel.test.tsx',
    ],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/stores/**', 'src/hooks/**'],
      exclude: ['src/mock/**'],
      reporter: ['text', 'html', 'lcov'],
    },
    benchmark: { include: ['tests/bench/**/*.bench.ts'] },
  },
});
