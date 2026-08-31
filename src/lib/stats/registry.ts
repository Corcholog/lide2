/**
 * El catálogo de estadísticas.
 *
 * La página, y más adelante las cards de Instagram, iteran sobre esto en vez de
 * repetir markup por cada ranking: sumar una estadística es escribir su función
 * y agregar una línea acá.
 *
 * El orden importa, es el orden en que se muestran.
 */

import * as champions from './champions'
import * as players from './players'
import * as records from './records'
import * as teams from './teams'
import * as universities from './universities'
import type { StatBlock, StatDefinition, StatSection, StatsData } from './types'

export const SECTIONS: { id: StatSection; label: string; description: string }[] = [
  {
    id: 'jugadores',
    label: 'Jugadores',
    description: 'Quién rindió, rol por rol',
  },
  { id: 'equipos', label: 'Equipos', description: 'Cómo viene cada uno' },
  {
    id: 'universidades',
    label: 'Universidades',
    description: 'Medido por jugador, no por equipo',
  },
  { id: 'meta', label: 'Meta', description: 'Qué se jugó y qué funcionó' },
  { id: 'records', label: 'Partidas', description: 'Las que se van a recordar' },
]

export const STATS: StatDefinition[] = [
  { id: 'mvp', title: 'MVP', section: 'jugadores', build: players.mvp },
  { id: 'quinteto', title: 'El quinteto', section: 'jugadores', build: players.bestFive },
  { id: 'kills', title: 'Carnicero', section: 'jugadores', build: players.topKills },
  { id: 'assists', title: 'Manos de seda', section: 'jugadores', build: players.topAssists },
  { id: 'kda', title: 'Mejor KDA', section: 'jugadores', build: players.bestKda },
  { id: 'muertes', title: 'Escurridizo', section: 'jugadores', build: players.fewestDeaths },
  { id: 'racha', title: 'Imparable', section: 'jugadores', build: players.longestKillingSpree },
  { id: 'dano', title: 'Más daño', section: 'jugadores', build: players.topDamage },
  { id: 'dpm', title: 'Daño por minuto', section: 'jugadores', build: players.topDpm },
  { id: 'csm', title: 'Más farmeo', section: 'jugadores', build: players.topCsPerMin },
  { id: 'gpm', title: 'Oro por minuto', section: 'jugadores', build: players.topGpm },
  { id: 'vision', title: 'Ojo de águila', section: 'jugadores', build: players.topVision },
  { id: 'deswardeo', title: 'A oscuras', section: 'jugadores', build: players.topWardsKilled },
  { id: 'multikills', title: 'Multikills', section: 'jugadores', build: players.multikills },

  { id: 'winrate', title: 'Mejor porcentaje', section: 'equipos', build: teams.winrates },
  { id: 'kill-diff', title: 'Diferencia de kills', section: 'equipos', build: teams.killDiff },
  { id: 'gold-diff', title: 'Diferencia de oro', section: 'equipos', build: teams.goldDiff },
  { id: 'objetivos', title: 'Más objetivos', section: 'equipos', build: teams.topObjectives },
  { id: 'duracion-equipo', title: 'Los más expeditivos', section: 'equipos', build: teams.fastestTeams },

  {
    id: 'universidades',
    title: 'Tabla de universidades',
    section: 'universidades',
    build: universities.universityStandings,
  },
  {
    id: 'universidad-fecha',
    title: 'Universidad destacada',
    section: 'universidades',
    build: universities.universityOfTheDay,
  },
  {
    id: 'universidades-kills',
    title: 'Más kills',
    section: 'universidades',
    build: universities.universityKills,
  },
  {
    id: 'universidades-dano',
    title: 'Más daño',
    section: 'universidades',
    build: universities.universityDamage,
  },

  { id: 'picks', title: 'Los más elegidos', section: 'meta', build: champions.mostPicked },
  { id: 'winrate-campeon', title: 'Los que más ganan', section: 'meta', build: champions.bestWinrate },
  { id: 'dano-campeon', title: 'Más daño promedio', section: 'meta', build: champions.topChampionDamage },
  { id: 'bans', title: 'Los más baneados', section: 'meta', build: champions.mostBanned },
  { id: 'presencia', title: 'Presencia', section: 'meta', build: champions.presence },

  { id: 'mas-larga', title: 'Las más largas', section: 'records', build: records.longestMatch },
  { id: 'mas-corta', title: 'Las más cortas', section: 'records', build: records.shortestMatch },
  { id: 'mas-kills', title: 'Las más sangrientas', section: 'records', build: records.mostCombinedKills },
  { id: 'mas-pareja', title: 'Las más parejas', section: 'records', build: records.closestGame },
  { id: 'paliza', title: 'Las palizas', section: 'records', build: records.biggestBlowout },
]

export interface StatSectionResult {
  id: StatSection
  label: string
  description: string
  blocks: StatBlock[]
}

/**
 * Resuelve todo el catálogo sobre un recorte.
 *
 * Las estadísticas sin datos devuelven null y quedan afuera, igual que las
 * secciones que se vacían enteras: antes de la primera fecha eso es el listado
 * completo, y una grilla de tarjetas vacías no le dice nada a nadie.
 */
export function buildStats(data: StatsData): StatSectionResult[] {
  return SECTIONS.map((section) => ({
    ...section,
    blocks: STATS.filter((stat) => stat.section === section.id)
      .map((stat) => stat.build(data))
      .filter((stat): stat is StatBlock => stat !== null),
  })).filter((section) => section.blocks.length > 0)
}
