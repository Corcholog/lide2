'use client'

import { useActionState } from 'react'
import { importRosterAction, type RosterActionResult } from '@/app/(app)/admin/roster-actions'

/**
 * Pegar la lista de Riot IDs de una.
 *
 * No pide un formato porque no se sabe en cuál va a llegar: `matchRosterLines`
 * saca el Riot ID de cada línea y busca al inscripto por las palabras que
 * quedan, así que aguanta columnas de más, separadores distintos y "Apellido,
 * Nombre" dado vuelta.
 *
 * Lo que no se pudo repartir se muestra: una importación que dice "cargué 87" y
 * se calla las 26 que no encontró es peor que una que falla, porque nadie va a
 * ir a buscar cuáles faltaron.
 */
export function RosterImport() {
  const [state, formAction, pending] = useActionState<RosterActionResult | null, FormData>(
    importRosterAction,
    null,
  )

  return (
    <form action={formAction} className="flex flex-col gap-3 border-2 border-line bg-surface p-4">
      <div>
        <h2 className="font-display text-sm uppercase tracking-wide">Pegar la lista</h2>
        <p className="mt-1 text-xs text-muted">
          Una persona por línea, con su Riot ID. El nombre puede venir como esté y con las columnas
          que sean: se busca por palabras.
        </p>
      </div>

      <textarea
        name="lista"
        rows={6}
        spellCheck={false}
        placeholder={'Equipo 15, Denis Chang, DenisChang#LAN\nGabriel Pareja; ElGabo#ARG1'}
        className="border-2 border-line-strong bg-raised px-3 py-2 font-mono text-xs outline-none focus:border-accent"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent-strong px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-muted"
        >
          {pending ? 'Importando…' : 'Importar'}
        </button>

        {state?.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p className="text-sm text-ok">
            {state.saved} cargados
            {state.linked ? ` · ${state.linked} emparejados con cuentas que ya jugaron` : ''}
          </p>
        )}
      </div>

      {state?.imported && state.imported.unmatched.length > 0 && (
        <Problem title={`${state.imported.unmatched.length} líneas sin encontrar`}>
          {state.imported.unmatched.map((line, index) => (
            <li key={index} className="truncate">
              {line}
            </li>
          ))}
        </Problem>
      )}

      {state?.imported && state.imported.ambiguous.length > 0 && (
        <Problem title={`${state.imported.ambiguous.length} líneas ambiguas`}>
          {state.imported.ambiguous.map((entry, index) => (
            <li key={index} className="truncate">
              {entry.line} → {entry.names.join(', ')}
            </li>
          ))}
        </Problem>
      )}
    </form>
  )
}

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="border-2 border-danger/40 bg-danger-dim px-3 py-2 text-xs text-danger">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <ul className="mt-2 flex flex-col gap-0.5 font-mono">{children}</ul>
    </details>
  )
}
