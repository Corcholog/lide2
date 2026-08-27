/**
 * Estructura de la LIDE 2 tal como la comunicó la organización.
 *
 * Todo lo de acá es dato firme: 113 jugadores, 20 equipos, 13 universidades, 4
 * grupos de 5, el fixture completo de la fase de grupos y los playoffs hasta la
 * final presencial. Ya no hay nada inventado: los equipos, los grupos y los
 * cruces salen de las planillas de la organización.
 *
 * Este archivo es la fuente para el seed (`scripts/seed-lide2.ts`), que lo
 * escribe en la base. Las páginas leen de la base, no de acá.
 */

/**
 * El slogan, partido en artículo y sustantivo.
 *
 * La portada pinta el sustantivo en rojo y el artículo en claro: el peso del
 * slogan está en país / red / campeón, y el color lo dice sin subrayarlo.
 *
 * Se guarda con tildes y en caja baja; la página lo pasa a versales con CSS. La
 * organización lo escribe en mayúsculas y sin tildes, que es lo habitual al
 * tipear, pero las tildes no se pierden por estar en mayúscula. Guardarlo así
 * deja mostrarlo en versales acá y en redonda en otro lado sin reescribirlo.
 */
export const SLOGAN_PARTS = [
  { article: 'Un', noun: 'país' },
  { article: 'Una', noun: 'red' },
  { article: 'Un', noun: 'campeón' },
] as const

export const TOURNAMENT = {
  name: 'LIDE 2',
  /** Cómo se identifica el torneo en la base (`tournaments.slug`). */
  slug: 'lide-2',
  fullName: 'Liga Interuniversitaria de Deportes Electrónicos',
  /** Armado desde SLOGAN_PARTS, para no escribirlo dos veces. */
  slogan: SLOGAN_PARTS.map(({ article, noun }) => `${article} ${noun}.`).join(' '),
  organizer: 'Red UNCI · Esports UNLP',
  players: 113,
  teams: 20,
  universities: 13,
  groups: 4,
  /** Horario de competencia de la fase de grupos. */
  playTime: '14:00 a 16:00',
  broadcast: {
    channel: 'twitch.tv/unlpesports',
    url: 'https://www.twitch.tv/unlpesports',
    /** Las partidas seleccionadas van en diferido, no en vivo. */
    schedule: '15:00 a 17:00, en diferido',
  },
  discord: 'https://discord.com/invite/C9UjkhPjwy',
} as const

/**
 * Sede de la final. Es la única fecha presencial del torneo.
 *
 * Ojo con las coordenadas: el iframe que da Google trae un `!2d`/`!3d` que es el
 * centro del encuadre del mapa, no el lugar marcado. En este caso caían dentro
 * del zoológico, medio kilómetro al sur. Lo que sí identifica al lugar sin
 * ambigüedad es el CID que viene en el mismo iframe, y de ahí sale `placeUrl`.
 *
 * `lat`/`lng` son las del complejo de la Facultad de Informática en
 * OpenStreetMap (way 52869224), que es donde está el CITT. Se usan para centrar
 * el mapa estático y para el link de "cómo llegar".
 */
export const VENUE = {
  name: 'CITT',
  fullName: 'Centro de Innovación y Transferencia Tecnológica',
  place: 'Facultad de Informática, UNLP · La Plata',
  lat: -34.9036474,
  lng: -57.9379974,
  /** La ficha exacta de Google, por CID (0x34e35e5789ea31cd del iframe de la sede). */
  placeUrl: 'https://maps.google.com/?cid=3810993439754564045',
} as const

/** Indicaciones para llegar, desde donde esté el que lo abra. */
export const VENUE_DIRECTIONS = `https://www.google.com/maps/dir/?api=1&destination=${VENUE.lat},${VENUE.lng}`

