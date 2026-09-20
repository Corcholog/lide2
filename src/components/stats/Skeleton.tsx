/**
 * Placeholders shown while a scope's numbers are on their way.
 *
 * The stats pages stream: the heading and the scope picker are rendered from
 * the URL alone and sent immediately, and the part that needs the database
 * arrives behind a `Suspense` boundary keyed on the scope. Without these the
 * page would jump from chips to a full table with nothing in between.
 *
 * Grey blocks shaped like the content rather than a spinner, matching
 * `(app)/loading.tsx`. No heading block here: the real one is already on
 * screen by the time these show.
 */

export function RankingsSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-8" aria-busy="true">
      <span className="sr-only">Cargando las estadísticas…</span>

      {/* The four summary tiles. */}
      <div className="grid grid-cols-2 gap-0.5 bg-line sm:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <div key={tile} className="flex flex-col gap-2 bg-surface px-4 py-3">
            <div className="h-3 w-16 bg-raised" />
            <div className="h-6 w-20 bg-raised" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((card) => (
          <div key={card} className="flex flex-col gap-3 border-2 border-line bg-surface p-4">
            <div className="h-4 w-28 bg-raised" />
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="h-3 w-full bg-raised" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function TablesSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-8" aria-busy="true">
      <span className="sr-only">Cargando las tablas…</span>

      {[0, 1].map((table) => (
        <div key={table} className="flex flex-col gap-3">
          <div className="h-5 w-40 bg-raised" />
          <div className="flex flex-col gap-0.5 border-2 border-line bg-line">
            {/* One thicker row for the header, then the body. */}
            <div className="h-9 bg-surface" />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
              <div key={row} className="h-8 bg-surface" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
