/**
 * El vocabulario del motor de estadísticas.
 *
 * La idea de fondo: la base ya devuelve todo agregado (una fila por jugador y
 * fecha, por equipo, por universidad, por campeón), así que acá no se calcula
 * nada pesado. Lo que hace este módulo es *elegir y presentar*: ordenar por el
 * criterio de cada ranking, cortar el top y dejar cada fila con un nombre, un
 * número y una unidad, lista para una tabla o para una card de Instagram.
 *
 * Por eso todas las estadísticas terminan en la misma forma (`StatBlock`): la
 * página y las cards iteran sobre el registro en vez de repetir markup por cada
 * una, y agregar una estadística nueva es agregar una función, no una pantalla.
 */

import type {
  ChampionStatRow,
  MatchRecordRow,
  PlayerPhaseTotalsRow,
  StatPhase,
  TeamPhaseTotalsRow,
  TournamentMvpRow,
  UniversityTotalsRow,
} from '@/types/db'

/**
 * Qué pedazo del torneo se está mirando.
 *
 * `matchday` en null es "toda la fase". No es lo mismo que la fecha 1: en la
 * base son filas distintas (`is_total`), justamente para que no se confundan.
 */
export interface StatScope {
  tournamentId: string
  phase: StatPhase
  /** Fecha del torneo (1 a 3), o null para el acumulado. */
  matchday: number | null
}

/** Todo lo que la base devuelve para un recorte, en cinco consultas. */
export interface StatsData {
  scope: StatScope
  players: PlayerPhaseTotalsRow[]
  teams: TeamPhaseTotalsRow[]
  universities: UniversityTotalsRow[]
  champions: ChampionStatRow[]
  records: MatchRecordRow[]
  mvp: TournamentMvpRow[]
}

/** Una posición de un ranking. */
export interface StatRow {
  /** Para el key de React. Único dentro del bloque. */
  id: string
  name: string
  /** Equipo, universidad, rol: lo que ubique a la fila. */
  subtitle?: string | null
  logo?: string | null
  /** El número crudo, para ordenar o exportar. */
  value: number
  /** El mismo número ya formateado, con su unidad. */
  display: string
  /** Contexto corto: "17/4/9", "4 partidas". */
  detail?: string | null
}

/** Una estadística resuelta: título, filas y, si hace falta, una advertencia. */
export interface StatBlock {
  id: string
  title: string
  subtitle?: string | null
  /**
   * Aclaración sobre cómo se midió. Se usa sobre todo para los bans, que se
   * cargan a mano y pueden cubrir sólo una parte de las partidas: sin decirlo,
   * un "60% de presencia" se lee como si fuera del torneo entero.
   */
  note?: string | null
  rows: StatRow[]
}

export type StatSection = 'individuales' | 'equipos' | 'universidades' | 'meta' | 'records'

/** Una estadística en el registro: cómo se llama y cómo se calcula. */
export interface StatDefinition {
  id: string
  title: string
  subtitle?: string
  section: StatSection
  /** Devuelve null si no hay datos suficientes para mostrarla. */
  build: (data: StatsData) => StatBlock | null
}

/** Cuántas filas muestra cada ranking. */
export const TOP_ROWS = 5
