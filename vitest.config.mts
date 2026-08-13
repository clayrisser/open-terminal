import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      // src/moduleDir.js only exists once the build has copied the per-format
      // implementation into place. Point it at lib/ so the suite runs against
      // the shim that actually ships.
      {
        find: /^\.\/moduleDir\.js$/,
        replacement: path.resolve(import.meta.dirname, 'tests/unit/moduleDir.mjs')
      }
    ]
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Thin process entry points; exercised by the e2e suite, not by vitest.
      exclude: ['src/bin.ts', 'src/shb64.ts', 'src/types.ts'],
      reportsDirectory: 'coverage'
    }
  }
});
