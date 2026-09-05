import { UniversityLogo } from '@/components/tournament/UniversityLogo'
import { Tabs } from '@/components/nav/Tabs'
import { timeOfDay, weekdayAndDate } from '@/lib/lide2/dates'
import type { FixtureResultRow } from '@/types/db'

/**
 * The published fixture.
 *
 * It is bucketed twice: by slot and, within each slot, by group. Every row used
 * to repeat its group, and since a slot holds two matchups per group and the
 * grid is two columns wide, the label appeared four times in a row. Saying it
 * once as a heading reads better, and it also lets each group show who is
 * resting, which used to be a loose line with all four together.
 *
 * Before it is played you see the matchup; afterwards, the scoreline in kills,
 * which is all there is to a BO1.
 */

interface Slot {
  matchday: number
  slot: number
  kickoff: string
  groups: Map<string, FixtureResultRow[]>
}

export function Fixture({ rounds }: { rounds: FixtureResultRow[] }) {
  if (rounds.length === 0) return null

  // The order the query already returned is kept: slot, group, team.
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

  /*
   * Resolved and not "played": a walkover has an outcome but nobody played it.
   * Counting it as played would be a lie, and leaving it out would make the
   * matchday read as though a matchup were still missing. What the number is
   * for is how much of the fixture is settled, so that is what it says.
   */
  const decided = rounds.filter((row) => row.status === 'jugado' || row.status === 'w.o.').length

  /*
   * And now one more pass: the slots are grouped by matchday, which is the
   * tab's unit. Matchdays 1 and 2 have two slots and matchday 3 has one, so a
   * panel can carry one or two blocks inside.
   */
  const byMatchday = new Map<number, Slot[]>()
  for (const slot of slots.values()) {
    byMatchday.set(slot.matchday, [...(byMatchday.get(slot.matchday) ?? []), slot])
  }
  const matchdays = [...byMatchday.entries()].sort((a, b) => a[0] - b[0])

  return (
    <section id="fixture" className="flex scroll-mt-16 flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 className="border-b-4 border-accent pb-1 text-lg uppercase tracking-tight">Fixture</h2>
        <p className="text-xs text-faint">
          {rounds.length} partidos ·{' '}
          {decided === 0 ? 'ninguno definido' : `${decided} definidos`}
        </p>
      </div>

      {/*
        Phone only. On a screen with a mouse the highlight is discovered on its
        own - the name turns red on hover - but with a finger there is no hover
        and nothing says the row does anything. It is the home page's best
        feature and it was being found by accident.
      */}
      <p className="text-xs text-faint sm:hidden">Tocá un equipo para ver todos sus partidos.</p>

      {/*
        One matchday at a time. With the groups in two columns, three matchdays
        in a row are six rows of groups: the fixture ate the whole home page and
        what came after it - playoffs, the final - was buried.

        The panels are drawn here, on the server, and travel as children: the
        client component only decides which one shows. See Tabs.
      */}
      <Tabs
        label="Fechas del fixture"
        tabs={matchdays.map(([matchday, daySlots]) => {
          const matchups = daySlots.reduce(
            (total, slot) => total + [...slot.groups.values()].flat().length,
            0,
          )
          const finished = daySlots
            .flatMap((slot) => [...slot.groups.values()].flat())
            .filter((row) => row.status === 'jugado' || row.status === 'w.o.').length

          return {
            id: `fecha-${matchday}`,
            title: `Fecha ${matchday}`,
            // How many were played as soon as any were; until then, when it is
            // played, which is all that can be said about a future matchday.
            detail:
              finished > 0
                ? `${finished} de ${matchups} definidos`
                : weekdayAndDate(daySlots[0].kickoff),
          }
        })}
      >
        {matchdays.map(([matchday, daySlots]) => (
          <div key={matchday} className="flex flex-col gap-4">
            {daySlots.map((slot) => (
              <div
                key={`${slot.matchday}-${slot.slot}`}
                className="border-2 border-line bg-surface"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 border-b-2 border-line px-4 py-2.5">
                  {/*
                    The time and not "Turno 1". The tab above already says
                    "Fecha 2", so repeating it would be saying it twice within
                    ten centimetres; and between a matchday's two slots, what
                    somebody needs to know is what time they play, not whether
                    theirs is the first or the second. The slot number means
                    nothing outside the organizers' sheet.
                  */}
                  <h3 className="tabular text-sm uppercase tracking-tight">
                    {timeOfDay(slot.kickoff)}
                  </h3>
                  <span className="text-xs text-muted">{weekdayAndDate(slot.kickoff)}</span>
                </div>

                {/*
                  The lines between cells come from the gap: the grid is painted
                  the border's colour and each cell covers its own with the
                  background. That comes out sturdier than giving borders to
                  some cells and not others depending on the column, which
                  changes with every breakpoint.

                  Two columns and not four. With four, a group's cell comes to
                  274px: taking out the padding, the scoreline and the crests,
                  the team's name had 51px left and "Equipo 15" needs 63, so
                  every one of them read "Equip…". With two columns the cell
                  goes to 551px and the name has room to spare.
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
  // The rival did not turn up inside the 15 minutes the rules allow. There is
  // no scoreline because there was no game: the names still carry who took it,
  // through team_a_win / team_b_win.
  const walkover = match.status === 'w.o.'

  return (
    // data-fixture: the mark the highlight looks for to dim the matchups the
    // pinned team is not in. See TeamFocus.
    <li data-fixture className="flex items-center gap-1.5 text-sm transition-opacity duration-200">
      <FixtureTeam
        id={match.team_a_id}
        name={match.team_a_name}
        universities={match.team_a_universities}
        won={match.team_a_win}
        align="right"
      />

      {/*
        w-10 and not w-12: the widest thing it shows is a kill scoreline with
        two digits a side ("15-23"), which in text-xs is about 30px. The 8px
        left over are worth more split between the two names, which is what
        truncates when the window sits between 640 and 768.
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
   * A button and not a link to the team's page, which is what it used to be. In
   * the fixture the question is "who do they play and when?", and that is
   * answered right here by lighting up their other matchups; leaving for
   * another page is losing your place. The team page is still reachable: from
   * the group table, and from the notice that appears when a team is pinned.
   *
   * aria-pressed starts false and TeamFocus updates it through the DOM, because
   * this tree is drawn by the server and never re-renders.
   *
   * ONE LINE, WITH THE CREST OUTSIDE. It used to be two: the name on top and
   * "UNER / UADE / UNLP" below it with a 16px crest in front. In a four-column
   * grid that only fits by force - the tag truncated and the crest was a smudge
   * - and on top of that the fixture is the longest thing on the home page, so
   * every extra line is paid for forty times.
   *
   * Dropping the line of tags leaves room for the crest at the side, at 24px,
   * and the row is half the height. The identity is not lost: the crest is
   * precisely what answers "whose team is this" without spending width, which
   * was the job the text did back when there were no logos. The full names are
   * still one hover away, in the title, and the standings table - which does
   * have the room - spells them out.
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
        // The crest goes against the outer edge and the name against the
        // scoreline, so the two teams end up mirrored around the result.
        align === 'right' ? 'flex-row' : 'flex-row-reverse'
      }`}
    >
      {/*
        The crests of all of the team's universities, not just the main one.
        They fit because one matchday shows at a time and the groups go in two
        columns: each team gets 233px, and three 40px crests with their gaps
        take 142. That leaves 91 for "Equipo 15", which needs 63.

        At 48px they would "fit" too - 67 would be left - but four pixels of
        margin are not a margin: any slightly longer name, or a font that loads
        differently, clips the text again. 40 leaves 28 of air.

        On a phone they do not fit: with a single column the team has 114px and
        three would eat the name. There only the main one shows - the rest go
        out with `hidden` - and at 28px instead of 40.
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
        `nombre-equipo` paints nothing on its own: it is the hook for the
        `@media (hover: none)` rule in globals.css, which on a phone gives it a
        dotted underline. Without that, the only sign the name could be tapped
        was the `group-hover:text-accent`, which is to say none where there is
        no mouse.
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
