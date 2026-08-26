import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { assetVersion, championIcon } from '@/lib/ddragon'
import { formatDate, formatNumber, formatPosition, riotId } from '@/lib/format'
import { GameIcon } from '@/components/match/GameIcon'
import type {
  MatchPlayerScoreRow,
  MatchSummaryRow,
  PlayerChampionRow,
  PlayerTotalsRow,
} from '@/types/db'

export const dynamic = 'force-dynamic'

interface PlayerRow {
  id: string
  puuid: string
  riot_game_name: string | null
  riot_tag_line: string | null
  display_name: string | null
}

/** Una partida del historial: el score del jugador más el contexto del partido. */
interface Game {
  score: MatchPlayerScoreRow
  summary: MatchSummaryRow | undefined
  opponent: string | null
}

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

export default async function PlayerPage({ params }: PageProps<'/players/[id]'>) {
  await requireUser()
  const { id } = await params

  const supabase = await createClient()
  const { data: playerData } = await supabase
    .from('players')
    .select('id,puuid,riot_game_name,riot_tag_line,display_name')
    .eq('id', id)
    .maybeSingle()

  const player = playerData as PlayerRow | null
  if (!player) notFound()

  const [totalsRes, championsRes, scoresRes, teamsRes] = await Promise.all([
    supabase.from('player_totals').select('*').eq('puuid', player.puuid).maybeSingle(),
    supabase.from('player_champion_totals').select('*').eq('puuid', player.puuid),
    supabase.from('match_player_scores').select('*').eq('puuid', player.puuid),
    supabase.from('teams').select('id,name'),
  ])

  const totals = totalsRes.data as PlayerTotalsRow | null
  const champions = ((championsRes.data ?? []) as PlayerChampionRow[]).sort(
    (a, b) => b.games - a.games || b.kda - a.kda,
  )
  const scores = (scoresRes.data ?? []) as MatchPlayerScoreRow[]
  const teamNames = new Map(
    ((teamsRes.data ?? []) as { id: string; name: string }[]).map((team) => [team.id, team.name]),
  )

  // El contexto de cada partida (fecha, etapa, rival) vive en match_summaries.
  const { data: summariesData } = scores.length
    ? await supabase
        .from('match_summaries')
        .select('*')
        .in('id', scores.map((score) => score.match_id))
    : { data: [] }

  const summaries = new Map(
    ((summariesData ?? []) as MatchSummaryRow[]).map((summary) => [summary.id, summary]),
  )

  const games: Game[] = scores
    .map((score) => {
      const summary = summaries.get(score.match_id)
      return {
        score,
        summary,
        // El rival es el equipo del otro lado del que jugó.
        opponent: (score.side === 100 ? summary?.red_team_name : summary?.blue_team_name) ?? null,
      }
    })
    .sort((a, b) => {
      const at = a.summary?.played_at ? new Date(a.summary.played_at).getTime() : 0
      const bt = b.summary?.played_at ? new Date(b.summary.played_at).getTime() : 0
      return bt - at
    })

  const version = await assetVersion(games[0]?.summary?.patch ?? null)
  const name = player.display_name ?? riotId(player.riot_game_name, player.riot_tag_line)
  const teamId = totals?.team_id ?? null
  const position = mainPosition(scores)
  const losses = (totals?.games ?? 0) - (totals?.wins ?? 0)

  return (
    <div className="flex flex-col gap-6">
      <Link href="/players" className="text-sm text-ink-400 transition-colors hover:text-white">
        ← Jugadores
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-400">
            {player.display_name && (
              <span className="text-ink-500">{riotId(player.riot_game_name, player.riot_tag_line)}</span>
            )}
            {teamId ? (
              <Link href={`/teams/${teamId}`} className="transition-colors hover:text-brand-aqua">
                {teamNames.get(teamId) ?? 'Equipo'}
              </Link>
            ) : (
              <span className="text-ink-600">sin equipo</span>
            )}
            {position && <span className="text-ink-500">· {formatPosition(position)}</span>}
          </p>
        </div>

        {totals && totals.mvp_count > 0 && (
          <p className="text-sm text-ink-400">
            <span className="mr-2 rounded bg-brand-red px-1.5 py-0.5 text-xs font-bold text-white">
              {totals.mvp_count}
            </span>
            {totals.mvp_count === 1 ? 'MVP' : 'MVPs'} en {totals.games} partidas
          </p>
        )}
      </header>

      {!totals ? (
        <div className="rounded-lg border border-dashed border-ink-700 px-6 py-14 text-center">
          <p className="text-ink-300">Este jugador todavía no aparece en ninguna partida cargada.</p>
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
            <Stat
              label="KDA"
              value={totals.kda}
              hint={`${totals.avg_kills}/${totals.avg_deaths}/${totals.avg_assists}`}
            />
            <Stat label="Daño" value={formatNumber(totals.avg_damage)} hint="promedio" />
            <Stat label="CS" value={totals.avg_cs} hint="promedio" />
            <Stat label="Visión" value={totals.avg_vision} hint="promedio" />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-ink-400">
              Campeones ({champions.length} {champions.length === 1 ? 'distinto' : 'distintos'})
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {champions.map((champion) => (
                <li
                  key={champion.champion}
                  className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2.5"
                >
                  <GameIcon
                    src={championIcon(version, champion.champion)}
                    alt={champion.champion}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{champion.champion}</p>
                    <p className="tabular text-xs text-ink-500">
                      {champion.games} {champion.games === 1 ? 'partida' : 'partidas'} ·{' '}
                      {champion.wins}V {champion.games - champion.wins}D
                    </p>
                  </div>
                  <div className="tabular shrink-0 text-right">
                    <p className="text-sm">{champion.kda}</p>
                    <p className="text-xs text-ink-600">KDA</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-ink-400">Historial ({games.length})</h2>
            <ul className="flex flex-col gap-2">
              {games.map(({ score, summary, opponent }) => (
                <li key={score.match_player_id}>
                  <Link
                    href={`/matches/${score.match_id}`}
                    className={`flex items-center gap-3 rounded-lg border bg-ink-900 px-3 py-2.5 transition-colors hover:border-ink-600 ${
                      score.win ? 'border-brand-aqua-dim' : 'border-ink-800'
                    }`}
                  >
                    <span
                      className={`w-6 shrink-0 text-center text-xs font-bold ${
                        score.win ? 'text-brand-aqua' : 'text-brand-red-soft'
                      }`}
                    >
                      {score.win ? 'V' : 'D'}
                    </span>

                    <GameIcon
                      src={championIcon(version, score.champion)}
                      alt={score.champion}
                      size={32}
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{score.champion}</p>
                      <p className="truncate text-xs text-ink-500">
                        {opponent ? `vs ${opponent}` : formatPosition(score.position)}
                      </p>
                    </div>

                    <div className="hidden w-28 shrink-0 text-xs text-ink-500 sm:block">
                      <p className="tabular">{formatDate(summary?.played_at ?? null)}</p>
                      <p className="truncate">
                        {[summary?.stage_label, summary?.round_label].filter(Boolean).join(' · ') ||
                          '—'}
                      </p>
                    </div>

                    <div className="tabular w-20 shrink-0 text-right text-sm">
                      <p>
                        {score.kills}/{score.deaths}/{score.assists}
                      </p>
                      <p className="text-xs text-ink-500">{score.kda} KDA</p>
                    </div>

                    <div className="tabular hidden w-20 shrink-0 text-right text-xs text-ink-500 md:block">
                      <p>{formatNumber(score.damage_to_champions)}</p>
                      <p>{score.cs} CS</p>
                    </div>

                    <div className="tabular w-14 shrink-0 text-right">
                      {score.match_rank === 1 ? (
                        <span className="rounded bg-brand-red px-1.5 py-0.5 text-xs font-bold text-white">
                          MVP
                        </span>
                      ) : (
                        <span className="text-xs text-ink-500">{score.score}</span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
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
    <div className="rounded-lg border border-ink-800 bg-ink-900 px-4 py-3">
      <p className="text-xs text-ink-500">{label}</p>
      <p className={`tabular mt-0.5 text-xl font-bold ${accent ? 'text-brand-aqua' : ''}`}>{value}</p>
      <p className="tabular text-xs text-ink-500">{hint}</p>
    </div>
  )
}
