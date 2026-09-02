import Link from 'next/link'

/**
 * A team, a player or a match that does not exist.
 *
 * The pages call `notFound()` when the query comes back empty, and without this
 * they landed on Next's generic screen, outside the site. Here they at least
 * stay inside, with the navigation in place and a way back.
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-6 border-2 border-line bg-surface px-6 py-16 text-center">
      <div>
        <p className="font-display text-5xl leading-none text-accent">404</p>
        <p className="mt-3 font-display text-xl uppercase tracking-tight">Esto no existe</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Puede que el link esté mal, o que sea algo que todavía no se cargó.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/"
          className="bg-accent-strong px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent"
        >
          El torneo
        </Link>
        <Link
          href="/partidas"
          className="border-2 border-line-strong px-4 py-2 text-sm font-bold uppercase tracking-wide text-muted transition-colors hover:border-accent hover:text-accent"
        >
          Las partidas
        </Link>
      </div>
    </div>
  )
}
