/**
 * Per-university rankings.
 *
 * The unit of all of this is the APPEARANCE (one player in one match), not the
 * match, because four teams mix up to three universities: Team 15 belongs to
 * UNER, UADE and UNLP at once, and one of its matches adds to all three
 * depending on which players it fielded. Counting matches would force a
 * decision about who a match played by three universities together belongs to,
 * and there is no right answer.
 *
 * The visible consequence: when a single-university team wins, that university
 * adds 5 wins, not 1. Every university is measured the same way, so the ranking
 * does not skew, but the copy spells it out so nobody reads "5" as five
 * matches.
 */

import { formatNumber, formatPercent } from '@/lib/format'
import { block, minGamesForAverages, rankRows } from './rank'
import type { StatBlock, StatsData } from './types'
import type { UniversityTotalsRow } from '@/types/db'

function universityRanking(
  data: StatsData,
  options: {
    value: (row: UniversityTotalsRow) => number
    display: (value: number, row: UniversityTotalsRow) => string
    eligible?: (row: UniversityTotalsRow) => boolean
    detail?: (row: UniversityTotalsRow) => string | null
  },
) {
  return rankRows(data.universities, {
    id: (row) => row.university_id,
    name: (row) => row.university_tag ?? '—',
    subtitle: (row) => row.university_name,
    logo: (row) => row.university_logo,
    detail:
      options.detail ??
      ((row) =>
        `${counted(row.teams, 'equipo', 'equipos')} · ${counted(row.players, 'jugador', 'jugadores')}`),
    value: options.value,
    display: options.display,
    eligible: options.eligible,
    tiebreak: (a, b) => b.kda - a.kda || (a.university_tag ?? '').localeCompare(b.university_tag ?? ''),
  })
}

/**
 * The university table: the win percentage of their players.
 *
 * With a minimum number of appearances so a university that fielded one player
 * in one match cannot head the table on 100%.
 */
/**
 * HOW THIS SECTION COUNTS, on every card of it.
 *
 * A team is not a university here. Most represent one, but the ones put
 * together out of loose signups represent up to three, and the numbers of this
 * section are each PLAYER'S, filed under the university they signed up with:
 * a mixed five winning a game hands that game to the two or three universities
 * standing in it, one appearance each. That is the only measure that compares a
 * university with nine teams against one with a single team - see
 * `perAppearance` - and it is also the one that surprises whoever reads "51-47"
 * expecting their team's record.
 *
 * It goes on the four cards and not only on the table, and as a `note` and not
 * as a line of the section, because a card is read alone: these get exported
 * one at a time to Instagram, where the section heading it was sitting under
 * does not travel and the note does - see `StatPoster`.
 */
const PER_PLAYER =
  'Cuenta por jugador: en un plantel mixto, la misma partida suma para más de una universidad.'

export function universityStandings(data: StatsData): StatBlock | null {
  const min = minGamesForAverages() * 5
  const rows = universityRanking(data, {
    value: (row) => row.win_pct,
    display: (value) => formatPercent(value),
    eligible: (row) => row.appearances >= min,
    /*
      The record, and how many players it took.

      Not the appearances: 47 plus 0 ARE the 47, and a line that says the same
      thing twice is the reason this one was the record alone. The players are
      another fact, and the one that keeps "47-0" from being read as matches -
      which is exactly how it reads, and UNLP played nine. Twenty-six players
      say at once that these are their games and not the university's.
    */
    detail: (row) => `${row.wins}-${row.losses} · ${counted(row.players, 'jugador', 'jugadores')}`,
  })

  return block('universidades', 'Tabla de universidades', rows, {
    subtitle: 'Porcentaje de victorias de sus jugadores',
    note: PER_PLAYER,
  })
}

/**
 * "1 equipo", "3 equipos", "1 jugador", "15 jugadores".
 *
 * The singular was being handled for the teams and not for the players: a
 * university that entered one player read "1 equipo · 1 jugadores".
 *
 * Both words are spelled out rather than derived. Spanish does not make its
 * plural the same way twice - "equipo" takes an -s and "jugador" an -es - and
 * a rule that guesses turns the bug around: it fixed the players and started
 * printing "6 equipoes".
 */
function counted(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/**
 * Per appearance, which is the unit this whole section is measured in.
 *
 * The total was not a ranking of anything: UNLP fielded nine teams and UNER
 * one, so whoever entered the most teams always won and the order came out
 * being the signup sheet. Dividing by TEAMS fixed that half and left the other
 * standing - a university whose teams played four games still doubled one
 * whose teams played two, so the order still moved with the calendar.
 *
 * The appearance - one player in one match - is the unit of every other number
 * in this section, and it is the one that closes both holes at once: it is how
 * many kills a player of this university gets in a game, which is a figure that
 * can be compared between a university with nine teams and one with a single
 * team playing its first match.
 *
 * The line below names the population being averaged, because "3.1 kills" only
 * means something once you know it is three teams and fifteen players and not
 * one lucky game.
 */
function perAppearance(total: number, row: UniversityTotalsRow): number {
  return row.appearances > 0 ? total / row.appearances : 0
}

export function universityKills(data: StatsData): StatBlock | null {
  const rows = universityRanking(data, {
    value: (row) => perAppearance(row.kills, row),
    display: (value) => `${value.toFixed(1)} por partida`,
  })

  return block('universidades-kills', 'Más kills por universidad', rows, {
    subtitle: 'Kills de cada jugador por partida',
    note: PER_PLAYER,
  })
}

export function universityDamage(data: StatsData): StatBlock | null {
  const rows = universityRanking(data, {
    value: (row) => perAppearance(row.damage, row),
    display: (value) => `${formatNumber(Math.round(value))} por partida`,
  })

  return block('universidades-dano', 'Más daño por universidad', rows, {
    subtitle: 'Daño de cada jugador por partida',
    note: PER_PLAYER,
  })
}

/**
 * University of the matchday: the one that performed best, measured by the
 * average score of its players rather than by wins.
 *
 * It goes by average and not by total on purpose: otherwise whoever entered the
 * most teams would always win. UNLP entered six and UNCuyo one.
 */
export function universityOfTheDay(data: StatsData): StatBlock | null {
  const min = minGamesForAverages() * 5
  const rows = universityRanking(data, {
    value: (row) => row.avg_score,
    display: (value) => value.toFixed(2),
    eligible: (row) => row.appearances >= min,
    // No detail line: the win percentage is already the card next to this one
    // and the KDA does not explain the score. The line they free up goes to the
    // university name when it does not fit on one.
    detail: () => null,
  })

  return block('universidad-fecha', 'Universidad destacada', rows, {
    subtitle: 'Mejor score (KDA) promedio de sus jugadores',
    note: PER_PLAYER,
  })
}
