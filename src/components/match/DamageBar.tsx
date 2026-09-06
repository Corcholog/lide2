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
  label,
}: {
  damage: number
  /** The highest damage in the match. */
  max: number
  side: 100 | 200
  /** Width class, literal: `w-14`. See the note above. */
  width?: string
  /**
   * The word that says what the number is, for wherever nothing else does.
   *
   * On the match page the column header says "Daño" and this stays off: the
   * word on every one of the ten rows would be the header repeated. The
   * listing's expanded detail has no header, and there the bar was a coloured
   * stripe with a bare number under which the vision score hung, so the two
   * lines read as one stat and its subtitle.
   */
  label?: string
}) {
  return (
    <div className="flex items-center gap-2">
      {/* shrink-0: the bar keeps its width whatever the number beside it is
          worth. Without it a five-figure damage plus the label squeezes the
          bar, and a bar that is not to scale is worse than no bar. */}
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
