/**
 * Trae de la base todo lo que necesita un recorte del torneo.
 *
 * Cinco consultas y no una por estadística. Las vistas ya devuelven los totales
 * agregados —113 jugadores, 20 equipos, 13 universidades— así que traerlos
 * enteros y ordenar en memoria cuesta menos que veinte viajes a Postgres, y
 * deja cada estadística como una función pura sobre datos ya cargados: se
 * pueden testear sin base.
 */

import type { createClient } from '@/lib/supabase/server'
import { assetVersion, championNames } from '@/lib/ddragon'
import { TOURNAMENT } from '@/lib/lide2/tournament'
import type {
  ChampionStatRow,
  MatchRecordRow,
  PlayerPhaseTotalsRow,
  TeamPhaseTotalsRow,
  TournamentMvpRow,
  UniversityTotalsRow,
} from '@/types/db'
import { maybeRow, rows } from '@/lib/supabase/query'
import { matchFilter, scopeFilter } from './filtros'
import type { StatScope, StatsData } from './types'

type Supabase = Awaited<ReturnType<typeof createClient>>

export async function resolveTournamentId(supabase: Supabase): Promise<string | null> {
  const torneo = maybeRow<{ id: string }>(
    await supabase.from('tournaments').select('id').eq('slug', TOURNAMENT.slug).maybeSingle(),
    'el torneo',
  )

  return torneo?.id ?? null
}

export async function loadStats(supabase: Supabase, scope: StatScope): Promise<StatsData> {
  const filter = scopeFilter(scope)

  // La versión de assets se resuelve antes que el resto: la necesitan tanto los
  // nombres de los campeones como las URLs de sus íconos.
  const version = await assetVersion(null)

  const [players, teams, universities, champions, records, mvp, names] = await Promise.all([
    supabase.from('player_phase_totals').select('*').match(filter),
    supabase.from('team_phase_totals').select('*').match(filter),
    supabase.from('university_totals').select('*').match(filter),
    supabase.from('champion_stats').select('*').match(filter),
    supabase.from('match_records').select('*').match(matchFilter(scope)),
    supabase.from('tournament_mvp').select('*').match(filter),
    // Un recorte cruza parches, y los nombres son los mismos en todos: el
    // último alcanza. Es el único pedido que no va a la base, y el único que
    // puede fallar sin arrastrar al resto.
    championNames(version),
  ])

  /*
   * Si una de las seis falla, falla todo.
   *
   * Un recorte al que le falta una consulta no está incompleto, está mal: la
   * página mostraría el meta sin el MVP, o los récords sin las universidades,
   * sin decir en ningún lado que falta algo.
   */
  return {
    scope,
    players: rows<PlayerPhaseTotalsRow>(players, 'los totales por jugador'),
    teams: rows<TeamPhaseTotalsRow>(teams, 'los totales por equipo'),
    universities: rows<UniversityTotalsRow>(universities, 'los totales por universidad'),
    champions: rows<ChampionStatRow>(champions, 'las estadísticas de campeones'),
    records: rows<MatchRecordRow>(records, 'los récords de partida'),
    mvp: rows<TournamentMvpRow>(mvp, 'el MVP del torneo'),
    championNames: names,
    assetVersion: version,
  }
}
