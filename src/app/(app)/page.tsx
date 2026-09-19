import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { resolveTournamentId } from '@/lib/stats/query'
import { nextMilestone } from '@/lib/lide2/dates'
import { groupsFinished } from '@/lib/lide2/fixture'
import { projectBracketSlots } from '@/lib/lide2/projection'
import { championOf } from '@/lib/lide2/winner'
import { TeamFocus, type FocusTeam } from '@/components/tournament/TeamFocus'
import { Hero, UniversityStrip } from '@/components/home/Hero'
import { Calendar } from '@/components/home/Calendar'
import { GroupPhase } from '@/components/home/GroupPhase'
import { Fixture } from '@/components/home/Fixture'
import { Playoffs } from '@/components/home/Playoffs'
import { GrandFinal } from '@/components/home/GrandFinal'
import { WhereToWatch } from '@/components/home/WhereToWatch'
import type { FixtureResultRow, GroupStandingRow, SeriesResultRow } from '@/types/db'

export const dynamic = 'force-dynamic'

/**
 * The tournament home page. Only data loading and section order live here;
 * each section renders itself from `@/components/home/`. Everything is wrapped
 * in `TeamFocus`, which needs the fixture and group tables in its subtree to
 * highlight a team with CSS.
 */

/**
 * The section bar, in the page's own order: what is being played first, what
 * has been played after it. Must be moved together with the sections below,
 * which are what it scrolls to.
 */
const SECTIONS = [
  { id: 'playoffs', label: 'Playoffs' },
  { id: 'final', label: 'La final' },
  { id: 'grupos', label: 'Fase de grupos' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'fixture', label: 'Fixture' },
]

/**
 * The teams in the fixture with their matchup count: ids for TeamFocus's CSS
 * rules, plus name and count for its notice.
 */
function focusTeams(fixture: FixtureResultRow[]): FocusTeam[] {
  const teams = new Map<string, FocusTeam>()

  for (const row of fixture) {
    for (const [id, name] of [
      [row.team_a_id, row.team_a_name],
      [row.team_b_id, row.team_b_name],
    ] as const) {
      const team = teams.get(id) ?? { id, name, matches: 0 }
      team.matches += 1
      teams.set(id, team)
    }
  }

  return [...teams.values()]
}

export default async function Lide2Page() {
  const supabase = await createClient()
  const tournamentId = await resolveTournamentId(supabase)
  const user = await getUser()

  const [standingsRes, seriesRes, fixtureRes] = tournamentId
    ? await Promise.all([
        supabase
          .from('group_standings')
          .select('*')
          .eq('tournament_id', tournamentId)
          .order('position'),
        supabase
          .from('series_results')
          .select('*')
          .eq('tournament_id', tournamentId)
          .order('stage_order')
          .order('order_index'),
        supabase
          .from('fixture_results')
          .select('*')
          .eq('tournament_id', tournamentId)
          .order('matchday')
          .order('slot')
          .order('group_label')
          // Tiebreak by name so matchups in the same slot keep a stable order.
          .order('team_a_name'),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]

  // The universities for the strip under the hero. Loaded separately because
  // the strip works even when no tournament exists.
  const universities = rows<{ tag: string; name: string }>(
    await supabase.from('universities').select('tag,name').order('tag'),
    'the universities',
  )

  const standings = rows<GroupStandingRow>(standingsRes, 'the standings table')
  const series = rows<SeriesResultRow>(seriesRes, 'the bracket')
  const fixture = rows<FixtureResultRow>(fixtureRes, 'the fixture')
  /*
    Read once and passed down: the hero's countdown, the calendar and the group
    tables all change wording when the group phase is over, and they must not
    disagree about when that happened.
  */
  const groupsDone = groupsFinished(fixture)
  const next = nextMilestone(groupsDone)
  // Shown in the hero once the final is played.
  const champion = championOf(series)
  // Who can still take each group slot of the bracket, from the rows above.
  const slots = projectBracketSlots(standings, fixture)
  // The bracket shows each team's crests, which `series_results` does not
  // carry; every playoff team played the group phase, so the table has them.
  const teamUniversities = new Map(standings.map((row) => [row.team_id, row.university_tags]))

  return (
    <TeamFocus teams={focusTeams(fixture)} className="flex flex-col gap-10">
      {/* The section bar is part of the hero. */}
      <Hero next={next} champion={champion} sections={SECTIONS} />

      <UniversityStrip universities={universities} />

      {/*
        The "run the seed" banner is for admins only; visitors see the rest of
        the page, which still works without a tournament.
      */}
      {!tournamentId && user && (
        <p className="rounded border border-danger/40 bg-danger-dim px-4 py-3 text-sm text-danger">
          El torneo todavía no está cargado en la base. Corré <code>npm run seed:lide2</code>.
        </p>
      )}

      {/*
        The bracket and the final lead: they are what is being played, and the
        final is the only date the public travels to. Then the group table,
        which says who reached that bracket. The calendar and the fixture are
        reference by now, and the hero already counts down to the next date.
      */}
      <Playoffs series={series} slots={slots} universities={teamUniversities} />

      <GrandFinal />

      <GroupPhase standings={standings} finished={groupsDone} />

      <Calendar next={next} groupsDone={groupsDone} />

      <Fixture rounds={fixture} />

      <WhereToWatch />
    </TeamFocus>
  )
}
