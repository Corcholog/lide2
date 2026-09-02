import { shortDate } from '@/lib/lide2/dates'
import { CALENDAR, TOURNAMENT, type Milestone } from '@/lib/lide2/tournament'

/** The tournament's six dates, with the next one framed. */
export function Calendar({ next }: { next: Milestone | undefined }) {
  return (
    <section id="calendario" className="flex scroll-mt-16 flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 className="border-b-4 border-accent pb-1 text-lg uppercase tracking-tight">
          Calendario
        </h2>
        <p className="text-xs text-faint">Fase de grupos, {TOURNAMENT.playTime} hs</p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {CALENDAR.map((milestone) => {
          const { day, month } = shortDate(milestone.date)
          const isNext = milestone.id === next?.id

          return (
            <li
              key={milestone.id}
              className={`flex flex-col gap-1 rounded-lg border px-4 py-3 ${
                isNext ? 'border-accent bg-accent-dim/50' : 'border-line bg-surface'
              }`}
            >
              <p className="tabular font-display text-xl font-bold">
                {day} <span className="text-sm font-medium text-muted">{month}</span>
              </p>
              <p className="text-sm font-medium">{milestone.label}</p>
              <p className="text-xs text-faint">
                {milestone.format} · {milestone.venue}
              </p>
              {milestone.detail && <p className="text-xs text-dim">{milestone.detail}</p>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