/**
 * El mapa embebido de la sede, el que da Google al compartir la ficha del CITT.
 *
 * Con una corrección: el `pb` que genera Google lleva DOS ubicaciones distintas
 * y es fácil no notarlo. El bloque `!3m3!1m2!1s0x…:0x34e35e5789ea31cd` es el
 * lugar —el CITT, el mismo id que `placeUrl`— y ese es el que pone el pin. Pero
 * `!2d`/`!3d` es el centro del encuadre con el que uno estaba mirando el mapa
 * cuando copió el iframe, y en el original caía en Diagonal 113, Barrio El
 * Mondongo, a 1,3 km de la facultad (verificado contra OpenStreetMap). Con un
 * encuadre de 1636 m de alto, el pin quedaba arriba del borde superior.
 *
 * Por eso el centro se arma con `VENUE.lat`/`VENUE.lng` en vez de estar escrito
 * a mano: el mapa apunta al mismo lugar que el botón de "Cómo llegar", y si
 * alguna vez cambia la sede cambia una sola línea.
 */
export const VENUE_EMBED = [
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1635.858751751946',
  `!2d${VENUE.lng}!3d${VENUE.lat}`,
  '!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1',
  '!3m3!1m2!1s0x95a2e76bf8acdce3%3A0x34e35e5789ea31cd',
  '!2sCentro%20de%20Innovaci%C3%B3n%20y%20Transferencia%20Tecnol%C3%B3gica%20-%20Facultad%20de%20inform%C3%A1tica%20UNO%20-%20UNLP',
  '!5e0!3m2!1ses-419!2sar!4v1787792392585!5m2!1ses-419!2sar',
].join('')

export interface Milestone {
  id: string
  /**
   * Mediodía UTC a propósito: con la fecha pelada ("2026-09-05") el navegador
   * la lee como medianoche UTC y en Argentina la muestra un día antes.
   */
  date: string
  label: string
  phase: 'grupos' | 'playoffs'
  format: string
  venue: string
  detail: string | null
}

/** Las seis fechas del torneo. Todas caen sábado. */
export const CALENDAR: Milestone[] = [
  {
    id: 'fecha-1',
    date: '2026-09-05T15:00:00.000Z',
    label: 'Fecha 1',
    phase: 'grupos',
    format: 'BO1',
    venue: 'Virtual',
    detail: '14:00 y 15:00',
  },
  {
    id: 'fecha-2',
    date: '2026-09-12T15:00:00.000Z',
    label: 'Fecha 2',
    phase: 'grupos',
    format: 'BO1',
    venue: 'Virtual',
    detail: '14:00 y 15:00',
  },
  {
    id: 'fecha-3',
    date: '2026-09-19T15:00:00.000Z',
    label: 'Fecha 3',
    phase: 'grupos',
    format: 'BO1',
    venue: 'Virtual',
    detail: '14:00',
  },
  {
    id: 'cuartos',
    date: '2026-09-26T15:00:00.000Z',
    label: 'Cuartos de final',
    phase: 'playoffs',
    format: 'BO3',
    venue: 'Virtual',
    detail: 'desde las 14:00',
  },
  {
    id: 'semis',
    date: '2026-10-03T15:00:00.000Z',
    label: 'Semifinales',
    phase: 'playoffs',
    format: 'BO3',
    venue: 'Virtual',
    detail: 'desde las 14:00',
  },
  {
    id: 'final',
    date: '2026-10-17T15:00:00.000Z',
    label: 'Gran final',
    phase: 'playoffs',
    format: 'BO5',
    venue: 'Presencial',
    detail: 'CITT · La Plata, desde las 14:00',
  },
]

export interface University {
  tag: string
  name: string
}

/**
 * Las 13 universidades del torneo, sacadas de los rosters.
 *
 * La planilla de grupos escribe "UER" para la Universidad Nacional de Entre
 * Ríos, pero los rosters de los equipos 13 y 15 la escriben "UNER", que es la
 * sigla oficial. Se usa UNER.
 */
