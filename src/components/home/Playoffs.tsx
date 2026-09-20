import type { CSSProperties } from 'react'
import Link from 'next/link'
import { Tabs } from '@/components/nav/Tabs'
import { currentTab } from '@/components/nav/current'
import { UniversityLogos } from '@/components/tournament/UniversityLogo'
import { dayAndMonth } from '@/lib/lide2/dates'
import { FINAL_ROUND, seriesWinner } from '@/lib/lide2/winner'
import { teamPath } from '@/lib/routes'
import type { SeriesResultRow } from '@/types/db'

/*
 * The playoff rounds. `round` is the value stored in the database; `short` is
 * the tab label on phones, where the full name would wrap.
 */
const QUARTERS = 'Cuartos de final'

const ROUNDS = [
  { round: QUARTERS, short: 'Cuartos' },
  { round: 'Semifinales', short: 'Semis' },
  { round: FINAL_ROUND, short: 'Final' },
]

/**
 * Why the quarter-finals name no one yet.
 *
 * The eight are known the moment the groups end, but not who meets whom: rule
 * 2.3 crosses group winners with runners-up through a draw that tries to keep
 * teams of the same university apart. Until it is made, any pairing written
 * here would be a guess presented as a fixture.
 */
const DRAW_NOTE = 'Cruce por sorteo: 1º contra 2º, evitando la misma universidad'

/**
 * What an empty slot says. The quarter-finals are drawn, so theirs name no
 * group place; the later rounds do follow from the bracket and keep the label
 * the series carries ("Ganador cuartos 1").
 */
function slotLabel(round: string | null, stored: string | null): string {
  return round === QUARTERS ? 'A sortear' : (stored ?? 'por definir')
}

/**
 * How wide the name column is, so the crests line up down the bracket instead
 * of following each name's length.
 *
 * In `ch` units, taken from the longest name shown (`ch` is the width of a
 * digit, and team names end in numbers). Capped so one long name cannot push
 * the crests off a narrow card; anything longer is truncated as before.
 */
function nameWidth(series: SeriesResultRow[]): number {
  const names = series.flatMap((item) => [item.team_a_name, item.team_b_name])

  return Math.min(Math.max(0, ...names.map((name) => name?.length ?? 0)), 18)
}

export function Playoffs({
  series,
  universities = new Map(),
}: {
  series: SeriesResultRow[]
  /** Each team's universities by id, for the crests beside the names. */
  universities?: Map<string, string[]>
}) {
  const inRound = (round: string) => series.filter((item) => item.round === round)

  /*
   * A round is over once every one of its series has a winner. A round with no
   * series yet is not over: it is what the bracket is waiting for.
   */
  const played = ROUNDS.map(({ round }) => {
    const items = inRound(round)
    return items.length > 0 && items.every((item) => item.winner_team_id !== null)
  })

  return (
    <section
      id="playoffs"
      className="flex flex-col gap-4"
      // Read by every team row, so all the crests share one column.
      style={{ '--bracket-name': `${nameWidth(series)}ch` } as CSSProperties}
    >
      <div className="flex items-end justify-between gap-4">
        <h2 className="border-b-4 border-accent pb-1 text-lg uppercase tracking-tight">Playoffs</h2>
        <p className="text-xs text-faint">Cuartos y semis BO3 · final BO5 presencial</p>
      </div>

      {/*
        The bracket is rendered twice and CSS shows one.

        From `md` up, the three rounds sit side by side so the tree shape is
        visible. Below that, one round at a time behind tabs, like the fixture.
        `md` rather than `sm`: at 640px the columns are too narrow for team names.

        Not switched with JavaScript because the tab panels need `inert` on
        phones, which CSS cannot toggle per breakpoint. `hidden` removes the
        unused copy from the accessibility tree, so nothing is read twice.
      */}
      <div className="hidden gap-4 md:grid md:grid-cols-3">
        {ROUNDS.map(({ round }) => (
          <RoundColumn
            key={round}
            title={round}
            series={inRound(round)}
            note={round === QUARTERS ? DRAW_NOTE : null}
            universities={universities}
            champion={round === FINAL_ROUND}
          />
        ))}
      </div>

      {/* Tabs returns the bar and panels as siblings; this gap spaces them. */}
      <div className="flex flex-col gap-4 md:hidden">
        <Tabs
          label="Rondas de playoffs"
          defaultIndex={currentTab(played)}
          tabs={ROUNDS.map(({ round, short }) => {
            const when = inRound(round)[0]?.scheduled_at
            return {
              id: `ronda-${round.split(' ')[0].toLowerCase()}`,
              title: short,
              detail: when ? dayAndMonth(when) : 'a definir',
            }
          })}
        >
          {ROUNDS.map(({ round }) => (
            <Round
              key={round}
              series={inRound(round)}
              note={round === QUARTERS ? DRAW_NOTE : null}
              universities={universities}
              champion={round === FINAL_ROUND}
            />
          ))}
        </Tabs>
      </div>
    </section>
  )
}

