import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { resolveTournamentId } from '@/lib/stats/query'
import { loadTeamPlayers } from '@/lib/lide2/champion-roster'
import { FINAL_ROUND } from '@/lib/lide2/winner'
import { withNames, type SpotlightUniversity } from '@/components/home/ChampionSpotlight'
import { PreviewChampion, type Finalist } from '@/components/admin/PreviewChampion'
import type { GroupStandingRow, SeriesResultRow } from '@/types/db'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vista previa del campeón' }

/**
 * The champion section with each finalist as the winner, to check it before the
 * final is decided. Reads the real final, so it only works once both
 * semifinals are played. The score is a placeholder.
 */
export default async function PreviewChampionPage() {
  await requireUser()

  const supabase = await createClient()
  const tournamentId = await resolveTournamentId(supabase)

  const names = rows<SpotlightUniversity>(
    await supabase.from('universities').select('tag,name'),
    'the universities',
  )

  const [seriesRes, standingsRes] = tournamentId
    ? await Promise.all([
        supabase.from('series_results').select('*').eq('tournament_id', tournamentId),
        supabase.from('group_standings').select('*').eq('tournament_id', tournamentId),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ]

  const final = rows<SeriesResultRow>(seriesRes, 'the bracket').find(
    (item) => item.round === FINAL_ROUND,
  )
  const standings = rows<GroupStandingRow>(standingsRes, 'the standings table')
  const tags = new Map(standings.map((row) => [row.team_id, row.university_tags]))

  const sides = [
    { id: final?.team_a_id, name: final?.team_a_name },
    { id: final?.team_b_id, name: final?.team_b_name },
  ]

  let finalists: [Finalist, Finalist] | null = null

  if (tournamentId && sides[0].id && sides[0].name && sides[1].id && sides[1].name) {
    const [a, b] = await Promise.all(
      sides.map(async (side) => ({
        champion: { teamId: side.id!, name: side.name!, universities: withNames(tags.get(side.id!), names) },
        players: await loadTeamPlayers(supabase, tournamentId, side.id!),
      })),
    )
    finalists = [a, b]
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl uppercase tracking-tight">Vista previa del campeón</h1>
      {finalists ? (
        <PreviewChampion finalists={finalists} />
      ) : (
        <p className="text-sm text-fg-soft">
          La gran final todavía no tiene sus dos equipos: faltan semifinales por jugar.
        </p>
      )}
    </div>
  )
}
