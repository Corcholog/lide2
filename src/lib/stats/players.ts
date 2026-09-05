/**
 * Individual rankings.
 *
 * One function per stat, all with the same signature, all pure: they take what
 * `loadStats` already fetched and return the finished block. Adding one means
 * writing a function and listing it in the registry.
 */

import { formatKda, formatNumber, formatPosition, ROLES } from '@/lib/format'
import { playerPath } from '@/lib/routes'
import { block, minGamesForAverages, rankRows } from './rank'
import type { StatBlock, StatsData } from './types'
import type { PlayerPhaseTotalsRow } from '@/types/db'

/** Team and university, which is what places a player in the tournament. */
function who(row: PlayerPhaseTotalsRow): string | null {
  return [row.team_name, row.university_tag].filter(Boolean).join(' · ') || null
}

function key(row: PlayerPhaseTotalsRow): string {
  return row.player_id ?? `${row.team_id ?? 'no-team'}-${row.player_name ?? '?'}`
}

/**
 * "Mínimo 2 partidas", or nothing at all.
 *
 * A minimum of one is not a minimum - it is every player who took the field -
 * and writing it out reads as a filter that is leaving somebody out. The cards
 * that name it get the line back the day the threshold goes up again.
 */
function minimumNote(min: number): string | null {
  return min > 1 ? `Mínimo ${min} partidas` : null
}

function record(row: PlayerPhaseTotalsRow): string {
  return `${formatKda(row.kills, row.deaths, row.assists)} · ${row.games} ${row.games === 1 ? 'partida' : 'partidas'}`
}

/** The shared base of nearly all of them: who, from where, and their KDA line. */
function playerRanking(
  data: StatsData,
  options: {
    value: (row: PlayerPhaseTotalsRow) => number
    display: (value: number, row: PlayerPhaseTotalsRow) => string
    order?: 'desc' | 'asc'
    eligible?: (row: PlayerPhaseTotalsRow) => boolean
    detail?: (row: PlayerPhaseTotalsRow) => string | null
  },
) {
  return rankRows(data.players, {
    id: key,
    name: (row) => row.player_name ?? 'Desconocido',
    subtitle: who,
    // Only the ones with a page: an account with no `player_id` is one the
    // ingest could not resolve, and there is nowhere to send the reader.
    href: (row) => (row.player_id ? playerPath(row.player_id) : null),
    detail: options.detail ?? record,
    value: options.value,
    display: options.display,
    order: options.order,
    eligible: options.eligible,
    // With few games played, ties are everyday: without a tiebreak, two
    // players on the same number would keep the order Postgres returned them
    // in, which can change between queries.
    tiebreak: (a, b) => b.avg_score - a.avg_score || (a.player_name ?? '').localeCompare(b.player_name ?? ''),
  })
}

/** The MVP is computed by the database (`tournament_mvp` view); this only presents it. */
export function mvp(data: StatsData): StatBlock | null {
  const rows = rankRows(
    [...data.mvp].sort((a, b) => a.mvp_rank - b.mvp_rank),
    {
      id: (row) => row.player_id ?? `${row.player_name}`,
      name: (row) => row.player_name ?? 'Desconocido',
      href: (row) => (row.player_id ? playerPath(row.player_id) : null),
      subtitle: (row) => [row.team_name, row.university_tag].filter(Boolean).join(' · ') || null,
      detail: (row) =>
        `${formatKda(row.kills, row.deaths, row.assists)} · ${Math.round(row.kill_participation * 100)}% de participación`,
      value: (row) => row.avg_score,
      display: (value) => value.toFixed(2),
      // The view already returns it sorted; mvp_rank is what makes it stable.
      tiebreak: (a, b) => a.mvp_rank - b.mvp_rank,
    },
  )

  return block('mvp', 'MVP', rows, {
    subtitle: 'Promedio del score: KDA con techo, participación en kills y un extra por ganar',
  })
}

/**
 * The starting five: the best of each role.
 *
 * The role comes from `position`, which is the one played most within the
 * scope. A player who rotated lanes shows up in the one they repeated most.
 */
