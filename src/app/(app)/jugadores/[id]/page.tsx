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
import { formatNumber, formatPercent, formatPosition, playerName, riotTag } from '@/lib/format'
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
 * How many of the most played champions are drawn as cards; the rest are rows.
 * Six fills complete rows in the 2, 3 and 6 column grids.
 */
const FEATURED = 6

/*
 * Shade under the card's text: solid at the bottom, gone two thirds of the way
 * up. Built on --canvas; the card forces the dark theme.
 */
const CARD_SHADE = [
  'linear-gradient(to top',
  'var(--canvas) 0%',
  'color-mix(in srgb, var(--canvas) 90%, transparent) 30%',
  'color-mix(in srgb, var(--canvas) 45%, transparent) 50%',
  'transparent 68%)',
].join(', ')

function percent(part: number, total: number): string {
  return total > 0 ? formatPercent(part / total) : '—'
}

/** The position played most, or null (the .rofl does not always include it). */
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
  // `player_profiles`, not `players`, which is not readable without a session
  // because it holds the PUUID.
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

  // The player's matches, with the same columns and detail as /partidas since
  // they are drawn with the same rows. Ordered by Postgres.
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
        'the player matches',
      )
    : []

  const detalle = await loadMatchDetails(
    supabase,
    matches.map((match) => match.id),
  )

  /*
    Damage, CS and vision are per minute, so longer games do not inflate them.
    Each game is divided first and then averaged, so every game weighs the same.
    `dpm` and `csm` come from match_player_scores, the same values the players
    table averages, so both pages agree; vision is divided here. Minutes have a
    floor of one, like migration 0010, so a remake does not blow up the rates.

    Annulled matches stay in the history but are left out of `minutes`, and so
    out of every average here, as in the tables.
  */
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
  // The Riot ID shown under the name (see the header).
  const handle = riotTag(player.riot_game_name, player.riot_tag_line, player.display_name)
  const teamId = totals?.team_id ?? null
  const position = mainPosition(rated)
  const losses = (totals?.games ?? 0) - (totals?.wins ?? 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Back to the tables, which remember the matchday and group filters. */}
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
              The account's Riot ID: the full ID when the name above is an alias,
              otherwise just the `#TAG`.
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
          Link to the account on op.gg, in the same header position as the team
          page's multisearch link.
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
              KDA over all games (kills and assists over deaths); the line below is
              per game. The next three are per minute (see above).
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
              Same rows as /partidas, with a red ring on the champion this player
              used. The player's full line is in the expanded detail.
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
 * One of the player's main champions, over its loading screen art, with games,
 * record and KDA. Always dark, since the text sits on the artwork.
 */
function ChampionCard({ champion, name }: { champion: PlayerChampionRow; name: string }) {
  return (
    /*
      Cropped to 3:4 and anchored at the top, where the loading art places the
      champion; the text goes where the game draws its own frame.

      The art is a CSS background rather than an <img>: if the CDN has no art
      yet, a broken <img> loses its aspect ratio, while a failed background
      leaves a full-size grey card that still shows the name.
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
