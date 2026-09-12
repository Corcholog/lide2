import Link from 'next/link'
import { Tabs } from '@/components/nav/Tabs'
import { dayAndMonth } from '@/lib/lide2/dates'
import { forSlot, type SlotProjection } from '@/lib/lide2/projection'
import { FINAL_ROUND, seriesWinner } from '@/lib/lide2/winner'
import { teamPath } from '@/lib/routes'
import type { SeriesResultRow } from '@/types/db'

/*
 * The three playoff rounds. `round` is the value the database stores and the
 * one that gets filtered on; `short` is what fits in the tab: at 390px the
 * three share about 104px each and "Cuartos de final" breaks onto three lines.
 * The long name is already in the section's subtitle.
 */
const ROUNDS = [
  { round: 'Cuartos de final', short: 'Cuartos' },
  { round: 'Semifinales', short: 'Semis' },
  { round: FINAL_ROUND, short: 'Final' },
]

/**
 * What an empty slot has to show instead of its placeholder, or null when there
 * is nothing to say.
 *
 * The team the organizers wrote down always wins: once `team_a_id` is filled
 * in, the group phase is over and the projection has nothing to add. And a slot
 * whose group is not being projected - the semis and the final, which hang off
 * other series and not off a table - returns null and keeps its placeholder.
 *
 * A slot whose list names the whole group does have something to say - that
 * nobody is out of it yet - and `Possibles` is where that gets said. It used to
 * be swallowed here, and an empty slot beside one carrying three names does not
 * read as "anybody can still get there": it reads as a number the site failed
 * to work out.
 */
function preview(
  slots: SlotProjection[],
  teamId: string | null,
  label: string | null,
): SlotProjection | null {
  if (teamId) return null

  const slot = forSlot(slots, label)
  if (!slot || (!slot.locked && slot.candidates.length === 0)) return null

  return slot
}

export function Playoffs({
  series,
  slots = [],
}: {
  series: SeriesResultRow[]
  /** Who can still fill each group slot, for the quarters nobody has entered yet. */
  slots?: SlotProjection[]
}) {
  const inRound = (round: string) => series.filter((item) => item.round === round)

  return (
    <section id="playoffs" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 className="border-b-4 border-accent pb-1 text-lg uppercase tracking-tight">Playoffs</h2>
        <p className="text-xs text-faint">Cuartos y semis BO3 · final BO5 presencial</p>
      </div>

      {/*
        THE BRACKET IS DRAWN TWICE, and CSS picks which one shows.

        A bracket communicates through the shape of the tree: the three rounds
        side by side, each with half the matchups of the one before. Where there
        is width that holds and it is shown whole. Where there is not - a phone -
        it used to be solved with `min-w-3xl` and horizontal scroll: 768px
        crammed into 390, with "Semifinales" cut in half and no sign that it
        continued. There one round shows at a time, with the fixture's own tabs.

        The breakpoint is `md` (768px) and not `sm`: the grid asked for 3xl
        precisely because three columns need that width. At 640px each one comes
        to 197px and the names truncate, which is coming back to the problem
        from another side. At 768 they are 229px, which is what the original
        design had.

        It is drawn twice and not switched with JavaScript because `inert` is a
        DOM attribute and cannot be made conditional per breakpoint from CSS:
        the tabs' hidden panels have to be inert on the phone and not exist at
        all on the desktop. With `hidden` the browser takes them out of the
        accessibility tree, so nothing gets read twice, and they are seven
        cards: a few extra kilobytes of HTML.
      */}
      <div className="hidden gap-4 md:grid md:grid-cols-3">
        {ROUNDS.map(({ round }) => (
          <RoundColumn
            key={round}
            title={round}
            series={inRound(round)}
            slots={slots}
            champion={round === FINAL_ROUND}
          />
        ))}
      </div>

      {/* The same `gap-4` as the section: Tabs returns the bar and the panels
          as siblings and the container separates them. */}
      <div className="flex flex-col gap-4 md:hidden">
        <Tabs
          label="Rondas de playoffs"
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
              slots={slots}
              champion={round === FINAL_ROUND}
            />
          ))}
        </Tabs>
      </div>
    </section>
  )
}