export function bestFive(data: StatsData): StatBlock | null {
  const rows = ROLES.flatMap((role) => {
    const best = data.players
      .filter((row) => row.position === role)
      .sort((a, b) => b.avg_score - a.avg_score || b.kda - a.kda)[0]

    if (!best) return []

    return [
      {
        id: `${role}-${key(best)}`,
        name: best.player_name ?? 'Desconocido',
        subtitle: who(best),
        logo: null,
        href: best.player_id ? playerPath(best.player_id) : null,
        detail: record(best),
        value: best.avg_score,
        display: formatPosition(role),
      },
    ]
  })

  return block('quinteto', 'El quinteto', rows, { subtitle: 'El mejor score promedio de cada rol' })
}

/*
  WHAT ACCUMULATES GOES PER GAME, here for the same reason as in `teams.ts`.

  Kills, assists, damage and wards destroyed were totals, and a total only
  ranks anything when everybody has played the same amount. Nobody has: the
  fixture gives some teams two games in a matchday and others one, substitutes
  come in, and somebody who played four games headed "Carnicero" over somebody
  who played two and killed more in each. That is a ranking of the calendar.

  Nothing is lost by dividing. The line under every name is already the total
  K/D/A and how many games it took - "26/8/14 · 4 partidas" - so the raw
  numbers are still right there; what changes is what decides the order.

  What is NOT divided: `best_killing_spree` is a maximum, and the average of a
  record is not a record; the multikills are a count of rare events, and "0.25
  pentas a game" is not a number anybody has ever scored. Both are read as
  achievements, and an achievement is not diluted by playing more.
*/

export function topKills(data: StatsData): StatBlock | null {
  const rows = playerRanking(data, {
    value: (row) => row.avg_kills,
    display: (value) => `${value.toFixed(1)} por partida`,
  })
  return block('kills', 'Carnicero', rows, { subtitle: 'Kills por partida' })
}

export function topAssists(data: StatsData): StatBlock | null {
  const rows = playerRanking(data, {
    value: (row) => row.avg_assists,
    display: (value) => `${value.toFixed(1)} por partida`,
  })
  return block('assists', 'Manos de seda', rows, { subtitle: 'Asistencias por partida' })
}

export function bestKda(data: StatsData): StatBlock | null {
  const min = minGamesForAverages()
  const rows = playerRanking(data, {
    value: (row) => row.kda,
    display: (value) => value.toFixed(2),
    eligible: (row) => row.games >= min,
  })
  return block('kda', 'Mejor KDA', rows, {
    subtitle: ['Sobre el total del recorte', minimumNote(min)].filter(Boolean).join(' · '),
  })
}

/**
 * The other KDA: each game's, averaged, and every player in the tournament in
 * the same ranking.
 *
 * It sits next to `bestKda` and does not replace it because they answer
 * different questions. "Mejor KDA" divides every kill and assist by every
 * death, so four steady games beat three quiet ones and one disaster. This one
 * averages the per-game figures, and since a game without deaths divides by
 * one, the 10/0/10 counts whole instead of dissolving into the totals: it is
 * the ranking of whoever had the best nights, not of whoever held up best.
 *
 * That is why both subtitles spell out which of the two they are: two
 * different numbers under the same word are the way to make neither readable.
 *
 * The minimum is the shared one and not a number of its own: it is an average
 * like the rest, and two rankings of averages asking for different amounts of
 * games are two rankings nobody can compare.
 */
export function bestAverageKda(data: StatsData): StatBlock | null {
  const min = minGamesForAverages()
  const rows = playerRanking(data, {
    value: (row) => row.avg_kda,
    display: (value) => value.toFixed(2),
    // The `typeof` is not paranoia: the migrations of this project are applied
    // by hand from Supabase's SQL editor (`npm run db:sql`), so the deploy can
    // perfectly well reach production before 0025 does. Without this the
    // column arrives undefined, `toFixed` throws and it takes down all of
    // /estadisticas - every other ranking included - over one card. With it
    // the card is simply not there, which is what already happens to any stat
    // with nothing to show, and it appears on its own once the view is
    // replaced.
    eligible: (row) => row.games >= min && typeof row.avg_kda === 'number',
  })
  return block('kda-promedio', 'Mayor KDA promedio', rows, {
    subtitle: ['El KDA de cada partida, promediado', minimumNote(min)].filter(Boolean).join(' · '),
  })
}

