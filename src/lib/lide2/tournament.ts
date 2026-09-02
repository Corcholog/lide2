/**
 * The structure of LIDE 2 exactly as the organizers announced it.
 *
 * Everything here is settled fact: 113 players, 20 teams, 13 universities, 4
 * groups of 5, the full group-phase fixture and the playoffs through to the
 * in-person final. Nothing is invented any more: the teams, the groups and the
 * matchups come from the organizers' sheets.
 *
 * This file is the source for the seed (`scripts/seed-lide2.ts`), which writes
 * it into the database. The pages read from the database, not from here.
 *
 * The values are content - names, labels, the slogan - so they stay in Spanish.
 */

/**
 * The slogan, split into article and noun.
 *
 * The home page paints the noun red and the article light: the weight of the
 * slogan sits on país / red / campeón, and the colour says so without
 * underlining it.
 *
 * It is stored accented and in lower case; the page puts it in small caps with
 * CSS. The organizers write it in capitals and without accents, which is what
 * people usually type, but accents are not lost by being capitalised. Storing
 * it this way allows showing it in small caps here and in roman elsewhere
 * without rewriting it.
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
 * Venue of the final. It is the tournament's only in-person date.
 *
 * Mind the coordinates: the iframe Google hands out carries a `!2d`/`!3d` that
 * is the centre of the map's viewport, not the marked place. In this case they
 * landed inside the zoo, half a kilometre south. What does identify the place
 * unambiguously is the CID that comes in the same iframe, and `placeUrl` is
 * built from it.
 *
 * `lat`/`lng` are those of the Facultad de Informática complex on OpenStreetMap
 * (way 52869224), which is where the CITT is. They centre the map and feed the
 * "how to get there" link.
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

/** Directions there, from wherever whoever opens it happens to be. */
export const VENUE_DIRECTIONS = `https://www.google.com/maps/dir/?api=1&destination=${VENUE.lat},${VENUE.lng}`

/**
 * The venue's embedded map, the one Google hands out when sharing the CITT
 * listing.
 *
 * With one correction: the `pb` Google generates carries TWO different
 * locations and it is easy to miss. The `!3m3!1m2!1s0x...:0x34e35e5789ea31cd`
 * block is the place - the CITT, the same id as `placeUrl` - and that is what
 * drops the pin. But `!2d`/`!3d` is the centre of the viewport you happened to
 * be looking at when you copied the iframe, and in the original it landed on
 * Diagonal 113, Barrio El Mondongo, 1.3 km from the faculty (verified against
 * OpenStreetMap). With a 1636 m tall viewport, the pin sat above the top edge.
 *
 * That is why the centre is built from `VENUE.lat`/`VENUE.lng` instead of being
 * written by hand: the map points at the same place as the "Cómo llegar"
 * button, and if the venue ever changes, one line changes.
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
   * Midday UTC on purpose: given the bare date ("2026-09-05") the browser reads
   * it as midnight UTC and shows it one day earlier in Argentina.
   */
  date: string
  label: string
  phase: 'grupos' | 'playoffs'
  format: string
  venue: string
  detail: string | null
}

/** The tournament's six dates. They all fall on a Saturday. */
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
 * The tournament's 13 universities, taken from the rosters.
 *
 * The groups sheet writes "UER" for the Universidad Nacional de Entre Ríos, but
 * the rosters of teams 13 and 15 write "UNER", which is the official tag. UNER
 * is what gets used.
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
  /** Official number, 1 to 20. It is the key the organizers name them by. */
  number: number
  /** "Equipo 01". The organizers gave them no names of their own. */
  name: string
  /**
   * Signup code ("UNLP1", "UAI2"). Only the ones that entered as a ready-made
   * team have it; the ones that came out of individual signups do not.
   */
  code: string | null
  /** How they signed up: as a ready-made team, or one by one. */
  entry: 'equipo' | 'individual'
  group: GroupName
  /**
   * The roster's universities, most represented first. Nearly all are from one
   * alone, but the individual signups built four mixed teams (13, 15, 16 and
   * 17).
   */
  universities: UniversityTag[]
  /** Registered players. Several signed up substitutes. */
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
  /** Matchups by team number, in the order the organizers published them. */
  matches: [number, number][]
}

/**
 * The full group-phase fixture.
 *
 * Five slots: two on 5 September, two on the 12th and one on the 19th. Each
 * slot holds 8 games (two per group) and leaves one team per group idle, so
 * every team plays 4 games and rests once. 40 games in total: the complete
 * round robin of the four groups.
 *
 * The teams on a bye in each slot are not written down: they come from
 * subtracting the ones that play, and `byesFor` works them out.
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

/** The ones resting in that slot: one per group. */
export function byesFor(round: ScheduleRound): TeamSeed[] {
  const playing = new Set(round.matches.flat())
  return TEAMS.filter((entry) => !playing.has(entry.number))
}

/** Round label stored in the database alongside each match. */
export function roundLabel(round: ScheduleRound): string {
  return `Fecha ${round.matchday} · Turno ${round.slot}`
}

/** Every team in a group, in number order. */
export function teamsOfGroup(group: GroupName): TeamSeed[] {
  return TEAMS.filter((entry) => entry.group === group)
}

/** The tournament runs on Argentine time. */
export const AR_TIME_ZONE = 'America/Argentina/Buenos_Aires'

/**
 * "5 de septiembre": when it all starts.
 *
 * Used by the "nothing here yet" notices a visitor sees. It comes out of
 * CALENDAR rather than being written by hand so there are never two different
 * dates going around if the tournament shifts.
 */
export function tournamentStartDate(): string {
  return new Date(CALENDAR[0].date).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    timeZone: AR_TIME_ZONE,
  })
}
