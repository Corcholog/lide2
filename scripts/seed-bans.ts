/**
 * Invents each match's draft, so the ban columns can be looked at.
 *
 * The .rofl stores the final scoreboard and not the draft, so `match_bans` only
 * gets filled by hand from /admin/bans. Entering 29 drafts by hand to see
 * whether a table draws properly makes no sense: this invents them.
 *
 *   npm run seed:bans                            shows what it would do
 *   npm run seed:bans -- --write                 stores them
 *   npm run seed:bans -- --write --coverage 0.5  only in half of them
 *   npm run seed:bans -- --clear                 deletes them
 *
 * THIS IS FAKE DATA, just like the results `seed:results` hands out: the
 * replays are LEIF's and nobody made these bans. They serve to check that pick
 * rate, ban rate and presence give numbers coherent with one another, not to
 * draw any conclusion.
 *
 * THE BIAS IS DELIBERATE. If the ten champions came out of an even draw,
 * presence would come to nearly the same for everybody and the table would show
 * nothing: in a real tournament what gets banned is what gets played. So the
 * draw weights each champion by the times they were picked, and that way the
 * ones heading pick rate are roughly the ones heading ban rate, which is the
 * shape the table has when the data is real.
 *
 * The seed is fixed: two runs give the same draft, so if something looks odd in
 * the table you can go back to the same picture.
 */

import { createAdminClient } from '../src/lib/supabase/admin'
import { TOURNAMENT } from '../src/lib/lide2/tournament'

const SEED = 20260905
const BANS_PER_SIDE = 5

const supabase = createAdminClient()
const args = process.argv.slice(2)
const write = args.includes('--write')
const clear = args.includes('--clear')

function flag(name: string): string | null {
  const i = args.indexOf(`--${name}`)
  return i !== -1 && args[i + 1] ? args[i + 1] : null
}

/** What share of the matches carries a draft. 1 = all of them. */
const coverage = Math.min(Math.max(Number(flag('coverage') ?? '1'), 0), 1)

/** Seeded PRNG (mulberry32), the same one seed-results uses. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Draws a champion from the pool, with better odds for the most played.
 *
 * The weight is `picks + 1`: the +1 is so a champion played only once can still
 * come out. Without it the draft would always be the same handful.
 */
function weightedPick(
  pool: { champion: string; picks: number }[],
  random: () => number,
): string | null {
  const total = pool.reduce((sum, c) => sum + c.picks + 1, 0)
  if (total === 0) return null

  let roll = random() * total
  for (const candidate of pool) {
    roll -= candidate.picks + 1
    if (roll <= 0) return candidate.champion
  }
  return pool[pool.length - 1]?.champion ?? null
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

  const { data: matchesData, error: matchesError } = await supabase
    .from('matches')
    .select('id')
    .eq('tournament_id', tournament)
    .order('played_at')

  if (matchesError) throw new Error(`matches: ${matchesError.message}`)
  const matches = (matchesData ?? []).map((row) => row.id as string)

  if (matches.length === 0) {
    console.log('No matches for the tournament. Load them first:')
    console.log('  npm run ingest:no-upload -- fixtures')
    console.log('  npm run seed:results -- --assign')
    return
  }

  if (clear) {
    const { error } = await supabase.from('match_bans').delete().in('match_id', matches)
    if (error) throw new Error(`match_bans: ${error.message}`)

    console.log(`Deleted the drafts of ${matches.length} matches.`)
    console.log('The ban columns on /estadisticas/tablas disappear again.')
    return
  }

  // The pool comes from what was played in the tournament: champions that exist
  // in this patch and already have an icon, weighted by their real picks.
  const { data: picksData, error: picksError } = await supabase
    .from('match_players')
    .select('match_id,champion')
    .in('match_id', matches)

  if (picksError) throw new Error(`match_players: ${picksError.message}`)
  const picks = (picksData ?? []) as { match_id: string; champion: string }[]

  const timesPlayed = new Map<string, number>()
  const playedInMatch = new Map<string, Set<string>>()
  for (const pick of picks) {
    timesPlayed.set(pick.champion, (timesPlayed.get(pick.champion) ?? 0) + 1)
    const inMatch = playedInMatch.get(pick.match_id) ?? new Set<string>()
    inMatch.add(pick.champion)
    playedInMatch.set(pick.match_id, inMatch)
  }

  const pool = [...timesPlayed.entries()]
    .map(([champion, picks]) => ({ champion, picks }))
    .sort((a, b) => b.picks - a.picks || a.champion.localeCompare(b.champion))

  const needed = BANS_PER_SIDE * 2
  if (pool.length < needed + 10) {
    console.log(`Only ${pool.length} distinct champions were played: far too few to draw ${needed} bans per match.`)
    return
  }

  const random = rng(SEED)
  const withDraft = matches.filter(() => random() < coverage)

  console.log(`\n  ${matches.length} matches · ${pool.length} champions in the pool`)
  console.log(`  ${withDraft.length} will carry a draft (coverage ${Math.round(coverage * 100)}%)\n`)

  let ok = 0
  for (const matchId of withDraft) {
    /*
     * A champion played in this match could not have been banned in this match.
     * It is the one draft rule that cannot be broken without the numbers
     * ceasing to add up: presence would count the same champion twice.
     */
    const forbidden = playedInMatch.get(matchId) ?? new Set<string>()
    const chosen: string[] = []
    const available = pool.filter((c) => !forbidden.has(c.champion))

    while (chosen.length < needed) {
      const remaining = available.filter((c) => !chosen.includes(c.champion))
      const pick = weightedPick(remaining, random)
      if (!pick) break
      chosen.push(pick)
    }

    const bans = chosen.map((champion, index) => ({
      side: index < BANS_PER_SIDE ? 100 : 200,
      order_index: (index % BANS_PER_SIDE) + 1,
      champion,
    }))

    if (!write) {
      console.log(`    ${matchId.slice(0, 8)}  ${chosen.join(', ')}`)
      continue
    }

    // Through the same function the panel uses: it validates the sides, the
    // order and the repeats, and adopts the champion spelling the database
    // already holds.
    const { data, error } = await supabase.rpc('set_match_bans', {
      p_match_id: matchId,
      p_bans: bans,
      p_created_by: null,
    })

    const result = (data ?? {}) as { ok?: boolean; error?: string; bans?: number }
    const reason = error?.message ?? (result.ok ? null : (result.error ?? 'rejected with no reason'))

    if (reason) console.error(`  ✗ ${matchId.slice(0, 8)}: ${reason}`)
    else ok += 1
  }

  if (!write) {
    console.log('\n  To do it: npm run seed:bans -- --write\n')
    return
  }

  console.log(`\n  Drafts written into ${ok} of ${withDraft.length} matches.`)
  console.log('  Look at /estadisticas/tablas: Bans, BR and Presencia now draw.')
  console.log('  To undo: npm run seed:bans -- --clear\n')
}

main()