/** One round as a bracket column (desktop). */
function RoundColumn({
  title,
  series,
  note,
  universities,
  champion = false,
}: {
  title: string
  series: SeriesResultRow[]
  note: string | null
  universities: Map<string, string[]>
  champion?: boolean
}) {
  const date = series[0]?.scheduled_at

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide">{title}</h3>
        <p className="text-xs text-faint">{date ? dayAndMonth(date) : 'a definir'}</p>
        {note && <p className="mt-1 text-xs text-dim">{note}</p>}
      </div>

      {/* Series spread over the column's height so they line up with the
          previous round. */}
      <div className="flex flex-1 flex-col justify-around gap-3">
        {series.map((item) => (
          <SeriesCard key={item.id} series={item} universities={universities} />
        ))}
        {champion && <Champion final={series[0]} />}
      </div>
    </div>
  )
}

/**
 * One round as a tab panel (phones): a single stacked column. The title and
 * date are in the tab.
 */
function Round({
  series,
  note,
  universities,
  champion = false,
}: {
  series: SeriesResultRow[]
  note: string | null
  universities: Map<string, string[]>
  champion?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      {note && <p className="text-xs text-dim">{note}</p>}
      {series.map((item) => (
        <SeriesCard key={item.id} series={item} universities={universities} />
      ))}
      {champion && <Champion final={series[0]} />}
    </div>
  )
}

/** Who won the tournament, or the place the name will go. */
function Champion({ final }: { final: SeriesResultRow | undefined }) {
  const winnerName = seriesWinner(final)

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        winnerName
          ? 'border-accent bg-gradient-to-br from-accent-dim to-surface'
          : 'border-dashed border-line'
      }`}
    >
      <p className="text-xs uppercase tracking-[0.2em] text-accent">Campeón</p>
      <p className="font-display mt-1 text-xl font-bold">
        {winnerName ?? <span className="text-dim">por definir</span>}
      </p>
    </div>
  )
}

function SeriesCard({
  series,
  universities,
}: {
  series: SeriesResultRow
  universities: Map<string, string[]>
}) {
  const decided = series.winner_team_id !== null

  return (
    <div className="border-2 border-line bg-surface px-3 py-2.5">
      <p className="mb-1.5 text-[10px] uppercase tracking-wide text-dim">
        BO{series.best_of}
        {/*
          An awarded series has no games on purpose, so it says why instead of
          reading as a 0-0 with a winner.
        */}
        {series.walkover_team_id !== null
          ? ' · W.O.'
          : series.games_played > 0 && ` · ${series.games_played} jugados`}
      </p>

      <SeriesTeam
        id={series.team_a_id}
        name={series.team_a_name}
        slot={slotLabel(series.round, series.slot_a_label)}
        universities={universities}
        wins={series.wins_a}
        won={decided && series.winner_team_id === series.team_a_id}
        pending={!decided}
      />
      <SeriesTeam
        id={series.team_b_id}
        name={series.team_b_name}
        slot={slotLabel(series.round, series.slot_b_label)}
        universities={universities}
        wins={series.wins_b}
        won={decided && series.winner_team_id === series.team_b_id}
        pending={!decided}
      />
    </div>
  )
}

/**
 * One side of a series: the team the organizers entered, or the slot's
 * placeholder while it is empty.
 *
 * Nothing is projected into a slot any more. It used to name the team the
 * group table had already settled into "1º A", which only worked while the
 * crossings were fixed; the quarter-finals are drawn (see `DRAW_NOTE`), so
 * there is no slot to settle into until the draw is made.
 *
 * `data-team` hooks names into TeamFocus, so hovering a team elsewhere on the
 * page highlights it here too.
 */
function SeriesTeam({
  id,
  name,
  slot,
  universities,
  wins,
  won,
  pending,
}: {
  id: string | null
  name: string | null
  slot: string | null
  universities: Map<string, string[]>
  wins: number
  won: boolean
  pending: boolean
}) {
  const shown = name
  const teamId = id
  const tags = teamId ? universities.get(teamId) : null

  const tone = won ? 'font-semibold' : pending ? 'text-fg-soft' : 'text-faint'
  // The name column is as wide as the longest name in the bracket, so the
  // crests line up; the slot and score are pushed to the right edge below.
  const label = `min-w-[var(--bracket-name)] truncate text-sm ${tone}`

  return (
    <div className={`border-l-2 py-1 pl-2 ${won ? 'border-accent' : 'border-transparent'}`}>
      <div className="flex items-center gap-2">
        {shown && teamId ? (
          <Link
            href={teamPath(teamId, 'playoffs')}
            data-team={teamId}
            className={`${label} transition-colors hover:text-accent`}
          >
            {shown}
          </Link>
        ) : (
          <span className={label}>
            {shown ?? <span className="text-dim">{slot ?? 'por definir'}</span>}
          </span>
        )}
        {/* The same size as the fixture's crests. Mixed teams show every
            university, as there too. */}
        {shown && <UniversityLogos tags={tags} size="fixture" />}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {shown && slot && <span className="text-[10px] text-dim">{slot}</span>}
          <span className={`tabular w-4 text-right text-sm ${won ? 'font-bold' : 'text-faint'}`}>
            {wins}
          </span>
        </span>
      </div>
    </div>
  )
}
