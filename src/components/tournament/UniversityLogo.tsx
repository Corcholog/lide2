import Image from 'next/image'

/**
 * University crests.
 *
 * The file path comes from the tag (/universidades/<lower-case tag>.png), since
 * standings and fixture rows only carry tags. The files are normalized by
 * scripts/normalize-logos.ts to 256x256 with a white background baked in, so
 * every crest looks the same on both themes and in exported cards. The border
 * keeps white crests from blending into light backgrounds.
 */

/** Square sizes (the site has no rounded corners). */
const SIZES = {
  xs: 'size-4', //  16px  signups on the team page
  sm: 'size-6', //  24px
  md: 'size-8', //  32px  the standings table
  lg: 'size-9', //  36px  the home page strip
  card: 'size-12', // 48px  team cards on /equipos
  xl: 'size-16', // 64px  the team page header
  // Responsive: on phones only one crest fits next to the team name (see
  // FixtureTeam).
  fixture: 'size-7 sm:size-10', // 28 -> 40px
} as const

export type LogoSize = keyof typeof SIZES

export function universityLogoPath(tag: string): string {
  return `/universidades/${tag.toLowerCase()}.png`
}

export function UniversityLogo({
  tag,
  size = 'sm',
  className = '',
}: {
  tag: string
  size?: LogoSize
  className?: string
}) {
  return (
    <Image
      src={universityLogoPath(tag)}
      alt={tag}
      title={tag}
      width={256}
      height={256}
      className={`${SIZES[size]} shrink-0 border border-line object-contain ${className}`}
    />
  )
}

/**
 * A team's crests, main university first; mixed teams have up to three. Side
 * by side, since stacked white squares would read as one block. `max` limits
 * how many are drawn and adds "+N"; the main one always survives the cut.
 */
export function UniversityLogos({
  tags,
  size = 'sm',
  max = 3,
  className = '',
}: {
  tags: string[] | null | undefined
  size?: LogoSize
  max?: number
  className?: string
}) {
  const all = tags ?? []
  if (all.length === 0) return null

  const visible = all.slice(0, max)
  const hidden = all.length - visible.length

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`} title={all.join(' · ')}>
      {visible.map((tag) => (
        <UniversityLogo key={tag} tag={tag} size={size} />
      ))}
      {hidden > 0 && <span className="text-[10px] leading-none text-faint">+{hidden}</span>}
    </span>
  )
}
