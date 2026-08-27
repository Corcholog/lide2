import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { assetVersion, championIcon } from '@/lib/ddragon'
import { formatGold, formatNumber, playerName } from '@/lib/format'
import { MatchCard, type CardHighlight, type MatchCardData } from '@/components/card/MatchCard'
import type { MatchPlayerScoreRow, MatchSummaryRow } from '@/types/db'

export const dynamic = 'force-dynamic'

export default async function MatchCardPage({ params }: PageProps<'/partidas/[id]/card'>) {
  const { id } = await params

  const supabase = await createClient()
  const [summaryRes, scoresRes] = await Promise.all([
    supabase.from('match_summaries').select('*').eq('id', id).maybeSingle(),
    supabase.from('match_player_scores').select('*').eq('match_id', id),
  ])

  const summary = summaryRes.data as MatchSummaryRow | null
  if (!summary) notFound()

  const scores = (scoresRes.data ?? []) as MatchPlayerScoreRow[]
  const version = await assetVersion(summary.patch)

  const best = (pick: (row: MatchPlayerScoreRow) => number) =>
    scores.reduce<MatchPlayerScoreRow | null>(
      (top, row) => (!top || pick(row) > pick(top) ? row : top),
      null,
    )

  const highlight = (
    label: string,
    row: MatchPlayerScoreRow | null,
    value: (row: MatchPlayerScoreRow) => string,
  ): CardHighlight | null =>
    row
      ? {
          label,
          value: value(row),
          player: playerName(row.riot_game_name),
          champion: row.champion,
          championIcon: championIcon(version, row.champion),
        }
      : null

  const highlights = [
    highlight('Más daño', best((r) => r.damage_to_champions), (r) =>
      formatNumber(r.damage_to_champions),
    ),
    highlight('Más oro', best((r) => r.gold_earned), (r) => formatGold(r.gold_earned)),
    highlight('Más visión', best((r) => r.vision_score), (r) => String(r.vision_score)),
  ].filter((h): h is CardHighlight => h !== null)

  const mvpRow = scores.find((row) => row.match_rank === 1) ?? null

  const data: MatchCardData = {
    blueName: summary.blue_team_name ?? 'Lado azul',
    redName: summary.red_team_name ?? 'Lado rojo',
    blueKills: summary.blue_kills ?? 0,
    redKills: summary.red_kills ?? 0,
    blueGold: summary.blue_gold ?? 0,
    redGold: summary.red_gold ?? 0,
    winningSide: summary.winning_side,
    durationMs: summary.game_length_ms,
    playedAt: summary.played_at,
    stageLabel: summary.stage_label,
    roundLabel: summary.round_label,
    patch: summary.patch,
    mvp: mvpRow
      ? {
          name: playerName(mvpRow.riot_game_name),
          champion: mvpRow.champion,
          championIcon: championIcon(version, mvpRow.champion),
          kills: mvpRow.kills,
          deaths: mvpRow.deaths,
          assists: mvpRow.assists,
          damage: mvpRow.damage_to_champions,
          gold: mvpRow.gold_earned,
        }
      : null,
    highlights,
  }

  const fileName = `lide-${summary.played_at?.slice(0, 10) ?? 'partida'}-${data.blueName}-vs-${data.redName}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/partidas/${id}`}
        className="text-sm text-muted transition-colors hover:text-fg"
      >
        ← Volver a la partida
      </Link>

      <MatchCard data={data} fileName={`${fileName}.png`} />
    </div>
  )
}
