import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { maybeRow, rows } from '@/lib/supabase/query'
import {
  assetVersion,
  championIcon,
  championLoading,
  championName,
  championNames,
} from '@/lib/ddragon'
import { formatNumber, formatPosition, playerName, riotTag } from '@/lib/format'
import { loadMatchDetails } from '@/lib/matches'
import { GameIcon } from '@/components/match/GameIcon'
import { LIST_COLUMNS, MatchList, type ListMatch } from '@/components/match/MatchList'
import { OpggPlayerLink } from '@/components/tournament/OpggLink'
import { teamPath } from '@/lib/routes'
import type {
  MatchPlayerScoreRow,
  PlayerChampionRow,
  PlayerProfileRow,
  PlayerTotalsRow,
} from '@/types/db'

export const dynamic = 'force-dynamic'

/**
 * How many champions of the pool are drawn as a card; the rest stay as rows.
 *
 * Six because it splits evenly across the three grids the section uses - two,
 * three and six columns - so a full set fills its rows at every width. And
 * because the art is what identifies the player's main picks: past the sixth
 * it is champions played once or twice, and a wall of portraits there is only
 * scrolling.
 */
const FEATURED = 6

/*
 * The shade the card's numbers rest on. Solid at the foot, where the text is,
 * and gone by two thirds of the way up, so the face stays clean. It is built
 * over --canvas like the hero's layers, and the card forces the dark theme, so
 * this always ends in the site's black.
 */
const CARD_SHADE = [
  'linear-gradient(to top',
  'var(--canvas) 0%',
  'color-mix(in srgb, var(--canvas) 90%, transparent) 30%',
  'color-mix(in srgb, var(--canvas) 45%, transparent) 50%',
  'transparent 68%)',
].join(', ')

function percent(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : '—'
}

/** La posición que más jugó; el .rofl no siempre la trae, por eso puede dar null. */
function mainPosition(scores: MatchPlayerScoreRow[]): string | null {
  const counts = new Map<string, number>()
  for (const score of scores) {
    if (score.position) counts.set(score.position, (counts.get(score.position) ?? 0) + 1)
  }

  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return top?.[0] ?? null
}

export async function generateMetadata({ params }: PageProps<'/jugadores/[id]'>) {
  const { id } = await params
  const { data } = await (await createClient())
    .from('player_profiles')
    .select('riot_game_name,display_name')
    .eq('player_id', id)
    .maybeSingle()

  const name = playerName(
    (data?.riot_game_name as string) ?? null,
    (data?.display_name as string) ?? null,
  )
  return { title: name, description: `Partidas, números y pool de campeones de ${name}.` }
}