/**
 * One round as a column of the bracket. This is the desktop view: the three
 * side by side form the tree, which is what a bracket has to say.
 */
function RoundColumn({
  title,
  series,
  slots,
  champion = false,
}: {
  title: string
  series: SeriesResultRow[]
  slots: SlotProjection[]
  champion?: boolean
}) {
  const date = series[0]?.scheduled_at

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide">{title}</h3>
        <p className="text-xs text-faint">{date ? dayAndMonth(date) : 'a definir'}</p>
      </div>

      {/* Each column spreads its series down the height so they sit centred
          against the previous one: four quarters, two semis, one final. */}
      <div className="flex flex-1 flex-col justify-around gap-3">
        {series.map((item) => (
          <SeriesCard key={item.id} series={item} slots={slots} />
        ))}
        {champion && <Champion final={series[0]} />}
      </div>
    </div>
  )
}

/**
 * The same round as its tab's panel. This is the phone view, where the tree
 * does not fit: a single column, stacked.
 *
 * With no title or date inside, which go in the tab above - same as in the
 * fixture, where the panel does not repeat "Fecha 2" either - and without the
 * column's `justify-around`, which exists to line one round up against the one
 * beside it and here there is none beside it.
 */
function Round({
  series,
  slots,
  champion = false,
}: {
  series: SeriesResultRow[]
  slots: SlotProjection[]
  champion?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      {series.map((item) => (
        <SeriesCard key={item.id} series={item} slots={slots} />
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

function SeriesCard({ series, slots }: { series: SeriesResultRow; slots: SlotProjection[] }) {
  const decided = series.winner_team_id !== null

  return (
    <div className="border-2 border-line bg-surface px-3 py-2.5">
      <p className="mb-1.5 text-[10px] uppercase tracking-wide text-dim">
        BO{series.best_of}
        {series.games_played > 0 && ` · ${series.games_played} jugados`}
      </p>

      <SeriesTeam
        id={series.team_a_id}
        name={series.team_a_name}
        slot={series.slot_a_label}
        projection={preview(slots, series.team_a_id, series.slot_a_label)}
        wins={series.wins_a}
        won={decided && series.winner_team_id === series.team_a_id}
        pending={!decided}
      />
      <SeriesTeam
        id={series.team_b_id}
        name={series.team_b_name}
        slot={series.slot_b_label}
        projection={preview(slots, series.team_b_id, series.slot_b_label)}
        wins={series.wins_b}
        won={decided && series.winner_team_id === series.team_b_id}
        pending={!decided}
      />
    </div>
  )
}

/**
 * One side of a series: the team, or where it is going to come from.
 *
 * Three states now instead of two. With the team entered it is drawn as it
 * always was. With the slot already settled by arithmetic the projected name
 * takes the place of the placeholder and goes in red, which is the site's way
 * of saying "this one is in" - the group table paints the two qualifying rows
 * with the same accent. With the place still open the placeholder stays and the
 * teams that can reach it go underneath.
 *
 * Every name that has a team behind it leads to that team's page, the same as
 * in the group tables and in the fixture, and the projected ones lead there
 * too: from a visitor's side there is no difference between a team the
 * organizers entered and one that arithmetic already put there.
 *
 * `data-team` is what hooks those names into the highlight: hovering over a
 * team in the group table lights up the slot it is heading for, which is the
 * whole question somebody looking at a bracket in the middle of the group phase
 * is asking.
 */
function SeriesTeam({
  id,
  name,
  slot,
  projection,
  wins,
  won,
  pending,
}: {
  id: string | null
  name: string | null
  slot: string | null
  projection: SlotProjection | null
  wins: number
  won: boolean
  pending: boolean
}) {
  const locked = projection?.locked ?? null
  const shown = name ?? locked?.teamName ?? null
  const teamId = id ?? locked?.teamId ?? null

  // Projected: the name is not in the database yet, arithmetic put it there.
  const projected = !name && locked !== null
  const tone = won
    ? 'font-semibold'
    : projected
      ? 'font-semibold text-accent'
      : pending
        ? 'text-fg-soft'
        : 'text-faint'
  const label = `min-w-0 flex-1 truncate text-sm ${tone}`

  return (
    <div className={`border-l-2 py-1 pl-2 ${won ? 'border-accent' : 'border-transparent'}`}>
      <div className="flex items-center gap-2">
        {shown && teamId ? (
          <Link
            href={teamPath(teamId, 'playoffs')}
            data-team={teamId}
            // The projected name is already accent, so its hover has to move
            // somewhere: without this it is a link that does not answer.
            className={`${label} transition-colors ${
              projected ? 'hover:text-accent-soft' : 'hover:text-accent'
            }`}
            title={projected && slot ? `${shown} ya está clasificado como ${slot}` : undefined}
          >
            {shown}
          </Link>
        ) : (
          <span className={label}>
            {shown ?? <span className="text-dim">{slot ?? 'por definir'}</span>}
          </span>
        )}
        {shown && slot && <span className="shrink-0 text-[10px] text-dim">{slot}</span>}
        <span className={`tabular w-4 text-right text-sm ${won ? 'font-bold' : 'text-faint'}`}>
          {wins}
        </span>
      </div>

      {!locked && projection && projection.candidates.length > 0 && (
        <Possibles projection={projection} />
      )}
    </div>
  )
}

/**
 * The teams that can still take the slot.
 *
 * Chips and not a comma-separated line: in a 229px column three names run
 * together into one string of words, and each one has to be picked out as a
 * unit for the highlight to be any use. They wrap, so four candidates take two
 * rows and the card grows instead of truncating - a list of possibles cut off
 * halfway is worse than no list.
 *
 * The tick is for the team that is already through and is only waiting to find
 * out whether it goes in as first or second. It is a glyph and not a colour
 * because that distinction is the point of the row, and the group table's own
 * comment explains why colour alone does not carry it.
 *
 * WHEN THE LIST IS THE WHOLE GROUP it is written out in words instead of drawn.
 * Five chips that leave nobody out are five names' worth of room to say
 * "anybody", and before the first matchday every one of the eight cards would
 * be carrying them - forty names that rule nothing out. Saying it in one line
 * is the same fact in a tenth of the space.
 *
 * What it must not do is stay quiet, which is what it did at first: a slot with
 * nothing under it next to one listing three teams does not read as "this one
 * is wide open", it reads as a gap in the page.
 */
function Possibles({ projection }: { projection: SlotProjection }) {
  const { candidates, teams, group } = projection

  if (candidates.length >= teams) {
    return (
      <p className="mt-1 text-[10px] leading-tight text-dim">
        <span className="uppercase tracking-wide">Posibles</span> · todavía cualquiera del grupo{' '}
        {group}
      </p>
    )
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] leading-tight">
      <span className="uppercase tracking-wide text-dim">Posibles</span>
      {candidates.map((candidate) => (
        <Link
          key={candidate.teamId}
          href={teamPath(candidate.teamId, 'playoffs')}
          data-team={candidate.teamId}
          className="border border-line bg-raised px-1 py-0.5 text-faint transition-colors hover:border-accent hover:text-accent"
        >
          {candidate.qualified && (
            <>
              <span aria-hidden className="text-accent">
                ✓{' '}
              </span>
              <span className="sr-only">ya clasificado: </span>
            </>
          )}
          {candidate.teamName}
        </Link>
      ))}
    </div>
  )
}
