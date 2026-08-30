import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { assetVersion, championName, championNames } from '@/lib/ddragon'
import { formatDate, formatDuration, formatGold, formatKda } from '@/lib/format'
import { inicioDelTorneo, TOURNAMENT } from '@/lib/lide2/tournament'
import { resolveTournamentId } from '@/lib/stats/query'
import type { MatchSummaryRow } from '@/types/db'

export const metadata = {
  title: 'Partidas',
  description: 'Todas las partidas jugadas, con su marcador, su duración y su MVP.',
}

export const dynamic = 'force-dynamic'

export default async function MatchesPage() {
  // La lista se ve sin sesión; subir replays, no.
  const user = await getUser()
  const supabase = await createClient()
  /*
   * Sólo las partidas del torneo.
   *
   * Sin el filtro esta lista mostraba `match_summaries` entera, o sea todo
   * .rofl que alguna vez se haya subido: los de prueba, los de otro torneo y
   * los que están esperando que alguien los asigne a su cruce. Nada de eso es
   * la LIDE 2, y en una página pública se lee como si lo fuera.
   *
   * Las que todavía no tienen cruce se ven en /admin/asignar, que es donde
   * hace falta verlas.
   *
   * El cartel de error que tenía esta página se fue al error.tsx del sitio:
   * era el único lugar donde un fallo se veía, y encima mostraba el mensaje
   * crudo de Postgres a cualquiera que entrara.
   */
  const tournamentId = await resolveTournamentId(supabase)

  const matches = tournamentId
    ? rows<MatchSummaryRow>(
        await supabase
          .from('match_summaries')
          .select('*')
          .eq('tournament_id', tournamentId)
          .order('played_at', { ascending: false, nullsFirst: false })
          .limit(100),
        'las partidas',
      )
    : []

  // El listado cruza parches, pero los nombres de los campeones no cambian de
  // uno a otro: alcanza con el catálogo del último.
  const champNames = await championNames(await assetVersion(null))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Partidas</h1>
          <p className="mt-1 text-sm text-muted">
            {matches.length === 0
              ? 'Todavía no hay partidas cargadas.'
              : `${matches.length} partida${matches.length === 1 ? '' : 's'} cargada${matches.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        {user && (
          <Link
            href="/admin/upload"
            className="rounded bg-accent-strong px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent"
          >
            Subir replays
          </Link>
        )}
      </div>

      {matches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
          {/*
            Dos textos porque son dos personas distintas. Con sesión esto es una
            pantalla de trabajo y lo que falta es subir los archivos. Sin sesión
            es alguien que entró a ver el torneo: pedirle que suba un .rofl es
            pedirle algo que no puede hacer, con una palabra que capaz ni conoce.
          */}
          <p className="text-fg-soft">
            {user
              ? 'Subí los .rofl de las partidas jugadas para empezar.'
              : `Todavía no se jugó ninguna partida. La ${TOURNAMENT.name} arranca el ${inicioDelTorneo()}.`}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {matches.map((match) => (
            <li key={match.id}>
              <Link
                href={`/partidas/${match.id}`}
                className="flex items-center gap-4 rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-accent"
              >
                <div className="w-28 shrink-0 text-xs text-faint">
                  <p className="tabular">{formatDate(match.played_at)}</p>
                  <p>
                    {[match.stage_label, match.round_label].filter(Boolean).join(' · ') ||
                      `parche ${match.patch ?? '?'}`}
                  </p>
                </div>

                <div className="flex flex-1 items-center justify-center gap-4">
                  <SideName
                    name={match.blue_team_name}
                    fallback="Lado azul"
                    won={match.winning_side === 100}
                    align="right"
                    accent="aqua"
                  />
                  <div className="tabular shrink-0 text-center">
                    <p className="text-lg font-bold">
                      <span className={match.winning_side === 100 ? 'text-side-blue' : 'text-muted'}>
                        {match.blue_kills ?? 0}
                      </span>
                      <span className="mx-1 text-dim">–</span>
                      <span className={match.winning_side === 200 ? 'text-side-red' : 'text-muted'}>
                        {match.red_kills ?? 0}
                      </span>
                    </p>
                    <p className="text-xs text-faint">{formatDuration(match.game_length_ms)}</p>
                  </div>
                  <SideName
                    name={match.red_team_name}
                    fallback="Lado rojo"
                    won={match.winning_side === 200}
                    align="left"
                    accent="red"
                  />
                </div>

                <div className="hidden w-52 shrink-0 text-right text-xs md:block">
                  {match.mvp_champion ? (
                    <>
                      <p className="text-fg-soft">
                        <span className="text-faint">MVP </span>
                        {match.mvp_name ?? championName(champNames, match.mvp_champion)}
                      </p>
                      <p className="tabular text-faint">
                        {championName(champNames, match.mvp_champion)} ·{' '}
                        {formatKda(match.mvp_kills ?? 0, match.mvp_deaths ?? 0, match.mvp_assists ?? 0)}
                      </p>
                    </>
                  ) : (
                    <p className="text-dim">sin MVP</p>
                  )}
                </div>

                <div className="tabular hidden w-20 shrink-0 text-right text-xs text-faint lg:block">
                  {formatGold((match.blue_gold ?? 0) + (match.red_gold ?? 0))} oro
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SideName({
  name,
  fallback,
  won,
  align,
  accent,
}: {
  name: string | null
  fallback: string
  won: boolean
  align: 'left' | 'right'
  accent: 'aqua' | 'red'
}) {
  const color = won ? (accent === 'aqua' ? 'text-side-blue' : 'text-side-red') : 'text-fg-soft'

  return (
    <p
      className={`min-w-0 flex-1 truncate text-sm font-medium ${color} ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {name ?? <span className="text-dim">{fallback}</span>}
    </p>
  )
}
