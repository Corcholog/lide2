import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { maybeRow, rows } from '@/lib/supabase/query'
import { daysUntil } from '@/lib/lide2/dates'
import { CALENDAR, TOURNAMENT } from '@/lib/lide2/tournament'
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
 * The tournament's front page.
 *
 * All that lives here is the fetching and the order the sections go in; each
 * one draws itself in `@/components/home/`. It used to be one 1300-line file,
 * and finding the fixture in the middle of the bracket, the calendar and the
 * hero meant scrolling past three unrelated things.
 *
 * Everything hangs off `TeamFocus`, which is what highlights a team across all
 * of its appearances: it needs the fixture and the group tables inside the same
 * subtree to reach them with its CSS rules.
 */

const SECTIONS = [
  { id: 'calendario', label: 'Calendario' },
  { id: 'grupos', label: 'Fase de grupos' },
  { id: 'fixture', label: 'Fixture' },
  { id: 'playoffs', label: 'Playoffs' },
  { id: 'final', label: 'La final' },
]

/**
 * The teams that appear in the fixture, with how many matchups each one has.
 *
 * It is what the highlight needs: the list of ids to emit its CSS rules, and
 * the name and the count for the notice that appears when one is pinned.
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
  const tournament = maybeRow<{ id: string; name: string }>(
    await supabase.from('tournaments').select('id,name').eq('slug', TOURNAMENT.slug).maybeSingle(),
    'the tournament',
  )

  const tournamentId = tournament?.id ?? null
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
          // Within a group there are two matchups per slot and neither comes
          // before the other: they are tiebroken by name so the list does not
          // dance.
          .order('team_a_name'),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]

  // The 13 universities, for the strip below the hero. It goes on its own and
  // not inside the Promise.all above because it does not depend on the
  // tournament being loaded: with no tournament, the strip still makes sense.
  const universities = rows<{ tag: string; name: string }>(
    await supabase.from('universities').select('tag,name').order('tag'),
    'the universities',
  )

  const standings = rows<GroupStandingRow>(standingsRes, 'the standings table')
  const series = rows<SeriesResultRow>(seriesRes, 'the bracket')
  const fixture = rows<FixtureResultRow>(fixtureRes, 'the fixture')
  const next = CALENDAR.find((milestone) => daysUntil(milestone.date) >= 0)

  return (
    <TeamFocus teams={focusTeams(fixture)} className="flex flex-col gap-10">
      {/* The section bar goes inside: it closes the hero, it does not follow it. */}
      <Hero next={next} sections={SECTIONS} />

      <UniversityStrip universities={universities} />

      {/*
        The red "the seed still has to be run" banner is for whoever administers
        the site. A visitor can do nothing with it: all it tells them is that
        the page is broken. Without a session nothing is shown and the rest of
        the home page - the calendar, the venue, the countdown - still makes
        sense.
      */}
      {!tournamentId && user && (
        <p className="rounded border border-danger/40 bg-danger-dim px-4 py-3 text-sm text-danger">
          El torneo todavía no está cargado en la base. Corré <code>npm run seed:lide2</code>.
        </p>
      )}

      <Calendar next={next} />

      <GroupPhase standings={standings} />

      <Fixture rounds={fixture} />

      <Playoffs series={series} />

      <GrandFinal />

      <WhereToWatch />
    </TeamFocus>
  )
}
