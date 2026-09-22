/**
 * Loads LIDE 2's structure into the database: tournament, universities, the 20
 * teams and their groups, the group-phase fixture and the playoff bracket. The
 * data comes from src/lib/lide2/tournament.ts, and the signups from
 * private/rosters.json when that file exists (see src/lib/lide2/rosters.ts).
 *
 *   npm run seed:lide2                  structure, fixture and signups
 *
 * The quarter-final pairings are not here: they come from a draw (rule 2.3)
 * and are entered in the panel, at /admin/cruces.
 *
 *   npm run seed:lide2 -- --clean       removes what the seed created
 */
import { existsSync, readFileSync } from 'node:fs'
import { rosterProblems, type RosterEntry, type Rosters } from '../src/lib/lide2/rosters'
import {
  CALENDAR,
  GROUPS,
  SCHEDULE,
  TEAMS,
  TOURNAMENT,
  UNIVERSITIES,
  teamByNumber,
} from '../src/lib/lide2/tournament'
import { FINAL_ROUND } from '../src/lib/lide2/winner'
import { createAdminClient } from '../src/lib/supabase/admin'

const SLUG = TOURNAMENT.slug

/** Not committed: the sheets hold legal names. */
const ROSTERS_FILE = 'private/rosters.json'

function milestone(id: string): string | null {
  return CALENDAR.find((entry) => entry.id === id)?.date ?? null
}

const supabase = createAdminClient()

async function findTournament(): Promise<string | null> {
  const { data } = await supabase.from('tournaments').select('id').eq('slug', SLUG).maybeSingle()
  return (data?.id as string) ?? null
}

/**
 * The signup sheets, checked against the declared teams before anything is
 * written. Without the file the rest is still seeded, and signups can be added
 * by hand from /admin/planteles.
 */
function loadRosters(): Rosters | null {
  if (!existsSync(ROSTERS_FILE)) {
    console.log(`  ${ROSTERS_FILE} not found: signups were not loaded.`)
    return null
  }

  const rosters = JSON.parse(readFileSync(ROSTERS_FILE, 'utf8')) as Rosters
  const problems = rosterProblems(rosters)
  if (problems.length > 0) {
    throw new Error(`${ROSTERS_FILE}:\n    ${problems.join('\n    ')}`)
  }
  return rosters
}

