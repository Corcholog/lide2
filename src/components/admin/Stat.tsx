/** One figure in an admin page's summary strip, highlighted when `tone` is set. */
export function Stat({
  label,
  value,
  tone,
  toneClass = 'text-accent',
}: {
  label: string
  value: number
  tone?: boolean
  toneClass?: string
}) {
  return (
    <div className="bg-surface px-4 py-3 text-fg">
      <dt className="text-xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className={`font-display text-2xl tabular-nums ${tone ? toneClass : ''}`}>{value}</dd>
    </div>
  )
}
