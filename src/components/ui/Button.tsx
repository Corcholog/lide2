import type { ButtonHTMLAttributes } from 'react'
import { twMerge } from 'tailwind-merge'

/**
 * The site's button.
 *
 * One recipe, decided here instead of in each screen: the accent fill, the
 * label style and the disabled state are the same everywhere.
 *
 *   variant="solid"   the standard action (medium weight)
 *   variant="upper"   the shouted label style, used on error pages and bans
 *   size="sm"         a smaller label in the same box
 *
 * `type` is not defaulted on purpose: a button inside a form has to keep
 * submitting, so every caller says what it is.
 *
 * `className` goes through `tailwind-merge`, so a caller can override a size
 * (`text-xs`) without fighting the variant's `font-medium`.
 */

const BASE =
  'cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-60'

const VARIANTS = {
  solid: 'bg-accent-strong font-medium text-on-accent hover:bg-accent disabled:hover:bg-accent-strong',
  upper:
    'bg-accent-strong font-bold uppercase tracking-wide text-on-accent hover:bg-accent disabled:hover:bg-accent-strong',
} as const

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
} as const

export interface ButtonStyle {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
  /** Extra classes, merged over the recipe. */
  className?: string
}

/**
 * The button recipe as a class string, for the elements that are not
 * `<button>`: a link that looks like one, for example.
 */
export function buttonClass({ variant = 'solid', size = 'md', className }: ButtonStyle = {}) {
  return twMerge(BASE, VARIANTS[variant], SIZES[size], className)
}

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonStyle {}

export function Button({ variant = 'solid', size = 'md', className, ...props }: ButtonProps) {
  return <button {...props} className={buttonClass({ variant, size, className })} />
}
