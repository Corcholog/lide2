import { formatNumber } from '@/lib/format'

/**
 * A player's damage as a bar relative to the match's top damage (a raw number
 * means different things by role). Shared by the match page scoreboard and the
 * listing detail, so both look the same.
 */

/* Full class names: Tailwind cannot see classes built at runtime. */
const FILL = {
  100: 'bg-side-blue-fill',
  200: 'bg-side-red-fill',
} as const

export function DamageBar({
  damage,
  max,
  side,
  width = 'w-20',
  label,
}: {
  damage: number
  /** The highest damage in the match. */
  max: number
  side: 100 | 200
  /** Width as a literal class, e.g. `w-14`. */
  width?: string
  /**
   * A label for the number ("daño"), where nothing else names it. Off on the
   * match page, whose column header already does.
   */
  label?: string
}) {
  return (
    <div className="flex items-center gap-2">
      {/* shrink-0 keeps the bar at scale when the number next to it is long. */}
      <div className={`h-1.5 shrink-0 overflow-hidden rounded-full bg-raised ${width}`}>
        <div
          className={`h-full rounded-r-[4px] ${FILL[side]}`}
          style={{ width: `${max > 0 ? (damage / max) * 100 : 0}%` }}
        />
      </div>
      <span className="tabular text-xs text-muted">
        {formatNumber(damage)}
        {label && <span className="text-faint"> {label}</span>}
      </span>
    </div>
  )
}
