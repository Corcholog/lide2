import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * The `@/` alias matches tsconfig, for tests that import from `src/`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    /*
     * Each suite starts its own Postgres (PGlite, WASM) and applies every
     * migration, which can exceed the default 10s hook timeout when suites run in
     * parallel on a busy machine. The timeout is raised here rather than per
     * `beforeAll`.
     */
    hookTimeout: 60_000,
  },
})
