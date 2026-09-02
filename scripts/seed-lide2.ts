/**
 * Loads LIDE 2's structure into the database: tournament, universities, the 20
 * teams with their group, the complete group-phase fixture and the chained
 * playoff bracket.
 *
 * Everything comes from src/lib/lide2/tournament.ts, which transcribes the
 * organizers' sheets. Nothing is invented any more: the teams are the real ones
 * and the matchups are the published ones.
 *
 *   npm run seed:lide2                  structure and fixture
 *   npm run seed:lide2 -- --qualified   puts the top two of each group into the
 *                                       quarter-finals (run when the group
 *                                       phase finishes)
 *   npm run seed:lide2 -- --clean       leaves the database as it was
 */
import { ROSTERS } from '../src/lib/lide2/rosters'
import {
  CALENDAR,
  GROUPS,
  SCHEDULE,
  TEAMS,
  TOURNAMENT,
  UNIVERSITIES,
  teamByNumber,
} from '../src/lib/lide2/tournament'
import { createAdminClient } from '../src/lib/supabase/admin'

const SLUG = 'lide-2'

function milestone(id: string): string | null {
  return CALENDAR.find((entry) => entry.id === id)?.date ?? null
}

const supabase = createAdminClient()

async function findTournament(): Promise<string | null> {
  const { data } = await supabase.from('tournaments').select('id').eq('slug', SLUG).maybeSingle()
  return (data?.id as string) ?? null
}

/** Creates the tournament, the 13 universities, the stages and the bracket's 7 series. */
async function createStructure(): Promise<string> {
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

  // The unique index is on lower(tag), an expression, and upsert cannot target
  // it: on conflict only matches indexes by column. It is solved by reading
  // first, same as with the teams.
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

  // Stages: one per group (for the calendar and the panel) and one per playoff
  // round (the series hang off these).
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

  // The stages are not recreated when they already exist: deleting them
  // cascades to the series, and that would unlink the playoff matches already
  // uploaded.
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

  const teamId = await createTeams(tournamentId, universityId)
  await createFixtures(tournamentId, teamId)

  return tournamentId
}

/**
 * The bracket is created back to front: the final first, because the semis
 * reference it, and the quarters reference the semis. Every series knows which
 * series and which side it sends its winner to, and that is what lets
 * advance_series() move them on its own when the last .rofl is uploaded.
 *
 * Matchups: two teams from the same group cannot meet before the final.
 */
async function createBracket(stageId: Map<string, string>): Promise<void> {
  const { data: final, error: finalError } = await supabase
    .from('series')
    .insert({
      stage_id: stageId.get('Gran final'),
      round: 'Gran final',
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

  const quarters = [
    { order: 1, a: '1º A', b: '2º B', semi: 1, slot: 'a' },
    { order: 2, a: '1º C', b: '2º D', semi: 1, slot: 'b' },
    { order: 3, a: '1º B', b: '2º A', semi: 2, slot: 'a' },
    { order: 4, a: '1º D', b: '2º C', semi: 2, slot: 'b' },
  ]

  const { error: quarterError } = await supabase.from('series').insert(
    quarters.map((quarter) => ({
      stage_id: stageId.get('Cuartos de final'),
      round: 'Cuartos de final',
      best_of: 3,
      order_index: quarter.order,
      slot_a_label: quarter.a,
      slot_b_label: quarter.b,
      scheduled_at: milestone('cuartos'),
      next_series_id: semiId.get(quarter.semi),
      next_slot: quarter.slot,
    })),
  )

  if (quarterError) throw new Error(`quarter-finals: ${quarterError.message}`)
}

/**
 * Creates or updates the 20 teams and their universities.
 *
 * `seed` stores the official number (1 to 20), which is how the organizers name
 * them in the fixture, and `tag` the signup code where they have one. The four
 * teams built from individual signups represent more than one university:
 * university_id keeps the most represented one, so attribution in the stats is
 * possible, and the full list goes to team_universities.
 *
 * It returns each team's id by number, which is what the fixture needs.
 */
async function createTeams(
  tournamentId: string,
  universityId: Map<string, string>,
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

    // The unique index is (tournament_id, lower(name)), an expression, so
    // upsert cannot target it: it is read first. Along the way, re-running this
    // does not trample a logo somebody uploaded from the panel.
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

    // It is replaced whole: if a team changes composition, the old list has no
    // business surviving.
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
      if (error) throw new Error(`universidades de ${team.name}: ${error.message}`)
    }

    await upsertRoster(id, team.number, universityId)
  }

  return byNumber
}

/**
 * Writes a team's signed-up roster.
 *
 * It goes by upsert against (team_id, order_index) and not by delete-and-insert:
 * if an admin already matched somebody with their Riot account, that player_id
 * is not in the payload and survives. Same with display_name, if they tidied up
 * the name.
 */
