import type { ButtonHTMLAttributes } from 'react'
import { twMerge } from 'tailwind-merge'

/**
 * The site's button.
 *
 * One recipe, decided here instead of in each screen: the fill, the label and
 * the disabled state are the same everywhere.
 *
 *   variant="solid"    accent fill: the action the screen wants
 *   variant="outline"  border only: the action next to it
 *   size="xs"          tiny, for a form or a toolbar
 *   size="sm"          small
 *   size="md"          the default, the biggest one
 *   shout              the shouted label: uppercase, bold, wide tracking
 *
 * `type` is not defaulted on purpose: a button inside a form has to keep
 * submitting, so every caller says what it is.
 *
 * `className` goes through `tailwind-merge`, so a caller can override a size
 * (`text-xs`) without fighting the variant.
 */

const BASE =
  'cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-60'

const VARIANTS = {
  solid:
    'bg-accent-strong font-medium text-on-accent hover:bg-accent disabled:hover:bg-accent-strong',
  outline:
    'border-2 border-line-strong text-muted hover:border-accent hover:text-accent disabled:hover:border-line-strong disabled:hover:text-muted',
} as const

const SIZES = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
} as const

/** The label that has to be read across the room. */
const SHOUT = 'font-bold uppercase tracking-wide'

export interface ButtonStyle {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
  /** The shouted label. */
  shout?: boolean
  /** Extra classes, merged over the recipe. */
  className?: string
}

/**
 * The button recipe as a class string, for the elements that are not
 * `<button>`: a link that looks like one, for example.
 */
export function buttonClass({
  variant = 'solid',
  size = 'md',
  shout = false,
  className,
}: ButtonStyle = {}) {
  return twMerge(BASE, VARIANTS[variant], SIZES[size], shout ? SHOUT : '', className)
}

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonStyle {}

export function Button({
  variant = 'solid',
  size = 'md',
  shout = false,
  className,
  ...props
}: ButtonProps) {
  return (
    <button {...props} className={buttonClass({ variant, size, shout, className })} />
  )
}
