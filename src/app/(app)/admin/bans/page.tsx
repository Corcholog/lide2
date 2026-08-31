import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rows } from '@/lib/supabase/query'
import { assetVersion, championCatalog, championName, championNames } from '@/lib/ddragon'
import { formatDate } from '@/lib/format'
import { resolveTournamentId } from '@/lib/stats/query'
import { CargarBans } from '@/components/admin/CargarBans'
import type { MatchBanRow, MatchSummaryRow } from '@/types/db'

export const metadata = { title: 'Bans' }

export const dynamic = 'force-dynamic'

/**
 * Cargar el draft de cada partida.
 *
 * Es el único paso del panel que no sale de un archivo: el .rofl guarda el
 * scoreboard del final y no el draft, así que los diez baneos hay que mirarlos
 * de la transmisión o del historial del cliente y escribirlos. Es tedioso, y
 * por eso vale aclarar para qué sirve: sin esto la tabla de campeones tiene
 * pick rate y winrate, pero ban rate y presencia quedan vacías.
 *
 * Por defecto se listan las que están sin cargar, que es lo que queda por
 * hacer; con `?estado=todas` aparecen todas, para corregir una que salió mal.
 */
export default async function BansPage({ searchParams }: PageProps<'/admin/bans'>) {
  await requireUser()

  const supabase = await createClient()
  const tournamentId = await resolveTournamentId(supabase)
  const todas = (await searchParams).estado === 'todas'

  const partidas = tournamentId
    ? rows<MatchSummaryRow>(
        await (todas
          ? supabase
              .from('match_summaries')
              .select('*')
              .eq('tournament_id', tournamentId)
              .order('played_at', { ascending: false, nullsFirst: false })
              .limit(60)
          : supabase
              .from('match_summaries')
              .select('*')
              .eq('tournament_id', tournamentId)
              .eq('ban_count', 0)
              .order('played_at', { ascending: false, nullsFirst: false })
              .limit(60)),
        'las partidas',
      )
    : []

  // Sólo hace falta traer los bans si se están mostrando las cargadas: las
  // pendientes, por definición, no tienen ninguno.
  const guardados =
    todas && partidas.length > 0
      ? rows<MatchBanRow>(
          await supabase
            .from('match_bans')
            .select('*')
            .in(
              'match_id',
              partidas.map((p) => p.id),
            ),
          'los bans cargados',
        )
      : []

  const version = await assetVersion(null)
  const [catalogo, names] = await Promise.all([championCatalog(version), championNames(version)])

  // Los bans de cada partida, indexados como los espera el formulario.
  const porPartida = new Map<string, Record<string, string>>()
  for (const ban of guardados) {
    const actual = porPartida.get(ban.match_id) ?? {}
    actual[`${ban.side}-${ban.order_index}`] = championName(names, ban.champion)
    porPartida.set(ban.match_id, actual)
  }

  const conDraft = partidas.filter((p) => p.ban_count > 0).length
  const totalBans = partidas.reduce((suma, p) => suma + p.ban_count, 0)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight">Bans</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Los diez baneos de cada partida, a mano: el .rofl no guarda el draft. Con esto la
            tabla de campeones puede calcular ban rate y presencia; sin esto, esas dos columnas
            ni se dibujan.
          </p>
        </div>
        <nav aria-label="Filtro" className="flex gap-1">
          <Link
            href="/admin/bans"
            aria-current={!todas ? 'true' : undefined}
            className={`border-2 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
              !todas
                ? 'border-accent bg-accent-dim text-accent'
                : 'border-line text-muted hover:border-line-strong hover:text-accent'
            }`}
          >
            Sin draft
          </Link>
          <Link
            href="/admin/bans?estado=todas"
            aria-current={todas ? 'true' : undefined}
            className={`border-2 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
              todas
                ? 'border-accent bg-accent-dim text-accent'
                : 'border-line text-muted hover:border-line-strong hover:text-accent'
            }`}
          >
            Todas
          </Link>
        </nav>
      </header>

      <dl className="grid grid-cols-3 gap-0.5 bg-line">
        <Stat
          label={todas ? 'Partidas' : 'Sin draft'}
          value={partidas.length}
          tone={!todas && partidas.length > 0}
        />
        <Stat label="Con draft" value={conDraft} />
        <Stat label="Bans cargados" value={totalBans} />
      </dl>

      {!tournamentId && (
        <p className="border-2 border-danger/40 bg-danger-dim px-4 py-3 text-sm text-danger">
          El torneo no está cargado en la base. Corré <code>npm run seed:lide2</code>.
        </p>
      )}

      {/*
        UN SOLO datalist para los diez campos de cada formulario y para todas
        las partidas de la página. Uno por campo serían 170 opciones × 10 × 60
        partidas; así son 170 nodos en total.
      */}
      <datalist id="campeones">
        {catalogo.map((champ) => (
          <option key={champ.key} value={champ.name} />
        ))}
      </datalist>

      {partidas.length === 0 ? (
        <p className="border-2 border-dashed border-line-strong px-6 py-10 text-center text-sm text-fg-soft">
          {todas
            ? 'Todavía no hay partidas cargadas.'
            : 'Todas las partidas tienen su draft cargado.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {partidas.map((partida) => {
            const azul = partida.blue_team_name ?? 'Lado azul'
            const rojo = partida.red_team_name ?? 'Lado rojo'

            return (
              <li key={partida.id}>
                <details className="border-2 border-line bg-surface">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
                    <span className="text-side-blue">{azul}</span>
                    <span className="text-dim">vs</span>
                    <span className="text-side-red">{rojo}</span>

                    <span className="text-xs text-faint">
                      {[partida.group_label, partida.matchday && `Fecha ${partida.matchday}`]
                        .filter(Boolean)
                        .join(' · ') || formatDate(partida.played_at)}
                    </span>

                    <span
                      className={`ml-auto text-xs font-medium ${
                        partida.ban_count > 0 ? 'text-ok' : 'text-accent'
                      }`}
                    >
                      {partida.ban_count > 0 ? `${partida.ban_count} bans` : 'sin draft'}
                    </span>
                  </summary>

                  <div className="border-t-2 border-line px-4 py-4">
                    <CargarBans
                      matchId={partida.id}
                      bans={porPartida.get(partida.id) ?? {}}
                      equipos={{ 100: azul, 200: rojo }}
                    />
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className={`font-display text-2xl tabular-nums ${tone ? 'text-accent' : 'text-fg'}`}>
        {value}
      </dd>
    </div>
  )
}