/** Creates the tournament, the 13 universities, the stages and the bracket's 7 series. */
async function createStructure(): Promise<string> {
  const rosters = loadRosters()

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .upsert(
      {
        name: TOURNAMENT.name,
        slug: SLUG,
        format: 'grupos + playoffs',
        starts_at: milestone('fecha-1')?.slice(0, 10),
        ends_at: milestone('final')?.slice(0, 10),
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single()

  if (error) throw new Error(`tournament: ${error.message}`)
  const tournamentId = tournament.id as string

  // The unique index is on lower(tag), an expression, which upsert cannot
  // target; read first instead, as with teams.
  const { data: existing } = await supabase.from('universities').select('id,tag')
  const universityId = new Map(
    (existing ?? []).map((row) => [String(row.tag).toLowerCase(), row.id as string]),
  )

  const missing = Object.values(UNIVERSITIES).filter(
    (university) => !universityId.has(university.tag.toLowerCase()),
  )

  if (missing.length > 0) {
    const { data: created, error: uniError } = await supabase
      .from('universities')
      .insert(missing.map((university) => ({ name: university.name, tag: university.tag })))
      .select('id,tag')

    if (uniError) throw new Error(`universities: ${uniError.message}`)
    for (const row of created ?? []) {
      universityId.set(String(row.tag).toLowerCase(), row.id as string)
    }
  }

  // Stages: one per group and one per playoff round (series belong to these).
  const stages = [
    ...GROUPS.map((name, index) => ({
      tournament_id: tournamentId,
      name: `Grupo ${name}`,
      kind: 'group',
      order_index: index + 1,
    })),
    { tournament_id: tournamentId, name: 'Cuartos de final', kind: 'bracket', order_index: 5 },
    { tournament_id: tournamentId, name: 'Semifinales', kind: 'bracket', order_index: 6 },
    { tournament_id: tournamentId, name: 'Gran final', kind: 'bracket', order_index: 7 },
  ]

  // Existing stages are kept: deleting them would cascade to the series and
  // unlink playoff matches already uploaded.
  const { data: alreadyThere } = await supabase
    .from('stages')
    .select('id,name')
    .eq('tournament_id', tournamentId)

  if (!alreadyThere || alreadyThere.length === 0) {
    const { data: created, error: stageError } = await supabase
      .from('stages')
      .insert(stages)
      .select('id,name')

    if (stageError) throw new Error(`stages: ${stageError.message}`)
    await createBracket(new Map((created ?? []).map((row) => [row.name as string, row.id as string])))
  } else {
    console.log('  The stages and the bracket already existed: they were left alone.')
  }

  const teamId = await createTeams(tournamentId, universityId, rosters)
  await createFixtures(tournamentId, teamId)

  return tournamentId
}

/**
 * Creates the bracket from the final backwards, since each series references
 * the one (and side) its winner advances to. That is what lets
 * advance_series() move winners along when the last .rofl is uploaded. Teams
 * from the same group cannot meet before the final.
 */
async function createBracket(stageId: Map<string, string>): Promise<void> {
  const { data: final, error: finalError } = await supabase
    .from('series')
    .insert({
      stage_id: stageId.get('Gran final'),
      round: FINAL_ROUND,
      best_of: 5,
      order_index: 1,
      slot_a_label: 'Ganador semifinal 1',
      slot_b_label: 'Ganador semifinal 2',
      scheduled_at: milestone('final'),
    })
    .select('id')
    .single()

  if (finalError) throw new Error(`final: ${finalError.message}`)

  const { data: semis, error: semiError } = await supabase
    .from('series')
    .insert(
      [1, 2].map((index) => ({
        stage_id: stageId.get('Semifinales'),
        round: 'Semifinales',
        best_of: 3,
        order_index: index,
        slot_a_label: `Ganador cuartos ${index * 2 - 1}`,
        slot_b_label: `Ganador cuartos ${index * 2}`,
        scheduled_at: milestone('semis'),
        next_series_id: final.id,
        next_slot: index === 1 ? 'a' : 'b',
      })),
    )
    .select('id,order_index')

  if (semiError) throw new Error(`semis: ${semiError.message}`)
  const semiId = new Map((semis ?? []).map((row) => [row.order_index as number, row.id as string]))

  /*
    The four quarter-finals exist from the start so the bracket has a shape,
    but they name no group place: rule 2.3 crosses winners with runners-up
    through a draw. /admin/cruces writes the teams once it is made.
  */
  const quarters = [
    { order: 1, semi: 1, slot: 'a' },
    { order: 2, semi: 1, slot: 'b' },
    { order: 3, semi: 2, slot: 'a' },
    { order: 4, semi: 2, slot: 'b' },
  ]

  const { error: quarterError } = await supabase.from('series').insert(
    quarters.map((quarter) => ({
      stage_id: stageId.get('Cuartos de final'),
      round: 'Cuartos de final',
      best_of: 3,
      order_index: quarter.order,
      slot_a_label: 'A sortear',
      slot_b_label: 'A sortear',
      scheduled_at: milestone('cuartos'),
      next_series_id: semiId.get(quarter.semi),
      next_slot: quarter.slot,
    })),
  )

  if (quarterError) throw new Error(`quarter-finals: ${quarterError.message}`)
}

/**
 * Creates or updates the 20 teams, their universities and their signups, and
 * returns each team's id by number (for the fixture).
 *
 * `seed` stores the official number and `tag` the signup code, if any. Mixed
 * teams keep their main university in `university_id` and the full list in
 * `team_universities`.
 */
async function createTeams(
  tournamentId: string,
  universityId: Map<string, string>,
  rosters: Rosters | null,
): Promise<Map<number, string>> {
  const byNumber = new Map<number, string>()

  for (const team of TEAMS) {
    const row = {
      tournament_id: tournamentId,
      name: team.name,
      tag: team.code,
      seed: team.number,
      group_label: `Grupo ${team.group}`,
      university_id: universityId.get(UNIVERSITIES[team.universities[0]].tag.toLowerCase()) ?? null,
    }

    // The unique index is (tournament_id, lower(name)), an expression upsert
    // cannot target, so read first. This also preserves logos set from the panel.
    const { data: existing } = await supabase
      .from('teams')
      .select('id')
      .eq('tournament_id', tournamentId)
      .ilike('name', team.name)
      .maybeSingle()

    let id: string
    if (existing) {
      id = existing.id as string
      const { error } = await supabase.from('teams').update(row).eq('id', id)
      if (error) throw new Error(`${team.name}: ${error.message}`)
    } else {
      const { data: created, error } = await supabase.from('teams').insert(row).select('id').single()
      if (error) throw new Error(`${team.name}: ${error.message}`)
      id = created.id as string
    }

    byNumber.set(team.number, id)

    // Replaced whole, so a changed composition leaves no stale rows.
    await supabase.from('team_universities').delete().eq('team_id', id)

    const links = team.universities
      .map((tag, index) => ({
        team_id: id,
        university_id: universityId.get(UNIVERSITIES[tag].tag.toLowerCase()),
        order_index: index,
      }))
      .filter((link) => link.university_id)

    if (links.length > 0) {
      const { error } = await supabase.from('team_universities').insert(links)
      if (error) throw new Error(`universities of ${team.name}: ${error.message}`)
    }

    if (rosters) await upsertRoster(id, team.number, rosters[team.number], universityId)
  }

  return byNumber
}

/**
 * Writes a team's signups with an upsert on (team_id, order_index), so
 * `player_id` and `display_name` set by an admin are preserved.
 */
async function upsertRoster(
  teamId: string,
  number: number,
  entries: RosterEntry[],
  universityId: Map<string, string>,
): Promise<void> {
  if (entries.length === 0) return

  const rows = entries.map((entry, index) => ({
    team_id: teamId,
    full_name: entry.name,
    university_id: universityId.get(UNIVERSITIES[entry.university].tag.toLowerCase()) ?? null,
    order_index: index,
  }))

  const { error } = await supabase
    .from('team_roster')
    .upsert(rows, { onConflict: 'team_id,order_index' })

  if (error) throw new Error(`roster of team ${number}: ${error.message}`)
}

/**
 * Writes the group phase's 40 matchups into `fixtures` (they exist before any
 * replay). Uploaded matches are linked to them later, and `fixture_results`
 * shows the result.
 */
async function createFixtures(
  tournamentId: string,
  teamId: Map<number, string>,
): Promise<void> {
  const { data: stages } = await supabase
    .from('stages')
    .select('id,name')
    .eq('tournament_id', tournamentId)

  const stageId = new Map((stages ?? []).map((row) => [row.name as string, row.id as string]))

  const rows = SCHEDULE.flatMap((round) =>
    round.matches.map(([a, b]) => {
      const group = `Grupo ${teamByNumber(a).group}`
      return {
        tournament_id: tournamentId,
        stage_id: stageId.get(group) ?? null,
        group_label: group,
        matchday: round.matchday,
        slot: round.slot,
        kickoff: new Date(round.kickoff).toISOString(),
        team_a_id: teamId.get(a),
        team_b_id: teamId.get(b),
      }
    }),
  )

  const incomplete = rows.filter((row) => !row.team_a_id || !row.team_b_id)
  if (incomplete.length > 0) {
    throw new Error(`fixture: there are ${incomplete.length} matchups with no team`)
  }

  // Upsert on (tournament_id, matchday, slot, team_a_id, team_b_id): re-running
  // neither duplicates matchups nor unlinks matches, since match_id is not
  // updated.
  const { error } = await supabase
    .from('fixtures')
    .upsert(rows, { onConflict: 'tournament_id,matchday,slot,team_a_id,team_b_id' })

  if (error) throw new Error(`fixture: ${error.message}`)
}

/**
 * Removes what the seed created and releases the tournament's matches.
 *
 * Order matters: matches are released first so relink_all_matches() can deduce
 * their teams again, and teams the seed did not create are unlinked before the
 * tournament is deleted, so the cascade does not take their rosters.
 */
async function clean(tournamentId: string): Promise<void> {
  const { error: matchError } = await supabase
    .from('matches')
    .update({ tournament_id: null, stage_label: null, blue_team_id: null, red_team_id: null })
    .eq('tournament_id', tournamentId)

  if (matchError) throw new Error(`matches: ${matchError.message}`)

  const { error: relinkError } = await supabase.rpc('relink_all_matches')
  if (relinkError) {
    console.log(`  Warning: could not relink the teams (${relinkError.message}).`)
    console.log('  The matches are left loose; it is fixed from /equipos/detectar.')
  }

  // Seed teams are told apart by roster, not name: teams detected from replays
  // have team_members, the seed's do not.
  const { data: ofTournament } = await supabase
    .from('teams')
    .select('id,name,team_members(count)')
    .eq('tournament_id', tournamentId)

  const withRoster: string[] = []
  const withoutRoster: string[] = []

  for (const team of ofTournament ?? []) {
    const members = (team.team_members as { count: number }[] | null)?.[0]?.count ?? 0
    if (members > 0) withRoster.push(team.id as string)
    else withoutRoster.push(team.id as string)
  }

  // Teams with a roster were detected from real matches: unlink instead of
  // deleting them.
  if (withRoster.length > 0) {
    await supabase
      .from('teams')
      .update({ tournament_id: null, group_label: null, university_id: null })
      .in('id', withRoster)
  }

  // team_universities and fixtures cascade with teams and the tournament, like
  // stages and series.
  if (withoutRoster.length > 0) {
    await supabase.from('teams').delete().in('id', withoutRoster)
  }

  await supabase.from('tournaments').delete().eq('id', tournamentId)

  // Universities left without teams, checked this way because earlier runs may
  // have loaded others.
  const { data: universities } = await supabase.from('universities').select('id,tag')
  const { data: inUse } = await supabase.from('teams').select('university_id')

  const used = new Set((inUse ?? []).map((team) => team.university_id).filter(Boolean))
  const orphans = (universities ?? [])
    .filter((university) => !used.has(university.id))
    .map((university) => university.id as string)

  if (orphans.length > 0) {
    await supabase.from('universities').delete().in('id', orphans)
  }
}

async function main() {
  const clean_ = process.argv.includes('--clean')
  if (clean_) {
    const existing = await findTournament()
    if (!existing) {
      console.log('\n  There is nothing to clean.\n')
      return
    }
    await clean(existing)
    console.log('\n  Done: tournament, teams, fixture, rosters and universities deleted.\n')
    return
  }

  const tournamentId = await createStructure()

  const count = (table: string) =>
    supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)

  const [teams, matches, series, fixtures, played] = await Promise.all([
    count('teams'),
    count('matches'),
    count('series_results'),
    count('fixtures'),
    supabase
      .from('fixture_results')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('status', 'jugado'),
  ])

  console.log(`\n  Tournament ${TOURNAMENT.name} ready (${tournamentId})`)
  console.log(`  ${teams.count ?? 0} teams across ${GROUPS.length} groups`)
  console.log(
    `  ${fixtures.count ?? 0} group-phase matchups (${played.count ?? 0} with a result)`,
  )
  const { count: signups } = await supabase
    .from('team_roster')
    .select('id', { count: 'exact', head: true })

  console.log(`  ${signups ?? 0} signups across the rosters`)
  console.log(`  ${series.count ?? 0} chained playoff series`)
  console.log(`  ${matches.count ?? 0} matches attached`)
  console.log('')
}

main().catch((error) => {
  console.error(`\n  ${error instanceof Error ? error.message : error}\n`)
  process.exit(1)
})