export function fewestDeaths(data: StatsData): StatBlock | null {
  const min = minGamesForAverages()
  const rows = playerRanking(data, {
    value: (row) => row.avg_deaths,
    display: (value) => `${value.toFixed(2)} por partida`,
    order: 'asc',
    eligible: (row) => row.games >= min,
  })
  return block('muertes', 'Escurridizo', rows, { subtitle: 'Menos muertes por partida' })
}

export function longestKillingSpree(data: StatsData): StatBlock | null {
  const rows = playerRanking(data, {
    value: (row) => row.best_killing_spree,
    display: (value) => `${value} kills`,
    eligible: (row) => row.best_killing_spree > 0,
  })
  // This replaces first bloods: the .rofl does not record who drew first
  // blood, but it does record each player's longest streak without dying.
  //
  // The bare number ("16 in a row") does not say of what: in a row could be
  // games won, kills or anything else. It ships with its unit attached and the
  // subtitle finishes explaining it.
  return block('racha', 'Imparable', rows, {
    subtitle: 'La racha de kills más larga sin morir',
  })
}

/**
 * Damage per game, which is not the same as the damage per minute below.
 *
 * This one asks how much a player does in a game and the other how fast they
 * do it: somebody who wins in twenty minutes can lead the per-minute ranking
 * and be well below in this one, and both facts are true. `avg_damage` comes
 * from the view already averaged.
 */
export function topDamage(data: StatsData): StatBlock | null {
  const rows = playerRanking(data, {
    value: (row) => row.avg_damage,
    display: (value) => `${formatNumber(value)} por partida`,
  })
  return block('dano', 'Más daño a campeones', rows, { subtitle: 'Daño a campeones por partida' })
}

export function topDpm(data: StatsData): StatBlock | null {
  const min = minGamesForAverages()
  const rows = playerRanking(data, {
    value: (row) => row.dpm,
    display: (value) => `${formatNumber(value)} por minuto`,
    eligible: (row) => row.games >= min,
  })
  return block('dpm', 'Daño por minuto', rows)
}

export function topCsPerMin(data: StatsData): StatBlock | null {
  const min = minGamesForAverages()
  const rows = playerRanking(data, {
    value: (row) => row.csm,
    display: (value) => `${value.toFixed(1)} por minuto`,
    eligible: (row) => row.games >= min,
  })
  return block('csm', 'Más farmeo', rows, { subtitle: 'CS por minuto' })
}

export function topGpm(data: StatsData): StatBlock | null {
  const min = minGamesForAverages()
  const rows = playerRanking(data, {
    value: (row) => row.gpm,
    display: (value) => `${formatNumber(value)} por minuto`,
    eligible: (row) => row.games >= min,
  })
  return block('gpm', 'Oro por minuto', rows)
}

export function topVision(data: StatsData): StatBlock | null {
  const min = minGamesForAverages()
  const rows = playerRanking(data, {
    value: (row) => row.avg_vision,
    display: (value) => `${value.toFixed(1)} por partida`,
    eligible: (row) => row.games >= min,
  })
  return block('vision', 'Ojo de águila', rows, { subtitle: 'Mejor puntaje de visión' })
}

export function topWardsKilled(data: StatsData): StatBlock | null {
  // The only one of the four with no averaged column in the view: it is
  // divided here.
  const rows = playerRanking(data, {
    value: (row) => (row.games > 0 ? row.wards_killed / row.games : 0),
    display: (value) => `${value.toFixed(1)} por partida`,
    eligible: (row) => row.wards_killed > 0,
  })
  return block('deswardeo', 'A oscuras', rows, {
    subtitle: 'Guardianes destruidos por partida',
  })
}

export function multikills(data: StatsData): StatBlock | null {
  const score = (row: PlayerPhaseTotalsRow) =>
    row.penta_kills * 1000 + row.quadra_kills * 100 + row.triple_kills

  const rows = playerRanking(data, {
    value: score,
    display: (_value, row) =>
      [
        row.penta_kills ? `${row.penta_kills} penta` : null,
        row.quadra_kills ? `${row.quadra_kills} quadra` : null,
        row.triple_kills ? `${row.triple_kills} triple` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    eligible: (row) => score(row) > 0,
  })

  return block('multikills', 'Multikills', rows, { subtitle: 'Triples, quadras y pentas' })
}
