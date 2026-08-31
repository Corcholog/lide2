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
  test: {
    /*
     * Los `beforeAll` que levantan la base tardan más que el default de 10s.
     *
     * `createTestDb()` arranca un Postgres en WASM y le aplica las veintiuna
     * migraciones, una por una. Sola tarda menos de dos segundos, pero son
     * veintiocho suites corriendo en paralelo y cada una levanta la suya: con
     * la máquina ocupada —un `next dev` al lado alcanza— alguna se pasa de los
     * diez, y el fallo aparece en un archivo distinto en cada corrida, que es
     * la peor forma de un test en rojo. No es lentitud de una prueba puntual
     * sino el costo fijo de arrancar, así que el margen va acá y no en cada
     * `beforeAll`.
     */
    hookTimeout: 60_000,
  },
})
