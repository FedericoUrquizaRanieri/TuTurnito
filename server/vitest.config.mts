import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // Tests share a single Postgres test database (tuturnito_test); running
    // test files in parallel would race on it (cross-test data collisions
    // between files, since each resets/reads global state like the catalog
    // count). This suite is small enough that sequential execution is fast
    // anyway.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 20000,
  },
});
