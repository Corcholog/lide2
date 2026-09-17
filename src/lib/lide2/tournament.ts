/**
 * The structure of LIDE 2 as announced by the organizers: teams, groups,
 * calendar, fixture and venue.
 *
 * This is the source for the seed (`scripts/seed-lide2.ts`); pages read from
 * the database, not from here. Values are content, so they are in Spanish.
 */

/**
 * The slogan split into article and noun, so the home page can color the noun.
 * Stored lower case with accents; the page applies small caps with CSS.
 */
export const SLOGAN_PARTS = [
  { article: 'Un', noun: 'país' },
  { article: 'Una', noun: 'red' },
  { article: 'Un', noun: 'campeón' },
] as const

export const TOURNAMENT = {
  name: 'LIDE 2',
  /** How the tournament is identified in the database (`tournaments.slug`). */
  slug: 'lide-2',
  fullName: 'Liga Interuniversitaria de Deportes Electrónicos',
  /** Built from SLOGAN_PARTS, so it is not written twice. */
  slogan: SLOGAN_PARTS.map(({ article, noun }) => `${article} ${noun}.`).join(' '),
  organizer: 'Red UNCI · Esports UNLP',
  players: 113,
  teams: 20,
  universities: 13,
  groups: 4,
  /** Playing hours of the group phase. */
  playTime: '14:00 a 16:00',
  broadcast: {
    channel: 'twitch.tv/unlpesports',
    url: 'https://www.twitch.tv/unlpesports',
    /** The selected games go out delayed, not live. */
    schedule: '15:00 a 17:00, en diferido',
  },
  discord: 'https://discord.com/invite/C9UjkhPjwy',
} as const

/**
 * Venue of the final, the only in-person date.
 *
 * `placeUrl` uses the listing's CID, which identifies the place exactly. The
 * coordinates come from OpenStreetMap (way 52869224, Facultad de Informática),
 * not from Google's embed, whose `!2d`/`!3d` values are the viewport center.
 */
export const VENUE = {
  name: 'CITT',
  fullName: 'Centro de Innovación y Transferencia Tecnológica',
  place: 'Facultad de Informática, UNLP · La Plata',
  lat: -34.9036474,
  lng: -57.9379974,
  /** The exact Google listing, by CID (0x34e35e5789ea31cd from the venue iframe). */
  placeUrl: 'https://maps.google.com/?cid=3810993439754564045',
} as const

/** Directions to the venue from the visitor's location. */
export const VENUE_DIRECTIONS = `https://www.google.com/maps/dir/?api=1&destination=${VENUE.lat},${VENUE.lng}`

/**
 * The venue's embedded map, from Google's share dialog.
 *
 * The center (`!2d`/`!3d`) is built from `VENUE` instead of the copied value,
 * which pointed at the viewport the map was copied from and left the pin off
 * screen. The `!1s...:0x34e35e5789ea31cd` block is the place itself.
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
   * 15:00 UTC (noon in Argentina). A bare date ("2026-09-05") would be read as
   * midnight UTC and shown a day earlier in Argentina.
   */
  date: string
  label: string
  phase: 'grupos' | 'playoffs'
  format: string
  venue: string
  detail: string | null
}

/** The tournament's six dates, all on Saturdays. */
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
 * The 13 universities, taken from the rosters. Entre Ríos uses the official
 * tag "UNER" (the groups sheet wrote "UER").
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
  /** Official number, 1 to 20. */
  number: number
  /** "Equipo 01". Teams have no names of their own. */
  name: string
  /** Signup code ("UNLP1", "UAI2"), or null for teams formed without one. */
  code: string | null
  /** How they signed up: as a ready-made team, or one by one. */
  entry: 'equipo' | 'individual'
  group: GroupName
  /**
   * The roster's universities, most represented first. Four teams formed from
   * individual signups are mixed (13, 15, 16 and 17).
   */
  universities: UniversityTag[]
  /** Registered players, substitutes included. */
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

/** The 20 teams, in number order. */
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

export interface ScheduleRound {
  /** Tournament matchday, 1 to 3. */
  matchday: 1 | 2 | 3
  /** Slot within the matchday. Matchday 3 has only one. */
  slot: 1 | 2
  /** With an explicit time zone so it does not depend on where this runs. */
  kickoff: string
  /** Matchups by team number, in the published order. */
  matches: [number, number][]
}

/**
 * The full group-phase fixture: five slots (two on each of the first two
 * matchdays, one on the third), eight games each. Every team plays four games
 * and rests once. Teams resting in a slot are derived by `byesFor`.
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
  if (!found) throw new Error(`There is no team ${number}`)
  return found
}

/** The teams resting in a slot: one per group. */
export function byesFor(round: ScheduleRound): TeamSeed[] {
  const playing = new Set(round.matches.flat())
  return TEAMS.filter((entry) => !playing.has(entry.number))
}

/** Every team in a group, in number order. */
export function teamsOfGroup(group: GroupName): TeamSeed[] {
  return TEAMS.filter((entry) => entry.group === group)
}

/** The tournament runs on Argentine time. */
export const AR_TIME_ZONE = 'America/Argentina/Buenos_Aires'

/**
 * The first matchday's date, "5 de septiembre" (optionally with the year),
 * derived from `CALENDAR` so it is never written by hand.
 */
export function tournamentStartDate({ year = false }: { year?: boolean } = {}): string {
  return new Date(CALENDAR[0].date).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    ...(year ? { year: 'numeric' } : {}),
    timeZone: AR_TIME_ZONE,
  })
}
