import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { detectTeamsFromMatches } from '@/lib/teams/service'
import { createDetectedTeamsAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function DetectTeamsPage() {
  await requireUser()
  const detected = await detectTeamsFromMatches()
  const named = detected.filter((team) => team.suggestedName).length

  return (
    <div className="flex flex-col gap-6">
      <Link href="/equipos" className="text-sm text-muted transition-colors hover:text-fg">
        ← Equipos
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Equipos detectados</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Se agruparon las alineaciones que comparten 3 o más jugadores, así los suplentes no parten
          un equipo en dos. El nombre sale del número que aparece en los nombres de archivo de{' '}
          <em>todas</em> sus partidas: en «E1vsE4» el propio es el que se repite y el del rival
          cambia. Revisá, corregí los nombres y destildá lo que no quieras crear.
        </p>
        <p className="mt-2 text-sm text-faint">
          {detected.length} equipos · {named} con nombre sugerido
        </p>
      </div>

      {detected.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-6 py-12 text-center text-fg-soft">
          No hay partidas cargadas todavía.
        </p>
      ) : (
        <form action={createDetectedTeamsAction} className="flex flex-col gap-3">
          {detected.map((team, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center"
            >
              <input type="hidden" name={`puuids-${index}`} value={team.puuids.join(',')} />

              <label className="flex shrink-0 items-center gap-3">
                <input
                  type="checkbox"
                  name={`include-${index}`}
                  defaultChecked
                  className="size-4 accent-accent-strong"
                />
                <input
                  name={`name-${index}`}
                  defaultValue={team.suggestedName ?? ''}
                  placeholder="Nombre del equipo"
                  className="w-48 rounded border border-line-strong bg-canvas px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
              </label>

              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg-soft">
                  {team.players
                    .slice(0, 5)
                    .map((player) => player.name)
                    .join(' · ')}
                </p>
                {team.players.length > 5 && (
                  <p className="mt-0.5 text-xs text-faint">
                    suplentes: {team.players.slice(5).map((p) => `${p.name} (${p.appearances})`).join(', ')}
                  </p>
                )}
              </div>

              <span className="tabular shrink-0 text-xs text-faint">
                {team.lineups} partidas
              </span>
            </div>
          ))}

          <button
            type="submit"
            className="self-start rounded bg-accent-strong px-5 py-2.5 font-medium text-white transition-colors hover:bg-accent"
          >
            Crear equipos y revincular partidas
          </button>
        </form>
      )}
    </div>
  )
}
