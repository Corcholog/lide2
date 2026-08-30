import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { maybeRow, rows } from '@/lib/supabase/query'
import { assetVersion, championNames, summonerSpellNames } from '@/lib/ddragon'
import { formatDate, formatDuration, ROLES } from '@/lib/format'
import { Scoreboard, type ScoreboardPlayer } from '@/components/match/Scoreboard'
import type { MatchPlayerScoreRow, MatchSummaryRow, MatchTeamStatsRow } from '@/types/db'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps<'/partidas/[id]'>) {
  const { id } = await params
  const { data } = await (await createClient())
    .from('match_summaries')
    .select('blue_team_name,red_team_name,round_label')
    .eq('id', id)
    .maybeSingle()

  if (!data) return { title: 'Partida' }

  const cruce = `${(data.blue_team_name as string) ?? 'Azul'} vs ${(data.red_team_name as string) ?? 'Rojo'}`
  return {
    title: cruce,
    description: [data.round_label, `Scoreboard completo de ${cruce}.`].filter(Boolean).join(' · '),
  }
}

export default async function MatchPage({ params }: PageProps<'/partidas/[id]'>) {
  // El scoreboard se ve sin sesión. El .rofl no: el bucket es privado y el link
  // de descarga lo rechaza igual, así que mostrarlo sólo servía para que un
  // visitante hiciera clic y terminara en el login.
  const user = await getUser()
  const { id } = await params

  const supabase = await createClient()
  // Los items y los hechizos venian de una cuarta consulta a `match_players`.
  // Esa tabla dejo de ser legible sin sesion (tiene el PUUID y el JSON crudo) y
  // ahora esas tres columnas viajan en el propio scoreboard.
  const [summaryRes, teamsRes, scoresRes] = await Promise.all([
    supabase.from('match_summaries').select('*').eq('id', id).maybeSingle(),
    supabase.from('match_team_stats').select('*').eq('match_id', id),
    supabase.from('match_player_scores').select('*').eq('match_id', id),
  ])

  const summary = maybeRow<MatchSummaryRow>(summaryRes, 'la partida')
  if (!summary) notFound()

  const teamStats = rows<MatchTeamStatsRow>(teamsRes, 'los totales por equipo')
  const scores = rows<MatchPlayerScoreRow>(scoresRes, 'el scoreboard')

  const version = await assetVersion(summary.patch)
  const [spellNames, champNames] = await Promise.all([
    summonerSpellNames(version),
    championNames(version),
  ])

  const players: ScoreboardPlayer[] = scores.map((score) => {
    return {
      matchPlayerId: score.match_player_id,
      side: score.side,
      champion: score.champion,
      position: score.position,
      riotGameName: score.riot_game_name,
      riotTagLine: score.riot_tag_line,
      kills: score.kills,
      deaths: score.deaths,
      assists: score.assists,
      kda: Number(score.kda),
      killParticipation: Number(score.kill_participation),
      cs: score.cs,
      csm: Number(score.csm),
      goldEarned: score.gold_earned,
      damageToChampions: score.damage_to_champions,
      damageShare: Number(score.damage_share),
      visionScore: score.vision_score,
      items: score.items ?? [],
      summonerSpell1: score.summoner_spell_1,
      summonerSpell2: score.summoner_spell_2,
      isMvp: score.match_rank === 1,
    }
  })

  const maxDamage = Math.max(...players.map((p) => p.damageToChampions), 1)
  const bySide = (side: 100 | 200) =>
    players
      .filter((p) => p.side === side)
      .sort((a, b) => POSITION_ORDER.indexOf(a.position ?? '') - POSITION_ORDER.indexOf(b.position ?? ''))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="text-sm text-muted transition-colors hover:text-fg">
          ← Partidas
        </Link>
        {user && (
          <div className="flex gap-2">
            <Link
              href={`/partidas/${id}/card`}
              className="rounded border border-line-strong px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
            >
              Card para Instagram
            </Link>
            <a
              href={`/api/matches/${id}/download`}
              className="rounded border border-line-strong px-3 py-1.5 text-sm transition-colors hover:border-accent"
            >
              Descargar .rofl
            </a>
          </div>
        )}
      </div>

      <header className="rounded-lg border border-line bg-surface px-6 py-5">
        <div className="flex items-center justify-center gap-6">
          <p
            className={`flex-1 truncate text-right text-lg font-semibold ${
              summary.winning_side === 100 ? 'text-side-blue' : 'text-muted'
            }`}
          >
            {summary.blue_team_name ?? 'Lado azul'}
          </p>
          <div className="tabular shrink-0 text-center">
            <p className="text-3xl font-bold">
              <span className={summary.winning_side === 100 ? 'text-side-blue' : 'text-faint'}>
                {summary.blue_kills ?? 0}
              </span>
              <span className="mx-2 text-dim">–</span>
              <span className={summary.winning_side === 200 ? 'text-side-red' : 'text-faint'}>
                {summary.red_kills ?? 0}
              </span>
            </p>
          </div>
          <p
            className={`flex-1 truncate text-left text-lg font-semibold ${
              summary.winning_side === 200 ? 'text-side-red' : 'text-muted'
            }`}
          >
            {summary.red_team_name ?? 'Lado rojo'}
          </p>
        </div>

        <p className="mt-3 text-center text-xs text-faint">
          {[
            formatDate(summary.played_at),
            summary.stage_label,
            summary.round_label,
            `${formatDuration(summary.game_length_ms)} min`,
            `parche ${summary.patch ?? '?'}`,
            summary.ended_in_surrender ? 'terminó por rendición' : null,
            summary.file_count > 1 ? `${summary.file_count} archivos de prueba` : null,
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </p>
      </header>

      <Scoreboard
        side={100}
        teamName={summary.blue_team_name}
        players={bySide(100)}
        stats={teamStats.find((t) => t.side === 100)}
        version={version}
        spellNames={spellNames}
        championNames={champNames}
        maxDamage={maxDamage}
      />

      <Scoreboard
        side={200}
        teamName={summary.red_team_name}
        players={bySide(200)}
        stats={teamStats.find((t) => t.side === 200)}
        version={version}
        spellNames={spellNames}
        championNames={champNames}
        maxDamage={maxDamage}
      />
    </div>
  )
}

const POSITION_ORDER: readonly string[] = ROLES
