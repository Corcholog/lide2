import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Los tests hasta ahora sólo tocaban SQL y helpers propios, así que alcanzaba
 * con imports relativos. Desde que también verifican datos que viven en `src/`
 * hace falta el alias `@/`, el mismo que ya declara el tsconfig.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