export default async function PlayerPage({ params }: PageProps<'/jugadores/[id]'>) {
  const { id } = await params

  const supabase = await createClient()
  // De `player_profiles` y no de `players`: esa tabla dejo de ser legible sin
  // sesion porque su clave es el PUUID.
  const { data: playerData } = await supabase
    .from('player_profiles')
    .select('*')
    .eq('player_id', id)
    .maybeSingle()

  const player = playerData as PlayerProfileRow | null
  if (!player) notFound()

  const [totalsRes, championsRes, scoresRes, teamsRes] = await Promise.all([
    supabase.from('player_totals').select('*').eq('player_id', id).maybeSingle(),
    supabase.from('player_champion_totals').select('*').eq('player_id', id),
    supabase.from('match_player_scores').select('*').eq('player_id', id),
    supabase.from('teams').select('id,name'),
  ])

  const totals = maybeRow<PlayerTotalsRow>(totalsRes, 'the player totals')
  const champions = rows<PlayerChampionRow>(championsRes, 'the champion pool').sort(
    (a, b) => b.games - a.games || b.kda - a.kda,
  )
  const scores = rows<MatchPlayerScoreRow>(scoresRes, 'the player matches')
  const teamNames = new Map(
    rows<{ id: string; name: string }>(teamsRes, 'the teams').map((team) => [team.id, team.name]),
  )

  /*
    Las partidas que jugó, pedidas como las pide /partidas: las mismas columnas
    y el mismo detalle, porque abajo se dibujan con la misma fila. El orden lo
    hace Postgres y no un sort acá, que es donde estaba.
  */
  const matches = scores.length
    ? rows<ListMatch>(
        await supabase
          .from('match_summaries')
          .select(LIST_COLUMNS)
          .in(
            'id',
            scores.map((score) => score.match_id),
          )
          .order('played_at', { ascending: false, nullsFirst: false }),
        'las partidas del jugador',
      )
    : []

  const detalle = await loadMatchDetails(
    supabase,
    matches.map((match) => match.id),
  )

  /*
    LO QUE HACE POR MINUTO, y no por partida.

    Daño, CS y visión crecían con lo que duraba el partido: 12.000 de daño en
    una de 40 minutos es la mitad de trabajo que 12.000 en una de 20, y
    promediados por partida los dos jugadores salían iguales. El de un equipo
    que cierra rápido quedaba siempre abajo, y eso no es cómo jugó sino cuánto
    duró.

    SE DIVIDE EN CADA PARTIDA Y RECIÉN DESPUÉS SE PROMEDIA, que no es lo mismo
    que dividir los totales: así las dos partidas pesan igual, y la larga no
    arrastra el número hacia ella por el solo hecho de haber durado más.

    El daño y el CS por minuto ya los calcula la base partida por partida
    —`dpm` y `csm` de match_player_scores— y son los mismos que promedia
    player_phase_totals para la tabla de jugadores: se usan esos y no una cuenta
    propia, porque el mismo jugador tiene que dar el mismo número acá y allá. La
    visión es la única que la base no trae por minuto.

    El piso de un minuto es el de la base (0010 divide por
    `greatest(game_length_ms / 60000, 1)`): sin él, un remake de treinta
    segundos multiplicaría por dos todo lo que pasó en él.
  */
  // Only the matches that count. One annulled by the organizers is still in
  // the history below - it was played - but its numbers are not this player's
  // record, the same as in every table; leaving it out of `minutes` is what
  // leaves it out of `rated`, and so out of every average here.
  const minutes = new Map(
    matches
      .filter((match) => !match.annulled)
      .map((match) => [match.id, Math.max((match.game_length_ms ?? 0) / 60000, 1)]),
  )

  const rated = scores.filter((score) => minutes.has(score.match_id))
  const mean = (of: (score: MatchPlayerScoreRow) => number) =>
    rated.length > 0 ? rated.reduce((total, score) => total + of(score), 0) / rated.length : 0

  const dpm = mean((score) => Number(score.dpm))
  const csm = mean((score) => Number(score.csm))
  const vpm = mean((score) => score.vision_score / minutes.get(score.match_id)!)
  const version = await assetVersion(matches[0]?.patch ?? null)
  const champNames = await championNames(version)
  const name = playerName(player.riot_game_name, player.display_name)
  // El Riot ID que va debajo del nombre. Ver el comentario en el header.
  const handle = riotTag(player.riot_game_name, player.riot_tag_line, player.display_name)
  const teamId = totals?.team_id ?? null
  const position = mainPosition(rated)
  const losses = (totals?.games ?? 0) - (totals?.wins ?? 0)

  return (
    <div className="flex flex-col gap-6">
      {/*
        Vuelve a las tablas y no a un listado de jugadores, que ya no existe:
        esa tabla es de donde se sale a mirar una ficha, y es la que además
        recuerda el recorte de fecha y grupo que se estaba mirando.
      */}
      <Link
        href="/estadisticas/tablas"
        className="text-sm text-muted transition-colors hover:text-fg"
      >
        ← Estadísticas
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {/*
              El Riot ID de la cuenta. Cuando el nombre de arriba es un alias
              del panel va entero —el tag no se le pega a un alias— y si no,
              sólo el `#TAG`, que es lo que le falta al nick para ser único.
            */}
            {handle && <span className="text-faint">{handle}</span>}
            {teamId ? (
              <Link href={teamPath(teamId)} className="transition-colors hover:text-accent">
                {teamNames.get(teamId) ?? 'Equipo'}
              </Link>
            ) : (
              <span className="text-dim">sin equipo</span>
            )}
            {position && <span className="text-faint">· {formatPosition(position)}</span>}
          </p>
        </div>

        {/*
          El rango, el pool y las rankeds de la cuenta: lo mismo que la ficha de
          un equipo linkea para los cinco, acá para uno. Va en el mismo rincón
          del encabezado que allá —a la derecha, enfrentado al nombre— porque es
          la misma puerta: quien aprendió qué hace el cuadrado azul en un lado no
          tiene que volver a aprenderlo en el otro.
        */}
        <div className="flex items-center gap-3">
          <OpggPlayerLink
            account={{ gameName: player.riot_game_name, tagLine: player.riot_tag_line }}
          />
          {totals && totals.mvp_count > 0 && (
            <p className="text-sm text-muted">
              <span className="mr-2 rounded bg-accent-strong px-1.5 py-0.5 text-xs font-bold text-white">
                {totals.mvp_count}
              </span>
              {totals.mvp_count === 1 ? 'MVP' : 'MVPs'} en {totals.games} partidas
            </p>
          )}
        </div>
      </header>

      {!totals ? (
        <div className="rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
          <p className="text-fg-soft">Este jugador todavía no jugó ninguna partida del torneo.</p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Partidas" value={totals.games} hint={`${totals.wins}V ${losses}D`} />
            <Stat
              label="Victorias"
              value={percent(totals.wins, totals.games)}
              hint="de las jugadas"
              accent
            />
            {/*
              El KDA es del recorte entero —todas las kills y asistencias sobre
              todas las muertes— y la línea de abajo es lo que hace en una
              partida. Los tres que siguen son por minuto: ver arriba.
            */}
            <Stat
              label="KDA"
              value={totals.kda}
              hint={`${totals.avg_kills}/${totals.avg_deaths}/${totals.avg_assists} por partida`}
            />
            <Stat label="Daño" value={formatNumber(Math.round(dpm))} hint="por minuto" />
            <Stat label="CS" value={csm.toFixed(1)} hint="por minuto" />
            <Stat label="Visión" value={vpm.toFixed(2)} hint="por minuto" />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted">
              Campeones ({champions.length} {champions.length === 1 ? 'distinto' : 'distintos'})
            </h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {champions.slice(0, FEATURED).map((champion) => (
                <ChampionCard
                  key={champion.champion}
                  champion={champion}
                  name={championName(champNames, champion.champion)}
                />
              ))}
            </ul>
            {champions.length > FEATURED && (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {champions.slice(FEATURED).map((champion) => (
                  <li
                    key={champion.champion}
                    className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5"
                  >
                    <GameIcon
                      src={championIcon(version, champion.champion)}
                      alt={championName(champNames, champion.champion)}
                      size={36}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {championName(champNames, champion.champion)}
                      </p>
                      <p className="tabular text-xs text-faint">
                        {champion.games} {champion.games === 1 ? 'partida' : 'partidas'} ·{' '}
                        {champion.wins}V {champion.games - champion.wins}D
                      </p>
                    </div>
                    <div className="tabular shrink-0 text-right">
                      <p className="text-sm">{champion.kda}</p>
                      <p className="text-xs text-dim">KDA</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted">Historial ({matches.length})</h2>
            {/*
              LAS MISMAS FILAS QUE /partidas, con el anillo rojo sobre el
              campeón que jugó. Acá había un listado propio —V/D, campeón,
              rival, KDA, daño— y era el tercero de la misma cosa en el sitio.
              Lo que ese decía de más no se perdió: la línea completa del
              jugador está en el detalle que la fila despliega, con su MVP, su
              CS y su oro, y de paso están los otros nueve.

              El anillo es lo que reemplaza al ícono suelto que había a la
              izquierda: en una fila de diez campeones hay que poder decir cuál
              es el suyo sin abrir nada.
            */}
            <MatchList
              matches={matches}
              playersByMatch={detalle.playersByMatch}
              statsByMatch={detalle.statsByMatch}
              version={version}
              championNames={champNames}
              player={id}
            />
          </section>
        </>
      )}
    </div>
  )
}

/**
 * One of the player's main champions, over its loading screen art.
 *
 * It carries the same three facts as the rows below - games, record and KDA -
 * so the card changes how the pool looks and not what it says.
 *
 * Always dark, like the hero: the text sits on the painting and not on the
 * site's background, and in the light theme it would stop reading.
 */
function ChampionCard({ champion, name }: { champion: PlayerChampionRow; name: string }) {
  return (
    /*
      Cut to 3:4 from the 11:20 of the original, which at six across was too
      tall to be a summary, and anchored at the top. Riot paints these for the
      loading screen, where the name and the frame sit over the lower part: the
      champion is composed in the upper band and the foot is left for text. So
      what the cut loses is what the game already covers, and the numbers land
      where the art expects something written.

      The art is a background and not an <img> because of how each one fails.
      When the CDN has no art yet - a champion released this week - a broken
      <img> drops its aspect ratio and draws the broken-image glyph, so a card
      alone on its row would collapse to the height of its text. A background
      that does not load leaves the grey of `bg-raised` at full size, with the
      name still on it. It is decorative either way: the name is written on
      the card.
    */
    <li
      data-theme="dark"
      className="relative aspect-[3/4] border-2 border-line bg-raised bg-cover bg-top text-fg"
      style={{ backgroundImage: `${CARD_SHADE}, url("${championLoading(champion.champion)}")` }}
    >
      <div className="absolute inset-x-0 bottom-0 px-3 pb-2.5">
        <p className="truncate font-display text-sm uppercase leading-tight" title={name}>
          {name}
        </p>
        <p className="tabular mt-0.5 truncate text-xs text-fg-soft">
          {champion.games} {champion.games === 1 ? 'partida' : 'partidas'} · {champion.wins}V{' '}
          {champion.games - champion.wins}D
        </p>
        <p className="tabular text-sm">
          <span className="font-bold">{champion.kda}</span>{' '}
          <span className="text-xs text-fg-soft">KDA</span>
        </p>
      </div>
    </li>
  )
}

function Stat({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string
  value: string | number
  hint: string
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-xs text-faint">{label}</p>
      <p className={`tabular mt-0.5 text-xl font-bold ${accent ? 'text-accent' : ''}`}>{value}</p>
      <p className="tabular text-xs text-faint">{hint}</p>
    </div>
  )
}
