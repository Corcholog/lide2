import type { StatBlock } from '@/lib/stats/types'

/**
 * Una estadística: título, hasta cinco filas y, si hace falta, una aclaración.
 *
 * Todas las estadísticas se dibujan con esto, así que el catálogo puede crecer
 * sin tocar la página. El puesto va en número grande a la izquierda y el valor
 * a la derecha, que es como se lee un ranking de un vistazo.
 */
export function StatCard({ block }: { block: StatBlock }) {
  return (
    <section className="flex flex-col border-2 border-line bg-surface text-fg">
      <header className="border-b-2 border-line px-4 py-3">
        <h3 className="font-display text-sm uppercase tracking-wide">{block.title}</h3>
        {block.subtitle && <p className="mt-0.5 text-xs text-muted">{block.subtitle}</p>}
      </header>

      <ol className="flex flex-1 flex-col divide-y divide-line">
        {block.rows.map((row, index) => (
          <li key={row.id} className="flex items-baseline gap-3 px-4 py-2.5">
            <span
              className={`w-4 shrink-0 font-display text-sm ${index === 0 ? 'text-accent' : 'text-faint'}`}
            >
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.name}</p>
              {(row.subtitle || row.detail) && (
                <p className="truncate text-xs text-muted">
                  {[row.subtitle, row.detail].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>

            <span
              className={`shrink-0 text-right text-sm tabular-nums ${index === 0 ? 'font-bold text-accent' : 'text-fg-soft'}`}
            >
              {row.display}
            </span>
          </li>
        ))}
      </ol>

      {block.note && (
        <p className="border-t-2 border-line px-4 py-2 text-xs text-faint">{block.note}</p>
      )}
    </section>
  )
}
