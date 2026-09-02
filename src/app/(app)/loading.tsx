/**
 * What shows while the page fetches its data.
 *
 * Nearly every page is dynamic and runs between three and six queries, so
 * without this the browser sits on the previous screen - or on a blank one -
 * with no sign that anything is happening.
 *
 * Grey blocks roughly the size of what is coming, and not a spinner: what it
 * means to say is "it is on its way, it will look like this", not "wait".
 */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true">
      <span className="sr-only">Cargando…</span>

      <div className="flex flex-col gap-2">
        <div className="h-8 w-56 bg-raised" />
        <div className="h-4 w-80 max-w-full bg-raised" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3 border-2 border-line bg-surface p-4">
            <div className="h-4 w-28 bg-raised" />
            {[0, 1, 2, 3, 4].map((j) => (
              <div key={j} className="h-3 w-full bg-raised" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
