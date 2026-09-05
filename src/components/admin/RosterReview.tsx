import { formatPosition, playerName, riotTag } from '@/lib/format'
import type { RosterReviewRow } from '@/types/db'
import { MergeAccount } from './MergeAccount'

/**
 * What the matchday left to sort out, for one team.
 *
 * The nicks and the lanes get typed in during the week from whatever people
 * send in, and the replay is the first hard fact about any of it. Three things
 * can come out of the comparison and each one needs something different:
 *
 *   - a lane that changed is already fixed (the lineup follows the scoreboard),
 *     so this only reports it;
 *   - somebody who appeared without being on the roster may be a substitute or
 *     may be a nick change, and only the second one needs an action;
 *   - a typed-in nick that never played is the other half of that pair.
 *
 * It is only drawn with a session. `roster_review` runs `security_invoker` over
 * tables that have no `anon` policy, so without a login there is nothing to
 * draw anyway - the gate is in the database, not here.
 */
export function RosterReview({ teamId, rows }: { teamId: string; rows: RosterReviewRow[] }) {
  if (rows.length === 0) return null

  const noJugo = rows.filter((row) => row.kind === 'no_jugo')
  const nuevas = rows.filter((row) => row.kind === 'nueva')
  const cambios = rows.filter((row) => row.kind === 'cambio_de_rol')

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium text-muted">Novedades del plantel ({rows.length})</h2>
        <span className="text-xs text-dim">Sólo visible con sesión</span>
      </div>

      <ul className="divide-y divide-line rounded-lg border border-line">
        {noJugo.map((row) => (
          <li key={`no-${row.player_id}`} className="flex flex-col gap-1.5 px-4 py-2.5 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-xs text-faint">
                No jugó
              </span>
              <span className="font-medium">{playerName(row.game_name, row.name)}</span>
              {riotTag(row.game_name, row.tag_line, row.name) && (
                <span className="text-xs text-faint">
                  {riotTag(row.game_name, row.tag_line, row.name)}
                </span>
              )}
              {row.assigned_role && (
                <span className="text-xs text-dim">
                  cargado como {formatPosition(row.assigned_role)}
                </span>
              )}
            </div>

            {row.suggested_player_id && row.suggested_name ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted">
                  ¿Es <span className="text-fg">{row.suggested_name}</span>, que sí jugó?{' '}
                  <span className="text-dim">({motivo(row.suggested_reason)})</span>
                </p>
                <MergeAccount
                  teamId={teamId}
                  placeholderId={row.player_id}
                  realId={row.suggested_player_id}
                  realName={row.suggested_name}
                />
              </div>
            ) : (
              /* Sin candidata no hay nada que confirmar: o de verdad no jugó, o
                 hay más de una posible y elegir por su cuenta sería el error
                 que después no ve nadie. Se saca con "Quitar", más arriba. */
              <p className="text-xs text-dim">
                Si cambió de nick, la cuenta nueva todavía no está en el plantel.
              </p>
            )}
          </li>
        ))}

        {nuevas.map((row) => (
          <li
            key={`nueva-${row.player_id}`}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-2.5 text-sm"
          >
            <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-xs text-accent">
              Apareció
            </span>
            <span className="font-medium">{playerName(row.game_name, row.name)}</span>
            {riotTag(row.game_name, row.tag_line, row.name) && (
              <span className="text-xs text-faint">
                {riotTag(row.game_name, row.tag_line, row.name)}
              </span>
            )}
            <span className="text-xs text-dim">
              jugó {row.games === 1 ? '1 partida' : `${row.games} partidas`}
              {row.played_role ? ` de ${formatPosition(row.played_role)}` : ''}, y no estaba anotada
            </span>
          </li>
        ))}

        {cambios.map((row) => (
          <li
            key={`rol-${row.player_id}`}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-2.5 text-sm"
          >
            <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-xs text-faint">
              Cambió de línea
            </span>
            <span className="font-medium">{playerName(row.game_name, row.name)}</span>
            <span className="text-xs text-dim">
              cargado como {formatPosition(row.assigned_role)} y jugó de{' '}
              {formatPosition(row.played_role)}. Manda lo que jugó.
            </span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-dim">
        Emparejar una cuenta vieja con la nueva le pasa el inscripto, que es lo que decide a qué
        universidad suman esas partidas. No se hace solo: un nick que deja de aparecer y otro que
        empieza puede ser la misma persona con nombre nuevo o un suplente que entró, y desde acá se
        ven iguales.
      </p>
    </section>
  )
}

/** Why the pairing is being proposed, in the words somebody would use. */
function motivo(reason: RosterReviewRow['suggested_reason']): string {
  if (reason === 'mismo_tag') return 'mismo #TAG'
  if (reason === 'unica') return 'es la única que falta y la única que apareció'
  return 'jugó la línea que tenía cargada'
}
