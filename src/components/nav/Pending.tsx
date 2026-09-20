'use client'

import { useLinkStatus } from 'next/link'

/**
 * A bar that fills along the bottom of a chip while its page loads.
 *
 * The stats pages are dynamic, and changing only `?fecha=` stays inside the
 * same route segment, so `loading.tsx` never comes back: without this a click
 * left the bar looking untouched for as long as the server took. Next's own
 * guidance points at `useLinkStatus` for exactly that case.
 *
 * It must render inside the `<Link>` whose status it reads, which is why it is
 * its own client component: `Chip` and the navs around it stay on the server.
 *
 * Decorative, so `aria-hidden`: the chip's label already says where it goes,
 * and screen readers announce the navigation themselves.
 */
export function Pending() {
  const { pending } = useLinkStatus()
  if (!pending) return null

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent motion-safe:animate-[carga_.9s_ease-out_infinite] motion-reduce:opacity-60"
    />
  )
}