export const UNIVERSITIES: Record<string, University> = {
  UNLP: { tag: 'UNLP', name: 'Universidad Nacional de La Plata' },
  UAI: { tag: 'UAI', name: 'Universidad Abierta Interamericana' },
  UNAHUR: { tag: 'UNAHUR', name: 'Universidad Nacional de Hurlingham' },
  UNPAZ: { tag: 'UNPAZ', name: 'Universidad Nacional de José C. Paz' },
  UNRN: { tag: 'UNRN', name: 'Universidad Nacional de Río Negro' },
  UNDAV: { tag: 'UNDAV', name: 'Universidad Nacional de Avellaneda' },
  UNLaM: { tag: 'UNLaM', name: 'Universidad Nacional de La Matanza' },
  UNAM: { tag: 'UNAM', name: 'Universidad Nacional de Misiones' },
  UNER: { tag: 'UNER', name: 'Universidad Nacional de Entre Ríos' },
  UAP: { tag: 'UAP', name: 'Universidad Adventista del Plata' },
  UNLu: { tag: 'UNLu', name: 'Universidad Nacional de Luján' },
  UNCuyo: { tag: 'UNCuyo', name: 'Universidad Nacional de Cuyo' },
  UADE: { tag: 'UADE', name: 'Universidad Argentina de la Empresa' },
}

export type UniversityTag = keyof typeof UNIVERSITIES

export const GROUPS = ['A', 'B', 'C', 'D'] as const
export type GroupName = (typeof GROUPS)[number]

export interface TeamSeed {
  /** Número oficial, 1 a 20. Es la clave con la que la organización los nombra. */
  number: number
  /** "Equipo 01". La organización no les puso nombre propio. */
  name: string
  /**
   * Código de inscripción ("UNLP1", "UAI2"). Sólo lo tienen los que se
   * anotaron como equipo armado; los que salieron de inscripciones individuales
   * no tienen.
   */
  code: string | null
  /** Cómo se anotaron: con el equipo ya armado o sueltos. */
  entry: 'equipo' | 'individual'
  group: GroupName
  /**
   * Universidades del plantel, la más representada primero. Casi todos son de
   * una sola, pero las inscripciones individuales armaron cuatro equipos
   * mezclados (13, 15, 16 y 17).
   */
  universities: UniversityTag[]
  /** Jugadores inscriptos. Varios anotaron suplentes. */
  roster: number
}

function team(
  number: number,
  group: GroupName,
  universities: UniversityTag[],
  roster: number,
  entry: 'equipo' | 'individual',
  code: string | null = null,
): TeamSeed {
  return {
    number,
    name: `Equipo ${String(number).padStart(2, '0')}`,
    code,
    entry,
    group,
    universities,
    roster,
  }
}

/** Los 20 equipos, en orden de número. */
export const TEAMS: TeamSeed[] = [
  team(1, 'A', ['UNLP'], 5, 'equipo', 'UNLP1'),
  team(2, 'D', ['UNLP'], 5, 'equipo', 'UNLP2'),
  team(3, 'B', ['UNLP'], 7, 'equipo', 'UNLP3'),
  team(4, 'B', ['UNLP'], 5, 'equipo', 'UNLP4'),
  team(5, 'B', ['UAI'], 7, 'equipo', 'UAI1'),
  team(6, 'D', ['UNAM'], 5, 'equipo', 'UNAM1'),
  team(7, 'A', ['UNRN'], 6, 'equipo', 'UNRN1'),
  team(8, 'C', ['UNRN'], 6, 'equipo', 'UNRN2'),
  team(9, 'B', ['UNAHUR'], 6, 'equipo', 'UNAHUR1'),
  team(10, 'A', ['UNAHUR'], 6, 'equipo', 'UNAHUR2'),
  team(11, 'D', ['UNDAV'], 7, 'equipo', 'UNDAV1'),
  team(12, 'C', ['UNLaM'], 5, 'individual', 'UNLaM1'),
  team(13, 'C', ['UAP', 'UNER'], 5, 'individual'),
  team(14, 'D', ['UNLP'], 5, 'individual'),
  team(15, 'A', ['UNER', 'UADE', 'UNLP'], 5, 'individual'),
  team(16, 'A', ['UAI', 'UNLP'], 5, 'individual'),
  team(17, 'D', ['UNLu', 'UNAM', 'UNCuyo'], 5, 'individual'),
  team(18, 'C', ['UNLP'], 5, 'individual'),
  team(19, 'C', ['UNPAZ'], 6, 'equipo', 'UNPAZ1'),
  team(20, 'B', ['UNPAZ'], 7, 'equipo', 'UNPAZ2'),
]