async function upsertRoster(
  teamId: string,
  number: number,
  universityId: Map<string, string>,
): Promise<void> {
  const entries = ROSTERS[number] ?? []
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
 * Writes the group phase's 40 matchups.
 *
 * A matchup exists from the moment the organizers publish the calendar, long
 * before there is any .rofl, so it goes in `fixtures` and not in `matches`. When
 * somebody uploads the replay the match is hooked to it and the fixture_results
 * view starts showing the result.
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

  // upsert against the unique on (tournament_id, matchday, slot, team_a_id,
  // team_b_id): re-running the seed neither duplicates matchups nor unhooks the
  // matches already linked, because match_id is not in the update.
  const { error } = await supabase
    .from('fixtures')
    .upsert(rows, { onConflict: 'tournament_id,matchday,slot,team_a_id,team_b_id' })

  if (error) throw new Error(`fixture: ${error.message}`)
}

/**
 * Puts the top two of each group into the quarter-finals, according to today's
 * table.
 *
 * It goes separately and not inside the seed because it depends on results:
 * while the group phase has not finished, the table can change and the quarters
 * would be wrong. It is run once, when the last matchday closes. It is
 * idempotent: running it again simply reads the table afresh.
 */
async function seedQuarters(tournamentId: string): Promise<void> {
  const { data: standings } = await supabase
    .from('group_standings')
    .select('group_label,team_id,position')
    .eq('tournament_id', tournamentId)
    .lte('position', 2)

  const qualified = new Map<string, string>()
  for (const row of standings ?? []) {
    qualified.set(`${row.position}${(row.group_label as string).slice(-1)}`, row.team_id as string)
  }

  const { data: quarters } = await supabase
    .from('series')
    .select('id,order_index,slot_a_label,slot_b_label')
    .eq('round', 'Cuartos de final')

  for (const quarter of quarters ?? []) {
    // "1º A" -> "1A", which is how `qualified`'s keys are built. By position
    // and letter and not by exact text, so it survives somebody rewriting the
    // label.
    const key = (label: string | null) => {
      const match = label?.match(/^(\d)\D*([A-D])$/)
      return match ? `${match[1]}${match[2]}` : ''
    }
    await supabase
      .from('series')
      .update({
        team_a_id: qualified.get(key(quarter.slot_a_label as string)) ?? null,
        team_b_id: qualified.get(key(quarter.slot_b_label as string)) ?? null,
      })
      .eq('id', quarter.id)
  }
}

/**
 * Leaves the database as it was: deletes everything the seed created and
 * returns the LEIF matches to being loose.
 *
 * The order matters. Deleting the tournament before unlinking the teams the
 * seed did not create means the cascade takes them along with their rosters.
 * And the matches are released before anything else, because afterwards
 * relink_all_matches() deduces their teams again from whoever played.
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

  // Whether the seed created a team is not decided by its name: an earlier run
  // may have used others, and in fact that happened back when the teams were
  // invented placeholders. What separates them is the roster: the ones that
  // came out of the replays have team_members and the seed's do not.
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

  // The ones with a roster are unlinked instead of deleted: they are teams
  // detected from real matches and the cascade would take their rosters.
  if (withRoster.length > 0) {
    await supabase
      .from('teams')
      .update({ tournament_id: null, group_label: null, university_id: null })
      .in('id', withRoster)
  }

  // team_universities and fixtures go by cascade with the teams and the
  // tournament, same as stages and series.
  if (withoutRoster.length > 0) {
    await supabase.from('teams').delete().in('id', withoutRoster)
  }

  await supabase.from('tournaments').delete().eq('id', tournamentId)

  // The universities left with no team at all. It is checked this way and not
  // against the UNIVERSITIES list because an old run may have loaded others
  // (the seed's first version invented thirteen that were not these).
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
  const qualified = process.argv.includes('--qualified')

  if (qualified) {
    const existing = await findTournament()
    if (!existing) throw new Error('No tournament loaded. Run first: npm run seed:lide2')

    await seedQuarters(existing)

    const { data: quarters } = await supabase
      .from('series_results')
      .select('slot_a_label,slot_b_label,team_a_name,team_b_name')
      .eq('tournament_id', existing)
      .eq('round', 'Cuartos de final')
      .order('order_index')

    console.log('')
    for (const q of quarters ?? []) {
      const a = (q.team_a_name as string | null) ?? `${q.slot_a_label} (sin definir)`
      const b = (q.team_b_name as string | null) ?? `${q.slot_b_label} (sin definir)`
      console.log(`  ${a} vs ${b}`)
    }
    console.log('')
    return
  }

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
