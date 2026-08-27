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
import { TOURNAMENT } from '@/lib/lide2/tournament'
import type {
  ChampionStatRow,
  MatchRecordRow,
  PlayerPhaseTotalsRow,
  TeamPhaseTotalsRow,
  TournamentMvpRow,
  UniversityTotalsRow,
} from '@/types/db'
import type { StatScope, StatsData } from './types'

type Supabase = Awaited<ReturnType<typeof createClient>>

export async function resolveTournamentId(supabase: Supabase): Promise<string | null> {
  const { data } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', TOURNAMENT.slug)
    .maybeSingle()

  return (data?.id as string) ?? null
}

/**
 * El recorte, como filtro de igualdad.
 *
 * `is_total` es el filtro importante y no se puede reemplazar por
 * `matchday is null`: en las vistas de acumulados conviven la fila de toda la
 * fase (matchday null a propósito) y la de una partida a la que no se le pudo
 * resolver la fecha (matchday null por accidente).
 */
function scopeFilter(scope: StatScope): Record<string, unknown> {
  const base = { tournament_id: scope.tournamentId, phase: scope.phase }

  return scope.matchday === null
    ? { ...base, is_total: true }
    : { ...base, is_total: false, matchday: scope.matchday }
}

/** Igual, para `match_records`, que es una fila por partida y no tiene acumulado. */
function matchFilter(scope: StatScope): Record<string, unknown> {
  const base = { tournament_id: scope.tournamentId, phase: scope.phase }
  return scope.matchday === null ? base : { ...base, matchday: scope.matchday }
}

export async function loadStats(supabase: Supabase, scope: StatScope): Promise<StatsData> {
  const filter = scopeFilter(scope)

  const [players, teams, universities, champions, records, mvp] = await Promise.all([
    supabase.from('player_phase_totals').select('*').match(filter),
    supabase.from('team_phase_totals').select('*').match(filter),
    supabase.from('university_totals').select('*').match(filter),
    supabase.from('champion_stats').select('*').match(filter),
    supabase.from('match_records').select('*').match(matchFilter(scope)),
    supabase.from('tournament_mvp').select('*').match(filter),
  ])

  return {
    scope,
    players: (players.data ?? []) as PlayerPhaseTotalsRow[],
    teams: (teams.data ?? []) as TeamPhaseTotalsRow[],
    universities: (universities.data ?? []) as UniversityTotalsRow[],
    champions: (champions.data ?? []) as ChampionStatRow[],
    records: (records.data ?? []) as MatchRecordRow[],
    mvp: (mvp.data ?? []) as TournamentMvpRow[],
  }
}
