import { milestonePlayed, shortDate } from '@/lib/lide2/dates'
import { CALENDAR, type Milestone } from '@/lib/lide2/tournament'

/*
 * How each date reads. Full class names, never assembled at runtime: Tailwind
 * only generates classes it finds written in the source.
 *
 * A played date drops the surface fill instead of being dimmed, so it steps
 * back without its text losing contrast.
 */
const CARD = {
  next: 'border-accent bg-accent-dim/50',
  played: 'border-line',
  upcoming: 'border-line bg-surface',
}

/** The tournament's six dates: the ones played, the one coming up, the rest. */
export function Calendar({
  next,
  groupsDone = false,
}: {
  next: Milestone | undefined
  /** Whether the group phase is over, which its own dates cannot tell. */
  groupsDone?: boolean
}) {
  const played = CALENDAR.filter((milestone) => milestonePlayed(milestone, groupsDone)).length

  return (
    <section id="calendario" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 className="border-b-4 border-accent pb-1 text-lg uppercase tracking-tight">
          Calendario
        </h2>
        <p className="text-xs text-faint">
          {CALENDAR.length} fechas · {played === 0 ? 'ninguna jugada' : `${played} jugadas`}
        </p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {CALENDAR.map((milestone) => {
          const { day, month } = shortDate(milestone.date)
          const done = milestonePlayed(milestone, groupsDone)

          return (
            <li
              key={milestone.id}
              className={`flex flex-col gap-1 rounded-lg border px-4 py-3 ${
                milestone.id === next?.id ? CARD.next : done ? CARD.played : CARD.upcoming
              }`}
            >
              <p className="tabular font-display text-xl font-bold">
                {day} <span className="text-sm font-medium text-muted">{month}</span>
              </p>
              <p className="text-sm font-medium">{milestone.label}</p>
              <p className="text-xs text-faint">
                {milestone.format} · {milestone.venue}
              </p>
              {/*
                Once it is played the kickoff times are noise; what matters is
                that it happened.
              */}
              {done ? (
                <p className="text-xs font-medium text-muted">Jugada</p>
              ) : (
                milestone.detail && <p className="text-xs text-dim">{milestone.detail}</p>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
