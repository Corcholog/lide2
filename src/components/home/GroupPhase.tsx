import Link from 'next/link'
import { teamPath } from '@/lib/routes'
import { UniversityLogo } from '@/components/tournament/UniversityLogo'
import type { GroupStandingRow } from '@/types/db'

/**
 * The group phase: four tables, two qualifying places each. The view returns
 * rows already ordered with the rulebook's tiebreaks; this only groups them.
 */
export function GroupPhase({
  standings,
  finished = false,
}: {
  standings: GroupStandingRow[]
  /** Whether the phase is over, which is all that changes is how it is worded. */
  finished?: boolean
}) {
  const groups = byGroup(standings)

  return (
    <section id="grupos" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 className="border-b-4 border-accent pb-1 text-lg uppercase tracking-tight">
          Fase de grupos
        </h2>
        <p className="text-xs text-faint">
          Todos contra todos · {finished ? 'clasificaron' : 'clasifican'} los dos primeros de cada
          grupo
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="border-2 border-dashed border-line-strong px-6 py-10 text-center text-sm text-fg-soft">
          Todavía no hay equipos asignados a los grupos.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((group) => (
            <GroupTable key={group.label} label={group.label} rows={group.rows} />
          ))}
        </div>
      )}
    </section>
  )
}

/** Groups the rows by group, in A-D order. */
function byGroup(standings: GroupStandingRow[]): { label: string; rows: GroupStandingRow[] }[] {
  const groups = new Map<string, GroupStandingRow[]>()
  for (const row of standings) {
    groups.set(row.group_label, [...(groups.get(row.group_label) ?? []), row])
  }

  return [...groups.entries()]
    .map(([label, list]) => ({ label, rows: list.sort((a, b) => a.position - b.position) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function GroupTable({ label, rows }: { label: string; rows: GroupStandingRow[] }) {
  const played = rows.reduce((total, row) => total + row.games, 0)

  return (
    <div className="overflow-hidden border-2 border-line bg-surface shadow-hard">
      <div className="flex items-baseline justify-between border-b border-line bg-surface px-4 py-2.5">
        <h3 className="font-bold">{label}</h3>
        <span className="text-xs text-faint">
          {rows.length} equipos · {played === 0 ? 'sin jugar' : `${played / 2} partidas`}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead className="text-xs text-faint">
          <tr className="border-b border-line">
            <th className="w-8 px-2 py-2 text-right font-medium">#</th>
            <th className="px-2 py-2 text-left font-medium">Equipo</th>
            <th className="w-14 px-2 py-2 text-right font-medium">G-P</th>
            {/*
              Kill difference (kills scored minus conceded). It does not break
              ties: since 0028 the order follows the rulebook's head to head
              (2.2). The heading wraps to keep the column narrow for team names.
            */}
            <th className="w-16 px-2 py-2 text-right font-medium">Dif. de kills</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <StandingsRow key={row.team_id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StandingsRow({ row }: { row: GroupStandingRow }) {
  const qualified = row.position <= 2

  return (
    // Qualifying rows get a red left border, not only a tint, so the
    // distinction does not rely on color alone.
    <tr
      data-team={row.team_id}
      className={qualified ? 'bg-accent-dim/40 [box-shadow:inset_3px_0_0_0_var(--accent)]' : ''}
    >
      <td
        className={`tabular px-2 py-2 text-right ${
          qualified ? 'font-bold text-accent' : 'text-faint'
        }`}
      >
        {row.position}
      </td>
      <td className="px-2 py-2">
        {/*
          The main university's crest beside both text lines, at 32px. Only the
          main one: the line below already names every university.
        */}
        <div className="flex items-center gap-2">
          {row.university_tags[0] && <UniversityLogo tag={row.university_tags[0]} size="md" />}
          <div className="min-w-0 flex-1">
            <Link
              href={teamPath(row.team_id, 'grupos')}
              className={`block truncate transition-colors hover:text-accent ${
                qualified ? 'font-semibold' : 'font-medium'
              }`}
            >
              {row.team_name}
            </Link>
            {row.university_tags.length > 0 && (
              <p className="truncate text-xs text-faint">{row.university_tags.join(' / ')}</p>
            )}
          </div>
        </div>
      </td>
      <td className="tabular px-2 py-2 text-right">
        <span className="text-win">{row.wins}</span>
        <span className="text-dim">-</span>
        <span className="text-loss">{row.losses}</span>
      </td>
      <td
        className={`tabular px-2 py-2 text-right ${
          row.kill_diff > 0 ? 'text-win' : row.kill_diff < 0 ? 'text-loss' : 'text-muted'
        }`}
      >
        {row.kill_diff > 0 ? '+' : ''}
        {row.kill_diff}
      </td>
    </tr>
  )
}
