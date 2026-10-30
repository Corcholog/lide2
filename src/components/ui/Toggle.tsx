import { twMerge } from 'tailwind-merge'

/**
 * The pressed/unpressed pair the site's filters and pickers use.
 *
 * The same two states, decided in one place: the selected one is filled with
 * the accent tint, the other one is a plain border that lights up on hover.
 *
 * `className` carries what makes each one different (the box and the label),
 * so the states stay the same across the site.
 */
export function toggleClass(pressed: boolean, className?: string) {
  return twMerge(
    'border-2 transition-colors',
    pressed
      ? 'border-accent bg-accent-dim text-accent'
      : 'border-line text-muted hover:border-line-strong hover:text-accent',
    className,
  )
}
