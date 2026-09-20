import { UniversityLogo } from '@/components/tournament/UniversityLogo'
import { Tabs } from '@/components/nav/Tabs'
import { currentTab } from '@/components/nav/current'
import { timeOfDay, weekdayAndDate } from '@/lib/lide2/dates'
import { isDecided } from '@/lib/lide2/fixture'
import { rulingLabel } from '@/lib/lide2/rulings'
import type { FixtureResultRow } from '@/types/db'

/**
 * The published fixture, one matchday per tab, grouped by time slot and then by
 * group (so each group label appears once). Upcoming matchups show "vs";
 * played ones show the kill score.
 */

interface Slot {
  matchday: number
  slot: number
  kickoff: string
  groups: Map<string, FixtureResultRow[]>
}

/** One matchday: its slots and how far along it is. */
interface Matchday {
  matchday: number
  slots: Slot[]
  matchups: number
  decided: number
}

/** Every matchup of a matchday, across its slots and groups. */
function matchupsOf(slots: Slot[]): FixtureResultRow[] {
  return slots.flatMap((slot) => [...slot.groups.values()].flat())
}

export function Fixture({ rounds }: { rounds: FixtureResultRow[] }) {
  if (rounds.length === 0) return null

  // Keeps the query's order: slot, group, team.
  const slots = new Map<string, Slot>()
  for (const row of rounds) {
    const key = `${row.matchday}-${row.slot}`
    const slot = slots.get(key) ?? {
      matchday: row.matchday,
      slot: row.slot,
      kickoff: row.kickoff,
      groups: new Map<string, FixtureResultRow[]>(),
    }
    slot.groups.set(row.group_label, [...(slot.groups.get(row.group_label) ?? []), row])
    slots.set(key, slot)
  }

  const decided = rounds.filter(isDecided).length

  // Slots grouped by matchday, the unit of each tab. Matchdays 1 and 2 have two
  // slots, matchday 3 has one. Each one carries its progress, which both the
  // tab label and the tab that opens are read from.
  const byMatchday = new Map<number, Slot[]>()
  for (const slot of slots.values()) {
    byMatchday.set(slot.matchday, [...(byMatchday.get(slot.matchday) ?? []), slot])
  }
  const matchdays: Matchday[] = [...byMatchday.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([matchday, daySlots]) => {
      const matchups = matchupsOf(daySlots)
      return {
        matchday,
        slots: daySlots,
        matchups: matchups.length,
        decided: matchups.filter(isDecided).length,
      }
    })

  return (
    <section id="fixture" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 className="border-b-4 border-accent pb-1 text-lg uppercase tracking-tight">Fixture</h2>
        <p className="text-xs text-faint">
          {rounds.length} partidos ·{' '}
          {decided === 0 ? 'ninguno definido' : `${decided} definidos`}
        </p>
      </div>

      {/*
        Phones only: without hover nothing signals that team names can be
        tapped to highlight their matchups.
      */}
      <p className="text-xs text-faint sm:hidden">Tocá un equipo para ver todos sus partidos.</p>

      {/*
        One matchday at a time, so the fixture does not push the rest of the
        home page far down. Panels are rendered on the server and passed as
        children; the client component only picks which one shows (see Tabs).
      */}
      <Tabs
        label="Fechas del fixture"
        defaultIndex={currentTab(matchdays.map((day) => day.decided === day.matchups))}
        tabs={matchdays.map((day) => ({
          id: `fecha-${day.matchday}`,
          title: `Fecha ${day.matchday}`,
          // Progress once games are decided; the date before that.
          detail:
            day.decided > 0
              ? `${day.decided} de ${day.matchups} definidos`
              : weekdayAndDate(day.slots[0].kickoff),
        }))}
      >
        {matchdays.map((day) => (
          <div key={day.matchday} className="flex flex-col gap-4">
            {day.slots.map((slot) => (
              <div
                key={`${slot.matchday}-${slot.slot}`}
                className="border-2 border-line bg-surface"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 border-b-2 border-line px-4 py-2.5">
                  {/*
                    The kickoff time rather than "Turno 1": the tab already names
                    the matchday, and the time is what people need.
                  */}
                  <h3 className="tabular text-sm uppercase tracking-tight">
                    {timeOfDay(slot.kickoff)}
                  </h3>
                  <span className="text-xs text-muted">{weekdayAndDate(slot.kickoff)}</span>
                </div>

                {/*
                  Grid lines come from the gap: the grid has the border color and
                  each cell covers it with its background, which holds up across
                  breakpoints. Two columns, so team names are not truncated.
                */}
                <div className="grid gap-0.5 bg-line sm:grid-cols-2">
                  {[...slot.groups.entries()].map(([group, matches]) => (
                    <div key={group} className="bg-surface px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-accent">
                        {group}
                      </p>

                      <ul className="mt-2 flex flex-col gap-2">
                        {matches.map((match) => (
                          <FixtureRow key={match.id} match={match} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </Tabs>
    </section>
  )
}

function FixtureRow({ match }: { match: FixtureResultRow }) {
  const played = match.status === 'jugado'
  // Walkover: no score because no game was played; the names show who won.
  const walkover = match.status === 'w.o.'
  // Overturned by the organizers: the played score is not the result, so it is
  // not shown; the names show who was awarded the matchup.
  const ruling = match.status === 'reglamento' ? rulingLabel(match.ruling) : null

  return (
    // `data-fixture` lets TeamFocus dim the matchups of other teams.
    <li data-fixture className="flex items-center gap-1.5 text-sm transition-opacity duration-200">
      <FixtureTeam
        id={match.team_a_id}
        name={match.team_a_name}
        universities={match.team_a_universities}
        won={match.team_a_win}
        align="right"
      />

      {/*
        w-10 fits a two-digit score per side ("15-23") in text-xs and leaves more
        room for the names.
      */}
      <span className="tabular w-10 shrink-0 text-center text-xs">
        {played ? (
          <>
            <span className={match.team_a_win ? 'font-bold text-win' : 'text-loss'}>
              {match.team_a_kills}
            </span>
            <span className="text-dim">-</span>
            <span className={match.team_b_win ? 'font-bold text-win' : 'text-loss'}>
              {match.team_b_kills}
            </span>
          </>
        ) : ruling ? (
          <abbr className="text-faint no-underline" title={`${ruling.long}: resultado definido por la organización`}>
            {ruling.short}
          </abbr>
        ) : walkover ? (
          <span className="text-faint" title="Ganado por no presentación del rival">
            W.O.
          </span>
        ) : (
          <span className="text-dim">vs</span>
        )}
      </span>

      <FixtureTeam
        id={match.team_b_id}
        name={match.team_b_name}
        universities={match.team_b_universities}
        won={match.team_b_win}
        align="left"
      />
    </li>
  )
}

function FixtureTeam({
  id,
  name,
  universities,
  won,
  align,
}: {
  id: string
  name: string
  universities: string[] | null
  won: boolean | null
  align: 'left' | 'right'
}) {
  /*
   * A button, not a link: here the question is who a team plays and when, which
   * highlighting answers without leaving the page. Team pages are linked from
   * the group table and the highlight notice.
   *
   * aria-pressed starts false and TeamFocus updates it in the DOM, since this
   * server-rendered tree never re-renders. Full university names are in the
   * title; the standings table shows them in full.
   */
  const tags = universities ?? []

  return (
    <button
      type="button"
      data-team={id}
      aria-pressed={false}
      title={
        tags.length > 0
          ? `Resaltar los partidos de ${name} (${tags.join(' · ')})`
          : `Resaltar los partidos de ${name}`
      }
      className={`group flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 px-1 ${
        // Crests on the outer edge and names next to the score, mirrored.
        align === 'right' ? 'flex-row' : 'flex-row-reverse'
      }`}
    >
      {/*
        Every university's crest at 40px, which leaves room for the name in the
        two-column layout. On phones only the main crest shows, at 28px.
      */}
      {tags.length > 0 && (
        <span className="flex shrink-0 items-center gap-1">
          {tags.map((tag, i) => (
            <UniversityLogo
              key={tag}
              tag={tag}
              size="fixture"
              className={i > 0 ? 'hidden sm:block' : ''}
            />
          ))}
        </span>
      )}
      {/*
        `nombre-equipo` is the hook for the `@media (hover: none)` rule in
        globals.css, which adds a dotted underline on touch screens.
      */}
      <span
        className={`nombre-equipo min-w-0 flex-1 truncate transition-colors group-hover:text-accent ${
          align === 'right' ? 'text-right' : 'text-left'
        } ${won === null ? 'text-fg-soft' : won ? 'font-semibold text-fg' : 'text-loss'}`}
      >
        {name}
      </span>
    </button>
  )
}
