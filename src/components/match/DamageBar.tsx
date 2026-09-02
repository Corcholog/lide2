import { formatNumber } from '@/lib/format'

/**
 * A player's damage, relative to whoever did the most in that match.
 *
 * The bare number says nothing: 25,000 is an enormous amount for a support and
 * little for an ADC. The bar is what gets read at a glance, and that is why the
 * scale is always the maximum of that same match and not a fixed ceiling.
 *
 * It lives here because the match page's scoreboard and the listing's
 * expandable detail both use it: if each drew it its own way, the same match
 * would look different on two pages.
 */

/* Tailwind reads the source: both tones go in whole, never built at runtime. */
const FILL = {
  100: 'bg-side-blue-fill',
  200: 'bg-side-red-fill',
} as const

export function DamageBar({
  damage,
  max,
  side,
  width = 'w-20',
}: {
  damage: number
  /** The highest damage in the match. */
  max: number
  side: 100 | 200
  /** Width class, literal: `w-14`. See the note above. */
  width?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-1.5 overflow-hidden rounded-full bg-raised ${width}`}>
        <div
          className={`h-full rounded-r-[4px] ${FILL[side]}`}
          style={{ width: `${max > 0 ? (damage / max) * 100 : 0}%` }}
        />
      </div>
      <span className="tabular text-xs text-muted">{formatNumber(damage)}</span>
    </div>
  )
}