/** Clasifican dos por grupo: son 4 grupos y los cuartos necesitan 8 equipos. */
export const QUALIFY_PER_GROUP = 2

export interface ScheduleRound {
  /** Fecha del torneo, 1 a 3. */
  matchday: 1 | 2 | 3
  /** Turno dentro de la fecha. La fecha 3 tiene uno solo. */
  slot: 1 | 2
  /** Con huso horario explícito para que no dependa de dónde corra esto. */
  kickoff: string
  /** Cruces por número de equipo, en el orden en que los publicó la organización. */
  matches: [number, number][]
}

/**
 * Fixture completo de la fase de grupos.
 *
 * Son 5 turnos: dos el 5 de septiembre, dos el 12 y uno el 19. Cada turno tiene
 * 8 partidos (dos por grupo) y deja libre a un equipo de cada grupo, así que
 * cada equipo juega 4 partidos y descansa una vez. En total, 40 partidos: el
 * todos contra todos completo de los cuatro grupos.
 *
 * Los equipos que quedan libres en cada turno no están escritos: salen de restar
 * los que juegan, y `byesFor` los calcula.
 */
export const SCHEDULE: ScheduleRound[] = [
  {
    matchday: 1,
    slot: 1,
    kickoff: '2026-09-05T14:00:00-03:00',
    matches: [
      [10, 7],
      [15, 16],
      [3, 20],
      [4, 9],
      [8, 13],
      [12, 18],
      [14, 17],
      [2, 6],
    ],
  },
  {
    matchday: 1,
    slot: 2,
    kickoff: '2026-09-05T15:00:00-03:00',
    matches: [
      [7, 15],
      [1, 10],
      [20, 4],
      [5, 3],
      [13, 12],
      [19, 8],
      [17, 2],
      [11, 14],
    ],
  },
  {
    matchday: 2,
    slot: 1,
    kickoff: '2026-09-12T14:00:00-03:00',
    matches: [
      [15, 1],
      [16, 7],
      [4, 5],
      [9, 20],
      [12, 19],
      [18, 13],
      [2, 11],
      [6, 17],
    ],
  },
  {
    matchday: 2,
    slot: 2,
    kickoff: '2026-09-12T15:00:00-03:00',
    matches: [
      [1, 16],
      [10, 15],
      [5, 9],
      [3, 4],
      [19, 18],
      [8, 12],
      [11, 6],
      [14, 2],
    ],
  },
  {
    matchday: 3,
    slot: 1,
    kickoff: '2026-09-19T14:00:00-03:00',
    matches: [
      [16, 10],
      [7, 1],
      [9, 3],
      [20, 5],
      [18, 8],
      [13, 19],
      [6, 14],
      [17, 11],
    ],
  },
]

const BY_NUMBER = new Map(TEAMS.map((entry) => [entry.number, entry]))

export function teamByNumber(number: number): TeamSeed {
  const found = BY_NUMBER.get(number)
  if (!found) throw new Error(`No existe el equipo ${number}`)
  return found
}

/** El grupo al que pertenece un cruce. Los dos equipos son siempre del mismo. */
export function groupOfMatch(pair: [number, number]): GroupName {
  return teamByNumber(pair[0]).group
}

/** Los que descansan en ese turno: uno por grupo. */
export function byesFor(round: ScheduleRound): TeamSeed[] {
  const playing = new Set(round.matches.flat())
  return TEAMS.filter((entry) => !playing.has(entry.number))
}

/** Etiqueta de ronda que se guarda en la base junto a cada partida. */
export function roundLabel(round: ScheduleRound): string {
  return `Fecha ${round.matchday} · Turno ${round.slot}`
}

/** Todos los equipos de un grupo, en orden de número. */
export function teamsOfGroup(group: GroupName): TeamSeed[] {
  return TEAMS.filter((entry) => entry.group === group)
}
