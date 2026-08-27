import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  CALENDAR,
  SLOGAN_PARTS,
  TOURNAMENT,
  VENUE,
  VENUE_DIRECTIONS,
  VENUE_EMBED,
  type Milestone,
} from '@/lib/lide2/tournament'
import { SectionNav, type NavSection } from '@/components/torneo/SectionNav'
import { TeamFocus, type FocusTeam } from '@/components/torneo/TeamFocus'
import type {
  FixtureByeRow,
  FixtureResultRow,
  GroupStandingRow,
  SeriesResultRow,
} from '@/types/db'

export const dynamic = 'force-dynamic'

/** El torneo se juega en horario argentino, se mire desde donde se mire. */
const AR_TIME_ZONE = 'America/Argentina/Buenos_Aires'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function shortDate(iso: string): { day: string; month: string } {
  const date = new Date(iso)
  return { day: String(date.getUTCDate()), month: MONTHS[date.getUTCMonth()] }
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

/** Agrupa la tabla por grupo, respetando el orden A, B, C, D. */
function byGroup(rows: GroupStandingRow[]): { label: string; rows: GroupStandingRow[] }[] {
  const groups = new Map<string, GroupStandingRow[]>()
  for (const row of rows) {
    groups.set(row.group_label, [...(groups.get(row.group_label) ?? []), row])
  }

  return [...groups.entries()]
    .map(([label, list]) => ({ label, rows: list.sort((a, b) => a.position - b.position) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Los equipos que aparecen en el fixture, con cuántos cruces tiene cada uno.
 *
 * Es lo que necesita el resaltado: la lista de ids para emitir sus reglas de
 * CSS, y el nombre y la cuenta para el cartel que aparece al fijar uno.
 */
function focusTeams(fixture: FixtureResultRow[]): FocusTeam[] {
  const teams = new Map<string, FocusTeam>()

  for (const row of fixture) {
    for (const [id, name] of [
      [row.team_a_id, row.team_a_name],
      [row.team_b_id, row.team_b_name],
    ] as const) {
      const team = teams.get(id) ?? { id, name, matches: 0 }
      team.matches += 1
      teams.set(id, team)
    }
  }

  return [...teams.values()]
}

export default async function Lide2Page() {
  const supabase = await createClient()
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id,name')
    .eq('slug', 'lide-2')
    .maybeSingle()

  const tournamentId = (tournament?.id as string) ?? null

  const [standingsRes, seriesRes, fixtureRes, byesRes] = tournamentId
    ? await Promise.all([
        supabase
          .from('group_standings')
          .select('*')
          .eq('tournament_id', tournamentId)
          .order('position'),
        supabase
          .from('series_results')
          .select('*')
          .eq('tournament_id', tournamentId)
          .order('stage_order')
          .order('order_index'),
        supabase
          .from('fixture_results')
          .select('*')
          .eq('tournament_id', tournamentId)
          .order('matchday')
          .order('slot')
          .order('group_label')
          // Dentro de un grupo hay dos cruces por turno y ninguno va antes que
          // el otro: se desempata por nombre para que la lista no baile.
          .order('team_a_name'),
        supabase
          .from('fixture_byes')
          .select('*')
          .eq('tournament_id', tournamentId)
          .order('matchday')
          .order('slot')
          .order('group_label'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const groups = byGroup((standingsRes.data ?? []) as GroupStandingRow[])
  const series = (seriesRes.data ?? []) as SeriesResultRow[]
  const fixture = (fixtureRes.data ?? []) as FixtureResultRow[]
  const byes = (byesRes.data ?? []) as FixtureByeRow[]
  const next = CALENDAR.find((milestone) => daysUntil(milestone.date) >= 0)

  const rounds = ['Cuartos de final', 'Semifinales', 'Gran final']

  const sections = [
    { id: 'calendario', label: 'Calendario' },
    { id: 'grupos', label: 'Fase de grupos' },
    { id: 'fixture', label: 'Fixture' },
    { id: 'playoffs', label: 'Playoffs' },
    { id: 'final', label: 'La final' },
  ]

  return (
    <TeamFocus teams={focusTeams(fixture)} className="flex flex-col gap-10">
      {/* La barra de secciones va adentro: cierra la portada, no la sigue. */}
      <Hero next={next} sections={sections} />

      {!tournamentId && (
        <p className="rounded border border-danger/40 bg-danger-dim px-4 py-3 text-sm text-danger">
          El torneo todavía no está cargado en la base. Corré <code>npm run seed:lide2</code>.
        </p>
      )}

      <Calendar next={next} />

      <section id="grupos" className="flex scroll-mt-16 flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <h2 className="border-b-4 border-accent pb-1 text-lg uppercase tracking-tight">Fase de grupos</h2>
          <p className="text-xs text-faint">
            Todos contra todos · clasifican los dos primeros de cada grupo
          </p>
        </div>

        {groups.length === 0 ? (
          <p className="border-2 border-dashed border-line-strong px-6 py-10 text-center text-sm text-fg-soft">
            Todavía no hay equipos asignados a los grupos.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map((group) => (
              <GroupTable key={group.label} label={group.label} rows={group.rows} />
            ))}
          </div>
        )}
      </section>

      <Fixture rounds={fixture} byes={byes} />

      <section id="playoffs" className="flex scroll-mt-16 flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <h2 className="border-b-4 border-accent pb-1 text-lg uppercase tracking-tight">Playoffs</h2>
          <p className="text-xs text-faint">Cuartos y semis BO3 · final BO5 presencial</p>
        </div>

        <div className="overflow-x-auto">
          <div className="grid min-w-3xl grid-cols-3 gap-4">
            {rounds.map((round) => (
              <BracketColumn
                key={round}
                title={round}
                series={series.filter((item) => item.round === round)}
                champion={round === 'Gran final'}
              />
            ))}
          </div>
        </div>
      </section>

      <GrandFinal />

      <Footer />
    </TeamFocus>
  )
}

/*
 * Capas de la portada, de abajo hacia arriba: la foto, un fundido que la
 * disuelve en el fondo de la página, una viñeta que apaga los bordes y un grano
 * finito. El grano no es decoración: un degradado tan grande sobre un JPEG
 * muestra bandas, y el ruido las rompe.
 *
 * Todo se arma con color-mix sobre --canvas para que las capas sigan al token y
 * no haya que sincronizar hexadecimales a mano.
 */
const HERO_OVERLAY = [
  // Viñeta: cierra las esquinas y saca el aire raro de los costados.
  'radial-gradient(115% 85% at 52% 30%, transparent 38%, var(--canvas) 100%)',
  // Lavado desde la izquierda, que es donde apoya el texto.
  'linear-gradient(to right, var(--canvas) 0%, color-mix(in srgb, var(--canvas) 55%, transparent) 42%, transparent 70%)',
  // Fundido al fondo: abajo termina en el color de la página, sin borde duro.
  [
    'linear-gradient(to top',
    'var(--canvas) 0%',
    'color-mix(in srgb, var(--canvas) 94%, transparent) 16%',
    'color-mix(in srgb, var(--canvas) 60%, transparent) 46%',
    'color-mix(in srgb, var(--canvas) 26%, transparent) 76%',
    'color-mix(in srgb, var(--canvas) 8%, transparent) 100%)',
  ].join(', '),
].join(', ')

const HERO_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

function Hero({ next, sections }: { next: Milestone | undefined; sections: NavSection[] }) {
  const days = next ? daysUntil(next.date) : null

  const stats = [
    { value: TOURNAMENT.players, label: 'jugadores' },
    { value: TOURNAMENT.teams, label: 'equipos' },
    { value: TOURNAMENT.universities, label: 'universidades' },
    { value: TOURNAMENT.groups, label: 'grupos' },
    { value: 1, label: 'campeón' },
  ]

  // La portada queda oscura en los dos temas: el texto va sobre la foto, no
  // sobre el fondo del sitio, y con el tema claro dejaría de leerse.
  return (
    <header data-theme="dark" className="relative -mt-8 text-fg">
      {/*
        Se sale del contenedor centrado para ocupar el ancho de la ventana. El
        <body> lleva overflow-x-clip porque 100vw incluye la barra de scroll y
        sin eso sobran unos píxeles a lo ancho.
      */}
      <div className="isolate absolute inset-y-0 left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-canvas">
        <Image
          src="/lide2-hero.jpg"
          alt="Campeones de League of Legends con las skins de campeón del mundo de T1"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[52%_20%]"
        />
        <div className="absolute inset-0" style={{ background: HERO_OVERLAY }} />
        <div
          className="absolute inset-0 opacity-[0.045] mix-blend-overlay"
          style={{ backgroundImage: HERO_GRAIN }}
          aria-hidden
        />
      </div>

      {/*
        La portada ocupa el pliegue entero: la ventana menos la barra del sitio.
        Todo lo demás —título, cifras y la barra de secciones— entra acá adentro,
        así que la primera pantalla es una pieza sola. Antes medía un alto fijo y
        quedaba asomando media tarjeta del calendario, que es lo peor de los dos
        mundos: ni se ve el calendario ni se termina de ver la portada.

        `svh` y no `vh` porque en el celular `vh` mide la ventana con la barra
        del navegador escondida: con ella a la vista, la barra de secciones
        quedaría abajo del pliegue. El `max()` es el piso para ventanas muy
        bajas, donde el texto no entraría.
      */}
      <div className="relative flex min-h-[max(30rem,calc(100svh-var(--site-header)))] flex-col pb-4 pt-6">
        {/*
          Esto no es el sitio oficial de la LIDE 2 y conviene que se lea antes
          que nada: la informacion sale del anuncio y las planillas de la
          organizacion, pero la pagina la mantiene otra gente.
        */}
        <p className="self-start border border-white/20 bg-black/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-fg-soft backdrop-blur">
          Página no oficial
        </p>

        <div className="mt-auto flex flex-col gap-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-accent">
              {TOURNAMENT.organizer}
            </p>
            <h1 className="mt-2 text-6xl uppercase leading-[0.82] tracking-[-0.045em] sm:text-7xl">
              {TOURNAMENT.name}
            </h1>
            {/*
              El slogan va en la misma familia que el título: es lo segundo que se
              lee, antes que el nombre largo del torneo. El sustantivo en rojo y
              el artículo en claro, que es donde está el peso de la frase.
            */}
            <p className="font-display mt-3 text-lg uppercase leading-none tracking-[-0.02em] sm:text-2xl">
              {SLOGAN_PARTS.map(({ article, noun }, index) => (
                <span key={noun} className="whitespace-nowrap">
                  {index > 0 && ' '}
                  <span className="text-fg">{article} </span>
                  <span className="text-accent">{noun}.</span>
                </span>
              ))}
            </p>
            <p className="mt-3 max-w-md text-sm text-fg-soft">{TOURNAMENT.fullName}</p>
          </div>

          {next && days !== null && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="flex items-baseline gap-2 rounded-md bg-accent-strong px-3 py-1.5 text-white">
                <span className="tabular font-display text-2xl font-bold leading-none">
                  {days === 0 ? '¡HOY!' : days}
                </span>
                {days !== 0 && (
                  <span className="text-xs font-bold uppercase tracking-wide">
                    {days === 1 ? 'día' : 'días'}
                  </span>
                )}
              </p>
              <p className="text-sm">
                <span className="font-semibold">{next.label}</span>
                <span className="text-fg-soft">
                  {' · '}
                  {shortDate(next.date).day} de{' '}
                  {new Date(next.date).toLocaleDateString('es-AR', {
                    month: 'long',
                    timeZone: 'UTC',
                  })}
                  {next.detail ? ` · ${next.detail}` : ''}
                </span>
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <a
              href={TOURNAMENT.broadcast.url}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-white/20 bg-black/30 px-4 py-2 text-sm font-medium backdrop-blur transition-colors hover:border-accent hover:text-accent"
            >
              Ver la transmisión
            </a>
            <a
              href={TOURNAMENT.discord}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-white/20 bg-black/30 px-4 py-2 text-sm font-medium backdrop-blur transition-colors hover:border-accent hover:text-accent"
            >
              Discord
            </a>
          </div>

          <dl className="mt-2 grid grid-cols-3 gap-x-6 gap-y-4 border-t border-white/10 pt-4 sm:grid-cols-5">
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <span className="tabular font-display block text-2xl font-bold leading-none">
                    {stat.value}
                  </span>
                  <span className="mt-1 block text-[11px] uppercase tracking-wide text-faint">
                    {stat.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          {/*
            El pie de la portada. Lleva la misma línea fina que las cifras de
            arriba, así que las dos filas se leen como un mismo bloque y no como
            una barra que quedó colgada abajo.
          */}
          <div className="border-t border-white/10 pt-2">
            <SectionNav sections={sections} />
          </div>
        </div>
      </div>
    </header>
  )
}

/**
 * El fixture publicado, agrupado por turno.
 *
 * Cada fecha tiene uno o dos turnos y cada turno son ocho cruces, dos por
 * grupo, con un equipo de cada grupo libre. Antes de jugarse se ve el cruce;
 * despues, el marcador en kills, que es lo unico que hay de un BO1.
 */
/**
 * El fixture publicado.
 *
 * Se agrupa dos veces: por turno y, dentro de cada turno, por grupo. Antes cada
 * fila repetia su grupo, y como en un turno hay dos cruces por grupo y la grilla
 * es de dos columnas, la etiqueta aparecia cuatro veces seguidas. Diciendolo una
 * sola vez como encabezado se lee mejor y ademas cada grupo puede mostrar quien
 * descansa, que antes era una linea suelta con los cuatro juntos.
 */
function Fixture({ rounds, byes }: { rounds: FixtureResultRow[]; byes: FixtureByeRow[] }) {
  if (rounds.length === 0) return null

  interface Slot {
    matchday: number
    slot: number
    kickoff: string
    groups: Map<string, FixtureResultRow[]>
  }

  // Se mantiene el orden que ya trajo la consulta: turno, grupo, equipo.
  const slots = new Map<string, Slot>()
  for (const row of rounds) {
    const key = `${row.matchday}-${row.slot}`
    const slot = slots.get(key) ?? {
      matchday: row.matchday,
      slot: row.slot,
      kickoff: row.kickoff,
      groups: new Map<string, FixtureResultRow[]>(),
    }
    slot.groups.set(row.group_label, [...(slot.groups.get(row.group_label) ?? []), row])
    slots.set(key, slot)
  }

  const resting = new Map<string, string>()
  for (const bye of byes) {
    resting.set(`${bye.matchday}-${bye.slot}-${bye.group_label}`, bye.team_name)
  }

  const played = rounds.filter((row) => row.status === 'jugado').length

  return (
    <section id="fixture" className="flex scroll-mt-16 flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 className="border-b-4 border-accent pb-1 text-lg uppercase tracking-tight">Fixture</h2>
        <p className="text-xs text-faint">
          {rounds.length} partidos · {played === 0 ? 'ninguno jugado' : `${played} jugados`}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {[...slots.entries()].map(([key, slot]) => (
          <div key={key} className="border-2 border-line bg-surface">
            <div className="flex flex-wrap items-baseline gap-x-3 border-b-2 border-line px-4 py-2.5">
              <h3 className="text-sm uppercase tracking-tight">Fecha {slot.matchday}</h3>
              <span className="text-xs text-muted">{kickoffLabel(slot.kickoff)}</span>
            </div>

            {/*
              Las lineas entre celdas salen del gap: la grilla se pinta del color
              del borde y cada celda tapa lo suyo con el fondo. Sale mas robusto
              que ponerle bordes a unas celdas si y a otras no segun la columna,
              que cambia con cada breakpoint.
            */}
            <div className="grid gap-0.5 bg-line sm:grid-cols-2 xl:grid-cols-4">
              {[...slot.groups.entries()].map(([group, matches]) => (
                <div key={group} className="bg-surface px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-accent">
                    {group}
                  </p>

                  <ul className="mt-2 flex flex-col gap-2">
                    {matches.map((match) => (
                      <FixtureRow key={match.id} match={match} />
                    ))}
                  </ul>

                  {resting.get(`${key}-${group}`) && (
                    <p className="mt-2 border-t border-line pt-2 text-[11px] text-dim">
                      Libre: {resting.get(`${key}-${group}`)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** "sábado 5 de septiembre, 14:00". El horario del torneo es el de Argentina. */
function kickoffLabel(iso: string): string {
  const date = new Date(iso)
  const day = date.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: AR_TIME_ZONE,
  })
  const time = date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: AR_TIME_ZONE,
  })
  return `${day}, ${time}`
}

function FixtureRow({ match }: { match: FixtureResultRow }) {
  const jugado = match.status === 'jugado'

  return (
    // data-fixture: es la marca que busca el resaltado para apagar los cruces
    // donde no juega el equipo fijado. Ver TeamFocus.
    <li data-fixture className="flex items-start gap-2 text-sm transition-opacity duration-200">
      <FixtureTeam
        id={match.team_a_id}
        name={match.team_a_name}
        universities={match.team_a_universities}
        won={match.team_a_win}
        align="right"
      />

      <span className="tabular w-12 shrink-0 pt-1 text-center text-xs">
        {jugado ? (
          <>
            <span className={match.team_a_win ? 'font-bold text-win' : 'text-loss'}>
              {match.team_a_kills}
            </span>
            <span className="text-dim">-</span>
            <span className={match.team_b_win ? 'font-bold text-win' : 'text-loss'}>
              {match.team_b_kills}
            </span>
          </>
        ) : (
          <span className="text-dim">vs</span>
        )}
      </span>

      <FixtureTeam
        id={match.team_b_id}
        name={match.team_b_name}
        universities={match.team_b_universities}
        won={match.team_b_win}
        align="left"
      />
    </li>
  )
}

function FixtureTeam({
  id,
  name,
  universities,
  won,
  align,
}: {
  id: string
  name: string
  universities: string[] | null
  won: boolean | null
  align: 'left' | 'right'
}) {
  /*
   * Botón y no link a la ficha del equipo, que es lo que era antes. En el
   * fixture la pregunta es "¿contra quién juega y cuándo?", y eso se contesta
   * acá mismo prendiendo sus otros cruces; irse a otra página es perder el
   * lugar. A la ficha se llega igual: desde la tabla del grupo, y desde el
   * cartel que aparece al fijar un equipo.
   *
   * aria-pressed arranca en false y lo actualiza TeamFocus por DOM, porque este
   * árbol lo dibuja el servidor y no se vuelve a renderizar.
   */
  return (
    <button
      type="button"
      data-team={id}
      aria-pressed={false}
      title={`Resaltar los partidos de ${name}`}
      className={`group min-w-0 flex-1 cursor-pointer px-1 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      <span
        className={`block truncate transition-colors group-hover:text-accent ${
          won === null ? 'text-fg-soft' : won ? 'font-semibold text-fg' : 'text-loss'
        }`}
      >
        {name}
      </span>
      {/* Quien es cada equipo: "Equipo 15" solo no dice nada. */}
      {universities && universities.length > 0 && (
        <span className="mt-0.5 block text-[11px] leading-tight text-faint">
          {universities.join(' / ')}
        </span>
      )}
    </button>
  )
}

function Calendar({ next }: { next: Milestone | undefined }) {
  return (
    <section id="calendario" className="flex scroll-mt-16 flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 className="border-b-4 border-accent pb-1 text-lg uppercase tracking-tight">Calendario</h2>
        <p className="text-xs text-faint">Fase de grupos, {TOURNAMENT.playTime} hs</p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {CALENDAR.map((milestone) => {
          const { day, month } = shortDate(milestone.date)
          const isNext = milestone.id === next?.id

          return (
            <li
              key={milestone.id}
              className={`flex flex-col gap-1 rounded-lg border px-4 py-3 ${
                isNext ? 'border-accent bg-accent-dim/50' : 'border-line bg-surface'
              }`}
            >
              <p className="tabular font-display text-xl font-bold">
                {day} <span className="text-sm font-medium text-muted">{month}</span>
              </p>
              <p className="text-sm font-medium">{milestone.label}</p>
              <p className="text-xs text-faint">
                {milestone.format} · {milestone.venue}
              </p>
              {milestone.detail && <p className="text-xs text-dim">{milestone.detail}</p>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function GroupTable({ label, rows }: { label: string; rows: GroupStandingRow[] }) {
  const played = rows.reduce((total, row) => total + row.games, 0)

  return (
    <div className="overflow-hidden border-2 border-line bg-surface shadow-hard">
      <div className="flex items-baseline justify-between border-b border-line bg-surface px-4 py-2.5">
        <h3 className="font-bold">{label}</h3>
        <span className="text-xs text-faint">
          {rows.length} equipos · {played === 0 ? 'sin jugar' : `${played / 2} partidas`}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead className="text-xs text-faint">
          <tr className="border-b border-line">
            <th className="w-8 px-2 py-2 text-right font-medium">#</th>
            <th className="px-2 py-2 text-left font-medium">Equipo</th>
            <th className="w-14 px-2 py-2 text-right font-medium">G-P</th>
            <th className="w-12 px-2 py-2 text-right font-medium">Dif.</th>
            <th className="w-24 px-3 py-2 text-right font-medium">Forma</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <Row key={row.team_id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({ row }: { row: GroupStandingRow }) {
  const qualified = row.position <= 2

  return (
    <tr data-team={row.team_id} className={qualified ? 'bg-accent-dim/40' : ''}>
      <td
        className={`tabular px-2 py-2 text-right ${
          qualified ? 'font-bold text-accent' : 'text-faint'
        }`}
      >
        {row.position}
      </td>
      <td className="px-2 py-2">
        <Link
          href={`/equipos/${row.team_id}`}
          className={`truncate transition-colors hover:text-accent ${
            qualified ? 'font-semibold' : 'font-medium'
          }`}
        >
          {row.team_name}
        </Link>
        {row.university_tags.length > 0 && (
          <p
            className="truncate text-xs text-faint"
            title={row.university_tags.length > 1 ? row.university_tags.join(' · ') : undefined}
          >
            {row.university_tags.join(' / ')}
          </p>
        )}
      </td>
      <td className="tabular px-2 py-2 text-right">
        <span className="text-win">{row.wins}</span>
        <span className="text-dim">-</span>
        <span className="text-loss">{row.losses}</span>
      </td>
      <td
        className={`tabular px-2 py-2 text-right ${
          row.kill_diff > 0
            ? 'text-win'
            : row.kill_diff < 0
              ? 'text-loss'
              : 'text-muted'
        }`}
      >
        {row.kill_diff > 0 ? '+' : ''}
        {row.kill_diff}
      </td>
      <td className="px-3 py-2">
        <span className="flex justify-end gap-1">
          {(row.form ?? [])
            .slice()
            .reverse()
            .map((win, index) => (
              <span
                key={index}
                title={win ? 'Victoria' : 'Derrota'}
                className={`flex size-4 items-center justify-center rounded text-[9px] font-bold ${
                  win ? 'bg-accent-dim text-win' : 'bg-raised text-loss'
                }`}
              >
                {win ? 'V' : 'D'}
              </span>
            ))}
        </span>
      </td>
    </tr>
  )
}

function BracketColumn({
  title,
  series,
  champion = false,
}: {
  title: string
  series: SeriesResultRow[]
  champion?: boolean
}) {
  const date = series[0]?.scheduled_at
  const final = series[0]
  const winnerName =
    final?.winner_team_id === final?.team_a_id ? final?.team_a_name : final?.team_b_name

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide">{title}</h3>
        <p className="text-xs text-faint">
          {date
            ? new Date(date).toLocaleDateString('es-AR', {
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              })
            : 'a definir'}
        </p>
      </div>

      {/* Cada columna reparte sus series a lo alto para que queden centradas
          contra la anterior: cuatro cuartos, dos semis, una final. */}
      <div className="flex flex-1 flex-col justify-around gap-3">
        {series.map((item) => (
          <SeriesCard key={item.id} series={item} />
        ))}

        {champion && (
          <div
            className={`rounded-lg border px-4 py-3 ${
              final?.winner_team_id
                ? 'border-accent bg-gradient-to-br from-accent-dim to-surface'
                : 'border-dashed border-line'
            }`}
          >
            <p className="text-xs uppercase tracking-[0.2em] text-accent">Campeón</p>
            <p className="font-display mt-1 text-xl font-bold">
              {winnerName ?? <span className="text-dim">por definir</span>}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function SeriesCard({ series }: { series: SeriesResultRow }) {
  const decided = series.winner_team_id !== null

  return (
    <div className="border-2 border-line bg-surface px-3 py-2.5">
      <p className="mb-1.5 text-[10px] uppercase tracking-wide text-dim">
        BO{series.best_of}
        {series.games_played > 0 && ` · ${series.games_played} jugados`}
      </p>

      <SeriesTeam
        name={series.team_a_name}
        slot={series.slot_a_label}
        wins={series.wins_a}
        won={decided && series.winner_team_id === series.team_a_id}
        pending={!decided}
      />
      <SeriesTeam
        name={series.team_b_name}
        slot={series.slot_b_label}
        wins={series.wins_b}
        won={decided && series.winner_team_id === series.team_b_id}
        pending={!decided}
      />
    </div>
  )
}

function SeriesTeam({
  name,
  slot,
  wins,
  won,
  pending,
}: {
  name: string | null
  slot: string | null
  wins: number
  won: boolean
  pending: boolean
}) {
  return (
    <div
      className={`flex items-center gap-2 border-l-2 py-1 pl-2 ${
        won ? 'border-accent' : 'border-transparent'
      }`}
    >
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          won ? 'font-semibold' : pending ? 'text-fg-soft' : 'text-faint'
        }`}
      >
        {name ?? <span className="text-dim">{slot ?? 'por definir'}</span>}
      </span>
      {name && slot && <span className="shrink-0 text-[10px] text-dim">{slot}</span>}
      <span className={`tabular w-4 text-right text-sm ${won ? 'font-bold' : 'text-faint'}`}>
        {wins}
      </span>
    </div>
  )
}

/**
 * La final tiene bloque propio porque es la única fecha presencial del torneo y
 * en el calendario quedaba como una casilla más, igual que una fecha de grupos.
 */
function GrandFinal() {
  const final = CALENDAR.find((milestone) => milestone.id === 'final')
  if (!final) return null

  const days = daysUntil(final.date)
  const { day, month } = shortDate(final.date)

  return (
    <section id="final" className="scroll-mt-16">
      <div className="relative overflow-hidden border-2 border-accent bg-gradient-to-br from-accent-dim via-surface to-surface shadow-hard-accent">
        {/* Resplandor rojo que recoge el color del arte de la portada. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 120% at 88% 20%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, transparent 70%)',
          }}
        />

        <div className="relative grid gap-8 px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-[1fr_20rem] lg:gap-12">
          <div className="flex flex-col">
            <p className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.25em] text-accent">
              <span className="rounded bg-accent-strong px-1.5 py-0.5 text-[10px] font-bold tracking-normal text-white">
                Presencial
              </span>
              La única fecha fuera de línea
            </p>

            <h2 className="mt-3 text-4xl uppercase leading-none tracking-[-0.04em] sm:text-5xl">
              Gran final
            </h2>

            <p className="mt-4 max-w-lg text-sm text-fg-soft">
              Los ganadores de las semifinales se cruzan al mejor de cinco. Todo el resto del
              torneo se juega en línea; esta se juega en una sala, con los equipos en el mismo
              lugar.
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-faint">Fecha</dt>
                <dd className="tabular font-display text-2xl font-bold leading-tight">
                  {day} <span className="text-base font-medium text-muted">{month}</span>
                </dd>
              </div>

              <div>
                <dt className="text-[11px] uppercase tracking-wide text-faint">Formato</dt>
                <dd className="font-display text-2xl font-bold leading-tight">{final.format}</dd>
              </div>

              {days > 0 && (
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-faint">Faltan</dt>
                  <dd className="tabular font-display text-2xl font-bold leading-tight">
                    {days} <span className="text-base font-medium text-muted">días</span>
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href={VENUE_DIRECTIONS}
                target="_blank"
                rel="noreferrer"
                className="rounded bg-accent-strong px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent"
              >
                Cómo llegar
              </a>
              <p className="text-xs text-faint">
                <span className="font-medium text-fg-soft">{VENUE.fullName}</span>
                <br />
                {VENUE.place}
              </p>
            </div>
          </div>

          {/*
            El mapa de Google, embebido. Con `loading="lazy"`: el iframe hace que
            el navegador del visitante contacte a Google, y así al menos no pasa
            hasta que el mapa entra en pantalla, que en esta página es al final
            de todo.
          */}
          <div className="relative overflow-hidden border-2 border-line bg-raised">
            <iframe
              src={VENUE_EMBED}
              title={`Mapa de la ubicación del ${VENUE.fullName}, en La Plata`}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="h-56 w-full border-0 lg:h-full lg:min-h-[16rem]"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-6">
      <h2 className="text-sm font-medium text-muted">Dónde se sigue</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <a
          href={TOURNAMENT.broadcast.url}
          target="_blank"
          rel="noreferrer"
          className="border-2 border-line bg-surface px-4 py-3 transition-colors hover:border-accent"
        >
          <p className="text-sm font-medium">Transmisión</p>
          <p className="text-xs text-faint">{TOURNAMENT.broadcast.channel}</p>
          <p className="text-xs text-dim">{TOURNAMENT.broadcast.schedule}</p>
        </a>

        <a
          href={TOURNAMENT.discord}
          target="_blank"
          rel="noreferrer"
          className="border-2 border-line bg-surface px-4 py-3 transition-colors hover:border-accent"
        >
          <p className="text-sm font-medium">Discord</p>
          <p className="text-xs text-faint">Esports UNLP</p>
          <p className="text-xs text-dim">canal #busco-rival-lide2</p>
        </a>

        <div className="rounded-lg border border-dashed border-line px-4 py-3">
          <p className="text-sm font-medium text-muted">Battlefy</p>
          <p className="text-xs text-dim">cruces y resultados oficiales</p>
          <p className="text-xs text-dim">el link todavía no salió</p>
        </div>
      </div>
    </section>
  )
}
