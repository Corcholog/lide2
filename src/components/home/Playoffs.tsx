import { Tabs } from '@/components/nav/Tabs'
import { dayAndMonth } from '@/lib/lide2/dates'
import { FINAL_ROUND, seriesWinner } from '@/lib/lide2/winner'
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

export function Playoffs({ series }: { series: SeriesResultRow[] }) {
  const inRound = (round: string) => series.filter((item) => item.round === round)

  return (
    <section id="playoffs" className="flex scroll-mt-16 flex-col gap-4">
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
            <Round key={round} series={inRound(round)} champion={round === FINAL_ROUND} />
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
  champion = false,
}: {
  title: string
  series: SeriesResultRow[]
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
          <SeriesCard key={item.id} series={item} />
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
function Round({ series, champion = false }: { series: SeriesResultRow[]; champion?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {series.map((item) => (
        <SeriesCard key={item.id} series={item} />
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

function SeriesCard({ series }: { series: SeriesResultRow }) {
  const decided = series.winner_team_id !== null

  return (
    <div className="border-2 border-line bg-surface px-3 py-2.5">
      <p className="mb-1.5 text-[10px] uppercase tracking-wide text-dim">
        BO{series.best_of}
        {series.games_played > 0 && ` · ${series.games_played} jugados`}
      </p>

      <SeriesTeam
        name={series.team_a_name}
        slot={series.slot_a_label}
        wins={series.wins_a}
        won={decided && series.winner_team_id === series.team_a_id}
        pending={!decided}
      />
      <SeriesTeam
        name={series.team_b_name}
        slot={series.slot_b_label}
        wins={series.wins_b}
        won={decided && series.winner_team_id === series.team_b_id}
        pending={!decided}
      />
    </div>
  )
}

function SeriesTeam({
  name,
  slot,
  wins,
  won,
  pending,
}: {
  name: string | null
  slot: string | null
  wins: number
  won: boolean
  pending: boolean
}) {
  return (
    <div
      className={`flex items-center gap-2 border-l-2 py-1 pl-2 ${
        won ? 'border-accent' : 'border-transparent'
      }`}
    >
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          won ? 'font-semibold' : pending ? 'text-fg-soft' : 'text-faint'
        }`}
      >
        {name ?? <span className="text-dim">{slot ?? 'por definir'}</span>}
      </span>
      {name && slot && <span className="shrink-0 text-[10px] text-dim">{slot}</span>}
      <span className={`tabular w-4 text-right text-sm ${won ? 'font-bold' : 'text-faint'}`}>
        {wins}
      </span>
    </div>
  )
}
