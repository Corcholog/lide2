/**
 * Hands out the already-uploaded matches among LIDE 2's matchups, at random.
 *
 * It serves to see the site full before 5 September: the stats, the table and
 * above all the cards on /admin/cards cannot be reviewed against an empty
 * database. The replays are LEIF's, another tournament, so the results mean
 * nothing: what is being exercised is the pipeline and the design.
 *
 *   npm run ingest -- fixtures --auto   first, uploads and parses the .rofl
 *   npm run seed:results                shows what it would do
 *   npm run seed:results -- --assign    hands them out
 *   npm run seed:results -- --clear     unassigns everything
 *
 * MIND THIS: the site is public. While they are assigned, anybody who comes in
 * sees those results as if they were LIDE 2's. `--clear` unhooks them (the
 * .rofl files stay uploaded; scripts/purge-leif.ts is there to delete them).
 *
 * The hand-out uses a fixed seed, so two runs give the same result: if
 * something looks odd in a card, you can go back to the same picture.
 */

import { TOURNAMENT } from '../src/lib/lide2/tournament'
import { createAdminClient } from '../src/lib/supabase/admin'

const SEED = 20260905

const supabase = createAdminClient()
const args = process.argv.slice(2)
const assign = args.includes('--assign')
const clear = args.includes('--clear')

/** Seeded PRNG (mulberry32): the same hand-out on every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

async function tournamentId(): Promise<string> {
  const { data } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', TOURNAMENT.slug)
    .maybeSingle()

  if (!data) throw new Error(`No tournament "${TOURNAMENT.slug}". Run: npm run seed:lide2`)
  return data.id as string
}

async function main() {
  const tournament = await tournamentId()

  if (clear) {
    /*
     * Unassigning is not enough to leave the database as it was.
     *
     * `unassign_match` releases the matchup and clears the labels, but it does
     * not touch `matches.tournament_id`, so the matches keep showing as LIDE
     * 2's: they still appear on /partidas, which does not filter by tournament,
     * and `purge-leif` - which looks for precisely the ones that are NOT LIDE
     * 2's - cannot find them to delete. They end up in no man's land.
     *
     * It does not undo the `team_members` the assignment registered either,
     * which are the "detected roster" seen on each team's page.
     */
    const [{ data: byMatchup }, { data: byTournament }] = await Promise.all([
      supabase.from('fixtures').select('match_id').eq('tournament_id', tournament).not('match_id', 'is', null),
      supabase.from('matches').select('id').eq('tournament_id', tournament),
    ])

    const matches = [
      ...new Set([
        ...(byMatchup ?? []).map((row) => row.match_id as string),
        ...(byTournament ?? []).map((row) => row.id as string),
      ]),
    ]

    if (matches.length === 0) {
      console.log('There is no test data in the database.')
      return
    }

    const { data: appearances } = await supabase
      .from('match_players')
      .select('player_id')
      .in('match_id', matches)
      .not('player_id', 'is', null)

    const players = [...new Set((appearances ?? []).map((row) => row.player_id as string))]

    // Rosters first: `unassign_match` deduces the sides again from
    // team_members, so deleting them afterwards leaves the teams stuck to the
    // match.
    if (players.length > 0) {
      const { error } = await supabase.from('team_members').delete().in('player_id', players)
      if (error) throw new Error(`team_members: ${error.message}`)
    }

    for (const matchId of matches) {
      const { error } = await supabase.rpc('unassign_match', { p_match_id: matchId })
      if (error) throw new Error(`unassign_match(${matchId}): ${error.message}`)
    }

    const { error } = await supabase
      .from('matches')
      .update({ tournament_id: null })
      .in('id', matches)
    if (error) throw new Error(`matches: ${error.message}`)

    console.log(`Unhooked ${matches.length} matches and ${players.length} players.`)
    console.log('The table, the fixture and the stats go back to zero.')
    console.log('\nThe matches are still loaded and show on /partidas. To delete them entirely:')
    console.log('  npx tsx --env-file=.env.local scripts/purge-leif.ts --confirm')
    return
  }

  const [{ data: unassigned }, { data: openMatchups }] = await Promise.all([
    supabase.from('unassigned_matches').select('match_id,played_at,riot_match_id'),
    supabase
      .from('fixtures')
      .select('id,matchday,slot,group_label,team_a_id,team_b_id')
      .eq('tournament_id', tournament)
      .is('match_id', null)
      .order('matchday')
      .order('slot')
      .order('group_label'),
  ])

  const matches = unassigned ?? []
  const matchups = openMatchups ?? []

  if (matches.length === 0) {
    console.log('There are no unassigned matches. Upload them first:')
    console.log('  npm run ingest -- fixtures --auto')
    return
  }

  // The matches are shuffled and not the matchups: that way the matchups fill
  // in matchday order, and matchdays 1 and 2 are complete before 3 begins. A
  // half-played tournament looks more like what will actually be seen than one
  // with loose games scattered everywhere.
  const shuffled = shuffle(matches, rng(SEED))
  const pairs = matchups.slice(0, shuffled.length).map((matchup, index) => ({
    matchup,
    match: shuffled[index],
  }))

  console.log(`${matches.length} unassigned matches · ${matchups.length} open matchups`)
  console.log(`${pairs.length} are going to be assigned.`)

  if (!assign) {
    for (const { matchup, match } of pairs.slice(0, 10)) {
      console.log(
        `  matchday ${matchup.matchday} slot ${matchup.slot} ${matchup.group_label} ← ${match.riot_match_id ?? match.match_id}`,
      )
    }
    if (pairs.length > 10) console.log(`  … and ${pairs.length - 10} more`)
    console.log('\nTo do it: npm run seed:results -- --assign')
    return
  }

  let ok = 0
  for (const { matchup, match } of pairs) {
    /*
     * The blue side goes in explicitly, always team A.
     *
     * The function can only deduce it on its own when some player in the match
     * is already on a team, and on the first assignment none is: there is
     * nothing to deduce it from, so it returns an error instead of inventing.
     * With test data it makes no difference which side is which, what matters
     * is that the matchup ends up played.
     */
    const { data, error } = await supabase.rpc('assign_match_to_fixture', {
      p_match_id: match.match_id,
      p_fixture_id: matchup.id,
      p_blue_team_id: matchup.team_a_id,
    })

    // The function returns { ok, error } and does not throw: a rejection from
    // it arrives with `error` null. Without looking at the payload, this would
    // count a run in which absolutely nothing was assigned as a success.
    const result = (data ?? {}) as { ok?: boolean; error?: string }
    const reason = error?.message ?? (result.ok ? null : (result.error ?? 'rejected with no reason'))

    if (reason) console.error(`  ✗ matchday ${matchup.matchday} ${matchup.group_label}: ${reason}`)
    else ok += 1
  }

  console.log(`\nAssigned ${ok} of ${pairs.length}.`)
  if (ok === 0) {
    console.error('None was assigned. The database was left as it was.')
    process.exit(1)
  }
  console.log('Look at /admin/cards?fecha=1 and the home page. To undo: npm run seed:results -- --clear')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
